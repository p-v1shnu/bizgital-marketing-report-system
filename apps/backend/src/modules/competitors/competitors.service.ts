import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException
} from '@nestjs/common';
import {
  BrandCompetitorStatus,
  CompetitorMonitoringStatus,
  CompetitorStatus,
  Prisma,
  ReportWorkflowState
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { BrandsService } from '../brands/brands.service';
import { MediaService } from '../media/media.service';
import type {
  CompetitorCatalogResponse,
  CompetitorOverviewResponse,
  CompetitorYearSetupResponse,
  SaveCompetitorMasterInput,
  SaveCompetitorMonitoringInput,
  UpdateAssignmentStatusInput,
  UpdateCompetitorMasterInput
} from './competitors.types';

const MAX_MONITORED_POSTS = 5;

type AssignmentWithCompetitor = {
  id: string;
  competitorId: string;
  displayOrder: number;
  status: CompetitorStatus;
  canRemove: boolean;
  removeBlockedReason: string | null;
  competitor: {
    id: string;
    name: string;
    primaryPlatform: string;
    status: CompetitorStatus;
    websiteUrl: string | null;
    facebookUrl: string | null;
    instagramUrl: string | null;
    tiktokUrl: string | null;
    youtubeUrl: string | null;
  };
};

type MonitoringWithPosts = {
  id: string;
  status: CompetitorMonitoringStatus | null;
  followerCount: number | null;
  monthlyPostCount: number | null;
  noActivityNote: string | null;
  noActivityEvidenceImageUrl: string | null;
  posts: Array<{
    id: string;
    displayOrder: number;
    screenshotUrl: string;
    postUrl: string | null;
    note?: string | null;
  }>;
};

@Injectable()
export class CompetitorsService {
  private readonly logger = new Logger(CompetitorsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly brandsService: BrandsService,
    private readonly mediaService: MediaService
  ) {}

  async getOverview(
    brandCode: string,
    periodId: string
  ): Promise<CompetitorOverviewResponse> {
    const { brand, period, currentDraft, latestVersion, targetVersion } =
      await this.getPeriodContext(brandCode, periodId);
    const baseResponse = this.toBaseOverviewResponse({
      brand,
      period,
      currentDraftVersionId: currentDraft?.id ?? null,
      latestVersionState: latestVersion?.workflowState ?? null
    });

    if (!targetVersion) {
      return {
        ...baseResponse,
        readiness: {
          state: 'blocked',
          detail: 'Create a reporting version before competitor monitoring can be captured.',
          requiredCompetitorCount: 0,
          completedCompetitorCount: 0
        },
        items: []
      };
    }

    const assignments = await this.getAssignmentsForYear(
      brand.id,
      period.year,
      period.month
    );

    if (assignments.length === 0) {
      return {
        ...baseResponse,
        readiness: {
          state: 'blocked',
          detail: 'No competitors are assigned for this brand and year yet.',
          requiredCompetitorCount: 0,
          completedCompetitorCount: 0
        },
        items: []
      };
    }

    const competitorIds = assignments.map((item) => item.competitorId);
    const [monitoringRows, evidenceRows] = await Promise.all([
      this.prisma.competitorMonitoring.findMany({
        where: {
          reportVersionId: targetVersion.id,
          competitorId: {
            in: competitorIds
          }
        },
        include: {
          posts: {
            orderBy: {
              displayOrder: 'asc'
            }
          }
        }
      }),
      this.prisma.competitorEvidence.findMany({
        where: {
          reportVersionId: targetVersion.id,
          competitorId: {
            in: competitorIds
          }
        }
      })
    ]);

    const monitoringByCompetitor = new Map(
      monitoringRows.map((row) => [row.competitorId, row])
    );
    const evidenceByCompetitor = new Map(
      evidenceRows.map((row) => [row.competitorId, row])
    );

    const items: CompetitorOverviewResponse['items'] = assignments.map((assignment) => {
      const monitoring = monitoringByCompetitor.get(assignment.competitorId) ?? null;
      const completion = this.getMonitoringCompletion(monitoring);
      const evidence = evidenceByCompetitor.get(assignment.competitorId) ?? null;
      const isRequired = assignment.status === CompetitorStatus.active;
      const isComplete = isRequired ? completion.isComplete : true;

      return {
        assignment: {
          status: assignment.status,
          isRequired
        },
        competitor: {
          id: assignment.competitor.id,
          name: assignment.competitor.name,
          primaryPlatform: assignment.competitor.primaryPlatform,
          displayOrder: assignment.displayOrder,
          websiteUrl: assignment.competitor.websiteUrl,
          facebookUrl: assignment.competitor.facebookUrl,
          instagramUrl: assignment.competitor.instagramUrl,
          tiktokUrl: assignment.competitor.tiktokUrl,
          youtubeUrl: assignment.competitor.youtubeUrl
        },
        evidence: {
          id: evidence?.id ?? null,
          title: evidence?.title ?? null,
          note: evidence?.note ?? null,
          postUrl: evidence?.postUrl ?? null,
          capturedMetricLabel: evidence?.capturedMetricLabel ?? null,
          capturedMetricValue: evidence?.capturedMetricValue ?? null,
          isComplete
        },
        monitoring: {
          id: monitoring?.id ?? null,
          status: monitoring?.status ?? null,
          followerCount: monitoring?.followerCount ?? null,
          monthlyPostCount: monitoring?.monthlyPostCount ?? null,
          highlightNote: monitoring?.noActivityNote ?? null,
          noActivityEvidenceImageUrl: monitoring?.noActivityEvidenceImageUrl ?? null,
          posts: (monitoring?.posts ?? []).map((post) => ({
            id: post.id,
            displayOrder: post.displayOrder,
            screenshotUrl: post.screenshotUrl,
            postUrl: post.postUrl
          })),
          completion,
          isComplete: completion.isComplete
        }
      };
    });

    const requiredItems = items.filter((item) => item.assignment.isRequired);
    const completedCompetitorCount = requiredItems.filter(
      (item) => item.monitoring.isComplete
    ).length;
    const requiredCompetitorCount = requiredItems.length;

    return {
      ...baseResponse,
      readiness: {
        state: completedCompetitorCount === requiredCompetitorCount ? 'ready' : 'pending',
        detail:
          requiredCompetitorCount === 0
            ? 'No active competitors require monitoring in this month.'
            : completedCompetitorCount === requiredCompetitorCount
              ? 'Every active assigned competitor is complete for monitoring this month.'
              : 'Complete monitoring for every active assigned competitor before submit.',
        requiredCompetitorCount,
        completedCompetitorCount
      },
      items
    };
  }

  async saveMonitoring(
    brandCode: string,
    periodId: string,
    competitorId: string,
    input: SaveCompetitorMonitoringInput
  ) {
    const { brand, period, currentDraft } = await this.getPeriodContext(brandCode, periodId);

    if (!currentDraft) {
      throw new ConflictException('Create or resume a draft before editing competitor monitoring.');
    }

    const assignment = await this.getAssignmentForCompetitor({
      brandId: brand.id,
      year: period.year,
      competitorId
    });

    if (!assignment) {
      throw new NotFoundException('Competitor is not assigned for this brand and reporting year.');
    }

    const normalized = this.normalizeMonitoringInput(input);
    await this.mediaService.assertManagedPublicUrlsExist(
      [
        normalized.noActivityEvidenceImageUrl,
        ...normalized.posts.map((post) => post.screenshotUrl)
      ],
      'Competitor evidence image'
    );
    const shouldDelete =
      normalized.status === null &&
      normalized.followerCount === null &&
      normalized.monthlyPostCount === null &&
      !normalized.highlightNote &&
      !normalized.noActivityEvidenceImageUrl &&
      normalized.posts.length === 0;

    const existing = await this.prisma.competitorMonitoring.findUnique({
      where: {
        competitor_monitoring_version_competitor_unique: {
          reportVersionId: currentDraft.id,
          competitorId
        }
      },
      select: {
        id: true,
        noActivityEvidenceImageUrl: true,
        posts: {
          select: {
            screenshotUrl: true
          }
        }
      }
    });
    const previousMediaUrls = this.collectMonitoringMediaUrls(existing);

    if (shouldDelete) {
      if (existing) {
        await this.prisma.competitorMonitoring.delete({
          where: {
            id: existing.id
          }
        });
        await this.deleteRemovedMediaUrls(Array.from(previousMediaUrls));
      }

      await this.auditLogService.append({
        actionKey: 'CONTENT_COMPETITOR_EVIDENCE_UPDATED',
        entityType: 'CONTENT',
        entityId: competitorId,
        entityLabel: assignment.competitor.name,
        summary: `Cleared competitor evidence for "${assignment.competitor.name}".`,
        metadata: {
          reportVersionId: currentDraft.id,
          brandId: brand.id,
          periodId: period.id
        },
        actor: {
          actorName: input.actorName,
          actorEmail: input.actorEmail
        }
      });

      return {
        deleted: !!existing
      };
    }

    const persisted = await this.prisma.$transaction(async (tx) => {
      const monitoring = await tx.competitorMonitoring.upsert({
        where: {
          competitor_monitoring_version_competitor_unique: {
            reportVersionId: currentDraft.id,
            competitorId
          }
        },
        update: {
          status: normalized.status,
          followerCount: normalized.followerCount,
          monthlyPostCount:
            normalized.status === CompetitorMonitoringStatus.has_posts
              ? normalized.monthlyPostCount
              : null,
          noActivityNote: normalized.highlightNote,
          noActivityEvidenceImageUrl:
            normalized.status === CompetitorMonitoringStatus.has_posts
              ? null
              : normalized.noActivityEvidenceImageUrl
        },
        create: {
          reportVersionId: currentDraft.id,
          competitorId,
          status: normalized.status,
          followerCount: normalized.followerCount,
          monthlyPostCount:
            normalized.status === CompetitorMonitoringStatus.has_posts
              ? normalized.monthlyPostCount
              : null,
          noActivityNote: normalized.highlightNote,
          noActivityEvidenceImageUrl:
            normalized.status === CompetitorMonitoringStatus.has_posts
              ? null
              : normalized.noActivityEvidenceImageUrl
        }
      });

      await tx.competitorMonitoringPost.deleteMany({
        where: {
          competitorMonitoringId: monitoring.id
        }
      });

      if (normalized.status === CompetitorMonitoringStatus.has_posts && normalized.posts.length > 0) {
        await tx.competitorMonitoringPost.createMany({
          data: normalized.posts.map((post) => ({
            competitorMonitoringId: monitoring.id,
            displayOrder: post.displayOrder,
            screenshotUrl: post.screenshotUrl,
            postUrl: post.postUrl,
            note: null
          }))
        });
      }

      return tx.competitorMonitoring.findUniqueOrThrow({
        where: {
          id: monitoring.id
        },
        include: {
          posts: {
            orderBy: {
              displayOrder: 'asc'
            }
          }
        }
      });
    });

    const completion = this.getMonitoringCompletion(persisted);
    const currentMediaUrls = this.collectMonitoringMediaUrls(persisted);
    const removedMediaUrls = Array.from(previousMediaUrls).filter(
      (url) => !currentMediaUrls.has(url)
    );
    await this.deleteRemovedMediaUrls(removedMediaUrls);

    await this.auditLogService.append({
      actionKey: 'CONTENT_COMPETITOR_EVIDENCE_UPDATED',
      entityType: 'CONTENT',
      entityId: competitorId,
      entityLabel: assignment.competitor.name,
      summary: `Updated competitor evidence for "${assignment.competitor.name}".`,
      metadata: {
        reportVersionId: currentDraft.id,
        brandId: brand.id,
        periodId: period.id,
        status: persisted.status,
        postCount: persisted.posts.length,
        monthlyPostCount: persisted.monthlyPostCount
      },
      actor: {
        actorName: input.actorName,
        actorEmail: input.actorEmail
      }
    });

    return {
      id: persisted.id,
      competitorId,
      status: persisted.status,
      followerCount: persisted.followerCount,
      monthlyPostCount: persisted.monthlyPostCount,
      highlightNote: persisted.noActivityNote,
      noActivityEvidenceImageUrl: persisted.noActivityEvidenceImageUrl,
      posts: persisted.posts.map((post) => ({
        id: post.id,
        displayOrder: post.displayOrder,
        screenshotUrl: post.screenshotUrl,
        postUrl: post.postUrl
      })),
      completion,
      isComplete: completion.isComplete
    };
  }

  async saveEvidence(
    brandCode: string,
    periodId: string,
    competitorId: string,
    input: {
      title?: string | null;
      note?: string | null;
      postUrl?: string | null;
      capturedMetricLabel?: string | null;
      capturedMetricValue?: number | null;
    }
  ) {
    const { brand, period, currentDraft } = await this.getPeriodContext(brandCode, periodId);

    if (!currentDraft) {
      throw new ConflictException('Create or resume a draft before editing competitor evidence.');
    }

    const assignment = await this.getAssignmentForCompetitor({
      brandId: brand.id,
      year: period.year,
      competitorId
    });

    if (!assignment) {
      throw new NotFoundException('Competitor is not assigned for this brand and reporting year.');
    }

    const title = this.normalizeOptionalText(input.title);
    const note = this.normalizeOptionalText(input.note);
    const postUrl = this.normalizeOptionalText(input.postUrl);
    const capturedMetricLabel = this.normalizeOptionalText(input.capturedMetricLabel);
    const capturedMetricValue =
      input.capturedMetricValue === null || input.capturedMetricValue === undefined
        ? null
        : Number(input.capturedMetricValue);

    if (postUrl) {
      this.assertHttpUrl(postUrl, 'Competitor post URL');
    }

    if (capturedMetricValue !== null && Number.isNaN(capturedMetricValue)) {
      throw new BadRequestException('Captured metric value must be a valid number.');
    }

    const existing = await this.prisma.competitorEvidence.findUnique({
      where: {
        competitor_evidence_version_competitor_unique: {
          reportVersionId: currentDraft.id,
          competitorId
        }
      }
    });

    if (!title && !note && !postUrl && !capturedMetricLabel && capturedMetricValue === null) {
      if (existing) {
        await this.prisma.competitorEvidence.delete({
          where: {
            id: existing.id
          }
        });
      }

      return {
        deleted: !!existing
      };
    }

    if (!title || !note) {
      throw new BadRequestException('Competitor evidence requires both a title and a note.');
    }

    const nextDisplayOrder =
      (await this.prisma.competitorEvidence.count({
        where: {
          reportVersionId: currentDraft.id
        }
      })) + 1;

    return this.prisma.competitorEvidence.upsert({
      where: {
        competitor_evidence_version_competitor_unique: {
          reportVersionId: currentDraft.id,
          competitorId
        }
      },
      update: {
        title,
        note,
        postUrl,
        capturedMetricLabel,
        capturedMetricValue
      },
      create: {
        reportVersionId: currentDraft.id,
        competitorId,
        title,
        note,
        postUrl,
        capturedMetricLabel,
        capturedMetricValue,
        displayOrder: nextDisplayOrder
      }
    });
  }

  async getCatalog(brandCode: string): Promise<CompetitorCatalogResponse> {
    const brand = await this.brandsService.getBrandByCodeOrThrow(brandCode);
    const competitors = await this.listCatalogCompetitorsForBrand(brand.id);

    return {
      brand: {
        id: brand.id,
        code: brand.code,
        name: brand.name
      },
      items: competitors.map((item) => {
        const assignmentsForCurrentBrand = item.brandCompetitorAssignments.filter(
          (assignment) => assignment.brandId === brand.id
        );

        return {
          id: item.id,
          name: item.name,
          primaryPlatform: item.primaryPlatform,
          status: item.status,
          websiteUrl: item.websiteUrl,
          facebookUrl: item.facebookUrl,
          instagramUrl: item.instagramUrl,
          tiktokUrl: item.tiktokUrl,
          youtubeUrl: item.youtubeUrl,
          usage: {
            assignedBrandCount: assignmentsForCurrentBrand.length > 0 ? 1 : 0,
            assignedYearCount: assignmentsForCurrentBrand.length
          }
        };
      })
    };
  }

  async getYearSetup(
    brandCode: string,
    year: number
  ): Promise<CompetitorYearSetupResponse> {
    this.assertYear(year, 'Year');

    const brand = await this.brandsService.getBrandByCodeOrThrow(brandCode);
    const displayMonth = this.getDefaultDisplayMonthForSetupYear(year);
    const [assignments, catalog] = await Promise.all([
      this.getAssignmentsForYear(brand.id, year, displayMonth, {
        includeRemoveMetadata: true,
        legacyFallback: false
      }),
      this.getCatalog(brandCode)
    ]);

    return {
      brand: {
        id: brand.id,
        code: brand.code,
        name: brand.name,
        timezone: brand.timezone
      },
      year,
      summary: {
        totalAssigned: assignments.length,
        activeCatalogCount: catalog.items.filter((item) => item.status === CompetitorStatus.active)
          .length
      },
      assignments: assignments.map((assignment) => ({
        id: assignment.id,
        displayOrder: assignment.displayOrder,
        status: assignment.status,
        canRemove: assignment.canRemove,
        removeBlockedReason: assignment.removeBlockedReason,
        competitor: {
          id: assignment.competitor.id,
          name: assignment.competitor.name,
          primaryPlatform: assignment.competitor.primaryPlatform,
          status: assignment.competitor.status,
          websiteUrl: assignment.competitor.websiteUrl,
          facebookUrl: assignment.competitor.facebookUrl,
          instagramUrl: assignment.competitor.instagramUrl,
          tiktokUrl: assignment.competitor.tiktokUrl,
          youtubeUrl: assignment.competitor.youtubeUrl
        }
      })),
      availableCompetitors: catalog.items
    };
  }

  async createMaster(brandCode: string, input: SaveCompetitorMasterInput) {
    const brand = await this.brandsService.getBrandByCodeOrThrow(brandCode);
    const normalized = this.normalizeCompetitorMasterInput(input);
    await this.mediaService.assertManagedPublicUrlsExist(
      [normalized.websiteUrl],
      'Competitor logo'
    );
    const currentYear = new Date().getUTCFullYear();

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.competitor.create({
        data: normalized
      });
      await tx.brandCompetitor.create({
        data: {
          brandId: brand.id,
          competitorId: created.id,
          activeFromYear: currentYear,
          activeToYear: null,
          displayOrder: 0,
          status: BrandCompetitorStatus.inactive
        }
      });

      return created;
    });
  }

  async updateMaster(
    brandCode: string,
    competitorId: string,
    input: UpdateCompetitorMasterInput
  ) {
    const brand = await this.brandsService.getBrandByCodeOrThrow(brandCode);
    const existing = await this.getCatalogCompetitorByIdForBrand(brand.id, competitorId);

    if (!existing) {
      throw new NotFoundException('Competitor not found for this brand.');
    }

    const normalized = this.normalizeCompetitorMasterUpdateInput(input);

    if (Object.keys(normalized).length === 0) {
      throw new BadRequestException('At least one field is required for competitor update.');
    }

    if ('websiteUrl' in normalized) {
      await this.mediaService.assertManagedPublicUrlsExist(
        [normalized.websiteUrl],
        'Competitor logo'
      );
    }

    const updated = await this.prisma.competitor.update({
      where: {
        id: competitorId
      },
      data: normalized
    });

    if ('websiteUrl' in normalized) {
      const previousMediaUrl = this.normalizeMediaUrl(existing.websiteUrl);
      const currentMediaUrl = this.normalizeMediaUrl(updated.websiteUrl);

      if (previousMediaUrl && previousMediaUrl !== currentMediaUrl) {
        await this.deleteRemovedMediaUrls([previousMediaUrl]);
      }
    }

    return updated;
  }

  async deleteMaster(brandCode: string, competitorId: string) {
    const brand = await this.brandsService.getBrandByCodeOrThrow(brandCode);
    const visibleToBrand = await this.getCatalogCompetitorByIdForBrand(
      brand.id,
      competitorId
    );

    if (!visibleToBrand) {
      throw new NotFoundException('Competitor not found for this brand.');
    }

    const existing = await this.prisma.competitor.findUnique({
      where: {
        id: competitorId
      },
      include: {
        brandCompetitorAssignments: {
          select: {
            id: true
          },
          take: 1
        },
        brandCompetitors: {
          where: {
            status: BrandCompetitorStatus.active
          },
          select: {
            id: true
          },
          take: 1
        }
      }
    });

    if (!existing) {
      throw new NotFoundException('Competitor not found.');
    }

    if (
      existing.brandCompetitorAssignments.length > 0 ||
      existing.brandCompetitors.length > 0
    ) {
      throw new ConflictException(
        'Cannot delete competitor that is assigned to at least one brand.'
      );
    }

    await this.prisma.competitor.delete({
      where: {
        id: competitorId
      }
    });
    await this.deleteRemovedMediaUrls([existing.websiteUrl]);

    return {
      deleted: true,
      id: competitorId
    };
  }

  async saveYearAssignments(
    brandCode: string,
    year: number,
    competitorIds: string[]
  ) {
    this.assertYear(year, 'Year');

    const brand = await this.brandsService.getBrandByCodeOrThrow(brandCode);
    const uniqueIds = Array.from(new Set(competitorIds.filter((id) => id.trim().length > 0)));
    const existingAssignments = await this.prisma.brandCompetitorAssignment.findMany({
      where: {
        brandId: brand.id,
        year
      },
      select: {
        id: true,
        competitorId: true
      }
    });
    const existingByCompetitorId = new Map(
      existingAssignments.map((item) => [item.competitorId, item])
    );
    const newCompetitorIds = uniqueIds.filter(
      (competitorId) => !existingByCompetitorId.has(competitorId)
    );

    if (newCompetitorIds.length > 0) {
      const competitors = await this.prisma.competitor.findMany({
        where: {
          id: {
            in: newCompetitorIds
          },
          status: CompetitorStatus.active,
          OR: [
            {
              brandCompetitorAssignments: {
                some: {
                  brandId: brand.id
                }
              }
            },
            {
              brandCompetitors: {
                some: {
                  brandId: brand.id
                }
              }
            }
          ]
        },
        select: {
          id: true
        }
      });

      if (competitors.length !== newCompetitorIds.length) {
        throw new BadRequestException(
          'One or more competitors are missing, inactive, or unavailable for this brand.'
        );
      }
    }
    const removedCompetitorIds = existingAssignments
      .map((item) => item.competitorId)
      .filter((competitorId) => !uniqueIds.includes(competitorId));

    if (removedCompetitorIds.length > 0) {
      const lockedCompetitorIds = await this.getCompetitorIdsWithCollectedMonitoringData({
        brandId: brand.id,
        year,
        competitorIds: removedCompetitorIds
      });

      if (lockedCompetitorIds.size > 0) {
        throw new ConflictException(
          'Cannot remove competitor assignment because monitoring data already exists. Set it to inactive instead.'
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      for (const competitorId of removedCompetitorIds) {
        const assignment = existingByCompetitorId.get(competitorId);
        if (!assignment) {
          continue;
        }

        await tx.brandCompetitorAssignment.delete({
          where: {
            id: assignment.id
          }
        });
      }

      for (let index = 0; index < uniqueIds.length; index += 1) {
        const competitorId = uniqueIds[index];
        const displayOrder = index + 1;
        const existingAssignment = existingByCompetitorId.get(competitorId);

        if (existingAssignment) {
          await tx.brandCompetitorAssignment.update({
            where: {
              id: existingAssignment.id
            },
            data: {
              displayOrder
            }
          });
          continue;
        }

        await tx.brandCompetitorAssignment.create({
          data: {
            brandId: brand.id,
            year,
            competitorId,
            displayOrder
          }
        });
      }
    });

    return this.getYearSetup(brandCode, year);
  }

  async updateAssignmentStatus(
    brandCode: string,
    year: number,
    competitorId: string,
    input: UpdateAssignmentStatusInput
  ) {
    this.assertYear(year, 'Year');
    const brand = await this.brandsService.getBrandByCodeOrThrow(brandCode);

    if (
      input.status !== CompetitorStatus.active &&
      input.status !== CompetitorStatus.inactive
    ) {
      throw new BadRequestException('Invalid assignment status.');
    }

    const effectiveMonth =
      input.effectiveMonth ?? this.getDefaultEffectiveMonthForStatusUpdate(year);
    this.assertMonth(effectiveMonth, 'Effective month');

    const assignment = await this.prisma.brandCompetitorAssignment.findUnique({
      where: {
        brand_competitor_assignment_brand_year_competitor_unique: {
          brandId: brand.id,
          year,
          competitorId
        }
      },
      select: {
        id: true
      }
    });

    if (!assignment) {
      throw new NotFoundException('Competitor is not assigned for this brand and year.');
    }

    try {
      await this.prisma.brandCompetitorAssignmentStatusChange.upsert({
        where: {
          brand_competitor_assignment_status_change_unique: {
            assignmentId: assignment.id,
            effectiveYear: year,
            effectiveMonth
          }
        },
        create: {
          assignmentId: assignment.id,
          effectiveYear: year,
          effectiveMonth,
          status: input.status
        },
        update: {
          status: input.status
        }
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2021'
      ) {
        throw new ConflictException(
          'Assignment status history table is missing. Apply latest competitor migration first.'
        );
      }
      throw error;
    }

    return this.getYearSetup(brandCode, year);
  }

  async copyYearAssignments(
    brandCode: string,
    sourceYear: number,
    targetYear: number
  ) {
    this.assertYear(sourceYear, 'Source year');
    this.assertYear(targetYear, 'Target year');

    if (sourceYear === targetYear) {
      throw new BadRequestException('Source year and target year must be different.');
    }

    const brand = await this.brandsService.getBrandByCodeOrThrow(brandCode);
    const sourceAssignments = await this.getAssignmentsForYear(
      brand.id,
      sourceYear,
      12,
      {
        legacyFallback: false
      }
    );

    if (sourceAssignments.length === 0) {
      throw new BadRequestException('No competitor assignments exist in source year.');
    }

    await this.saveYearAssignments(
      brandCode,
      targetYear,
      sourceAssignments.map((item) => item.competitorId)
    );

    const inactiveSourceCompetitorIds = sourceAssignments
      .filter((item) => item.status === CompetitorStatus.inactive)
      .map((item) => item.competitorId);

    if (inactiveSourceCompetitorIds.length > 0) {
      const targetAssignments = await this.prisma.brandCompetitorAssignment.findMany({
        where: {
          brandId: brand.id,
          year: targetYear,
          competitorId: {
            in: inactiveSourceCompetitorIds
          }
        },
        select: {
          id: true
        }
      });

      if (targetAssignments.length > 0) {
        await this.prisma.$transaction(
          targetAssignments.map((assignment) =>
            this.prisma.brandCompetitorAssignmentStatusChange.upsert({
              where: {
                brand_competitor_assignment_status_change_unique: {
                  assignmentId: assignment.id,
                  effectiveYear: targetYear,
                  effectiveMonth: 1
                }
              },
              create: {
                assignmentId: assignment.id,
                effectiveYear: targetYear,
                effectiveMonth: 1,
                status: CompetitorStatus.inactive
              },
              update: {
                status: CompetitorStatus.inactive
              }
            })
          )
        );
      }
    }

    return {
      brand: {
        id: brand.id,
        code: brand.code,
        name: brand.name
      },
      sourceYear,
      targetYear,
      copiedCount: sourceAssignments.length
    };
  }

  private async listCatalogCompetitorsForBrand(brandId: string) {
    return this.prisma.competitor.findMany({
      where: {
        OR: [
          {
            brandCompetitorAssignments: {
              some: {
                brandId
              }
            }
          },
          {
            brandCompetitors: {
              some: {
                brandId
              }
            }
          }
        ]
      },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      include: {
        brandCompetitorAssignments: {
          select: {
            brandId: true,
            year: true
          }
        }
      }
    });
  }

  private async getCatalogCompetitorByIdForBrand(
    brandId: string,
    competitorId: string
  ) {
    return this.prisma.competitor.findFirst({
      where: {
        id: competitorId,
        OR: [
          {
            brandCompetitorAssignments: {
              some: {
                brandId
              }
            }
          },
          {
            brandCompetitors: {
              some: {
                brandId
              }
            }
          }
        ]
      }
    });
  }

  async getReadinessForReportVersion(reportVersionId: string) {
    const version = await this.prisma.reportVersion.findUnique({
      where: {
        id: reportVersionId
      },
      include: {
        reportingPeriod: true
      }
    });

    if (!version) {
      throw new NotFoundException('Report version not found.');
    }

    const assignments = await this.getAssignmentsForYear(
      version.reportingPeriod.brandId,
      version.reportingPeriod.year,
      version.reportingPeriod.month
    );

    if (assignments.length === 0) {
      return {
        isComplete: false,
        detail: 'No competitors are assigned for this brand and reporting year.',
        requiredCompetitorCount: 0,
        completedCompetitorCount: 0
      };
    }

    const monitorings = await this.prisma.competitorMonitoring.findMany({
      where: {
        reportVersionId,
        competitorId: {
          in: assignments.map((item) => item.competitorId)
        }
      },
      include: {
        posts: true
      }
    });

    const monitoringByCompetitor = new Map(
      monitorings.map((item) => [item.competitorId, item])
    );
    const requiredAssignments = assignments.filter(
      (assignment) => assignment.status === CompetitorStatus.active
    );
    const completedCompetitorCount = requiredAssignments.filter((assignment) =>
      this.getMonitoringCompletion(
        monitoringByCompetitor.get(assignment.competitorId) ?? null
      ).isComplete
    ).length;
    const requiredCompetitorCount = requiredAssignments.length;

    return {
      isComplete: completedCompetitorCount === requiredCompetitorCount,
      detail:
        requiredCompetitorCount === 0
          ? 'No active competitors require monthly monitoring for this period.'
          : completedCompetitorCount === requiredCompetitorCount
            ? 'Every active assigned competitor has complete monthly monitoring evidence.'
            : `${completedCompetitorCount}/${requiredCompetitorCount} active assigned competitors are complete for monthly monitoring.`,
      requiredCompetitorCount,
      completedCompetitorCount
    };
  }

  private async getPeriodContext(brandCode: string, periodId: string) {
    const brand = await this.brandsService.getBrandByCodeOrThrow(brandCode);
    const period = await this.prisma.reportingPeriod.findUnique({
      where: { id: periodId },
      include: {
        reportVersions: {
          orderBy: {
            versionNo: 'desc'
          }
        }
      }
    });

    if (!period || period.brandId !== brand.id) {
      throw new NotFoundException('Reporting period not found for this brand.');
    }

    const currentDraft =
      period.reportVersions.find((version) => version.workflowState === ReportWorkflowState.draft) ??
      null;
    const latestVersion = period.reportVersions[0] ?? null;
    const targetVersion = currentDraft ?? latestVersion;

    return {
      brand,
      period,
      currentDraft,
      latestVersion,
      targetVersion
    };
  }

  private toBaseOverviewResponse(input: {
    brand: {
      id: string;
      code: string;
      name: string;
      timezone: string;
    };
    period: {
      id: string;
      year: number;
      month: number;
    };
    currentDraftVersionId: string | null;
    latestVersionState: ReportWorkflowState | null;
  }) {
    return {
      brand: input.brand,
      period: {
        id: input.period.id,
        year: input.period.year,
        month: input.period.month,
        label: new Intl.DateTimeFormat('en-US', {
          month: 'long',
          year: 'numeric'
        }).format(new Date(Date.UTC(input.period.year, input.period.month - 1, 1))),
        currentDraftVersionId: input.currentDraftVersionId,
        latestVersionState: input.latestVersionState
      }
    };
  }

  private async getAssignmentsForYear(
    brandId: string,
    year: number,
    targetMonth = 12,
    options?: {
      includeRemoveMetadata?: boolean;
      legacyFallback?: boolean;
    }
  ) {
    const assignments = await this.prisma.brandCompetitorAssignment.findMany({
      where: {
        brandId,
        year
      },
      include: {
        competitor: true
      },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }]
    });

    if (assignments.length > 0) {
      const [statusByAssignmentId, lockedCompetitorIds] = await Promise.all([
        this.getAssignmentStatusMap(
          assignments.map((item) => item.id),
          year,
          targetMonth
        ),
        options?.includeRemoveMetadata
          ? this.getCompetitorIdsWithCollectedMonitoringData({
              brandId,
              year,
              competitorIds: assignments.map((item) => item.competitorId)
            })
          : Promise.resolve(new Set<string>())
      ]);

      return assignments.map((item) => ({
        id: item.id,
        competitorId: item.competitorId,
        displayOrder: item.displayOrder,
        status: statusByAssignmentId.get(item.id) ?? CompetitorStatus.active,
        canRemove: !lockedCompetitorIds.has(item.competitorId),
        removeBlockedReason: lockedCompetitorIds.has(item.competitorId)
          ? 'Monitoring data already exists for this competitor in this year.'
          : null,
        competitor: {
          id: item.competitor.id,
          name: item.competitor.name,
          primaryPlatform: item.competitor.primaryPlatform,
          status: item.competitor.status,
          websiteUrl: item.competitor.websiteUrl,
          facebookUrl: item.competitor.facebookUrl,
          instagramUrl: item.competitor.instagramUrl,
          tiktokUrl: item.competitor.tiktokUrl,
          youtubeUrl: item.competitor.youtubeUrl
        }
      })) satisfies AssignmentWithCompetitor[];
    }

    if (options?.legacyFallback === false) {
      return [] as AssignmentWithCompetitor[];
    }

    const currentYear = new Date().getUTCFullYear();
    if (year > currentYear) {
      return [] as AssignmentWithCompetitor[];
    }

    const legacyAssignments = await this.prisma.brandCompetitor.findMany({
      where: {
        brandId,
        status: 'active',
        activeFromYear: {
          lte: year
        },
        OR: [
          {
            activeToYear: null
          },
          {
            activeToYear: {
              gte: year
            }
          }
        ],
        competitor: {
          status: CompetitorStatus.active
        }
      },
      include: {
        competitor: true
      },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }]
    });

    return legacyAssignments.map((item) => ({
      id: item.id,
      competitorId: item.competitorId,
      displayOrder: item.displayOrder,
      status: CompetitorStatus.active,
      canRemove: true,
      removeBlockedReason: null,
      competitor: {
        id: item.competitor.id,
        name: item.competitor.name,
        primaryPlatform: item.competitor.primaryPlatform,
        status: item.competitor.status,
        websiteUrl: item.competitor.websiteUrl,
        facebookUrl: item.competitor.facebookUrl,
        instagramUrl: item.competitor.instagramUrl,
        tiktokUrl: item.competitor.tiktokUrl,
        youtubeUrl: item.competitor.youtubeUrl
      }
    })) satisfies AssignmentWithCompetitor[];
  }

  private async getAssignmentForCompetitor(input: {
    brandId: string;
    year: number;
    competitorId: string;
  }) {
    const assignment = await this.prisma.brandCompetitorAssignment.findUnique({
      where: {
        brand_competitor_assignment_brand_year_competitor_unique: {
          brandId: input.brandId,
          year: input.year,
          competitorId: input.competitorId
        }
      },
      include: {
        competitor: true
      }
    });

    if (assignment) {
      return {
        id: assignment.id,
        competitorId: assignment.competitorId,
        displayOrder: assignment.displayOrder,
        status: CompetitorStatus.active,
        canRemove: true,
        removeBlockedReason: null,
        competitor: {
          id: assignment.competitor.id,
          name: assignment.competitor.name,
          primaryPlatform: assignment.competitor.primaryPlatform,
          status: assignment.competitor.status,
          websiteUrl: assignment.competitor.websiteUrl,
          facebookUrl: assignment.competitor.facebookUrl,
          instagramUrl: assignment.competitor.instagramUrl,
          tiktokUrl: assignment.competitor.tiktokUrl,
          youtubeUrl: assignment.competitor.youtubeUrl
        }
      } satisfies AssignmentWithCompetitor;
    }

    const legacyAssignments = await this.getAssignmentsForYear(input.brandId, input.year);
    return (
      legacyAssignments.find((item) => item.competitorId === input.competitorId) ?? null
    );
  }

  private async getAssignmentStatusMap(
    assignmentIds: string[],
    targetYear: number,
    targetMonth: number
  ) {
    if (assignmentIds.length === 0) {
      return new Map<string, CompetitorStatus>();
    }

    let statusRows: Array<{
      assignmentId: string;
      status: CompetitorStatus;
    }> = [];

    try {
      statusRows = await this.prisma.brandCompetitorAssignmentStatusChange.findMany({
        where: {
          assignmentId: {
            in: assignmentIds
          },
          OR: [
            {
              effectiveYear: {
                lt: targetYear
              }
            },
            {
              effectiveYear: targetYear,
              effectiveMonth: {
                lte: targetMonth
              }
            }
          ]
        },
        orderBy: [{ effectiveYear: 'desc' }, { effectiveMonth: 'desc' }, { createdAt: 'desc' }],
        select: {
          assignmentId: true,
          status: true
        }
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2021'
      ) {
        return new Map<string, CompetitorStatus>();
      }
      throw error;
    }

    const result = new Map<string, CompetitorStatus>();
    for (const row of statusRows) {
      if (!result.has(row.assignmentId)) {
        result.set(row.assignmentId, row.status);
      }
    }

    return result;
  }

  private async getCompetitorIdsWithCollectedMonitoringData(input: {
    brandId: string;
    year: number;
    competitorIds: string[];
  }) {
    if (input.competitorIds.length === 0) {
      return new Set<string>();
    }

    const reportVersions = await this.prisma.reportVersion.findMany({
      where: {
        reportingPeriod: {
          brandId: input.brandId,
          year: input.year
        }
      },
      select: {
        id: true
      }
    });
    const reportVersionIds = reportVersions.map((item) => item.id);

    if (reportVersionIds.length === 0) {
      return new Set<string>();
    }

    const [monitorings, evidences] = await Promise.all([
      this.prisma.competitorMonitoring.findMany({
        where: {
          reportVersionId: {
            in: reportVersionIds
          },
          competitorId: {
            in: input.competitorIds
          }
        },
        select: {
          competitorId: true
        },
        distinct: ['competitorId']
      }),
      this.prisma.competitorEvidence.findMany({
        where: {
          reportVersionId: {
            in: reportVersionIds
          },
          competitorId: {
            in: input.competitorIds
          }
        },
        select: {
          competitorId: true
        },
        distinct: ['competitorId']
      })
    ]);

    return new Set<string>([
      ...monitorings.map((item) => item.competitorId),
      ...evidences.map((item) => item.competitorId)
    ]);
  }

  private getDefaultDisplayMonthForSetupYear(year: number) {
    const now = new Date();
    const currentYear = now.getUTCFullYear();

    if (year < currentYear) {
      return 12;
    }

    if (year > currentYear) {
      return 1;
    }

    return now.getUTCMonth() + 1;
  }

  private getDefaultEffectiveMonthForStatusUpdate(year: number) {
    const now = new Date();
    const currentYear = now.getUTCFullYear();

    if (year < currentYear) {
      return 12;
    }

    if (year > currentYear) {
      return 1;
    }

    return now.getUTCMonth() + 1;
  }

  private getMonitoringCompletion(monitoring: MonitoringWithPosts | null | undefined) {
    const hasFollower =
      monitoring?.followerCount !== null &&
      monitoring?.followerCount !== undefined &&
      Number.isInteger(monitoring.followerCount) &&
      monitoring.followerCount >= 0;
    const hasValidStatus =
      monitoring?.status === CompetitorMonitoringStatus.has_posts ||
      monitoring?.status === CompetitorMonitoringStatus.no_activity;

    let hasRequiredEvidence = false;

    if (monitoring?.status === CompetitorMonitoringStatus.has_posts) {
      const hasMonthlyPostCount =
        monitoring.monthlyPostCount !== null &&
        monitoring.monthlyPostCount !== undefined &&
        Number.isInteger(monitoring.monthlyPostCount) &&
        monitoring.monthlyPostCount >= monitoring.posts.length;
      const hasHighlightNote = !!monitoring.noActivityNote?.trim();
      hasRequiredEvidence =
        monitoring.posts.length > 0 &&
        monitoring.posts.every((post) => post.screenshotUrl.trim().length > 0) &&
        hasMonthlyPostCount &&
        hasHighlightNote;
    } else if (monitoring?.status === CompetitorMonitoringStatus.no_activity) {
      hasRequiredEvidence =
        !!monitoring.noActivityNote?.trim() &&
        !!monitoring.noActivityEvidenceImageUrl?.trim();
    }

    return {
      hasFollower,
      hasValidStatus,
      hasRequiredEvidence,
      isComplete: hasFollower && hasValidStatus && hasRequiredEvidence
    };
  }

  private normalizeMonitoringInput(input: SaveCompetitorMonitoringInput) {
    const status =
      input.status === CompetitorMonitoringStatus.has_posts ||
      input.status === CompetitorMonitoringStatus.no_activity
        ? input.status
        : null;

    const followerCount =
      input.followerCount === null || input.followerCount === undefined
        ? null
        : Number(input.followerCount);

    if (followerCount !== null) {
      if (!Number.isFinite(followerCount) || !Number.isInteger(followerCount)) {
        throw new BadRequestException('Follower count must be a whole number.');
      }

      if (followerCount < 0) {
        throw new BadRequestException('Follower count must be 0 or more.');
      }
    }

    const rawMonthlyPostCount =
      input.monthlyPostCount === null || input.monthlyPostCount === undefined
        ? null
        : Number(input.monthlyPostCount);
    let monthlyPostCount = rawMonthlyPostCount;

    if (rawMonthlyPostCount !== null) {
      if (!Number.isFinite(rawMonthlyPostCount) || !Number.isInteger(rawMonthlyPostCount)) {
        throw new BadRequestException('Monthly post count must be a whole number.');
      }

      if (rawMonthlyPostCount < 0) {
        throw new BadRequestException('Monthly post count must be 0 or more.');
      }
    }

    const highlightNote = this.normalizeOptionalText(input.highlightNote);
    const noActivityEvidenceImageUrl = this.normalizeOptionalText(
      input.noActivityEvidenceImageUrl
    );
    if (noActivityEvidenceImageUrl) {
      this.assertHttpUrl(noActivityEvidenceImageUrl, 'No activity evidence image URL');
    }
    const posts = (input.posts ?? []).map((raw, index) => {
      const screenshotUrl = this.normalizeOptionalText(raw.screenshotUrl);
      const postUrl = this.normalizeOptionalText(raw.postUrl);
      const displayOrder =
        raw.displayOrder === null || raw.displayOrder === undefined
          ? index + 1
          : Number(raw.displayOrder);

      if (!Number.isInteger(displayOrder) || displayOrder < 1) {
        throw new BadRequestException('Post display order must be a positive integer.');
      }

      if (!screenshotUrl) {
        throw new BadRequestException('Each monitored post requires a screenshot.');
      }
      this.assertHttpUrl(screenshotUrl, 'Screenshot URL');

      if (postUrl) {
        this.assertHttpUrl(postUrl, 'Post URL');
      }

      return {
        displayOrder,
        screenshotUrl,
        postUrl
      };
    });

    if (posts.length > MAX_MONITORED_POSTS) {
      throw new BadRequestException(
        `Each competitor supports at most ${MAX_MONITORED_POSTS} monitored posts per month.`
      );
    }

    const uniqueDisplayOrderCount = new Set(posts.map((post) => post.displayOrder)).size;
    if (uniqueDisplayOrderCount !== posts.length) {
      throw new BadRequestException('Post display order must be unique per competitor.');
    }

    if (status === CompetitorMonitoringStatus.no_activity && posts.length > 0) {
      throw new BadRequestException(
        'No activity mode cannot include monitored posts. Remove posts or switch status.'
      );
    }

    if (status === CompetitorMonitoringStatus.has_posts) {
      if (monthlyPostCount === null) {
        throw new BadRequestException(
          'Monthly post count is required in has-posts mode.'
        );
      }

      if (!highlightNote) {
        throw new BadRequestException(
          'Highlight note is required in has-posts mode.'
        );
      }

      if (posts.length === 0) {
        throw new BadRequestException(
          'At least one highlighted post screenshot is required in has-posts mode.'
        );
      }

      if (monthlyPostCount !== null && monthlyPostCount < posts.length) {
        throw new BadRequestException(
          'Monthly post count cannot be lower than highlighted post screenshots.'
        );
      }
    } else {
      monthlyPostCount = null;
    }

    return {
      status,
      followerCount,
      monthlyPostCount,
      highlightNote,
      noActivityEvidenceImageUrl,
      posts
    };
  }

  private normalizeCompetitorMasterInput(input: SaveCompetitorMasterInput) {
    const name = this.normalizeOptionalText(input.name);
    const primaryPlatform = this.normalizeOptionalText(input.primaryPlatform);

    if (!name) {
      throw new BadRequestException('Competitor name is required.');
    }

    if (!primaryPlatform) {
      throw new BadRequestException('Primary platform is required.');
    }

    const websiteUrl = this.normalizeOptionalText(input.websiteUrl);
    const facebookUrl = this.normalizeOptionalText(input.facebookUrl);
    const instagramUrl = this.normalizeOptionalText(input.instagramUrl);
    const tiktokUrl = this.normalizeOptionalText(input.tiktokUrl);
    const youtubeUrl = this.normalizeOptionalText(input.youtubeUrl);

    if (websiteUrl) this.assertHttpUrl(websiteUrl, 'Website URL');
    if (facebookUrl) this.assertHttpUrl(facebookUrl, 'Facebook URL');
    if (instagramUrl) this.assertHttpUrl(instagramUrl, 'Instagram URL');
    if (tiktokUrl) this.assertHttpUrl(tiktokUrl, 'TikTok URL');
    if (youtubeUrl) this.assertHttpUrl(youtubeUrl, 'YouTube URL');

    return {
      name,
      primaryPlatform,
      status: input.status ?? CompetitorStatus.active,
      websiteUrl,
      facebookUrl,
      instagramUrl,
      tiktokUrl,
      youtubeUrl
    };
  }

  private normalizeCompetitorMasterUpdateInput(input: UpdateCompetitorMasterInput) {
    const data: Record<string, string | CompetitorStatus | null> = {};

    if ('name' in input) {
      const value = this.normalizeOptionalText(input.name ?? null);
      if (!value) {
        throw new BadRequestException('Competitor name cannot be empty.');
      }
      data.name = value;
    }

    if ('primaryPlatform' in input) {
      const value = this.normalizeOptionalText(input.primaryPlatform ?? null);
      if (!value) {
        throw new BadRequestException('Primary platform cannot be empty.');
      }
      data.primaryPlatform = value;
    }

    if ('status' in input) {
      if (
        input.status !== CompetitorStatus.active &&
        input.status !== CompetitorStatus.inactive
      ) {
        throw new BadRequestException('Invalid competitor status.');
      }
      data.status = input.status;
    }

    const urlFields: Array<keyof Pick<
      UpdateCompetitorMasterInput,
      'websiteUrl' | 'facebookUrl' | 'instagramUrl' | 'tiktokUrl' | 'youtubeUrl'
    >> = ['websiteUrl', 'facebookUrl', 'instagramUrl', 'tiktokUrl', 'youtubeUrl'];

    for (const field of urlFields) {
      if (field in input) {
        const value = this.normalizeOptionalText(input[field] ?? null);
        if (value) {
          this.assertHttpUrl(value, field);
        }
        data[field] = value;
      }
    }

    return data;
  }

  private normalizeOptionalText(input: string | null | undefined) {
    const normalized = String(input ?? '').trim();
    return normalized.length > 0 ? normalized : null;
  }

  private collectMonitoringMediaUrls(input: {
    noActivityEvidenceImageUrl: string | null;
    posts: Array<{ screenshotUrl: string }>;
  } | null | undefined) {
    const urls = new Set<string>();
    const noActivityImageUrl = this.normalizeMediaUrl(input?.noActivityEvidenceImageUrl);

    if (noActivityImageUrl) {
      urls.add(noActivityImageUrl);
    }

    for (const post of input?.posts ?? []) {
      const screenshotUrl = this.normalizeMediaUrl(post.screenshotUrl);
      if (screenshotUrl) {
        urls.add(screenshotUrl);
      }
    }

    return urls;
  }

  private async deleteRemovedMediaUrls(urls: Array<string | null | undefined>) {
    const targets = Array.from(
      new Set(
        urls
          .map((url) => this.normalizeMediaUrl(url))
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
          `Failed to delete competitor media file (${publicUrl}): ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
        );
      }
    }
  }

  private normalizeMediaUrl(value: string | null | undefined) {
    const normalized = value?.trim() ?? '';
    return normalized.length > 0 ? normalized : null;
  }

  private assertYear(value: number, label: string) {
    if (!Number.isInteger(value) || value < 2000 || value > 3000) {
      throw new BadRequestException(`${label} must be a valid year.`);
    }
  }

  private assertMonth(value: number, label: string) {
    if (!Number.isInteger(value) || value < 1 || value > 12) {
      throw new BadRequestException(`${label} must be between 1 and 12.`);
    }
  }

  private assertHttpUrl(rawValue: string, label: string) {
    let parsedUrl: URL;

    try {
      parsedUrl = new URL(rawValue);
    } catch {
      throw new BadRequestException(`${label} must be a valid URL.`);
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new BadRequestException(`${label} must start with http:// or https://.`);
    }
  }
}
