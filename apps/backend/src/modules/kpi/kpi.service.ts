import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import {
  KpiSourceType,
  MappingTargetField,
  Prisma,
  ReportWorkflowState
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { BrandsService } from '../brands/brands.service';
import { METRIC_TARGET_FIELDS } from '../mapping/mapping-targets';
import {
  NEW_BRAND_DEFAULT_KPI_SETTING_KEY,
  type NewBrandDefaultKpiSettingPayload
} from './kpi-defaults.constants';
import {
  KPI_PLAN_SNAPSHOT_SETTING_VERSION,
  parseKpiPlanSnapshotSettingPayload,
  stringifyKpiPlanSnapshotSettingPayload,
  toKpiPlanSnapshotSettingKey
} from './kpi-plan-snapshot-setting';
import type {
  BrandKpiPlanResponse,
  CreateKpiCatalogInput,
  KpiCatalogListResponse,
  NewBrandDefaultKpiSelectionResponse,
  UpdateNewBrandDefaultKpiSelectionInput,
  UpdateBrandKpiPlanInput,
  UpdateKpiCatalogInput
} from './kpi.types';

function normalizeText(value: string | null | undefined) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function toKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

const KPI_MANUAL_CANONICAL_FIELDS = new Set<MappingTargetField>([
  MappingTargetField.viewers,
  MappingTargetField.page_followers
]);

const KPI_FORMULA_ONLY_FIELDS = new Set<MappingTargetField>([
  MappingTargetField.engagement
]);

type ApprovedKpiUsageSummary = {
  approvedReportCount: number;
  missingSnapshotCount: number;
  hasLegacyCoverageGap: boolean;
  usageByKpiCatalogId: Map<string, number>;
};

@Injectable()
export class KpiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly brandsService: BrandsService
  ) {}

  async listCatalog(includeInactive = false): Promise<KpiCatalogListResponse> {
    const items = await this.prisma.globalKpiCatalog.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: {
        formula: true,
        _count: {
          select: {
            planItems: true
          }
        }
      },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }]
    });

    return {
      items: items.map(item => ({
        id: item.id,
        key: item.key,
        label: item.label,
        description: item.description,
        sourceType: item.sourceType,
        canonicalMetricKey: item.canonicalMetricKey,
        formulaId: item.formulaId,
        formulaLabel: item.formula?.columnLabel ?? null,
        isActive: item.isActive,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
        usage: {
          activePlanCount: item._count.planItems
        }
      })),
      newBrandDefaultKpiCatalogIds: await this.readNewBrandDefaultKpiSelection()
    };
  }

  async getNewBrandDefaultKpiSelection(): Promise<NewBrandDefaultKpiSelectionResponse> {
    return {
      kpiCatalogIds: await this.readNewBrandDefaultKpiSelection()
    };
  }

  async updateNewBrandDefaultKpiSelection(
    input: UpdateNewBrandDefaultKpiSelectionInput
  ): Promise<NewBrandDefaultKpiSelectionResponse> {
    await this.ensureGlobalUiSettingsStorage();
    const submittedIds = Array.from(
      new Set((input.kpiCatalogIds ?? []).map(id => normalizeText(id)).filter(id => !!id))
    );

    if (submittedIds.length > 0) {
      const activeCatalogItems = await this.prisma.globalKpiCatalog.findMany({
        where: {
          id: {
            in: submittedIds
          },
          isActive: true
        },
        select: {
          id: true
        }
      });
      const activeIds = new Set(activeCatalogItems.map(item => item.id));

      if (submittedIds.some(id => !activeIds.has(id))) {
        throw new BadRequestException(
          'Default KPI selection can include only active KPI definitions.'
        );
      }
    }

    const payload: NewBrandDefaultKpiSettingPayload = {
      kpiCatalogIds: submittedIds
    };

    await this.prisma.globalUiSetting.upsert({
      where: {
        settingKey: NEW_BRAND_DEFAULT_KPI_SETTING_KEY
      },
      update: {
        valueJson: JSON.stringify(payload)
      },
      create: {
        settingKey: NEW_BRAND_DEFAULT_KPI_SETTING_KEY,
        valueJson: JSON.stringify(payload)
      }
    });

    return {
      kpiCatalogIds: await this.readNewBrandDefaultKpiSelection()
    };
  }

  async createCatalogItem(input: CreateKpiCatalogInput) {
    const payload = await this.normalizeCatalogPayload(input);
    const existingKeys = new Set(
      (
        await this.prisma.globalKpiCatalog.findMany({
          select: { key: true }
        })
      ).map(item => item.key)
    );

    const baseKey = toKey(payload.label);

    if (!baseKey) {
      throw new BadRequestException('KPI label is required.');
    }

    let key = baseKey;
    let suffix = 2;

    while (existingKeys.has(key)) {
      key = `${baseKey}_${suffix}`;
      suffix += 1;
    }

    await this.prisma.globalKpiCatalog.create({
      data: {
        key,
        label: payload.label,
        description: payload.description,
        sourceType: payload.sourceType,
        canonicalMetricKey: payload.canonicalMetricKey,
        formulaId: payload.formulaId,
        isActive: payload.isActive
      }
    });

    return this.listCatalog(true);
  }

  async updateCatalogItem(kpiId: string, input: UpdateKpiCatalogInput) {
    const existing = await this.prisma.globalKpiCatalog.findUnique({
      where: {
        id: kpiId
      }
    });

    if (!existing) {
      throw new NotFoundException('KPI catalog item was not found.');
    }

    const payload = await this.normalizeCatalogPayload(
      {
        label: input.label ?? existing.label,
        description: input.description ?? existing.description,
        sourceType: input.sourceType ?? existing.sourceType,
        canonicalMetricKey: input.canonicalMetricKey ?? existing.canonicalMetricKey,
        formulaId: input.formulaId ?? existing.formulaId,
        isActive: input.isActive ?? existing.isActive
      },
      true
    );

    await this.prisma.globalKpiCatalog.update({
      where: {
        id: kpiId
      },
      data: {
        label: payload.label,
        description: payload.description,
        sourceType: payload.sourceType,
        canonicalMetricKey: payload.canonicalMetricKey,
        formulaId: payload.formulaId,
        isActive: payload.isActive
      }
    });

    return this.listCatalog(true);
  }

  async deleteCatalogItem(kpiId: string) {
    const existing = await this.prisma.globalKpiCatalog.findUnique({
      where: {
        id: kpiId
      },
      include: {
        _count: {
          select: {
            planItems: true
          }
        }
      }
    });

    if (!existing) {
      throw new NotFoundException('KPI catalog item was not found.');
    }

    if (existing._count.planItems > 0) {
      throw new ConflictException(
        `Cannot delete KPI "${existing.label}" because it is used in ${existing._count.planItems} yearly plan${existing._count.planItems === 1 ? '' : 's'}.`
      );
    }

    await this.prisma.globalKpiCatalog.delete({
      where: {
        id: kpiId
      }
    });

    return {
      deleted: true
    };
  }

  async getBrandKpiPlan(brandCode: string, year: number): Promise<BrandKpiPlanResponse> {
    const brand = await this.brandsService.getBrandByCodeOrThrow(brandCode);
    return this.getBrandKpiPlanByBrand(brand, year);
  }

  async getBrandKpiPlanForReportVersion(
    brandCode: string,
    year: number,
    reportVersionId: string,
    options?: {
      preferSnapshot?: boolean;
      autoCaptureFromCurrentPlan?: boolean;
    }
  ) {
    const brand = await this.brandsService.getBrandByCodeOrThrow(brandCode);
    const preferSnapshot = !!options?.preferSnapshot;

    if (preferSnapshot) {
      const snapshot = await this.readKpiPlanSnapshotForReportVersion(reportVersionId, brand);
      if (snapshot) {
        return snapshot;
      }

      const currentPlan = await this.getBrandKpiPlanByBrand(brand, year);
      if (options?.autoCaptureFromCurrentPlan && currentPlan.items.length > 0) {
        await this.captureKpiPlanSnapshotForReportVersion(reportVersionId);
        const capturedSnapshot = await this.readKpiPlanSnapshotForReportVersion(
          reportVersionId,
          brand
        );

        if (capturedSnapshot) {
          return capturedSnapshot;
        }
      }

      return currentPlan;
    }

    return this.getBrandKpiPlanByBrand(brand, year);
  }

  async captureKpiPlanSnapshotForReportVersion(
    reportVersionId: string,
    tx?: Prisma.TransactionClient
  ) {
    const client = tx ?? this.prisma;
    await this.ensureGlobalUiSettingsStorageWithClient(client);

    const settingKey = toKpiPlanSnapshotSettingKey(reportVersionId);
    const existingSnapshot = await client.globalUiSetting.findUnique({
      where: {
        settingKey
      },
      select: {
        settingKey: true
      }
    });

    if (existingSnapshot) {
      return;
    }

    const reportVersion = await client.reportVersion.findUnique({
      where: {
        id: reportVersionId
      },
      include: {
        reportingPeriod: {
          include: {
            brand: true
          }
        }
      }
    });

    if (!reportVersion) {
      throw new NotFoundException('Report version was not found.');
    }

    if (reportVersion.workflowState !== ReportWorkflowState.approved) {
      return;
    }

    const plan = await client.brandKpiPlan.findUnique({
      where: {
        brand_kpi_plan_brand_year_unique: {
          brandId: reportVersion.reportingPeriod.brandId,
          year: reportVersion.reportingPeriod.year
        }
      },
      include: {
        items: {
          include: {
            kpiCatalog: {
              include: {
                formula: true
              }
            }
          },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
        }
      }
    });

    const payload = {
      version: KPI_PLAN_SNAPSHOT_SETTING_VERSION,
      capturedAt: new Date().toISOString(),
      year: reportVersion.reportingPeriod.year,
      plan: {
        id: plan?.id ?? null,
        itemCount: plan?.items.length ?? 0,
        updatedAt: plan?.updatedAt?.toISOString() ?? null
      },
      items:
        plan?.items.map(item => ({
          id: item.id,
          sortOrder: item.sortOrder,
          targetValue: item.targetValue,
          note: item.note,
          kpi: {
            id: item.kpiCatalog.id,
            key: item.kpiCatalog.key,
            label: item.kpiCatalog.label,
            description: item.kpiCatalog.description,
            sourceType: item.kpiCatalog.sourceType,
            canonicalMetricKey: item.kpiCatalog.canonicalMetricKey,
            formulaId: item.kpiCatalog.formulaId,
            formulaLabel: item.kpiCatalog.formula?.columnLabel ?? null,
            isActive: item.kpiCatalog.isActive
          }
        })) ?? []
    };

    await client.globalUiSetting.upsert({
      where: {
        settingKey
      },
      update: {
        valueJson: stringifyKpiPlanSnapshotSettingPayload(payload)
      },
      create: {
        settingKey,
        valueJson: stringifyKpiPlanSnapshotSettingPayload(payload)
      }
    });
  }

  async updateBrandKpiPlan(
    brandCode: string,
    year: number,
    input: UpdateBrandKpiPlanInput
  ) {
    const brand = await this.brandsService.getBrandByCodeOrThrow(brandCode);
    const existingPlan = await this.prisma.brandKpiPlan.findUnique({
      where: {
        brand_kpi_plan_brand_year_unique: {
          brandId: brand.id,
          year
        }
      },
      include: {
        items: {
          include: {
            kpiCatalog: {
              select: {
                id: true,
                label: true
              }
            }
          }
        }
      }
    });
    const submittedItems = input.items.filter(item => normalizeText(item.kpiCatalogId));
    const dedupedIds = new Set<string>();

    for (const item of submittedItems) {
      if (dedupedIds.has(item.kpiCatalogId)) {
        throw new ConflictException('Each KPI can appear only once in the annual plan.');
      }

      dedupedIds.add(item.kpiCatalogId);
    }

    const catalogIds = submittedItems.map(item => item.kpiCatalogId);
    const existingCatalog = catalogIds.length
      ? await this.prisma.globalKpiCatalog.findMany({
          where: {
            id: {
              in: catalogIds
            }
          }
        })
      : [];

    if (existingCatalog.length !== catalogIds.length) {
      throw new BadRequestException('One or more KPI definitions were not found.');
    }

    const currentKpiIds = new Set(existingPlan?.items.map(item => item.kpiCatalogId) ?? []);
    const submittedKpiIds = new Set(submittedItems.map(item => item.kpiCatalogId));
    const removedKpiIds = Array.from(currentKpiIds).filter(id => !submittedKpiIds.has(id));

    if (removedKpiIds.length > 0) {
      const approvedUsage = await this.getApprovedKpiUsageForBrandYear(brand.id, year);
      const blockedByApprovedReports = removedKpiIds.filter(
        kpiCatalogId => (approvedUsage.usageByKpiCatalogId.get(kpiCatalogId) ?? 0) > 0
      );

      if (blockedByApprovedReports.length > 0) {
        const labelsByCatalogId = new Map(
          (existingPlan?.items ?? []).map(item => [item.kpiCatalogId, item.kpiCatalog.label])
        );
        const blockedLabels = blockedByApprovedReports
          .map(kpiCatalogId => labelsByCatalogId.get(kpiCatalogId) ?? kpiCatalogId)
          .slice(0, 3)
          .join(', ');
        const blockedCount = blockedByApprovedReports.length;

        throw new ConflictException(
          blockedLabels.length > 0
            ? `Cannot remove KPI already used in approved reports for ${year}: ${blockedLabels}${blockedCount > 3 ? ` (+${blockedCount - 3} more)` : ''}.`
            : `Cannot remove KPI already used in approved reports for ${year}.`
        );
      }

      if (approvedUsage.hasLegacyCoverageGap) {
        throw new ConflictException(
          `Cannot remove KPI for ${year} because ${approvedUsage.missingSnapshotCount} approved report${approvedUsage.missingSnapshotCount === 1 ? '' : 's'} do not have KPI snapshot coverage yet.`
        );
      }
    }

    await this.prisma.$transaction(async tx => {
      const plan = await tx.brandKpiPlan.upsert({
        where: {
          brand_kpi_plan_brand_year_unique: {
            brandId: brand.id,
            year
          }
        },
        update: {},
        create: {
          brandId: brand.id,
          year
        }
      });

      await tx.brandKpiPlanItem.deleteMany({
        where: {
          brandKpiPlanId: plan.id
        }
      });

      if (submittedItems.length > 0) {
        await tx.brandKpiPlanItem.createMany({
          data: submittedItems.map((item, index) => ({
            brandKpiPlanId: plan.id,
            kpiCatalogId: item.kpiCatalogId,
            targetValue:
              item.targetValue === undefined || item.targetValue === null
                ? null
                : Number(item.targetValue),
            note: normalizeText(item.note),
            sortOrder:
              item.sortOrder !== undefined &&
              item.sortOrder !== null &&
              Number.isInteger(item.sortOrder) &&
              item.sortOrder > 0
                ? item.sortOrder
                : index + 1
          }))
        });
      }
    });

    return this.getBrandKpiPlan(brandCode, year);
  }

  private async getBrandKpiPlanByBrand(
    brand: {
      id: string;
      code: string;
      name: string;
    },
    year: number
  ): Promise<BrandKpiPlanResponse> {
    const [plan, approvedUsage] = await Promise.all([
      this.prisma.brandKpiPlan.findUnique({
        where: {
          brand_kpi_plan_brand_year_unique: {
            brandId: brand.id,
            year
          }
        },
        include: {
          items: {
            include: {
              kpiCatalog: {
                include: {
                  formula: true
                }
              }
            },
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
          }
        }
      }),
      this.getApprovedKpiUsageForBrandYear(brand.id, year)
    ]);

    return {
      brand: {
        id: brand.id,
        code: brand.code,
        name: brand.name
      },
      year,
      plan: {
        id: plan?.id ?? null,
        itemCount: plan?.items.length ?? 0,
        updatedAt: plan?.updatedAt.toISOString() ?? null,
        approvedReportCount: approvedUsage.approvedReportCount,
        hasLegacyCoverageGap: approvedUsage.hasLegacyCoverageGap
      },
      items:
        plan?.items.map(item => ({
          ...this.buildKpiPlanItemRemovalGuard({
            approvedUsage,
            kpiCatalogId: item.kpiCatalog.id,
            year
          }),
          id: item.id,
          sortOrder: item.sortOrder,
          targetValue: item.targetValue,
          note: item.note,
          kpi: {
            id: item.kpiCatalog.id,
            key: item.kpiCatalog.key,
            label: item.kpiCatalog.label,
            description: item.kpiCatalog.description,
            sourceType: item.kpiCatalog.sourceType,
            canonicalMetricKey: item.kpiCatalog.canonicalMetricKey,
            formulaId: item.kpiCatalog.formulaId,
            formulaLabel: item.kpiCatalog.formula?.columnLabel ?? null,
            isActive: item.kpiCatalog.isActive
          }
        })) ?? []
    };
  }

  private buildKpiPlanItemRemovalGuard(input: {
    approvedUsage: ApprovedKpiUsageSummary;
    kpiCatalogId: string;
    year: number;
  }) {
    const approvedReportCount =
      input.approvedUsage.usageByKpiCatalogId.get(input.kpiCatalogId) ?? 0;
    const blockedByLegacyCoverageGap = input.approvedUsage.hasLegacyCoverageGap;
    const canRemove = approvedReportCount === 0 && !blockedByLegacyCoverageGap;
    const removeBlockedReason =
      approvedReportCount > 0
        ? `Cannot remove because this KPI is already used in ${approvedReportCount} approved report${approvedReportCount === 1 ? '' : 's'} for ${input.year}.`
        : blockedByLegacyCoverageGap
          ? `Cannot remove because ${input.approvedUsage.missingSnapshotCount} approved report${input.approvedUsage.missingSnapshotCount === 1 ? '' : 's'} in ${input.year} do not have KPI snapshot coverage yet.`
          : null;

    return {
      canRemove,
      removeBlockedReason,
      usage: {
        approvedReportCount,
        blockedByLegacyCoverageGap
      }
    };
  }

  private async readKpiPlanSnapshotForReportVersion(
    reportVersionId: string,
    brand: {
      id: string;
      code: string;
      name: string;
    }
  ): Promise<BrandKpiPlanResponse | null> {
    await this.ensureGlobalUiSettingsStorage();

    const setting = await this.prisma.globalUiSetting.findUnique({
      where: {
        settingKey: toKpiPlanSnapshotSettingKey(reportVersionId)
      },
      select: {
        valueJson: true
      }
    });

    const parsed = parseKpiPlanSnapshotSettingPayload(setting?.valueJson ?? null);
    if (!parsed) {
      return null;
    }

    return {
      brand: {
        id: brand.id,
        code: brand.code,
        name: brand.name
      },
      year: parsed.year,
      plan: {
        id: parsed.plan.id,
        itemCount: parsed.items.length,
        updatedAt: parsed.plan.updatedAt
      },
      items: parsed.items.map(item => ({
        id: item.id,
        sortOrder: item.sortOrder,
        targetValue: item.targetValue,
        note: item.note,
        canRemove: false,
        removeBlockedReason: 'This KPI comes from a report snapshot and is immutable.',
        usage: {
          approvedReportCount: 0,
          blockedByLegacyCoverageGap: false
        },
        kpi: {
          id: item.kpi.id,
          key: item.kpi.key,
          label: item.kpi.label,
          description: item.kpi.description,
          sourceType: item.kpi.sourceType,
          canonicalMetricKey: item.kpi.canonicalMetricKey,
          formulaId: item.kpi.formulaId,
          formulaLabel: item.kpi.formulaLabel,
          isActive: item.kpi.isActive
        }
      }))
    };
  }

  private async getApprovedKpiUsageForBrandYear(
    brandId: string,
    year: number
  ): Promise<ApprovedKpiUsageSummary> {
    const approvedVersions = await this.prisma.reportVersion.findMany({
      where: {
        workflowState: ReportWorkflowState.approved,
        reportingPeriod: {
          brandId,
          year
        }
      },
      select: {
        id: true
      }
    });

    if (approvedVersions.length === 0) {
      return {
        approvedReportCount: 0,
        missingSnapshotCount: 0,
        hasLegacyCoverageGap: false,
        usageByKpiCatalogId: new Map()
      };
    }

    await this.ensureGlobalUiSettingsStorage();
    const keys = approvedVersions.map(version => toKpiPlanSnapshotSettingKey(version.id));
    const rawSnapshots = await this.prisma.globalUiSetting.findMany({
      where: {
        settingKey: {
          in: keys
        }
      },
      select: {
        settingKey: true,
        valueJson: true
      }
    });
    const valueBySettingKey = new Map(
      rawSnapshots.map(item => [item.settingKey, item.valueJson] as const)
    );

    let missingSnapshotCount = 0;
    const usageByKpiCatalogId = new Map<string, number>();

    for (const version of approvedVersions) {
      const parsed = parseKpiPlanSnapshotSettingPayload(
        valueBySettingKey.get(toKpiPlanSnapshotSettingKey(version.id)) ?? null
      );

      if (!parsed) {
        missingSnapshotCount += 1;
        continue;
      }

      const uniqueKpiIds = new Set(
        parsed.items
          .map(item => normalizeText(item.kpi.id))
          .filter((kpiCatalogId): kpiCatalogId is string => !!kpiCatalogId)
      );

      for (const kpiCatalogId of uniqueKpiIds) {
        usageByKpiCatalogId.set(
          kpiCatalogId,
          (usageByKpiCatalogId.get(kpiCatalogId) ?? 0) + 1
        );
      }
    }

    return {
      approvedReportCount: approvedVersions.length,
      missingSnapshotCount,
      hasLegacyCoverageGap: missingSnapshotCount > 0,
      usageByKpiCatalogId
    };
  }

  private async normalizeCatalogPayload(
    input: CreateKpiCatalogInput,
    allowExistingFormula = false
  ) {
    const label = normalizeText(input.label);
    const description = normalizeText(input.description);
    const sourceType = input.sourceType;
    const isActive = input.isActive ?? true;

    if (!label) {
      throw new BadRequestException('KPI label is required.');
    }

    if (!Object.values(KpiSourceType).includes(sourceType)) {
      throw new BadRequestException('Invalid KPI source type.');
    }

    if (sourceType === KpiSourceType.canonical_metric) {
      const canonicalMetricKey = input.canonicalMetricKey ?? null;
      const isMappedDatasetMetric = !!canonicalMetricKey && METRIC_TARGET_FIELDS.includes(canonicalMetricKey);
      const isManualCanonicalMetric = !!canonicalMetricKey && KPI_MANUAL_CANONICAL_FIELDS.has(canonicalMetricKey);

      if (!canonicalMetricKey || (!isMappedDatasetMetric && !isManualCanonicalMetric)) {
        throw new BadRequestException('Canonical metric KPIs must select a valid metric field.');
      }

      if (KPI_FORMULA_ONLY_FIELDS.has(canonicalMetricKey)) {
        throw new BadRequestException(
          'Engagement KPI must use Formula column source, not canonical metric source.'
        );
      }

      return {
        label,
        description: description || null,
        sourceType,
        canonicalMetricKey,
        formulaId: null,
        isActive
      };
    }

    const formulaId = normalizeText(input.formulaId);

    if (!formulaId) {
      throw new BadRequestException('Formula-column KPIs must select a formula column.');
    }

    const formula = await this.prisma.globalComputedFormula.findUnique({
      where: {
        id: formulaId
      }
    });

    if (!formula) {
      throw new BadRequestException('Selected formula column was not found.');
    }

    if (!allowExistingFormula && !formula.isActive) {
      throw new BadRequestException('Selected formula column must be active before it can power a KPI.');
    }

    return {
      label,
      description: description || null,
      sourceType,
      canonicalMetricKey: null as MappingTargetField | null,
      formulaId,
      isActive
    };
  }

  private async readNewBrandDefaultKpiSelection() {
    await this.ensureGlobalUiSettingsStorage();
    const rawSetting = await this.prisma.globalUiSetting.findUnique({
      where: {
        settingKey: NEW_BRAND_DEFAULT_KPI_SETTING_KEY
      },
      select: {
        valueJson: true
      }
    });

    if (!rawSetting) {
      return [];
    }

    let parsedPayload: NewBrandDefaultKpiSettingPayload | null = null;

    try {
      const parsed = JSON.parse(rawSetting.valueJson) as {
        kpiCatalogIds?: unknown;
      };
      parsedPayload = {
        kpiCatalogIds: Array.isArray(parsed.kpiCatalogIds)
          ? parsed.kpiCatalogIds
              .map(item => normalizeText(String(item)))
              .filter(item => !!item)
          : []
      };
    } catch {
      parsedPayload = null;
    }

    if (!parsedPayload || parsedPayload.kpiCatalogIds.length === 0) {
      return [];
    }

    const existingActiveCatalog = await this.prisma.globalKpiCatalog.findMany({
      where: {
        id: {
          in: parsedPayload.kpiCatalogIds
        },
        isActive: true
      },
      select: {
        id: true
      }
    });
    const activeIds = new Set(existingActiveCatalog.map(item => item.id));

    return parsedPayload.kpiCatalogIds.filter(id => activeIds.has(id));
  }

  private async ensureGlobalUiSettingsStorage() {
    await this.ensureGlobalUiSettingsStorageWithClient(this.prisma);
  }

  private async ensureGlobalUiSettingsStorageWithClient(
    client: PrismaService | Prisma.TransactionClient
  ) {
    await client.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS global_ui_settings (
        setting_key VARCHAR(191) NOT NULL,
        value_json LONGTEXT NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (setting_key)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);
  }
}
