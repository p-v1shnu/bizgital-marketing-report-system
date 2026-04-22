import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException
} from '@nestjs/common';
import {
  BrandRole,
  BrandStatus,
  BrandDropdownFieldKey,
  BrandDropdownOptionStatus,
  Prisma,
  ReportWorkflowState,
  UserStatus
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import {
  parseManualSourceRowsSettingPayload,
  toManualSourceRowsSettingKey
} from '../dataset/manual-source-rows-setting';
import { readImportJobSnapshot } from '../imports/import-snapshot';
import { MediaService } from '../media/media.service';
import type {
  CompanyFormatOptionsResponse,
  CreateBrandInput,
  CreateCompanyFormatOptionInput,
  DeleteBrandInput,
  ReorderCompanyFormatOptionsInput,
  UpdateBrandInput,
  UpdateCompanyFormatOptionInput
} from './brands.types';
import {
  NEW_BRAND_DEFAULT_KPI_SETTING_KEY,
  type NewBrandDefaultKpiSettingPayload
} from '../kpi/kpi-defaults.constants';

const CONTENT_STYLE_DEFAULT_OPTIONS = [
  'Tips',
  'Memes',
  'Trending',
  'Special Day',
  'Tie-In',
  'Position',
  'Call-To-Engage',
  'Details',
  'Reviews',
  'Promotion',
  'Event',
  'Call-to-Action',
  'CRM'
];

const COMPANY_FORMAT_FIELD_DEFINITIONS: Array<{
  key: BrandDropdownFieldKey;
  label: string;
  defaultOptions: string[];
}> = [
  {
    key: BrandDropdownFieldKey.content_style,
    label: 'Content Style',
    defaultOptions: CONTENT_STYLE_DEFAULT_OPTIONS
  },
  {
    key: BrandDropdownFieldKey.related_product,
    label: 'Related Product',
    defaultOptions: ['Hero Product', 'Core Line', 'Seasonal Push', 'Bundle', 'Other']
  },
  {
    key: BrandDropdownFieldKey.media_format,
    label: 'Media Format',
    defaultOptions: ['Static', 'Album', 'Motion', 'Short Video', 'Long Video', 'Reels']
  },
  {
    key: BrandDropdownFieldKey.campaign_base,
    label: 'Campaign Base',
    defaultOptions: ['Always-on', 'Campaign Burst', 'Promotion', 'Event', 'Other']
  },
  {
    key: BrandDropdownFieldKey.content_objective,
    label: 'Content Objective',
    defaultOptions: ['AWR', 'CON', 'ACT']
  }
];

function normalizeLabel(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function toValueKey(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'option';
}

function normalizeBrandCode(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeLogoUrl(value: string | null | undefined) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function normalizeIdList(values: unknown) {
  if (!Array.isArray(values)) {
    return [];
  }

  return Array.from(
    new Set(
      values
        .map((value) => String(value ?? '').trim())
        .filter((value) => !!value)
    )
  );
}

function normalizeStatus(value: string | undefined) {
  if (value === undefined) {
    return undefined;
  }

  if (!Object.values(BrandStatus).includes(value as BrandStatus)) {
    throw new BadRequestException('Invalid brand status.');
  }

  return value as BrandStatus;
}

type RawBrandUiSettingRow = {
  brand_id: string;
  logo_url: string | null;
};

type RawMembershipPermissionRow = {
  brand_id: string;
  user_id: string;
  can_create_reports: number | null;
  can_approve_reports: number | null;
};

type MembershipPermissionSnapshot = {
  canCreateReports: boolean;
  canApproveReports: boolean;
};

function defaultPermissionsForRole(role: BrandRole): MembershipPermissionSnapshot {
  if (role === BrandRole.admin) {
    return {
      canCreateReports: true,
      canApproveReports: true
    };
  }

  if (role === BrandRole.content) {
    return {
      canCreateReports: true,
      canApproveReports: false
    };
  }

  if (role === BrandRole.approver) {
    return {
      canCreateReports: false,
      canApproveReports: true
    };
  }

  return {
    canCreateReports: false,
    canApproveReports: false
  };
}

function resolveMembershipPermissions(options: {
  role: BrandRole;
  overrideCanCreateReports: number | null | undefined;
  overrideCanApproveReports: number | null | undefined;
}): MembershipPermissionSnapshot {
  const defaults = defaultPermissionsForRole(options.role);

  return {
    canCreateReports:
      options.overrideCanCreateReports === null ||
      options.overrideCanCreateReports === undefined
        ? defaults.canCreateReports
        : options.overrideCanCreateReports === 1,
    canApproveReports:
      options.overrideCanApproveReports === null ||
      options.overrideCanApproveReports === undefined
        ? defaults.canApproveReports
        : options.overrideCanApproveReports === 1
  };
}

type BrandServiceTransactionClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class BrandsService {
  private readonly logger = new Logger(BrandsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaService: MediaService,
    private readonly auditLogService: AuditLogService
  ) {}

  async listBrands() {
    await this.ensureMembershipPermissionStorage();
    const brands = await this.prisma.brand.findMany({
      include: {
        memberships: {
          include: {
            user: true
          },
          orderBy: [{ role: 'asc' }, { createdAt: 'asc' }]
        }
      },
      orderBy: {
        name: 'asc'
      }
    });
    const logoByBrandId = await this.getBrandLogoMap(brands.map(brand => brand.id));
    const permissionByMembershipKey = await this.getMembershipPermissionByPairs(
      brands.flatMap(brand =>
        brand.memberships.map(membership => ({
          brandId: membership.brandId,
          userId: membership.userId
        }))
      )
    );

    return brands.map(brand => ({
      ...brand,
      memberships: brand.memberships.map(membership => ({
        ...membership,
        permissions: resolveMembershipPermissions({
          role: membership.role,
          overrideCanCreateReports: permissionByMembershipKey.get(
            this.membershipPermissionKey(membership.brandId, membership.userId)
          )?.can_create_reports,
          overrideCanApproveReports: permissionByMembershipKey.get(
            this.membershipPermissionKey(membership.brandId, membership.userId)
          )?.can_approve_reports
        })
      })),
      logoUrl: logoByBrandId.get(brand.id) ?? null
    }));
  }

  async getBrandByCodeOrThrow(brandCode: string) {
    await this.ensureMembershipPermissionStorage();
    const brand = await this.prisma.brand.findUnique({
      where: {
        code: brandCode
      },
      include: {
        memberships: {
          include: {
            user: true
          },
          orderBy: [{ role: 'asc' }, { createdAt: 'asc' }]
        }
      }
    });

    if (!brand) {
      throw new NotFoundException(`Brand ${brandCode} was not found.`);
    }

    const logoByBrandId = await this.getBrandLogoMap([brand.id]);
    const permissionByMembershipKey = await this.getMembershipPermissionByPairs(
      brand.memberships.map(membership => ({
        brandId: membership.brandId,
        userId: membership.userId
      }))
    );

    return {
      ...brand,
      memberships: brand.memberships.map(membership => ({
        ...membership,
        permissions: resolveMembershipPermissions({
          role: membership.role,
          overrideCanCreateReports: permissionByMembershipKey.get(
            this.membershipPermissionKey(membership.brandId, membership.userId)
          )?.can_create_reports,
          overrideCanApproveReports: permissionByMembershipKey.get(
            this.membershipPermissionKey(membership.brandId, membership.userId)
          )?.can_approve_reports
        })
      })),
      logoUrl: logoByBrandId.get(brand.id) ?? null
    };
  }

  async createBrand(input: CreateBrandInput) {
    const name = normalizeLabel(String(input.name ?? ''));
    const timezone = normalizeLabel(String(input.timezone ?? 'Asia/Vientiane')) || 'Asia/Vientiane';
    const status = normalizeStatus(input.status) ?? BrandStatus.active;
    const logoUrl = normalizeLogoUrl(input.logoUrl);
    const responsibleUserIds = normalizeIdList(input.responsibleUserIds);
    const requestedCode = normalizeBrandCode(String(input.code ?? ''));
    const codeSeed = requestedCode || normalizeBrandCode(name) || 'brand';

    if (!name) {
      throw new BadRequestException('Brand name is required.');
    }

    await this.mediaService.assertManagedPublicUrlsExist([logoUrl], 'Brand logo');

    await this.ensureBrandUiStorage();
    await this.ensureGlobalUiSettingsStorage();
    await this.ensureMembershipPermissionStorage();

    let createdCode: string | null = null;
    let attempts = 0;

    while (!createdCode && attempts < 20) {
      const candidateCode = await this.resolveNextAvailableBrandCode(codeSeed);

      try {
        await this.prisma.$transaction(async tx => {
          const brand = await tx.brand.create({
            data: {
              code: candidateCode,
              name,
              timezone,
              status,
              ...(status === BrandStatus.active
                ? { activatedAt: new Date(), deactivatedAt: null }
                : { activatedAt: null, deactivatedAt: new Date() })
            }
          });

          await this.setBrandLogoWithClient(tx, brand.id, logoUrl);
          await this.assignDefaultKpisForNewBrandWithClient(tx, brand.id, timezone);
          if (responsibleUserIds.length > 0) {
            await this.syncResponsibleUsersWithClient(tx, {
              brandId: brand.id,
              responsibleUserIds
            });
          }
        });

        createdCode = candidateCode;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          attempts += 1;
          continue;
        }

        throw error;
      }
    }

    if (!createdCode) {
      throw new ConflictException('Could not allocate a unique brand code. Try again.');
    }

    const createdBrand = await this.getBrandByCodeOrThrow(createdCode);

    await this.auditLogService.append({
      actionKey: 'BRAND_CREATED',
      entityType: 'BRAND',
      entityId: createdBrand.id,
      entityLabel: createdBrand.name,
      summary: `Created brand "${createdBrand.name}".`,
      metadata: {
        code: createdBrand.code,
        timezone: createdBrand.timezone,
        status: createdBrand.status,
        responsibleUserCount: createdBrand.memberships.filter(
          membership => membership.role !== BrandRole.admin
        ).length
      },
      actor: {
        actorName: input.actorName,
        actorEmail: input.actorEmail
      }
    });

    return createdBrand;
  }

  async updateBrand(brandCode: string, input: UpdateBrandInput) {
    const brand = await this.getBrandByCodeOrThrow(brandCode);
    const nextName =
      input.name !== undefined ? normalizeLabel(String(input.name ?? '')) : undefined;
    const nextTimezone =
      input.timezone !== undefined
        ? normalizeLabel(String(input.timezone ?? ''))
        : undefined;
    const nextStatus = normalizeStatus(input.status);
    const nextLogoUrl =
      input.logoUrl !== undefined ? normalizeLogoUrl(input.logoUrl) : undefined;
    const responsibleUserIds =
      input.responsibleUserIds !== undefined
        ? normalizeIdList(input.responsibleUserIds)
        : undefined;
    const previousResponsibleUserSet = new Set(
      brand.memberships
        .filter(membership => membership.role !== BrandRole.admin)
        .map(membership => membership.user.id)
    );

    if (nextName !== undefined && !nextName) {
      throw new BadRequestException('Brand name cannot be empty.');
    }

    if (nextTimezone !== undefined && !nextTimezone) {
      throw new BadRequestException('Timezone cannot be empty.');
    }

    if (nextLogoUrl !== undefined) {
      await this.mediaService.assertManagedPublicUrlsExist([nextLogoUrl], 'Brand logo');
    }

    const statusLifecycleUpdate =
      nextStatus === undefined || nextStatus === brand.status
        ? {}
        : nextStatus === BrandStatus.active
          ? { activatedAt: new Date() }
          : { deactivatedAt: new Date() };

    await this.prisma.brand.update({
      where: { id: brand.id },
      data: {
        ...(nextName !== undefined ? { name: nextName } : {}),
        ...(nextTimezone !== undefined ? { timezone: nextTimezone } : {}),
        ...(nextStatus !== undefined ? { status: nextStatus } : {}),
        ...statusLifecycleUpdate
      }
    });

    if (nextLogoUrl !== undefined) {
      await this.setBrandLogo(brand.id, nextLogoUrl);
      const previousLogoUrl = this.normalizeMediaUrl(brand.logoUrl);
      const currentLogoUrl = this.normalizeMediaUrl(nextLogoUrl);
      if (previousLogoUrl && previousLogoUrl !== currentLogoUrl) {
        await this.deleteRemovedLogoUrls([previousLogoUrl]);
      }
    }

    if (responsibleUserIds !== undefined) {
      await this.ensureMembershipPermissionStorage();
      await this.syncResponsibleUsersWithClient(this.prisma, {
        brandId: brand.id,
        responsibleUserIds
      });
    }

    const updatedBrand = await this.getBrandByCodeOrThrow(brandCode);
    const actor = {
      actorName: input.actorName,
      actorEmail: input.actorEmail
    };
    const statusChanged = nextStatus !== undefined && nextStatus !== brand.status;
    const nextResponsibleUserSet = new Set(
      updatedBrand.memberships
        .filter(membership => membership.role !== BrandRole.admin)
        .map(membership => membership.user.id)
    );
    const responsibleUsersChanged =
      responsibleUserIds !== undefined &&
      (previousResponsibleUserSet.size !== nextResponsibleUserSet.size ||
        Array.from(previousResponsibleUserSet).some(
          userId => !nextResponsibleUserSet.has(userId)
        ));
    const changedFields: string[] = [];
    if (nextName !== undefined && nextName !== brand.name) {
      changedFields.push('name');
    }
    if (nextTimezone !== undefined && nextTimezone !== brand.timezone) {
      changedFields.push('timezone');
    }
    if (
      nextLogoUrl !== undefined &&
      this.normalizeMediaUrl(nextLogoUrl) !== this.normalizeMediaUrl(brand.logoUrl)
    ) {
      changedFields.push('logoUrl');
    }
    const hasGeneralUpdate = changedFields.length > 0;

    if (statusChanged) {
      await this.auditLogService.append({
        actionKey: 'BRAND_STATUS_CHANGED',
        entityType: 'BRAND',
        entityId: updatedBrand.id,
        entityLabel: updatedBrand.name,
        summary: `Changed brand status for "${updatedBrand.name}" from ${brand.status} to ${updatedBrand.status}.`,
        metadata: {
          from: brand.status,
          to: updatedBrand.status
        },
        actor
      });
    }

    if (responsibleUsersChanged) {
      const addedCount = Array.from(nextResponsibleUserSet).filter(
        userId => !previousResponsibleUserSet.has(userId)
      ).length;
      const removedCount = Array.from(previousResponsibleUserSet).filter(
        userId => !nextResponsibleUserSet.has(userId)
      ).length;

      await this.auditLogService.append({
        actionKey: 'BRAND_RESPONSIBLE_USERS_CHANGED',
        entityType: 'BRAND',
        entityId: updatedBrand.id,
        entityLabel: updatedBrand.name,
        summary: `Updated responsible users for "${updatedBrand.name}" (+${addedCount}, -${removedCount}).`,
        metadata: {
          previousCount: previousResponsibleUserSet.size,
          currentCount: nextResponsibleUserSet.size,
          addedCount,
          removedCount
        },
        actor
      });
    }

    if (hasGeneralUpdate) {
      await this.auditLogService.append({
        actionKey: 'BRAND_UPDATED',
        entityType: 'BRAND',
        entityId: updatedBrand.id,
        entityLabel: updatedBrand.name,
        summary: `Updated brand "${updatedBrand.name}".`,
        metadata: {
          changedFields
        },
        actor
      });
    }

    return updatedBrand;
  }

  async deleteBrand(brandCode: string, input?: DeleteBrandInput) {
    await this.ensureMembershipPermissionStorage();
    const brand = await this.getBrandByCodeOrThrow(brandCode);
    const approvedCount = await this.prisma.reportVersion.count({
      where: {
        reportingPeriod: {
          brandId: brand.id
        },
        workflowState: ReportWorkflowState.approved
      }
    });

    if (approvedCount > 0) {
      throw new ConflictException(
        'Cannot delete brand because at least one approved report exists.'
      );
    }

    await this.prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe(
        `
        DELETE FROM brand_membership_permissions
        WHERE brand_id = ?
        `,
        brand.id
      );

      await tx.$executeRawUnsafe(
        `
        DELETE FROM brand_ui_settings
        WHERE brand_id = ?
        `,
        brand.id
      );

      await tx.brand.delete({
        where: { id: brand.id }
      });
    });
    await this.deleteRemovedLogoUrls([brand.logoUrl]);

    await this.auditLogService.append({
      actionKey: 'BRAND_DELETED',
      entityType: 'BRAND',
      entityId: brand.id,
      entityLabel: brand.name,
      summary: `Deleted brand "${brand.name}".`,
      metadata: {
        code: brand.code
      },
      actor: {
        actorName: input?.actorName,
        actorEmail: input?.actorEmail
      }
    });

    return {
      deleted: true
    };
  }

  async getCompanyFormatOptions(
    brandCode: string,
    includeDeprecated = false
  ): Promise<CompanyFormatOptionsResponse> {
    const brand = await this.getBrandByCodeOrThrow(brandCode);
    await this.ensureCompanyFormatDefaults(brand.id);

    const options = await this.prisma.brandDropdownOption.findMany({
      where: {
        brandId: brand.id,
        ...(includeDeprecated ? {} : { status: BrandDropdownOptionStatus.active })
      },
      orderBy: [
        { fieldKey: 'asc' },
        { sortOrder: 'asc' },
        { createdAt: 'asc' }
      ]
    });

    return {
      brand: {
        id: brand.id,
        code: brand.code,
        name: brand.name
      },
      fields: COMPANY_FORMAT_FIELD_DEFINITIONS.map((field) => ({
        key: field.key,
        label: field.label,
        options: options
          .filter((option) => option.fieldKey === field.key)
          .map((option) => ({
            id: option.id,
            fieldKey: option.fieldKey,
            valueKey: option.valueKey,
            label: option.label,
            status: option.status,
            sortOrder: option.sortOrder
          }))
      }))
    };
  }

  async createCompanyFormatOption(
    brandCode: string,
    input: CreateCompanyFormatOptionInput
  ) {
    const brand = await this.getBrandByCodeOrThrow(brandCode);
    const fieldKey = this.resolveFieldKey(input.fieldKey);
    const label = normalizeLabel(input.label);

    if (!label) {
      throw new BadRequestException('Option label is required.');
    }

    await this.ensureCompanyFormatDefaults(brand.id);

    const existing = await this.prisma.brandDropdownOption.findMany({
      where: {
        brandId: brand.id,
        fieldKey
      },
      orderBy: [{ sortOrder: 'desc' }]
    });
    const existingValueKeys = new Set(existing.map((item) => item.valueKey));
    const baseValueKey = toValueKey(label);
    let valueKey = baseValueKey;
    let suffix = 2;

    while (existingValueKeys.has(valueKey)) {
      valueKey = `${baseValueKey}-${suffix}`;
      suffix += 1;
    }

    const created = await this.prisma.brandDropdownOption.create({
      data: {
        brandId: brand.id,
        fieldKey,
        valueKey,
        label,
        sortOrder: (existing[0]?.sortOrder ?? 0) + 1,
        status: BrandDropdownOptionStatus.active
      }
    });

    return {
      option: {
        id: created.id,
        fieldKey: created.fieldKey,
        valueKey: created.valueKey,
        label: created.label,
        status: created.status,
        sortOrder: created.sortOrder
      }
    };
  }

  async updateCompanyFormatOption(
    brandCode: string,
    optionId: string,
    input: UpdateCompanyFormatOptionInput
  ) {
    const brand = await this.getBrandByCodeOrThrow(brandCode);
    const option = await this.prisma.brandDropdownOption.findUnique({
      where: {
        id: optionId
      }
    });

    if (!option || option.brandId !== brand.id) {
      throw new NotFoundException('Internal option was not found for this brand.');
    }

    const nextStatus =
      input.status !== undefined ? this.resolveOptionStatus(input.status) : undefined;
    const nextLabel =
      input.label !== undefined ? normalizeLabel(input.label) : undefined;

    if (nextLabel !== undefined && !nextLabel) {
      throw new BadRequestException('Option label cannot be empty.');
    }

    if (nextLabel === undefined && nextStatus === undefined) {
      throw new BadRequestException('Provide label or status to update this option.');
    }

    const updated = await this.prisma.brandDropdownOption.update({
      where: {
        id: option.id
      },
      data: {
        ...(nextLabel !== undefined ? { label: nextLabel } : {}),
        ...(nextStatus !== undefined ? { status: nextStatus } : {})
      }
    });

    return {
      option: {
        id: updated.id,
        fieldKey: updated.fieldKey,
        valueKey: updated.valueKey,
        label: updated.label,
        status: updated.status,
        sortOrder: updated.sortOrder
      }
    };
  }

  async reorderCompanyFormatOptions(
    brandCode: string,
    input: ReorderCompanyFormatOptionsInput
  ) {
    const brand = await this.getBrandByCodeOrThrow(brandCode);
    const fieldKey = this.resolveFieldKey(input.fieldKey);
    const requestedIds = Array.from(new Set(input.optionIds));

    if (requestedIds.length === 0) {
      throw new BadRequestException('Option order is required.');
    }

    const activeOptions = await this.prisma.brandDropdownOption.findMany({
      where: {
        brandId: brand.id,
        fieldKey,
        status: BrandDropdownOptionStatus.active
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
    });

    if (activeOptions.length !== requestedIds.length) {
      throw new BadRequestException(
        'Reorder payload must include every active option in this field exactly once.'
      );
    }

    const activeIds = new Set(activeOptions.map((option) => option.id));
    if (requestedIds.some((optionId) => !activeIds.has(optionId))) {
      throw new BadRequestException('One or more options cannot be reordered for this field.');
    }

    await this.prisma.$transaction(
      requestedIds.map((optionId, index) =>
        this.prisma.brandDropdownOption.update({
          where: { id: optionId },
          data: { sortOrder: index + 1 }
        })
      )
    );

    return this.getCompanyFormatOptions(brandCode, true);
  }

  async deleteCompanyFormatOption(brandCode: string, optionId: string) {
    const brand = await this.getBrandByCodeOrThrow(brandCode);
    const option = await this.prisma.brandDropdownOption.findUnique({
      where: {
        id: optionId
      }
    });

    if (!option || option.brandId !== brand.id) {
      throw new NotFoundException('Internal option was not found for this brand.');
    }

    const usedInApprovedReport = await this.isDropdownOptionUsedInApprovedReports(
      brand.id,
      option.fieldKey,
      option.valueKey,
      option.label
    );

    if (usedInApprovedReport) {
      throw new ConflictException(
        `Cannot delete "${option.label}" because it is used in at least one approved report.`
      );
    }

    await this.prisma.$transaction(async tx => {
      await tx.brandDropdownOption.delete({
        where: {
          id: option.id
        }
      });

      const remainingOptions = await tx.brandDropdownOption.findMany({
        where: {
          brandId: brand.id,
          fieldKey: option.fieldKey
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true
        }
      });

      for (const [index, remainingOption] of remainingOptions.entries()) {
        await tx.brandDropdownOption.update({
          where: {
            id: remainingOption.id
          },
          data: {
            sortOrder: index + 1
          }
        });
      }
    });

    return {
      deleted: true
    };
  }

  private async ensureCompanyFormatDefaults(brandId: string) {
    const existing = await this.prisma.brandDropdownOption.groupBy({
      by: ['fieldKey'],
      where: {
        brandId
      }
    });

    const existingFieldKeys = new Set(existing.map((item) => item.fieldKey));
    const createPayload = COMPANY_FORMAT_FIELD_DEFINITIONS.flatMap((field) => {
      if (existingFieldKeys.has(field.key)) {
        return [];
      }

      return field.defaultOptions.map((label, index) => ({
        brandId,
        fieldKey: field.key,
        valueKey: toValueKey(label),
        label,
        sortOrder: index + 1,
        status: BrandDropdownOptionStatus.active
      }));
    });

    if (createPayload.length > 0) {
      await this.prisma.brandDropdownOption.createMany({
        data: createPayload
      });
    }

    await this.syncContentStyleOptions(brandId);
  }

  private async syncContentStyleOptions(brandId: string) {
    const allowed = CONTENT_STYLE_DEFAULT_OPTIONS.map((label, index) => ({
      label,
      valueKey: toValueKey(label),
      sortOrder: index + 1
    }));
    const allowedValueKeys = allowed.map(item => item.valueKey);
    const fieldKey = BrandDropdownFieldKey.content_style;

    await this.prisma.$transaction([
      ...allowed.map(item =>
        this.prisma.brandDropdownOption.upsert({
          where: {
            brand_dropdown_option_brand_field_value_key_unique: {
              brandId,
              fieldKey,
              valueKey: item.valueKey
            }
          },
          update: {
            label: item.label,
            sortOrder: item.sortOrder,
            status: BrandDropdownOptionStatus.active
          },
          create: {
            brandId,
            fieldKey,
            valueKey: item.valueKey,
            label: item.label,
            sortOrder: item.sortOrder,
            status: BrandDropdownOptionStatus.active
          }
        })
      ),
      this.prisma.brandDropdownOption.deleteMany({
        where: {
          brandId,
          fieldKey,
          valueKey: {
            notIn: allowedValueKeys
          }
        }
      })
    ]);
  }

  private async isDropdownOptionUsedInApprovedReports(
    brandId: string,
    fieldKey: BrandDropdownFieldKey,
    optionValueKey: string,
    optionLabel: string
  ) {
    const approvedVersions = await this.prisma.reportVersion.findMany({
      where: {
        workflowState: ReportWorkflowState.approved,
        reportingPeriod: {
          brandId
        },
      },
      select: {
        id: true,
        importJobs: {
          select: {
            snapshotSourceType: true,
            snapshotSheetName: true,
            snapshotHeaderRow: true,
            snapshotDataRows: true
          }
        }
      }
    });

    if (approvedVersions.length === 0) {
      return false;
    }

    const importJobs = approvedVersions.flatMap(version => version.importJobs);
    if (
      this.isOptionUsedInImportSnapshots(importJobs, fieldKey, optionValueKey, optionLabel)
    ) {
      return true;
    }

    const settings = await this.prisma.globalUiSetting.findMany({
      where: {
        settingKey: {
          in: approvedVersions.map(version => toManualSourceRowsSettingKey(version.id))
        }
      },
      select: {
        valueJson: true
      }
    });

    return this.isOptionUsedInManualSourceRows(settings, fieldKey, optionValueKey, optionLabel);
  }

  private isOptionUsedInImportSnapshots(
    importJobs: Array<{
      snapshotSourceType: string | null;
      snapshotSheetName: string | null;
      snapshotHeaderRow: Prisma.JsonValue | null;
      snapshotDataRows: Prisma.JsonValue | null;
    }>,
    fieldKey: BrandDropdownFieldKey,
    optionValueKey: string,
    optionLabel: string
  ) {
    const headerAliasSet = new Set(
      this.getCompanyFormatFieldAliases(fieldKey).map(alias =>
        normalizeLabel(alias).toLowerCase()
      )
    );

    if (headerAliasSet.size === 0) {
      return false;
    }

    for (const importJob of importJobs) {
      const snapshot = readImportJobSnapshot(importJob);
      if (!snapshot) {
        continue;
      }

      const matchingIndexes = snapshot.headerRow
        .map((header, index) => ({
          index,
          normalizedHeader: normalizeLabel(header).toLowerCase()
        }))
        .filter(item => headerAliasSet.has(item.normalizedHeader))
        .map(item => item.index);

      if (matchingIndexes.length === 0) {
        continue;
      }

      for (const row of snapshot.dataRows) {
        for (const columnIndex of matchingIndexes) {
          if (
            this.isDropdownOptionValueMatch(
              row[columnIndex] ?? '',
              optionValueKey,
              optionLabel
            )
          ) {
            return true;
          }
        }
      }
    }

    return false;
  }

  private isOptionUsedInManualSourceRows(
    settings: Array<{ valueJson: string | null }>,
    fieldKey: BrandDropdownFieldKey,
    optionValueKey: string,
    optionLabel: string
  ) {
    const headerAliasSet = new Set(
      this.getCompanyFormatFieldAliases(fieldKey).map(alias =>
        normalizeLabel(alias).toLowerCase()
      )
    );

    if (headerAliasSet.size === 0) {
      return false;
    }

    for (const setting of settings) {
      const rowsByRowNumber = parseManualSourceRowsSettingPayload(setting.valueJson);

      for (const rowColumns of Object.values(rowsByRowNumber)) {
        for (const [rawLabel, rawValue] of Object.entries(rowColumns)) {
          if (!headerAliasSet.has(normalizeLabel(rawLabel).toLowerCase())) {
            continue;
          }

          if (
            this.isDropdownOptionValueMatch(rawValue, optionValueKey, optionLabel)
          ) {
            return true;
          }
        }
      }
    }

    return false;
  }

  private isDropdownOptionValueMatch(
    rawValue: string,
    optionValueKey: string,
    optionLabel: string
  ) {
    const normalizedValue = normalizeLabel(rawValue).toLowerCase();
    const normalizedOptionLabel = normalizeLabel(optionLabel).toLowerCase();

    if (!normalizedValue) {
      return false;
    }

    return (
      normalizedValue === normalizedOptionLabel ||
      toValueKey(normalizedValue) === optionValueKey
    );
  }

  private getCompanyFormatFieldAliases(fieldKey: BrandDropdownFieldKey) {
    const definition = COMPANY_FORMAT_FIELD_DEFINITIONS.find(item => item.key === fieldKey);
    if (definition) {
      return [definition.label];
    }

    if (fieldKey === BrandDropdownFieldKey.campaign_base) {
      return ['Campaign Base', 'Is campaign content'];
    }

    return [fieldKey.replace(/_/g, ' ')];
  }

  private resolveFieldKey(fieldKey: string) {
    if (
      !Object.values(BrandDropdownFieldKey).includes(
        fieldKey as BrandDropdownFieldKey
      )
    ) {
      const allowed = COMPANY_FORMAT_FIELD_DEFINITIONS.map((field) => field.label).join(', ');
      throw new BadRequestException(`Unknown internal field. Allowed fields: ${allowed}.`);
    }

    return fieldKey as BrandDropdownFieldKey;
  }

  private resolveOptionStatus(status: string) {
    if (
      !Object.values(BrandDropdownOptionStatus).includes(
        status as BrandDropdownOptionStatus
      )
    ) {
      throw new BadRequestException('Invalid option status.');
    }

    return status as BrandDropdownOptionStatus;
  }

  private async getBrandLogoMap(brandIds: string[]) {
    await this.ensureBrandUiStorage();

    if (brandIds.length === 0) {
      return new Map<string, string | null>();
    }

    const placeholders = brandIds.map(() => '?').join(', ');
    const rows = await this.prisma.$queryRawUnsafe<RawBrandUiSettingRow[]>(
      `
      SELECT brand_id, logo_url
      FROM brand_ui_settings
      WHERE brand_id IN (${placeholders})
      `,
      ...brandIds
    );

    return new Map(rows.map(row => [row.brand_id, row.logo_url]));
  }

  private membershipPermissionKey(brandId: string, userId: string) {
    return `${brandId}::${userId}`;
  }

  private async getMembershipPermissionByPairs(
    pairs: Array<{
      brandId: string;
      userId: string;
    }>
  ) {
    if (pairs.length === 0) {
      return new Map<string, RawMembershipPermissionRow>();
    }

    const uniqueUserIds = Array.from(new Set(pairs.map(pair => pair.userId)));
    const userIdPlaceholders = uniqueUserIds.map(() => '?').join(', ');
    const rows = await this.prisma.$queryRawUnsafe<RawMembershipPermissionRow[]>(
      `
      SELECT brand_id, user_id, can_create_reports, can_approve_reports
      FROM brand_membership_permissions
      WHERE user_id IN (${userIdPlaceholders})
      `,
      ...uniqueUserIds
    );
    const allowedKeys = new Set(
      pairs.map(pair => this.membershipPermissionKey(pair.brandId, pair.userId))
    );

    return new Map(
      rows
        .filter(row => allowedKeys.has(this.membershipPermissionKey(row.brand_id, row.user_id)))
        .map(row => [this.membershipPermissionKey(row.brand_id, row.user_id), row] as const)
    );
  }

  private async syncResponsibleUsersWithClient(
    client: BrandServiceTransactionClient,
    input: {
      brandId: string;
      responsibleUserIds: string[];
    }
  ) {
    const responsibleUserIds = normalizeIdList(input.responsibleUserIds);
    const responsibleUserIdSet = new Set(responsibleUserIds);

    if (responsibleUserIds.length > 0) {
      const users = await client.user.findMany({
        where: {
          id: {
            in: responsibleUserIds
          }
        },
        select: {
          id: true,
          status: true
        }
      });
      const foundUserIds = new Set(users.map(user => user.id));
      const missingUserIds = responsibleUserIds.filter(userId => !foundUserIds.has(userId));

      if (missingUserIds.length > 0) {
        throw new BadRequestException(
          `Responsible users not found: ${missingUserIds.join(', ')}.`
        );
      }

      const inactiveUserIds = users
        .filter(user => user.status === UserStatus.inactive)
        .map(user => user.id);
      if (inactiveUserIds.length > 0) {
        throw new BadRequestException(
          'Inactive users cannot be assigned as brand responsible users.'
        );
      }

      const adminUsers = await client.brandMembership.findMany({
        where: {
          userId: {
            in: responsibleUserIds
          },
          role: BrandRole.admin
        },
        select: {
          userId: true
        },
        distinct: ['userId']
      });
      if (adminUsers.length > 0) {
        throw new BadRequestException(
          'Admin users are automatically assigned to all brands and should not be set as responsible users.'
        );
      }
    }

    const existingNonAdminMemberships = await client.brandMembership.findMany({
      where: {
        brandId: input.brandId,
        role: {
          not: BrandRole.admin
        }
      },
      select: {
        id: true,
        userId: true
      }
    });
    const existingUserIds = new Set(
      existingNonAdminMemberships.map(membership => membership.userId)
    );
    const userIdsToCreate = responsibleUserIds.filter(userId => !existingUserIds.has(userId));
    const userIdsToRemove = Array.from(
      new Set(
        existingNonAdminMemberships
          .filter(membership => !responsibleUserIdSet.has(membership.userId))
          .map(membership => membership.userId)
      )
    );

    if (userIdsToRemove.length > 0) {
      await client.brandMembership.deleteMany({
        where: {
          brandId: input.brandId,
          role: {
            not: BrandRole.admin
          },
          userId: {
            in: userIdsToRemove
          }
        }
      });
      await client.$executeRaw(
        Prisma.sql`
          DELETE FROM brand_membership_permissions
          WHERE brand_id = ${input.brandId}
            AND user_id IN (${Prisma.join(userIdsToRemove)})
        `
      );
    }

    if (userIdsToCreate.length > 0) {
      await client.brandMembership.createMany({
        data: userIdsToCreate.map(userId => ({
          brandId: input.brandId,
          userId,
          role: BrandRole.content
        }))
      });
    }
  }

  private async setBrandLogo(brandId: string, logoUrl: string | null) {
    await this.ensureBrandUiStorage();

    await this.setBrandLogoWithClient(this.prisma, brandId, logoUrl);
  }

  private normalizeMediaUrl(value: string | null | undefined) {
    const normalized = value?.trim() ?? '';
    return normalized.length > 0 ? normalized : null;
  }

  private async deleteRemovedLogoUrls(urls: Array<string | null | undefined>) {
    const targets = Array.from(
      new Set(
        urls
          .map(url => this.normalizeMediaUrl(url))
          .filter((url): url is string => !!url)
      )
    );

    for (const publicUrl of targets) {
      try {
        await this.mediaService.deleteObject({
          publicUrl
        });
      } catch (error) {
        this.logger.warn(
          `Failed to delete brand logo (${publicUrl}): ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
        );
      }
    }
  }

  private async setBrandLogoWithClient(
    client: BrandServiceTransactionClient,
    brandId: string,
    logoUrl: string | null
  ) {
    await client.$executeRawUnsafe(
      `
      INSERT INTO brand_ui_settings (
        brand_id,
        logo_url
      ) VALUES (?, ?)
      ON DUPLICATE KEY UPDATE
        logo_url = VALUES(logo_url),
        updated_at = CURRENT_TIMESTAMP(3)
      `,
      brandId,
      logoUrl
    );
  }

  private async assignDefaultKpisForNewBrandWithClient(
    client: BrandServiceTransactionClient,
    brandId: string,
    timezone: string
  ) {
    const defaultKpiCatalogIds = await this.readNewBrandDefaultKpiCatalogIdsWithClient(client);

    if (defaultKpiCatalogIds.length === 0) {
      return;
    }

    const activeCatalogRows = await client.globalKpiCatalog.findMany({
      where: {
        id: {
          in: defaultKpiCatalogIds
        },
        isActive: true
      },
      select: {
        id: true
      }
    });
    const activeCatalogIds = new Set(activeCatalogRows.map(row => row.id));
    const orderedIds = defaultKpiCatalogIds.filter(id => activeCatalogIds.has(id));

    if (orderedIds.length === 0) {
      return;
    }

    const year = this.resolveCurrentYearForTimezone(timezone);
    const plan = await client.brandKpiPlan.upsert({
      where: {
        brand_kpi_plan_brand_year_unique: {
          brandId,
          year
        }
      },
      update: {},
      create: {
        brandId,
        year
      }
    });

    await client.brandKpiPlanItem.deleteMany({
      where: {
        brandKpiPlanId: plan.id
      }
    });

    await client.brandKpiPlanItem.createMany({
      data: orderedIds.map((kpiCatalogId, index) => ({
        brandKpiPlanId: plan.id,
        kpiCatalogId,
        targetValue: null,
        note: null,
        sortOrder: index + 1
      }))
    });
  }

  private async readNewBrandDefaultKpiCatalogIdsWithClient(
    client: BrandServiceTransactionClient
  ) {
    const setting = await client.globalUiSetting.findUnique({
      where: {
        settingKey: NEW_BRAND_DEFAULT_KPI_SETTING_KEY
      },
      select: {
        valueJson: true
      }
    });

    if (!setting) {
      return [];
    }

    let payload: NewBrandDefaultKpiSettingPayload | null = null;

    try {
      const parsed = JSON.parse(setting.valueJson) as {
        kpiCatalogIds?: unknown;
      };
      payload = {
        kpiCatalogIds: Array.isArray(parsed.kpiCatalogIds)
          ? parsed.kpiCatalogIds
              .map(item => normalizeLabel(String(item)))
              .filter(item => !!item)
          : []
      };
    } catch {
      payload = null;
    }

    return payload?.kpiCatalogIds ?? [];
  }

  private resolveCurrentYearForTimezone(timezone: string) {
    try {
      const formattedYear = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric'
      }).format(new Date());

      const parsedYear = Number(formattedYear);
      if (Number.isFinite(parsedYear) && parsedYear > 2000) {
        return parsedYear;
      }
    } catch {
      // fall through to UTC year
    }

    return new Date().getUTCFullYear();
  }

  private async resolveNextAvailableBrandCode(seed: string) {
    const baseCode = normalizeBrandCode(seed) || 'brand';
    const existingRows = await this.prisma.brand.findMany({
      where: {
        OR: [
          { code: baseCode },
          {
            code: {
              startsWith: `${baseCode}-`
            }
          }
        ]
      },
      select: {
        code: true
      }
    });

    if (existingRows.length === 0) {
      return baseCode;
    }

    let maxSuffix = 1;

    for (const row of existingRows) {
      if (row.code === baseCode) {
        maxSuffix = Math.max(maxSuffix, 1);
        continue;
      }

      if (!row.code.startsWith(`${baseCode}-`)) {
        continue;
      }

      const suffixText = row.code.slice(baseCode.length + 1);
      const suffix = Number(suffixText);

      if (Number.isInteger(suffix) && suffix > maxSuffix) {
        maxSuffix = suffix;
      }
    }

    return `${baseCode}-${maxSuffix + 1}`;
  }

  private async ensureBrandUiStorage() {
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS brand_ui_settings (
        brand_id VARCHAR(191) NOT NULL,
        logo_url TEXT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (brand_id)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);
  }

  private async ensureGlobalUiSettingsStorage() {
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS global_ui_settings (
        setting_key VARCHAR(191) NOT NULL,
        value_json LONGTEXT NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (setting_key)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);
  }

  private async ensureMembershipPermissionStorage() {
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS brand_membership_permissions (
        brand_id VARCHAR(191) NOT NULL,
        user_id VARCHAR(191) NOT NULL,
        can_create_reports TINYINT(1) NULL,
        can_approve_reports TINYINT(1) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (brand_id, user_id),
        KEY brand_membership_permissions_user_id_idx (user_id)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);
  }
}
