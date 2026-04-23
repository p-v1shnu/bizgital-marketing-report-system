import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException
} from '@nestjs/common';
import {
  BrandDropdownFieldKey,
  BrandDropdownOptionStatus,
  ImportJobStatus,
  Prisma,
  QuestionStatus,
  ReportCadence,
  ReportWorkflowState,
  ReportingPeriodState
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { BrandsService } from '../brands/brands.service';
import { CompetitorsService } from '../competitors/competitors.service';
import { toManualFormulaRowsSettingKey } from '../dataset/manual-formula-rows-setting';
import { toManualSourceRowsSettingKey } from '../dataset/manual-source-rows-setting';
import { toKpiPlanSnapshotSettingKey } from '../kpi/kpi-plan-snapshot-setting';
import { KpiService } from '../kpi/kpi.service';
import { ManualMetricsService } from '../manual-metrics/manual-metrics.service';
import { MediaService } from '../media/media.service';
import { AVAILABLE_TARGETS_BY_KEY, METRIC_TARGET_FIELDS } from '../mapping/mapping-targets';
import { MetricsService } from '../metrics/metrics.service';
import {
  toTopContentCountSnapshotSettingKey
} from '../top-content/top-content-content-count-snapshot-setting';
import { TopContentService } from '../top-content/top-content.service';
import {
  parseReportActivityLogSettingPayload,
  stringifyReportActivityLogSettingPayload,
  toReportActivityLogSettingKey,
  type ReportActivityLogEvent
} from './report-activity-log-setting';
import type {
  ReportingDetailResponse,
  ReportingListItem,
  ReportingListResponse,
  ReportingRecycleBinItem,
  ReportingRecycleBinResponse,
  ReportingPeriodWithVersions
} from './reporting.types';
import { ReviewReadinessService } from './review-readiness.service';

type CreatePeriodInput = {
  brandCode: string;
  year: number;
  month: number;
  replaceDeleted?: boolean;
  actorName?: string | null;
  actorEmail?: string | null;
};

type RejectVersionInput = {
  reason: string;
  actorName?: string | null;
  actorEmail?: string | null;
};

type ReopenVersionInput = {
  reason?: string;
  actorName?: string | null;
  actorEmail?: string | null;
};

type ReviseVersionInput = {
  reason?: string;
  actorName?: string | null;
  actorEmail?: string | null;
};

type ActionActorInput = {
  actorName?: string | null;
  actorEmail?: string | null;
};

type YearSetupCheck = {
  key:
    | 'kpi_plan'
    | 'competitor_assignments'
    | 'question_assignments'
    | 'related_product_options';
  label: string;
  required: boolean;
  passed: boolean;
  detail: string;
};

type YearSetupStatus = {
  year: number;
  canCreateReport: boolean;
  summary: string;
  checks: YearSetupCheck[];
};

type YearSetupContext = {
  reportYears: Set<number>;
  kpiConfiguredYears: Set<number>;
  kpiReadyYears: Set<number>;
  competitorReadyYears: Set<number>;
  questionAssignmentsReady: boolean;
  relatedProductOptionsReady: boolean;
};

type ReportMediaDeleteTargets = {
  objectKeys: string[];
  publicUrls: string[];
};

type ReportMediaCleanupSummary = {
  attempted: number;
  deleted: number;
  skipped: number;
  failed: number;
};

type ApprovedSnapshotSummary = NonNullable<ReportingListItem['approvedSnapshot']>;
type MetricAggregateItem = {
  key: ApprovedSnapshotSummary['items'][number]['key'];
  label: string;
  value: number;
};

const REPORT_RECYCLE_RETENTION_DAYS = 7;
const REPORT_RECYCLE_RETENTION_MS = REPORT_RECYCLE_RETENTION_DAYS * 24 * 60 * 60 * 1000;

@Injectable()
export class ReportingService {
  private readonly logger = new Logger(ReportingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly brandsService: BrandsService,
    private readonly competitorsService: CompetitorsService,
    private readonly kpiService: KpiService,
    private readonly manualMetricsService: ManualMetricsService,
    private readonly metricsService: MetricsService,
    private readonly reviewReadinessService: ReviewReadinessService,
    private readonly mediaService: MediaService,
    private readonly topContentService: TopContentService
  ) {}

  async listReportingPeriods(
    brandCode: string,
    year?: number
  ): Promise<ReportingListResponse> {
    await this.purgeExpiredDeletedReportingPeriods();
    const brand = await this.brandsService.getBrandByCodeOrThrow(brandCode);
    const targetYear = Number.isFinite(year) ? year : null;
    const currentYear = new Date().getUTCFullYear();
    const selectedYear = targetYear ?? currentYear;

    const [periods, latestMonthlyPeriod, yearSetupContext] = await Promise.all([
      this.prisma.reportingPeriod.findMany({
        where: {
          brandId: brand.id,
          cadence: ReportCadence.monthly,
          deletedAt: null,
          ...(targetYear !== null ? { year: targetYear } : {})
        },
        include: {
          brand: true,
          reportVersions: {
            orderBy: {
              versionNo: 'desc'
            }
          }
        },
        orderBy:
          targetYear !== null
            ? {
                month: 'asc'
              }
            : [{ year: 'asc' }, { month: 'asc' }]
      }),
      this.prisma.reportingPeriod.findFirst({
        where: {
          brandId: brand.id,
          cadence: ReportCadence.monthly,
          deletedAt: null,
          ...(targetYear !== null ? { year: targetYear } : {})
        },
        select: {
          year: true,
          month: true
        },
        orderBy: [{ year: 'desc' }, { month: 'desc' }]
      }),
      this.getYearSetupContext(brand.id)
    ]);
    const selectedYearSetup = this.toYearSetupStatus(selectedYear, yearSetupContext);
    const yearOptions = this.buildYearOptions({
      selectedYear,
      currentYear,
      context: yearSetupContext
    });

    const readinessByPeriodId = new Map(
      await Promise.all(
        periods.map(async (period) => [
          period.id,
          await this.reviewReadinessService.evaluatePeriod(period)
        ] as const)
      )
    );
    const activityLogByPeriodId = await this.readActivityLogByPeriodIds(
      periods.map(period => period.id)
    );
    const approvedSnapshotByVersionId =
      await this.readApprovedSnapshotByReportVersionIds(
        periods
          .map(period =>
            period.reportVersions.find(
              version => version.workflowState === ReportWorkflowState.approved
            )?.id ?? null
          )
          .filter((versionId): versionId is string => !!versionId)
      );

    return {
      brand: {
        id: brand.id,
        code: brand.code,
        name: brand.name,
        timezone: brand.timezone
      },
      year: selectedYear,
      cadence: 'monthly',
      yearOptions,
      selectedYearSetup,
      suggestedNextPeriod: this.resolveSuggestedNextPeriod(latestMonthlyPeriod, {
        fallbackYear: selectedYear
      }),
      items: periods.map((period) =>
        this.toListItem(period, {
          canSubmitLatest: readinessByPeriodId.get(period.id)?.canSubmit ?? false,
          activityLog: activityLogByPeriodId.get(period.id) ?? [],
          approvedSnapshotByVersionId
        })
      )
    };
  }

  async listDeletedReportingPeriods(
    brandCode: string,
    year?: number
  ): Promise<ReportingRecycleBinResponse> {
    await this.purgeExpiredDeletedReportingPeriods();
    const brand = await this.brandsService.getBrandByCodeOrThrow(brandCode);
    const targetYear = Number.isFinite(year) ? year : null;
    const now = new Date();
    const periods = await this.prisma.reportingPeriod.findMany({
      where: {
        brandId: brand.id,
        cadence: ReportCadence.monthly,
        deletedAt: {
          not: null
        },
        OR: [
          {
            purgeAt: {
              gt: now
            }
          },
          {
            purgeAt: null
          }
        ],
        ...(targetYear !== null ? { year: targetYear } : {})
      },
      include: {
        brand: true,
        reportVersions: {
          orderBy: {
            versionNo: 'desc'
          }
        }
      },
      orderBy: [{ deletedAt: 'desc' }, { year: 'desc' }, { month: 'desc' }]
    });

    return {
      brand: {
        id: brand.id,
        code: brand.code,
        name: brand.name,
        timezone: brand.timezone
      },
      year: targetYear ?? new Date().getUTCFullYear(),
      cadence: 'monthly',
      retentionDays: REPORT_RECYCLE_RETENTION_DAYS,
      items: periods.map(period => this.toRecycleBinItem(period))
    };
  }

  async getReportingPeriodDetail(
    brandCode: string,
    periodId: string
  ): Promise<ReportingDetailResponse> {
    await this.purgeExpiredDeletedReportingPeriods();
    const brand = await this.brandsService.getBrandByCodeOrThrow(brandCode);
    const period = await this.prisma.reportingPeriod.findUnique({
      where: {
        id: periodId
      },
      include: {
        brand: true,
        reportVersions: {
          orderBy: {
            versionNo: 'desc'
          }
        }
      }
    });

    if (!period || period.brandId !== brand.id || period.deletedAt) {
      throw new NotFoundException('Reporting period not found for this brand.');
    }

    const currentDraftVersion =
      period.reportVersions.find((version) => version.workflowState === ReportWorkflowState.draft) ??
      null;

    if (currentDraftVersion?.createdFromVersionId) {
      await this.ensureDraftCloneFromSource(
        currentDraftVersion.id,
        currentDraftVersion.createdFromVersionId
      );
    }

    const reviewReadiness = await this.reviewReadinessService.evaluatePeriod(period);
    const activityLogByPeriodId = await this.readActivityLogByPeriodIds([period.id]);
    const approvedSnapshotByVersionId =
      await this.readApprovedSnapshotByReportVersionIds(
        period.reportVersions
          .filter(version => version.workflowState === ReportWorkflowState.approved)
          .map(version => version.id)
      );
    const listItem = this.toListItem(period, {
      canSubmitLatest: reviewReadiness.canSubmit,
      activityLog: activityLogByPeriodId.get(period.id) ?? [],
      approvedSnapshotByVersionId
    });
    const latestVersion = listItem.versions[0] ?? null;
    const hasDraft = !!listItem.currentDraftVersionId;
    const importVersionId = listItem.currentDraftVersionId ?? listItem.latestVersionId ?? null;
    const latestImportJob = importVersionId
      ? await this.prisma.importJob.findFirst({
          where: {
            reportVersionId: importVersionId
          },
          include: {
            _count: {
              select: {
                sourceColumnMappings: true
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          }
        })
      : null;

    const mappingReady = latestImportJob?.status === ImportJobStatus.ready_for_mapping;
    const datasetReady = !!latestImportJob?._count.sourceColumnMappings;
    const metricsVersionId = listItem.currentDraftVersionId ?? listItem.latestVersionId;
    const manualHeaderMetrics = metricsVersionId
      ? await this.manualMetricsService.getReportManualMetrics(metricsVersionId)
      : null;
    const manualMonthlyInputsComplete =
      manualHeaderMetrics !== null &&
      manualHeaderMetrics.viewers !== null &&
      manualHeaderMetrics.pageFollowers !== null &&
      manualHeaderMetrics.pageVisit !== null;
    const metricCellsReady = metricsVersionId
      ? (await this.prisma.datasetCell.count({
          where: {
            datasetRow: {
              reportVersionId: metricsVersionId
            },
            targetField: {
              in: METRIC_TARGET_FIELDS
            }
          }
        })) > 0
      : false;
    const metricSnapshotCurrent =
      reviewReadiness.checks.find(
        (check) => check.key === 'metric_snapshot_current'
      )?.passed ?? false;
    const competitorMonitoringReady =
      reviewReadiness.checks.find(
        (check) => check.key === 'competitor_evidence_complete'
      ) ?? null;
    const questionEvidenceReady =
      reviewReadiness.checks.find(
        (check) => check.key === 'question_evidence_complete'
      ) ?? null;
    const topContentReadinessCheck =
      reviewReadiness.checks.find(
        (check) => check.key === 'required_top_content_cards_exist'
      ) ?? null;
    const topContentReady = topContentReadinessCheck?.passed ?? false;

    const sections: ReportingDetailResponse['period']['workspace']['sections'] = [
      {
        slug: 'overview',
        label: 'Overview',
        status: 'ready',
        detail: 'Core workflow and period state are available now.'
      },
      {
        slug: 'import',
        label: 'Import',
        status: !latestImportJob
          ? hasDraft
            ? 'pending'
            : 'blocked'
          : manualMonthlyInputsComplete
            ? 'ready'
            : 'pending',
        detail: !latestImportJob
          ? hasDraft
            ? 'Upload the source file to start this month.'
            : 'Create or resume a draft before uploading import files.'
          : manualMonthlyInputsComplete
            ? 'Source import and manual monthly inputs are complete for this month.'
            : 'Source file is uploaded. Complete Manual monthly inputs (Viewers, Page Followers, Page Visit) to mark Import as complete.'
      },
      {
        slug: 'mapping',
        label: 'Mapping',
        status: mappingReady ? 'pending' : latestImportJob ? 'blocked' : 'blocked',
        detail: mappingReady
          ? 'Auto-map fallback is available only when source columns still need manual help.'
          : latestImportJob
            ? 'The latest import file is not profiled for mapping yet.'
            : 'Upload an import file before mapping can begin.'
      },
      {
        slug: 'metrics',
        label: 'Metrics',
        status: metricSnapshotCurrent ? 'ready' : metricCellsReady ? 'pending' : 'blocked',
        detail: metricSnapshotCurrent
          ? 'Current persisted metric snapshot is ready for review and submit guard checks.'
          : metricCellsReady
            ? 'Metric fields are mapped, but the current snapshot still needs to be generated or refreshed.'
          : datasetReady
            ? 'Persisted dataset exists, but KPI-linked canonical metric fields still need mapping before snapshot generation.'
            : 'Complete import and any required mapping fallback before metrics can be calculated.'
      },
      {
        slug: 'top-content',
        label: 'Top Content',
        status: topContentReady ? 'ready' : metricSnapshotCurrent ? 'pending' : 'blocked',
        detail: topContentReady
          ? 'Required top content highlight cards already exist for review.'
          : metricSnapshotCurrent
            ? (topContentReadinessCheck?.detail ??
              'Metrics are ready. Open Top Content to generate the required highlight cards.')
            : 'Complete metrics first so top content ranking has a canonical basis.'
      },
      {
        slug: 'competitors',
        label: 'Competitors',
        status: competitorMonitoringReady?.passed ? 'ready' : hasDraft ? 'pending' : 'blocked',
        detail:
          competitorMonitoringReady?.detail ??
          'Competitor monitoring is required before submit.'
      },
      {
        slug: 'questions',
        label: 'Questions',
        status: questionEvidenceReady?.passed ? 'ready' : hasDraft ? 'pending' : 'blocked',
        detail: questionEvidenceReady?.detail ?? 'Question monitoring is required before submit.'
      },
      {
        slug: 'review',
        label: 'Review',
        status: this.getReviewSectionStatus(reviewReadiness.overall, hasDraft),
        detail: this.getReviewSectionDetail(reviewReadiness)
      },
      {
        slug: 'history',
        label: 'History',
        status: 'ready',
        detail: 'Version history is available from the reporting core now.'
      }
    ];

    return {
      brand: {
        id: brand.id,
        code: brand.code,
        name: brand.name,
        timezone: brand.timezone
      },
      period: {
        ...listItem,
        monthLabel: this.formatMonthLabel(period.year, period.month),
        latestVersion,
        workspace: {
          sections
        },
        reviewReadiness
      }
    };
  }

  async createReportingPeriod(input: CreatePeriodInput) {
    await this.purgeExpiredDeletedReportingPeriods();
    this.assertYear(input.year);
    this.assertMonth(input.month);
    const brand = await this.brandsService.getBrandByCodeOrThrow(input.brandCode);
    const yearSetupContext = await this.getYearSetupContext(brand.id);
    const yearSetupStatus = this.toYearSetupStatus(input.year, yearSetupContext);

    if (!yearSetupStatus.canCreateReport) {
      throw new ConflictException(this.buildYearSetupBlockedMessage(yearSetupStatus));
    }

    const createMonthlyPeriod = async () =>
      this.prisma.$transaction(async tx => {
        const period = await tx.reportingPeriod.create({
          data: {
            brandId: brand.id,
            year: input.year,
            month: input.month,
            cadence: ReportCadence.monthly,
            currentState: ReportingPeriodState.not_started
          },
          include: {
            brand: true,
            reportVersions: {
              orderBy: {
                versionNo: 'desc'
              }
            }
          }
        });

        await this.appendReportActivityLogWithClient(tx, {
          reportingPeriodId: period.id,
          reportVersionId: null,
          eventKey: 'report_period_created',
          label: 'Report period created',
          note: this.formatMonthLabel(period.year, period.month),
          actor: {
            actorName: input.actorName,
            actorEmail: input.actorEmail
          }
        });

        return period;
      });

    try {
      const created = await createMonthlyPeriod();

      return this.toListItem(created);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const inRecycleBin = await this.prisma.reportingPeriod.findFirst({
          where: {
            brandId: brand.id,
            cadence: ReportCadence.monthly,
            year: input.year,
            month: input.month,
            deletedAt: {
              not: null
            }
          },
          select: {
            id: true
          }
        });

        if (inRecycleBin) {
          if (input.replaceDeleted) {
            await this.purgeDeletedReportingPeriodById(inRecycleBin.id);
            try {
              const recreated = await createMonthlyPeriod();
              return this.toListItem(recreated);
            } catch (recreateError) {
              if (
                recreateError instanceof Prisma.PrismaClientKnownRequestError &&
                recreateError.code === 'P2002'
              ) {
                throw new ConflictException(
                  `A monthly reporting period already exists for ${input.brandCode} ${input.year}-${String(input.month).padStart(2, '0')}.`
                );
              }

              throw recreateError;
            }
          }

          throw new ConflictException(
            `A monthly report for ${input.brandCode} ${input.year}-${String(input.month).padStart(2, '0')} is in recycle bin. Restore it from Recycle Bin.`
          );
        }

        throw new ConflictException(
          `A monthly reporting period already exists for ${input.brandCode} ${input.year}-${String(input.month).padStart(2, '0')}.`
        );
      }

      throw error;
    }
  }

  async prepareYearSetup(
    brandCode: string,
    targetYear: number,
    sourceYear?: number
  ) {
    this.assertYear(targetYear);
    const resolvedSourceYear = sourceYear ?? targetYear - 1;
    this.assertYear(resolvedSourceYear);

    if (resolvedSourceYear === targetYear) {
      throw new BadRequestException('Source year and target year must be different.');
    }

    const brand = await this.brandsService.getBrandByCodeOrThrow(brandCode);
    let copiedKpiCount = 0;
    let copiedCompetitorCount = 0;

    const targetKpiPlan = await this.kpiService.getBrandKpiPlan(brandCode, targetYear);
    if (targetKpiPlan.items.length === 0) {
      const sourceKpiPlan = await this.kpiService.getBrandKpiPlan(brandCode, resolvedSourceYear);

      if (sourceKpiPlan.items.length > 0) {
        await this.kpiService.updateBrandKpiPlan(brandCode, targetYear, {
          items: sourceKpiPlan.items.map((item, index) => ({
            kpiCatalogId: item.kpi.id,
            targetValue: item.targetValue,
            note: item.note,
            sortOrder: item.sortOrder ?? index + 1
          }))
        });
        copiedKpiCount = sourceKpiPlan.items.length;
      }
    }

    const targetCompetitorSetup = await this.competitorsService.getYearSetup(
      brandCode,
      targetYear
    );
    if (targetCompetitorSetup.assignments.length === 0) {
      const sourceCompetitorSetup = await this.competitorsService.getYearSetup(
        brandCode,
        resolvedSourceYear
      );

      if (sourceCompetitorSetup.assignments.length > 0) {
        const copyResult = await this.competitorsService.copyYearAssignments(
          brandCode,
          resolvedSourceYear,
          targetYear
        );
        copiedCompetitorCount = copyResult.copiedCount;
      }
    }

    const yearSetupContext = await this.getYearSetupContext(brand.id);
    const targetYearSetup = this.toYearSetupStatus(targetYear, yearSetupContext);

    return {
      brand: {
        id: brand.id,
        code: brand.code,
        name: brand.name
      },
      sourceYear: resolvedSourceYear,
      targetYear,
      copied: {
        kpiItemCount: copiedKpiCount,
        competitorAssignmentCount: copiedCompetitorCount
      },
      setup: targetYearSetup
    };
  }

  async createOrResumeDraft(periodId: string, actor?: ActionActorInput) {
    return this.prisma.$transaction(async (tx) => {
      const period = await tx.reportingPeriod.findUnique({
        where: { id: periodId },
        include: {
          brand: true,
          reportVersions: {
            orderBy: {
              versionNo: 'desc'
            }
          }
        }
      });

      if (!period) {
        throw new NotFoundException('Reporting period not found.');
      }

      if (period.deletedAt) {
        throw new NotFoundException(
          'Reporting period not found. It may be in recycle bin.'
        );
      }

      const existingDraft = period.reportVersions.find(
        (version) => version.workflowState === ReportWorkflowState.draft
      );

      if (existingDraft) {
        await this.appendReportActivityLogWithClient(tx, {
          reportingPeriodId: period.id,
          reportVersionId: existingDraft.id,
          eventKey: 'draft_resumed',
          label: `Draft v${existingDraft.versionNo} resumed`,
          note: null,
          actor
        });
        return existingDraft;
      }

      const latestVersion = period.reportVersions[0] ?? null;

      if (latestVersion?.workflowState === ReportWorkflowState.submitted) {
        throw new ConflictException(
          'The latest version is still submitted and waiting for a decision.'
        );
      }

      if (
        latestVersion?.workflowState === ReportWorkflowState.approved ||
        latestVersion?.workflowState === ReportWorkflowState.rejected
      ) {
        throw new ConflictException(
          'Use the revise flow to create a new draft from an approved or rejected version.'
        );
      }

      const draft = await tx.reportVersion.create({
        data: {
          reportingPeriodId: period.id,
          versionNo: (latestVersion?.versionNo ?? 0) + 1,
          cadence: ReportCadence.monthly,
          workflowState: ReportWorkflowState.draft
        }
      });

      await tx.reportingPeriod.update({
        where: { id: period.id },
        data: {
          currentState: ReportingPeriodState.in_progress
        }
      });

      await this.appendReportActivityLogWithClient(tx, {
        reportingPeriodId: period.id,
        reportVersionId: draft.id,
        eventKey: 'draft_created',
        label: `Draft v${draft.versionNo} created`,
        note: latestVersion ? `Created after v${latestVersion.versionNo}` : null,
        actor
      });

      return draft;
    });
  }

  async submitVersion(versionId: string, actor?: ActionActorInput) {
    const version = await this.prisma.reportVersion.findUnique({
      where: { id: versionId },
      include: {
        reportingPeriod: {
          include: {
            brand: true,
            reportVersions: {
              orderBy: {
                versionNo: 'desc'
              }
            }
          }
        }
      }
    });

    if (!version) {
      throw new NotFoundException('Report version not found.');
    }

    if (version.reportingPeriod.deletedAt) {
      throw new NotFoundException('Report version not found.');
    }

    if (version.workflowState !== ReportWorkflowState.draft) {
      throw new ConflictException('Only draft versions can be submitted.');
    }

    const reviewReadiness = await this.reviewReadinessService.evaluatePeriod(
      version.reportingPeriod as ReportingPeriodWithVersions
    );

    if (!reviewReadiness.canSubmit || reviewReadiness.targetVersionId !== version.id) {
      throw new BadRequestException(
        this.buildSubmitBlockedMessage(reviewReadiness)
      );
    }

    return this.transitionDraft(versionId, actor);
  }

  async approveVersion(versionId: string, actor?: ActionActorInput) {
    return this.prisma.$transaction(async (tx) => {
      const version = await tx.reportVersion.findUnique({
        where: { id: versionId },
        include: {
          reportingPeriod: true
        }
      });

      if (!version) {
        throw new NotFoundException('Report version not found.');
      }

      if (version.reportingPeriod.deletedAt) {
        throw new NotFoundException('Report version not found.');
      }

      if (version.workflowState !== ReportWorkflowState.submitted) {
        throw new ConflictException(
          'Only submitted versions can be approved.'
        );
      }

      const now = new Date();

      await tx.reportVersion.updateMany({
        where: {
          reportingPeriodId: version.reportingPeriodId,
          workflowState: ReportWorkflowState.approved
        },
        data: {
          workflowState: ReportWorkflowState.superseded,
          supersededAt: now
        }
      });

      const approved = await tx.reportVersion.update({
        where: { id: version.id },
        data: {
          workflowState: ReportWorkflowState.approved,
          approvedAt: now
        }
      });

      await tx.reportingPeriod.update({
        where: { id: version.reportingPeriodId },
        data: {
          currentState: ReportingPeriodState.approved
        }
      });

      await this.captureQuestionSnapshotForPeriod(
        tx,
        version.reportingPeriodId,
        version.reportingPeriod.brandId
      );
      await this.kpiService.captureKpiPlanSnapshotForReportVersion(version.id, tx);
      await this.topContentService.captureApprovalContentCountSnapshot(version.id, {
        capturedAt: now,
        tx
      });
      await this.lockActiveFormulasForApprovedVersion(tx, version.id);
      await this.appendReportActivityLogWithClient(tx, {
        reportingPeriodId: version.reportingPeriodId,
        reportVersionId: version.id,
        eventKey: 'approved',
        label: `Version v${version.versionNo} approved`,
        note: null,
        actor
      });

      return approved;
    });
  }

  async rejectVersion(versionId: string, input: RejectVersionInput) {
    const reason = input.reason?.trim();

    if (!reason) {
      throw new BadRequestException('Rejection reason is required.');
    }

    return this.prisma.$transaction(async (tx) => {
      const version = await tx.reportVersion.findUnique({
        where: { id: versionId }
      });

      if (!version) {
        throw new NotFoundException('Report version not found.');
      }

      await this.ensureReportingPeriodActiveWithClient(tx, version.reportingPeriodId);

      if (version.workflowState !== ReportWorkflowState.submitted) {
        throw new ConflictException(
          'Only submitted versions can be rejected.'
        );
      }

      const rejected = await tx.reportVersion.update({
        where: { id: version.id },
        data: {
          workflowState: ReportWorkflowState.rejected,
          rejectedAt: new Date(),
          rejectionReason: reason
        }
      });

      await tx.reportingPeriod.update({
        where: { id: version.reportingPeriodId },
        data: {
          currentState: ReportingPeriodState.rejected
        }
      });
      await this.appendReportActivityLogWithClient(tx, {
        reportingPeriodId: version.reportingPeriodId,
        reportVersionId: version.id,
        eventKey: 'changes_requested',
        label: `Changes requested on v${version.versionNo}`,
        note: reason,
        actor: {
          actorName: input.actorName,
          actorEmail: input.actorEmail
        }
      });

      return rejected;
    });
  }

  async reviseVersion(versionId: string, input?: ReviseVersionInput) {
    const reason = input?.reason?.trim() ?? '';

    if (!reason) {
      throw new BadRequestException('Revision reason is required.');
    }

    return this.prisma.$transaction(async (tx) => {
      const version = await tx.reportVersion.findUnique({
        where: { id: versionId }
      });

      if (!version) {
        throw new NotFoundException('Report version not found.');
      }

      await this.ensureReportingPeriodActiveWithClient(tx, version.reportingPeriodId);

      if (
        version.workflowState !== ReportWorkflowState.approved &&
        version.workflowState !== ReportWorkflowState.rejected
      ) {
        throw new ConflictException(
          'Only approved or rejected versions can spawn a new draft revision.'
        );
      }

      const existingDraft = await tx.reportVersion.findFirst({
        where: {
          reportingPeriodId: version.reportingPeriodId,
          workflowState: ReportWorkflowState.draft
        }
      });

      if (existingDraft) {
        throw new ConflictException(
          'This reporting period already has an active draft.'
        );
      }

      const latestVersion = await tx.reportVersion.findFirst({
        where: {
          reportingPeriodId: version.reportingPeriodId
        },
        orderBy: {
          versionNo: 'desc'
        }
      });

      if (!latestVersion || latestVersion.id !== version.id) {
        throw new ConflictException(
          'Only the latest approved or rejected version can spawn a revision.'
        );
      }

      const draft = await tx.reportVersion.create({
        data: {
          reportingPeriodId: version.reportingPeriodId,
          versionNo: (latestVersion?.versionNo ?? 0) + 1,
          cadence: version.cadence,
          workflowState: ReportWorkflowState.draft,
          createdFromVersionId: version.id,
          changeSummary: reason
        }
      });

      await this.cloneRevisionSourceData(tx, version.id, draft.id);

      await tx.reportingPeriod.update({
        where: { id: version.reportingPeriodId },
        data: {
          currentState: ReportingPeriodState.in_progress
        }
      });
      await this.appendReportActivityLogWithClient(tx, {
        reportingPeriodId: version.reportingPeriodId,
        reportVersionId: draft.id,
        eventKey: 'revision_created',
        label: `Revision draft v${draft.versionNo} created`,
        note: reason,
        actor: {
          actorName: input?.actorName,
          actorEmail: input?.actorEmail
        }
      });

      return draft;
    });
  }

  async reopenVersion(versionId: string, input?: ReopenVersionInput) {
    const reason = input?.reason?.trim() ?? null;

    return this.prisma.$transaction(async (tx) => {
      const version = await tx.reportVersion.findUnique({
        where: { id: versionId }
      });

      if (!version) {
        throw new NotFoundException('Report version not found.');
      }

      await this.ensureReportingPeriodActiveWithClient(tx, version.reportingPeriodId);

      if (version.workflowState !== ReportWorkflowState.submitted) {
        throw new ConflictException(
          'Only submitted versions can be reopened for editing.'
        );
      }

      const existingDraft = await tx.reportVersion.findFirst({
        where: {
          reportingPeriodId: version.reportingPeriodId,
          workflowState: ReportWorkflowState.draft
        }
      });

      if (existingDraft) {
        if (existingDraft.createdFromVersionId) {
          const hasAnyVersionData = await this.hasAnyVersionData(tx, existingDraft.id);

          if (!hasAnyVersionData) {
            await this.cloneRevisionSourceData(
              tx,
              existingDraft.createdFromVersionId,
              existingDraft.id
            );
          }
        }

        if (reason && existingDraft.rejectionReason !== reason) {
          const updated = await tx.reportVersion.update({
            where: { id: existingDraft.id },
            data: {
              rejectionReason: reason
            }
          });
          await this.appendReportActivityLogWithClient(tx, {
            reportingPeriodId: version.reportingPeriodId,
            reportVersionId: updated.id,
            eventKey: 'reopened_for_editing',
            label: `Reopened to draft v${updated.versionNo}`,
            note: reason,
            actor: {
              actorName: input?.actorName,
              actorEmail: input?.actorEmail
            }
          });
          return updated;
        }

        await this.appendReportActivityLogWithClient(tx, {
          reportingPeriodId: version.reportingPeriodId,
          reportVersionId: existingDraft.id,
          eventKey: 'reopened_for_editing',
          label: `Reopened to draft v${existingDraft.versionNo}`,
          note: reason,
          actor: {
            actorName: input?.actorName,
            actorEmail: input?.actorEmail
          }
        });
        return existingDraft;
      }

      const latestVersion = await tx.reportVersion.findFirst({
        where: {
          reportingPeriodId: version.reportingPeriodId
        },
        orderBy: {
          versionNo: 'desc'
        }
      });

      if (!latestVersion || latestVersion.id !== version.id) {
        throw new ConflictException(
          'Only the latest submitted version can be reopened for editing.'
        );
      }

      const now = new Date();

      await tx.reportVersion.update({
        where: { id: version.id },
        data: {
          workflowState: ReportWorkflowState.superseded,
          supersededAt: now
        }
      });

      const draft = await tx.reportVersion.create({
        data: {
          reportingPeriodId: version.reportingPeriodId,
          versionNo: version.versionNo + 1,
          cadence: version.cadence,
          workflowState: ReportWorkflowState.draft,
          createdFromVersionId: version.id,
          rejectionReason: reason
        }
      });

      await this.cloneRevisionSourceData(tx, version.id, draft.id);

      await tx.reportingPeriod.update({
        where: { id: version.reportingPeriodId },
        data: {
          currentState: ReportingPeriodState.in_progress
        }
      });
      await this.appendReportActivityLogWithClient(tx, {
        reportingPeriodId: version.reportingPeriodId,
        reportVersionId: draft.id,
        eventKey: 'reopened_for_editing',
        label: `Reopened to draft v${draft.versionNo}`,
        note: reason,
        actor: {
          actorName: input?.actorName,
          actorEmail: input?.actorEmail
        }
      });

      return draft;
    });
  }

  private async ensureDraftCloneFromSource(draftVersionId: string, sourceVersionId: string) {
    await this.prisma.$transaction(async tx => {
      const draft = await tx.reportVersion.findUnique({
        where: { id: draftVersionId },
        select: {
          id: true,
          workflowState: true,
          createdFromVersionId: true
        }
      });

      if (
        !draft ||
        draft.workflowState !== ReportWorkflowState.draft ||
        !draft.createdFromVersionId ||
        draft.createdFromVersionId !== sourceVersionId
      ) {
        return;
      }

      const hasAnyVersionData = await this.hasAnyVersionData(tx, draft.id);

      if (hasAnyVersionData) {
        return;
      }

      await this.cloneRevisionSourceData(tx, sourceVersionId, draft.id);
    });
  }

  private async hasAnyVersionData(tx: Prisma.TransactionClient, versionId: string) {
    const [
      importJobCount,
      datasetRowCount,
      topContentCardCount,
      competitorMonitoringCount,
      questionEvidenceCount,
      metricSnapshotCount,
      manualSourceRowsSettingCount,
      manualFormulaRowsSettingCount
    ] = await Promise.all([
      tx.importJob.count({
        where: { reportVersionId: versionId }
      }),
      tx.datasetRow.count({
        where: { reportVersionId: versionId }
      }),
      tx.topContentCard.count({
        where: { reportVersionId: versionId }
      }),
      tx.competitorMonitoring.count({
        where: { reportVersionId: versionId }
      }),
      tx.questionEvidence.count({
        where: { reportVersionId: versionId }
      }),
      tx.metricSnapshot.count({
        where: { reportVersionId: versionId }
      }),
      tx.globalUiSetting.count({
        where: {
          settingKey: toManualSourceRowsSettingKey(versionId)
        }
      }),
      tx.globalUiSetting.count({
        where: {
          settingKey: toManualFormulaRowsSettingKey(versionId)
        }
      })
    ]);

    return (
      importJobCount > 0 ||
      datasetRowCount > 0 ||
      topContentCardCount > 0 ||
      competitorMonitoringCount > 0 ||
      questionEvidenceCount > 0 ||
      metricSnapshotCount > 0 ||
      manualSourceRowsSettingCount > 0 ||
      manualFormulaRowsSettingCount > 0
    );
  }

  private async cloneRevisionSourceData(
    tx: Prisma.TransactionClient,
    sourceVersionId: string,
    draftVersionId: string
  ) {
    const importJobIdMap = await this.cloneImportJobsAndMappings(
      tx,
      sourceVersionId,
      draftVersionId
    );
    const datasetRowIdMap = await this.cloneDatasetRowsAndCells(
      tx,
      sourceVersionId,
      draftVersionId,
      importJobIdMap
    );

    await this.cloneMetricSnapshot(tx, sourceVersionId, draftVersionId);
    await this.cloneTopContentCards(tx, sourceVersionId, draftVersionId, datasetRowIdMap);
    await this.cloneCompetitorMonitoring(tx, sourceVersionId, draftVersionId);
    await this.cloneCompetitorEvidence(tx, sourceVersionId, draftVersionId);
    await this.cloneQuestionEvidence(tx, sourceVersionId, draftVersionId);
    await this.cloneManualHeaderMetrics(tx, sourceVersionId, draftVersionId);
    await this.cloneManualSourceRowsSetting(tx, sourceVersionId, draftVersionId);
    await this.cloneManualFormulaRowsSetting(tx, sourceVersionId, draftVersionId);
  }

  private async cloneImportJobsAndMappings(
    tx: Prisma.TransactionClient,
    sourceVersionId: string,
    draftVersionId: string
  ) {
    const sourceImportJobs = await tx.importJob.findMany({
      where: {
        reportVersionId: sourceVersionId
      },
      include: {
        columnProfiles: {
          orderBy: {
            sourcePosition: 'asc'
          },
          include: {
            mappings: true
          }
        }
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    const importJobIdMap = new Map<string, string>();

    for (const sourceImportJob of sourceImportJobs) {
      const clonedImportJob = await tx.importJob.create({
        data: {
          reportVersionId: draftVersionId,
          originalFilename: sourceImportJob.originalFilename,
          storedFilename: sourceImportJob.storedFilename,
          storagePath: sourceImportJob.storagePath,
          mimeType: sourceImportJob.mimeType,
          fileSize: sourceImportJob.fileSize,
          snapshotSourceType: sourceImportJob.snapshotSourceType,
          snapshotSheetName: sourceImportJob.snapshotSheetName,
          snapshotHeaderRow: sourceImportJob.snapshotHeaderRow ?? Prisma.DbNull,
          snapshotDataRows: sourceImportJob.snapshotDataRows ?? Prisma.DbNull,
          snapshotCapturedAt: sourceImportJob.snapshotCapturedAt,
          status: sourceImportJob.status
        }
      });

      importJobIdMap.set(sourceImportJob.id, clonedImportJob.id);

      const columnProfileIdMap = new Map<string, string>();

      for (const sourceProfile of sourceImportJob.columnProfiles) {
        const clonedProfile = await tx.importColumnProfile.create({
          data: {
            importJobId: clonedImportJob.id,
            sourceColumnName: sourceProfile.sourceColumnName,
            sourcePosition: sourceProfile.sourcePosition,
            sampleValue: sourceProfile.sampleValue
          }
        });
        columnProfileIdMap.set(sourceProfile.id, clonedProfile.id);
      }

      for (const sourceProfile of sourceImportJob.columnProfiles) {
        const clonedProfileId = columnProfileIdMap.get(sourceProfile.id);

        if (!clonedProfileId) {
          continue;
        }

        for (const sourceMapping of sourceProfile.mappings) {
          await tx.columnMapping.create({
            data: {
              reportVersionId: draftVersionId,
              importJobId: clonedImportJob.id,
              importColumnProfileId: clonedProfileId,
              targetField: sourceMapping.targetField
            }
          });
        }
      }
    }

    return importJobIdMap;
  }

  private async cloneDatasetRowsAndCells(
    tx: Prisma.TransactionClient,
    sourceVersionId: string,
    draftVersionId: string,
    importJobIdMap: Map<string, string>
  ) {
    const sourceRows = await tx.datasetRow.findMany({
      where: {
        reportVersionId: sourceVersionId
      },
      include: {
        cells: {
          include: {
            override: true
          }
        }
      },
      orderBy: {
        sourceRowNumber: 'asc'
      }
    });

    const datasetRowIdMap = new Map<string, string>();

    for (const sourceRow of sourceRows) {
      const clonedImportJobId = importJobIdMap.get(sourceRow.importJobId);

      if (!clonedImportJobId) {
        continue;
      }

      const clonedRow = await tx.datasetRow.create({
        data: {
          reportVersionId: draftVersionId,
          importJobId: clonedImportJobId,
          sourceRowNumber: sourceRow.sourceRowNumber
        }
      });
      datasetRowIdMap.set(sourceRow.id, clonedRow.id);

      for (const sourceCell of sourceRow.cells) {
        const clonedCell = await tx.datasetCell.create({
          data: {
            datasetRowId: clonedRow.id,
            targetField: sourceCell.targetField,
            value: sourceCell.value
          }
        });

        if (sourceCell.override) {
          await tx.datasetCellOverride.create({
            data: {
              datasetCellId: clonedCell.id,
              overrideValue: sourceCell.override.overrideValue
            }
          });
        }
      }
    }

    return datasetRowIdMap;
  }

  private async cloneMetricSnapshot(
    tx: Prisma.TransactionClient,
    sourceVersionId: string,
    draftVersionId: string
  ) {
    const sourceMetricSnapshot = await tx.metricSnapshot.findUnique({
      where: {
        reportVersionId: sourceVersionId
      },
      include: {
        items: true
      }
    });

    if (!sourceMetricSnapshot) {
      return;
    }

    const clonedSnapshot = await tx.metricSnapshot.create({
      data: {
        reportVersionId: draftVersionId,
        generatedAt: sourceMetricSnapshot.generatedAt
      }
    });

    if (sourceMetricSnapshot.items.length === 0) {
      return;
    }

    await tx.metricSnapshotItem.createMany({
      data: sourceMetricSnapshot.items.map(item => ({
        metricSnapshotId: clonedSnapshot.id,
        metricKey: item.metricKey,
        value: item.value,
        rowCoverage: item.rowCoverage,
        overrideCount: item.overrideCount,
        sourceColumnName: item.sourceColumnName,
        sourceAliasLabel: item.sourceAliasLabel
      }))
    });
  }

  private async cloneTopContentCards(
    tx: Prisma.TransactionClient,
    sourceVersionId: string,
    draftVersionId: string,
    datasetRowIdMap: Map<string, string>
  ) {
    const sourceCards = await tx.topContentCard.findMany({
      where: {
        reportVersionId: sourceVersionId
      }
    });

    for (const sourceCard of sourceCards) {
      const clonedDatasetRowId = datasetRowIdMap.get(sourceCard.datasetRowId);

      if (!clonedDatasetRowId) {
        continue;
      }

      await tx.topContentCard.create({
        data: {
          reportVersionId: draftVersionId,
          datasetRowId: clonedDatasetRowId,
          slotKey: sourceCard.slotKey,
          metricKey: sourceCard.metricKey,
          title: sourceCard.title,
          headlineValue: sourceCard.headlineValue,
          caption: sourceCard.caption,
          externalUrl: sourceCard.externalUrl,
          screenshotUrl: sourceCard.screenshotUrl,
          selectionBasis: sourceCard.selectionBasis,
          rankPosition: sourceCard.rankPosition,
          displayOrder: sourceCard.displayOrder
        }
      });
    }
  }

  private async cloneCompetitorMonitoring(
    tx: Prisma.TransactionClient,
    sourceVersionId: string,
    draftVersionId: string
  ) {
    const sourceMonitoringRecords = await tx.competitorMonitoring.findMany({
      where: {
        reportVersionId: sourceVersionId
      },
      include: {
        posts: {
          orderBy: {
            displayOrder: 'asc'
          }
        }
      }
    });

    for (const sourceMonitoring of sourceMonitoringRecords) {
      const clonedMonitoring = await tx.competitorMonitoring.create({
        data: {
          reportVersionId: draftVersionId,
          competitorId: sourceMonitoring.competitorId,
          status: sourceMonitoring.status,
          followerCount: sourceMonitoring.followerCount,
          noActivityNote: sourceMonitoring.noActivityNote,
          noActivityEvidenceImageUrl: sourceMonitoring.noActivityEvidenceImageUrl
        }
      });

      if (sourceMonitoring.posts.length === 0) {
        continue;
      }

      await tx.competitorMonitoringPost.createMany({
        data: sourceMonitoring.posts.map(post => ({
          competitorMonitoringId: clonedMonitoring.id,
          displayOrder: post.displayOrder,
          screenshotUrl: post.screenshotUrl,
          postUrl: post.postUrl,
          note: null
        }))
      });
    }
  }

  private async cloneCompetitorEvidence(
    tx: Prisma.TransactionClient,
    sourceVersionId: string,
    draftVersionId: string
  ) {
    const sourceEvidence = await tx.competitorEvidence.findMany({
      where: {
        reportVersionId: sourceVersionId
      }
    });

    if (sourceEvidence.length === 0) {
      return;
    }

    await tx.competitorEvidence.createMany({
      data: sourceEvidence.map(item => ({
        reportVersionId: draftVersionId,
        competitorId: item.competitorId,
        title: item.title,
        postUrl: item.postUrl,
        note: item.note,
        capturedMetricValue: item.capturedMetricValue,
        capturedMetricLabel: item.capturedMetricLabel,
        displayOrder: item.displayOrder
      }))
    });
  }

  private async cloneQuestionEvidence(
    tx: Prisma.TransactionClient,
    sourceVersionId: string,
    draftVersionId: string
  ) {
    const [sourceVersion, sourceHighlightScreenshots] = await Promise.all([
      tx.reportVersion.findUnique({
        where: {
          id: sourceVersionId
        },
        select: {
          questionHighlightNote: true
        }
      }),
      tx.questionHighlightScreenshot.findMany({
        where: {
          reportVersionId: sourceVersionId
        },
        orderBy: {
          displayOrder: 'asc'
        }
      })
    ]);

    await tx.reportVersion.update({
      where: {
        id: draftVersionId
      },
      data: {
        questionHighlightNote: sourceVersion?.questionHighlightNote ?? null
      }
    });

    if (sourceHighlightScreenshots.length > 0) {
      await tx.questionHighlightScreenshot.createMany({
        data: sourceHighlightScreenshots.map((item) => ({
          reportVersionId: draftVersionId,
          displayOrder: item.displayOrder,
          screenshotUrl: item.screenshotUrl
        }))
      });
    }

    const sourceQuestionEvidence = await tx.questionEvidence.findMany({
      where: {
        reportVersionId: sourceVersionId
      },
      include: {
        screenshots: {
          orderBy: {
            displayOrder: 'asc'
          }
        }
      },
      orderBy: {
        displayOrder: 'asc'
      }
    });

    for (const sourceEvidence of sourceQuestionEvidence) {
      const clonedQuestionEvidence = await tx.questionEvidence.create({
        data: {
          reportVersionId: draftVersionId,
          brandQuestionActivationId: sourceEvidence.brandQuestionActivationId,
          title: sourceEvidence.title,
          responseNote: sourceEvidence.responseNote,
          postUrl: sourceEvidence.postUrl,
          mode: sourceEvidence.mode,
          questionCount: sourceEvidence.questionCount,
          displayOrder: sourceEvidence.displayOrder
        }
      });

      if (sourceEvidence.screenshots.length === 0) {
        continue;
      }

      await tx.questionEvidenceScreenshot.createMany({
        data: sourceEvidence.screenshots.map(screenshot => ({
          questionEvidenceId: clonedQuestionEvidence.id,
          displayOrder: screenshot.displayOrder,
          screenshotUrl: screenshot.screenshotUrl
        }))
      });
    }
  }

  private async cloneManualHeaderMetrics(
    tx: Prisma.TransactionClient,
    sourceVersionId: string,
    draftVersionId: string
  ) {
    await tx.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS report_manual_metrics (
        report_version_id VARCHAR(191) NOT NULL,
        viewers DECIMAL(18, 2) NULL,
        page_followers DECIMAL(18, 2) NULL,
        page_visit DECIMAL(18, 2) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (report_version_id)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);

    await tx.$executeRawUnsafe(
      `
      INSERT INTO report_manual_metrics (
        report_version_id,
        viewers,
        page_followers,
        page_visit,
        created_at,
        updated_at
      )
      SELECT
        ?,
        viewers,
        page_followers,
        page_visit,
        CURRENT_TIMESTAMP(3),
        CURRENT_TIMESTAMP(3)
      FROM report_manual_metrics
      WHERE report_version_id = ?
      ON DUPLICATE KEY UPDATE
        viewers = VALUES(viewers),
        page_followers = VALUES(page_followers),
        page_visit = VALUES(page_visit),
        updated_at = CURRENT_TIMESTAMP(3)
      `,
      draftVersionId,
      sourceVersionId
    );
  }

  private async cloneManualSourceRowsSetting(
    tx: Prisma.TransactionClient,
    sourceVersionId: string,
    draftVersionId: string
  ) {
    const sourceSettingKey = toManualSourceRowsSettingKey(sourceVersionId);
    const draftSettingKey = toManualSourceRowsSettingKey(draftVersionId);
    const sourceSetting = await tx.globalUiSetting.findUnique({
      where: {
        settingKey: sourceSettingKey
      },
      select: {
        valueJson: true
      }
    });

    if (!sourceSetting) {
      await tx.globalUiSetting.deleteMany({
        where: {
          settingKey: draftSettingKey
        }
      });
      return;
    }

    await tx.globalUiSetting.upsert({
      where: {
        settingKey: draftSettingKey
      },
      update: {
        valueJson: sourceSetting.valueJson
      },
      create: {
        settingKey: draftSettingKey,
        valueJson: sourceSetting.valueJson
      }
    });
  }

  private async cloneManualFormulaRowsSetting(
    tx: Prisma.TransactionClient,
    sourceVersionId: string,
    draftVersionId: string
  ) {
    const sourceSettingKey = toManualFormulaRowsSettingKey(sourceVersionId);
    const draftSettingKey = toManualFormulaRowsSettingKey(draftVersionId);
    const sourceSetting = await tx.globalUiSetting.findUnique({
      where: {
        settingKey: sourceSettingKey
      },
      select: {
        valueJson: true
      }
    });

    if (!sourceSetting) {
      await tx.globalUiSetting.deleteMany({
        where: {
          settingKey: draftSettingKey
        }
      });
      return;
    }

    await tx.globalUiSetting.upsert({
      where: {
        settingKey: draftSettingKey
      },
      update: {
        valueJson: sourceSetting.valueJson
      },
      create: {
        settingKey: draftSettingKey,
        valueJson: sourceSetting.valueJson
      }
    });
  }

  async deleteReportingPeriod(periodId: string, actor?: ActionActorInput) {
    await this.purgeExpiredDeletedReportingPeriods();
    const now = new Date();
    const purgeAt = this.resolveRecyclePurgeAt(now);
    const actorName = this.normalizeLogActorText(actor?.actorName);
    const actorEmail = this.normalizeLogActorText(actor?.actorEmail)?.toLowerCase() ?? null;

    const deletedPeriod = await this.prisma.$transaction(async tx => {
      const period = await tx.reportingPeriod.findUnique({
        where: { id: periodId },
        include: {
          reportVersions: {
            select: {
              id: true,
              versionNo: true,
              workflowState: true
            },
            orderBy: {
              versionNo: 'desc'
            }
          }
        }
      });

      if (!period) {
        throw new NotFoundException('Reporting period not found.');
      }

      if (period.deletedAt && period.purgeAt && period.purgeAt > now) {
        return period;
      }

      const hasApprovedVersion = period.reportVersions.some(
        version => version.workflowState === ReportWorkflowState.approved
      );

      if (hasApprovedVersion) {
        throw new ConflictException(
          'Cannot delete this report because an approved version already exists.'
        );
      }

      const updated = await tx.reportingPeriod.update({
        where: {
          id: period.id
        },
        data: {
          deletedAt: now,
          deletedByName: actorName,
          deletedByEmail: actorEmail,
          purgeAt
        },
        include: {
          reportVersions: {
            select: {
              id: true,
              versionNo: true,
              workflowState: true
            },
            orderBy: {
              versionNo: 'desc'
            }
          }
        }
      });
      const latestVersion = updated.reportVersions[0] ?? null;

      await this.appendReportActivityLogWithClient(tx, {
        reportingPeriodId: updated.id,
        reportVersionId: latestVersion?.id ?? null,
        eventKey: 'report_moved_to_recycle_bin',
        label: 'Report moved to recycle bin',
        note: `Auto-delete on ${purgeAt.toISOString()}`,
        actor
      });

      return updated;
    });

    return {
      deleted: true,
      softDeleted: true,
      retentionDays: REPORT_RECYCLE_RETENTION_DAYS,
      purgeAt: deletedPeriod.purgeAt?.toISOString() ?? purgeAt.toISOString()
    };
  }

  async restoreReportingPeriod(periodId: string, actor?: ActionActorInput) {
    await this.purgeExpiredDeletedReportingPeriods();
    const now = new Date();

    const restoredPeriod = await this.prisma.$transaction(async tx => {
      const period = await tx.reportingPeriod.findUnique({
        where: { id: periodId },
        include: {
          brand: true,
          reportVersions: {
            orderBy: {
              versionNo: 'desc'
            }
          }
        }
      });

      if (!period) {
        throw new NotFoundException('Reporting period not found.');
      }

      if (!period.deletedAt) {
        throw new ConflictException('This report is not in recycle bin.');
      }

      if (period.purgeAt && period.purgeAt <= now) {
        throw new NotFoundException(
          'This report has expired from recycle bin and can no longer be restored.'
        );
      }

      const updated = await tx.reportingPeriod.update({
        where: {
          id: period.id
        },
        data: {
          deletedAt: null,
          deletedByName: null,
          deletedByEmail: null,
          purgeAt: null
        },
        include: {
          brand: true,
          reportVersions: {
            orderBy: {
              versionNo: 'desc'
            }
          }
        }
      });
      const latestVersion = updated.reportVersions[0] ?? null;

      await this.appendReportActivityLogWithClient(tx, {
        reportingPeriodId: updated.id,
        reportVersionId: latestVersion?.id ?? null,
        eventKey: 'report_restored_from_recycle_bin',
        label: 'Report restored from recycle bin',
        note: this.formatMonthLabel(updated.year, updated.month),
        actor
      });

      return updated;
    });

    return {
      restored: true,
      period: this.toListItem(restoredPeriod)
    };
  }

  private async purgeExpiredDeletedReportingPeriods() {
    const now = new Date();
    const expiredPeriods = await this.prisma.reportingPeriod.findMany({
      where: {
        deletedAt: {
          not: null
        },
        OR: [
          {
            purgeAt: {
              lte: now
            }
          },
          {
            purgeAt: null
          }
        ]
      },
      select: {
        id: true
      },
      take: 25
    });

    if (expiredPeriods.length === 0) {
      return;
    }

    for (const period of expiredPeriods) {
      await this.purgeDeletedReportingPeriodById(period.id);
    }
  }

  private async purgeDeletedReportingPeriodById(periodId: string) {
    const deleted = await this.prisma.$transaction(async tx => {
      const period = await tx.reportingPeriod.findUnique({
        where: { id: periodId },
        include: {
          reportVersions: {
            select: {
              id: true,
              workflowState: true,
              importJobs: {
                select: {
                  storagePath: true
                }
              },
              topContentCards: {
                select: {
                  screenshotUrl: true
                }
              },
              competitorMonitoringRecords: {
                select: {
                  noActivityEvidenceImageUrl: true,
                  posts: {
                    select: {
                      screenshotUrl: true
                    }
                  }
                }
              },
              questionEvidence: {
                select: {
                  screenshots: {
                    select: {
                      screenshotUrl: true
                    }
                  }
                }
              },
              questionHighlightScreenshots: {
                select: {
                  screenshotUrl: true
                }
              }
            }
          }
        }
      });

      if (!period || !period.deletedAt) {
        return null;
      }

      const mediaDeleteTargets = this.collectReportMediaDeleteTargets(period.reportVersions);
      const reportVersionSettingKeys = period.reportVersions.flatMap(version => [
        toManualSourceRowsSettingKey(version.id),
        toManualFormulaRowsSettingKey(version.id),
        toKpiPlanSnapshotSettingKey(version.id),
        toTopContentCountSnapshotSettingKey(version.id)
      ]);
      const periodSettingKeys = [toReportActivityLogSettingKey(period.id)];
      const settingKeys = [...new Set([...reportVersionSettingKeys, ...periodSettingKeys])];

      await tx.reportingPeriod.delete({
        where: {
          id: period.id
        }
      });

      if (settingKeys.length > 0) {
        await tx.globalUiSetting.deleteMany({
          where: {
            settingKey: {
              in: settingKeys
            }
          }
        });
      }

      return {
        mediaDeleteTargets
      };
    });

    if (!deleted) {
      return;
    }

    const mediaCleanup = await this.deleteReportMediaArtifacts(deleted.mediaDeleteTargets);
    if (mediaCleanup.failed > 0) {
      this.logger.warn(
        `Recycle bin purge completed with media cleanup failures for period ${periodId}.`
      );
    }
  }

  private resolveRecyclePurgeAt(base: Date) {
    return new Date(base.getTime() + REPORT_RECYCLE_RETENTION_MS);
  }

  private collectReportMediaDeleteTargets(
    reportVersions: Array<{
      importJobs: Array<{ storagePath: string }>;
      topContentCards: Array<{ screenshotUrl: string | null }>;
      competitorMonitoringRecords: Array<{
        noActivityEvidenceImageUrl: string | null;
        posts: Array<{ screenshotUrl: string }>;
      }>;
      questionEvidence: Array<{
        screenshots: Array<{ screenshotUrl: string }>;
      }>;
      questionHighlightScreenshots: Array<{
        screenshotUrl: string;
      }>;
    }>
  ): ReportMediaDeleteTargets {
    const objectKeys = new Set<string>();
    const publicUrls = new Set<string>();

    for (const version of reportVersions) {
      for (const importJob of version.importJobs) {
        const objectKey = this.normalizeManagedObjectKey(importJob.storagePath);
        if (objectKey) {
          objectKeys.add(objectKey);
        }
      }

      for (const card of version.topContentCards) {
        const normalizedUrl = this.normalizeMediaUrl(card.screenshotUrl);
        if (normalizedUrl) {
          publicUrls.add(normalizedUrl);
        }
      }

      for (const monitoring of version.competitorMonitoringRecords) {
        const noActivityEvidenceUrl = this.normalizeMediaUrl(
          monitoring.noActivityEvidenceImageUrl
        );
        if (noActivityEvidenceUrl) {
          publicUrls.add(noActivityEvidenceUrl);
        }

        for (const post of monitoring.posts) {
          const screenshotUrl = this.normalizeMediaUrl(post.screenshotUrl);
          if (screenshotUrl) {
            publicUrls.add(screenshotUrl);
          }
        }
      }

      for (const questionEvidence of version.questionEvidence) {
        for (const screenshot of questionEvidence.screenshots) {
          const screenshotUrl = this.normalizeMediaUrl(screenshot.screenshotUrl);
          if (screenshotUrl) {
            publicUrls.add(screenshotUrl);
          }
        }
      }

      for (const screenshot of version.questionHighlightScreenshots) {
        const screenshotUrl = this.normalizeMediaUrl(screenshot.screenshotUrl);
        if (screenshotUrl) {
          publicUrls.add(screenshotUrl);
        }
      }
    }

    return {
      objectKeys: Array.from(objectKeys),
      publicUrls: Array.from(publicUrls)
    };
  }

  private async deleteReportMediaArtifacts(
    targets: ReportMediaDeleteTargets
  ): Promise<ReportMediaCleanupSummary> {
    const uniqueTargets = [
      ...targets.objectKeys.map((objectKey) => ({ type: 'object_key' as const, value: objectKey })),
      ...targets.publicUrls.map((publicUrl) => ({ type: 'public_url' as const, value: publicUrl }))
    ];

    if (uniqueTargets.length === 0) {
      return {
        attempted: 0,
        deleted: 0,
        skipped: 0,
        failed: 0
      };
    }

    let attempted = 0;
    let deleted = 0;
    let skipped = 0;
    let failed = 0;

    for (const target of uniqueTargets) {
      attempted += 1;

      try {
        const result =
          target.type === 'object_key'
            ? await this.mediaService.deleteObject({ objectKey: target.value })
            : await this.mediaService.deleteObject({ publicUrl: target.value });

        if (result.deleted) {
          deleted += 1;
        } else {
          skipped += 1;
        }
      } catch (error) {
        failed += 1;
        this.logger.warn(
          `Failed to delete media file during report cleanup (${target.type}=${target.value}): ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
        );
      }
    }

    return {
      attempted,
      deleted,
      skipped,
      failed
    };
  }

  private normalizeMediaUrl(value: string | null | undefined) {
    const normalized = value?.trim() ?? '';
    return normalized.length > 0 ? normalized : null;
  }

  private normalizeManagedObjectKey(value: string | null | undefined) {
    const normalized = (value ?? '')
      .trim()
      .replace(/\\/g, '/')
      .replace(/^\/+/g, '');

    if (!normalized.startsWith('uploads/')) {
      return null;
    }

    if (normalized.includes('..')) {
      return null;
    }

    return normalized;
  }

  private async ensureReportingPeriodActiveWithClient(
    client: PrismaService | Prisma.TransactionClient,
    periodId: string
  ) {
    const period = await client.reportingPeriod.findUnique({
      where: {
        id: periodId
      },
      select: {
        id: true,
        deletedAt: true
      }
    });

    if (!period || period.deletedAt) {
      throw new NotFoundException('Reporting period not found.');
    }
  }

  private async transitionDraft(versionId: string, actor?: ActionActorInput) {
    return this.prisma.$transaction(async (tx) => {
      const version = await tx.reportVersion.findUnique({
        where: { id: versionId }
      });

      if (!version) {
        throw new NotFoundException('Report version not found.');
      }

      if (version.workflowState !== ReportWorkflowState.draft) {
        throw new ConflictException(
          'Only draft versions can be submitted.'
        );
      }

      await this.ensureReportingPeriodActiveWithClient(tx, version.reportingPeriodId);

      const submitted = await tx.reportVersion.update({
        where: { id: version.id },
        data: {
          workflowState: ReportWorkflowState.submitted,
          submittedAt: new Date()
        }
      });

      await tx.reportingPeriod.update({
        where: { id: version.reportingPeriodId },
        data: {
          currentState: ReportingPeriodState.submitted
        }
      });

      await this.appendReportActivityLogWithClient(tx, {
        reportingPeriodId: version.reportingPeriodId,
        reportVersionId: version.id,
        eventKey: 'submitted',
        label: `Version v${version.versionNo} submitted`,
        note: null,
        actor
      });

      return submitted;
    });
  }

  private toRecycleBinItem(period: ReportingPeriodWithVersions): ReportingRecycleBinItem {
    const latestVersion = period.reportVersions[0] ?? null;
    const deletedAt = period.deletedAt ?? period.updatedAt;
    const purgeAt = period.purgeAt ?? this.resolveRecyclePurgeAt(deletedAt);

    return {
      id: period.id,
      brandId: period.brandId,
      brandCode: period.brand.code,
      brandName: period.brand.name,
      cadence: 'monthly',
      year: period.year,
      month: period.month,
      label: this.formatMonthLabel(period.year, period.month),
      createdAt: period.createdAt.toISOString(),
      createdYear: period.createdAt.getUTCFullYear(),
      deletedAt: deletedAt.toISOString(),
      deletedByName: period.deletedByName,
      deletedByEmail: period.deletedByEmail,
      purgeAt: purgeAt.toISOString(),
      latestVersionId: latestVersion?.id ?? null,
      latestVersionState: latestVersion?.workflowState ?? null,
      latestVersionNo: latestVersion?.versionNo ?? null,
      latestVersionUpdatedAt: latestVersion?.updatedAt.toISOString() ?? null,
      versionCount: period.reportVersions.length
    };
  }

  private toListItem(
    period: ReportingPeriodWithVersions,
    overrides?: {
      canSubmitLatest?: boolean;
      activityLog?: ReportActivityLogEvent[];
      approvedSnapshotByVersionId?: Map<string, ApprovedSnapshotSummary>;
    }
  ): ReportingListItem {
    const currentDraft =
      period.reportVersions.find(
        (version) => version.workflowState === ReportWorkflowState.draft
      ) ?? null;
    const currentApproved =
      period.reportVersions.find(
        (version) => version.workflowState === ReportWorkflowState.approved
      ) ?? null;
    const latestVersion = period.reportVersions[0] ?? null;

    return {
      id: period.id,
      brandId: period.brandId,
      brandCode: period.brand.code,
      brandName: period.brand.name,
      cadence: 'monthly',
      year: period.year,
      month: period.month,
      label: this.formatMonthLabel(period.year, period.month),
      currentState: period.currentState,
      currentDraftVersionId: currentDraft?.id ?? null,
      currentApprovedVersionId: currentApproved?.id ?? null,
      latestVersionId: latestVersion?.id ?? null,
      latestVersionState: latestVersion?.workflowState ?? null,
      versions: period.reportVersions.map((version) => ({
        id: version.id,
        versionNo: version.versionNo,
        workflowState: version.workflowState,
        createdFromVersionId: version.createdFromVersionId,
        submittedAt: version.submittedAt?.toISOString() ?? null,
        approvedAt: version.approvedAt?.toISOString() ?? null,
        rejectedAt: version.rejectedAt?.toISOString() ?? null,
        rejectionReason: version.rejectionReason,
        supersededAt: version.supersededAt?.toISOString() ?? null,
        createdAt: version.createdAt.toISOString(),
        updatedAt: version.updatedAt.toISOString()
      })),
      activityLog: (overrides?.activityLog ?? []).map(event => ({
        id: event.id,
        eventKey: event.eventKey,
        label: event.label,
        at: event.at,
        actorName: event.actorName,
        actorEmail: event.actorEmail,
        reportVersionId: event.reportVersionId,
        note: event.note
      })),
      approvedSnapshot:
        currentApproved && overrides?.approvedSnapshotByVersionId
          ? (overrides.approvedSnapshotByVersionId.get(currentApproved.id) ?? null)
          : null,
      availableActions: {
        canCreateDraft:
          !latestVersion ||
          latestVersion.workflowState === ReportWorkflowState.draft,
        canSubmitLatest:
          overrides?.canSubmitLatest ??
          latestVersion?.workflowState === ReportWorkflowState.draft,
        canApproveLatest:
          latestVersion?.workflowState === ReportWorkflowState.submitted,
        canReviseLatest:
          !!latestVersion &&
          (latestVersion.workflowState === ReportWorkflowState.approved ||
            latestVersion.workflowState === ReportWorkflowState.rejected) &&
          !currentDraft,
        canReopenLatest:
          !!latestVersion &&
          latestVersion.workflowState === ReportWorkflowState.submitted &&
          !currentDraft
      }
    };
  }

  private formatMonthLabel(year: number, month: number) {
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      year: 'numeric'
    }).format(new Date(Date.UTC(year, month - 1, 1)));
  }

  private async readActivityLogByPeriodIds(periodIds: string[]) {
    if (periodIds.length === 0) {
      return new Map<string, ReportActivityLogEvent[]>();
    }

    await this.ensureGlobalUiSettingsStorageWithClient(this.prisma);
    const settingKeys = periodIds.map(periodId => toReportActivityLogSettingKey(periodId));
    const settings = await this.prisma.globalUiSetting.findMany({
      where: {
        settingKey: {
          in: settingKeys
        }
      },
      select: {
        settingKey: true,
        valueJson: true
      }
    });
    const valueBySettingKey = new Map(
      settings.map(setting => [setting.settingKey, setting.valueJson] as const)
    );

    return new Map(
      periodIds.map(periodId => {
        const parsed = parseReportActivityLogSettingPayload(
          valueBySettingKey.get(toReportActivityLogSettingKey(periodId)) ?? null
        );
        return [periodId, parsed?.events ?? []] as const;
      })
    );
  }

  private async readApprovedSnapshotByReportVersionIds(reportVersionIds: string[]) {
    const uniqueReportVersionIds = Array.from(new Set(reportVersionIds));
    if (uniqueReportVersionIds.length === 0) {
      return new Map<string, ApprovedSnapshotSummary>();
    }

    const [snapshots, reportVersions, datasetCells, metricsItemsByVersionId] = await Promise.all([
      this.prisma.metricSnapshot.findMany({
        where: {
          reportVersionId: {
            in: uniqueReportVersionIds
          }
        },
        include: {
          items: true
        }
      }),
      this.prisma.reportVersion.findMany({
        where: {
          id: {
            in: uniqueReportVersionIds
          }
        },
        select: {
          id: true,
          approvedAt: true,
          updatedAt: true
        }
      }),
      this.prisma.datasetCell.findMany({
        where: {
          targetField: {
            in: METRIC_TARGET_FIELDS
          },
          datasetRow: {
            reportVersionId: {
              in: uniqueReportVersionIds
            }
          }
        },
        select: {
          targetField: true,
          value: true,
          override: {
            select: {
              overrideValue: true
            }
          },
          datasetRow: {
            select: {
              reportVersionId: true
            }
          }
        }
      }),
      this.readMetricsItemsByReportVersionIds(uniqueReportVersionIds)
    ]);

    const reportVersionById = new Map(
      reportVersions.map(version => [version.id, version] as const)
    );
    const snapshotByVersionId = new Map(
      snapshots.map(snapshot => [snapshot.reportVersionId, snapshot] as const)
    );
    const aggregatedByVersionId = new Map<string, Map<string, number>>();

    for (const cell of datasetCells) {
      const numericValue = this.toNumber(cell.override?.overrideValue ?? cell.value);
      if (numericValue === null) {
        continue;
      }

      const versionId = cell.datasetRow.reportVersionId;
      const versionMap =
        aggregatedByVersionId.get(versionId) ??
        (() => {
          const next = new Map<string, number>();
          aggregatedByVersionId.set(versionId, next);
          return next;
        })();
      versionMap.set(cell.targetField, (versionMap.get(cell.targetField) ?? 0) + numericValue);
    }

    const asMetricItem = (key: string, value: number): MetricAggregateItem => ({
      key: key as MetricAggregateItem['key'],
      label: AVAILABLE_TARGETS_BY_KEY.get(key as MetricAggregateItem['key'])?.label ?? key,
      value
    });

    const result = new Map<string, ApprovedSnapshotSummary>();
    for (const versionId of uniqueReportVersionIds) {
      const snapshot = snapshotByVersionId.get(versionId) ?? null;
      const aggregated = aggregatedByVersionId.get(versionId) ?? new Map<string, number>();
      const mergedItemsByKey = new Map<string, MetricAggregateItem>();

      if (snapshot) {
        for (const item of snapshot.items) {
          mergedItemsByKey.set(item.metricKey, asMetricItem(item.metricKey, item.value));
        }
      }

      for (const [key, value] of aggregated.entries()) {
        if (!mergedItemsByKey.has(key)) {
          mergedItemsByKey.set(key, asMetricItem(key, value));
        }
      }

      const metricsItems = metricsItemsByVersionId.get(versionId) ?? [];
      const engagementFromMetrics = this.resolveDashboardMetricValueFromMetricsItems(
        metricsItems,
        'engagement'
      );
      const videoViews3sFromMetrics = this.resolveDashboardMetricValueFromMetricsItems(
        metricsItems,
        'video_views_3s'
      );
      if (!mergedItemsByKey.has('engagement') && engagementFromMetrics !== null) {
        mergedItemsByKey.set('engagement', asMetricItem('engagement', engagementFromMetrics));
      }
      if (!mergedItemsByKey.has('video_views_3s') && videoViews3sFromMetrics !== null) {
        mergedItemsByKey.set(
          'video_views_3s',
          asMetricItem('video_views_3s', videoViews3sFromMetrics)
        );
      }

      if (mergedItemsByKey.size === 0) {
        continue;
      }

      const reportVersion = reportVersionById.get(versionId);
      const generatedAt = snapshot?.generatedAt.toISOString() ??
        reportVersion?.approvedAt?.toISOString() ??
        reportVersion?.updatedAt.toISOString() ??
        new Date().toISOString();

      result.set(versionId, {
        reportVersionId: versionId,
        generatedAt,
        items: Array.from(mergedItemsByKey.values()).sort((left, right) =>
          left.label.localeCompare(right.label)
        )
      });
    }

    return result;
  }

  private async readMetricsItemsByReportVersionIds(reportVersionIds: string[]) {
    type MetricsItems = Awaited<ReturnType<MetricsService['getMetricsItemsForReportVersion']>>;
    const entries: Array<[string, MetricsItems]> = await Promise.all(
      reportVersionIds.map(async reportVersionId => {
        try {
          const items = await this.metricsService.getMetricsItemsForReportVersion(
            reportVersionId
          );
          return [reportVersionId, items];
        } catch {
          return [reportVersionId, []];
        }
      })
    );

    return new Map(entries);
  }

  private resolveDashboardMetricValueFromMetricsItems(
    items: Array<{
      key: string;
      label: string;
      canonicalMetricKey: string | null;
      actualValue: number | null;
    }>,
    targetKey: 'engagement' | 'video_views_3s'
  ) {
    const normalizedTarget = targetKey.toLowerCase();
    const matchByCanonical = items.find(
      item =>
        item.actualValue !== null &&
        (item.canonicalMetricKey?.toLowerCase() ?? '') === normalizedTarget
    );
    if (matchByCanonical) {
      return matchByCanonical.actualValue;
    }

    const matchByKey = items.find(
      item => item.actualValue !== null && item.key.toLowerCase() === normalizedTarget
    );
    if (matchByKey) {
      return matchByKey.actualValue;
    }

    if (targetKey === 'engagement') {
      const matchByLabel = items.find(
        item =>
          item.actualValue !== null &&
          item.label.toLowerCase().replace(/\s+/g, ' ').trim() === 'engagement'
      );
      return matchByLabel?.actualValue ?? null;
    }

    const matchByVideoLabel = items.find(item => {
      if (item.actualValue === null) {
        return false;
      }

      const label = item.label.toLowerCase();
      return label.includes('video') && label.includes('3');
    });
    return matchByVideoLabel?.actualValue ?? null;
  }

  private async appendReportActivityLogWithClient(
    client: PrismaService | Prisma.TransactionClient,
    input: {
      reportingPeriodId: string;
      reportVersionId: string | null;
      eventKey: string;
      label: string;
      note: string | null;
      actor?: ActionActorInput;
    }
  ) {
    await this.ensureGlobalUiSettingsStorageWithClient(client);

    const settingKey = toReportActivityLogSettingKey(input.reportingPeriodId);
    const currentSetting = await client.globalUiSetting.findUnique({
      where: {
        settingKey
      },
      select: {
        valueJson: true
      }
    });
    const parsed = parseReportActivityLogSettingPayload(currentSetting?.valueJson ?? null);
    const actorName = this.normalizeLogActorText(input.actor?.actorName);
    const actorEmail = this.normalizeLogActorText(input.actor?.actorEmail)?.toLowerCase() ?? null;
    const note = this.normalizeLogActorText(input.note);
    const event: ReportActivityLogEvent = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
      eventKey: this.normalizeLogActorText(input.eventKey) ?? 'event',
      label: this.normalizeLogActorText(input.label) ?? 'Activity',
      at: new Date().toISOString(),
      actorName,
      actorEmail,
      reportVersionId: this.normalizeLogActorText(input.reportVersionId),
      note
    };
    const nextEvents = [event, ...(parsed?.events ?? [])].slice(0, 200);
    const valueJson = stringifyReportActivityLogSettingPayload({
      version: 1,
      events: nextEvents
    });

    await client.globalUiSetting.upsert({
      where: {
        settingKey
      },
      update: {
        valueJson
      },
      create: {
        settingKey,
        valueJson
      }
    });

    const mappedAuditLog = this.mapReportActivityEventToAdminAuditLog({
      eventKey: event.eventKey,
      label: event.label,
      note: event.note,
      reportVersionId: event.reportVersionId,
      reportingPeriodId: input.reportingPeriodId
    });

    if (mappedAuditLog) {
      await this.auditLogService.appendWithClient(client, {
        ...mappedAuditLog,
        actor: {
          actorName: event.actorName,
          actorEmail: event.actorEmail
        }
      });
    }
  }

  private mapReportActivityEventToAdminAuditLog(input: {
    eventKey: string;
    label: string;
    note: string | null;
    reportVersionId: string | null;
    reportingPeriodId: string;
  }) {
    const mappedActionKeyByEventKey: Record<string, string> = {
      submitted: 'REPORT_SUBMITTED',
      approved: 'REPORT_APPROVED',
      changes_requested: 'REPORT_REJECTED',
      reopened_for_editing: 'REPORT_REOPENED',
      revision_created: 'REPORT_REVISED'
    };
    const actionKey = mappedActionKeyByEventKey[input.eventKey];

    if (!actionKey) {
      return null;
    }

    const summary = input.note ? `${input.label}. ${input.note}` : input.label;

    return {
      actionKey,
      entityType: 'REPORT' as const,
      entityId: input.reportVersionId ?? input.reportingPeriodId,
      entityLabel: input.label,
      summary,
      metadata: {
        reportVersionId: input.reportVersionId,
        reportingPeriodId: input.reportingPeriodId
      }
    };
  }

  private normalizeLogActorText(value: string | null | undefined) {
    const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
    return normalized.length > 0 ? normalized : null;
  }

  private toNumber(rawValue: string | null | undefined) {
    if (!rawValue) {
      return null;
    }

    const normalized = rawValue.replaceAll(',', '').trim();
    if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
      return null;
    }

    return Number(normalized);
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

  private resolveSuggestedNextPeriod(
    latestMonthlyPeriod: {
      year: number;
      month: number;
    } | null,
    options?: {
      fallbackYear?: number;
    }
  ) {
    if (!latestMonthlyPeriod) {
      const now = new Date();
      const fallbackYear =
        options?.fallbackYear &&
        Number.isInteger(options.fallbackYear) &&
        options.fallbackYear >= 2000 &&
        options.fallbackYear <= 3000
          ? options.fallbackYear
          : null;
      const year = fallbackYear ?? now.getUTCFullYear();
      const month = fallbackYear !== null ? 1 : now.getUTCMonth() + 1;
      return {
        year,
        month,
        label: this.formatMonthLabel(year, month)
      };
    }

    const next = new Date(Date.UTC(latestMonthlyPeriod.year, latestMonthlyPeriod.month, 1));
    const year = next.getUTCFullYear();
    const month = next.getUTCMonth() + 1;

    return {
      year,
      month,
      label: this.formatMonthLabel(year, month)
    };
  }

  private async getYearSetupContext(brandId: string): Promise<YearSetupContext> {
    const [
      reportYearsRows,
      kpiPlans,
      competitorAssignmentYears,
      activeQuestionAssignmentCount,
      activeRelatedProductOptionCount
    ] = await Promise.all([
        this.prisma.reportingPeriod.findMany({
          where: {
            brandId,
            cadence: ReportCadence.monthly,
            deletedAt: null
          },
          select: {
            year: true
          },
          distinct: ['year']
        }),
        this.prisma.brandKpiPlan.findMany({
          where: {
            brandId
          },
          select: {
            year: true,
            _count: {
              select: {
                items: true
              }
            }
          }
        }),
        this.prisma.brandCompetitorAssignment.findMany({
          where: {
            brandId
          },
          select: {
            year: true
          },
          distinct: ['year']
        }),
        this.prisma.brandQuestionActivation.count({
          where: {
            brandId,
            status: QuestionStatus.active,
            questionMaster: {
              status: QuestionStatus.active
            }
          }
        }),
        this.prisma.brandDropdownOption.count({
          where: {
            brandId,
            fieldKey: BrandDropdownFieldKey.related_product,
            status: BrandDropdownOptionStatus.active
          }
        })
      ]);

    return {
      reportYears: new Set(reportYearsRows.map((row) => row.year)),
      kpiConfiguredYears: new Set(kpiPlans.map((plan) => plan.year)),
      kpiReadyYears: new Set(
        kpiPlans.filter((plan) => plan._count.items > 0).map((plan) => plan.year)
      ),
      competitorReadyYears: new Set(competitorAssignmentYears.map((row) => row.year)),
      questionAssignmentsReady: activeQuestionAssignmentCount > 0,
      relatedProductOptionsReady: activeRelatedProductOptionCount > 0
    };
  }

  private toYearSetupStatus(year: number, context: YearSetupContext): YearSetupStatus {
    const hasKpiPlan = context.kpiConfiguredYears.has(year);
    const hasReadyKpiPlan = context.kpiReadyYears.has(year);
    const hasCompetitorAssignments = context.competitorReadyYears.has(year);

    const kpiPassed = hasReadyKpiPlan;
    const competitorPassed = hasCompetitorAssignments;
    const questionPassed = context.questionAssignmentsReady;
    const relatedProductPassed = context.relatedProductOptionsReady;

    const checks: YearSetupCheck[] = [
      {
        key: 'kpi_plan',
        label: 'KPI plan',
        required: true,
        passed: kpiPassed,
        detail: kpiPassed
          ? 'Yearly KPI targets are configured.'
          : hasKpiPlan
            ? 'KPI plan exists but has no KPI items yet.'
            : 'Configure yearly KPI targets before creating reports.'
      },
      {
        key: 'competitor_assignments',
        label: 'Competitor setup',
        required: true,
        passed: competitorPassed,
        detail: competitorPassed
          ? 'Competitor assignments are configured for this year.'
          : 'Assign competitors for this year before creating reports.'
      },
      {
        key: 'question_assignments',
        label: 'Question categories',
        required: true,
        passed: questionPassed,
        detail: questionPassed
          ? 'Question categories are assigned for this brand.'
          : 'Assign at least one active question category before creating reports.'
      },
      {
        key: 'related_product_options',
        label: 'Columns (Related Product)',
        required: true,
        passed: relatedProductPassed,
        detail: relatedProductPassed
          ? 'Related Product options are configured for this brand.'
          : 'Add at least one active Related Product option before creating reports.'
      }
    ];

    const failedRequiredChecks = checks.filter((check) => check.required && !check.passed);
    const canCreateReport = failedRequiredChecks.length === 0;
    const summary = canCreateReport
      ? 'Year setup is ready. You can create report periods for this year.'
      : `Complete year setup before creating reports: ${failedRequiredChecks
          .map((check) => check.label)
          .join(', ')}.`;

    return {
      year,
      canCreateReport,
      summary,
      checks
    };
  }

  private buildYearOptions(input: {
    selectedYear: number;
    currentYear: number;
    context: YearSetupContext;
  }) {
    const years = new Set<number>([
      input.selectedYear,
      input.currentYear - 1,
      input.currentYear,
      input.currentYear + 1
    ]);

    for (const year of input.context.reportYears) {
      years.add(year);
    }
    for (const year of input.context.kpiConfiguredYears) {
      years.add(year);
    }
    for (const year of input.context.competitorReadyYears) {
      years.add(year);
    }

    return Array.from(years)
      .filter((year) => Number.isInteger(year) && year >= 2000 && year <= 3000)
      .filter((year) => year <= input.currentYear + 1 || year === input.selectedYear)
      .sort((left, right) => right - left)
      .map((year) => ({
        year,
        isReady: this.toYearSetupStatus(year, input.context).canCreateReport,
        hasReports: input.context.reportYears.has(year)
      }));
  }

  private buildYearSetupBlockedMessage(status: YearSetupStatus) {
    const failedRequiredChecks = status.checks.filter((check) => check.required && !check.passed);
    if (failedRequiredChecks.length === 0) {
      return `Cannot create report for ${status.year} yet. Year setup is still incomplete.`;
    }

    const checklist = failedRequiredChecks
      .map((check) => `${check.label} (${check.detail})`)
      .join('; ');

    return `Cannot create report for ${status.year} yet. Complete year setup first: ${checklist}.`;
  }

  private assertYear(year: number) {
    if (!Number.isInteger(year) || year < 2000 || year > 3000) {
      throw new BadRequestException('Year must be between 2000 and 3000.');
    }
  }

  private assertMonth(month: number) {
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new BadRequestException('Month must be between 1 and 12.');
    }
  }

  private getReviewSectionStatus(
    overall: ReportingDetailResponse['period']['reviewReadiness']['overall'],
    hasDraft: boolean
  ): ReportingDetailResponse['period']['workspace']['sections'][number]['status'] {
    if (overall === 'ready_to_submit' || overall === 'awaiting_decision' || overall === 'published') {
      return 'ready';
    }

    return hasDraft ? 'pending' : 'blocked';
  }

  private getReviewSectionDetail(
    reviewReadiness: ReportingDetailResponse['period']['reviewReadiness']
  ) {
    if (reviewReadiness.overall === 'awaiting_decision') {
      return 'Latest version is already submitted and waiting for a decision.';
    }

    if (reviewReadiness.overall === 'published') {
      return 'Latest version is approved and published. Create a revision draft for further changes.';
    }

    if (reviewReadiness.canSubmit) {
      return 'All required monthly checks pass. This draft can be submitted now.';
    }

    return reviewReadiness.summary;
  }

  private buildSubmitBlockedMessage(
    reviewReadiness: ReportingDetailResponse['period']['reviewReadiness']
  ) {
    const failedChecks = reviewReadiness.checks
      .filter((check) => !check.passed)
      .map((check) => check.label);

    if (failedChecks.length === 0) {
      return 'This draft is not ready to submit yet.';
    }

    return `This monthly report cannot be submitted yet. Fix these checklist items first: ${failedChecks.join(', ')}.`;
  }

  private async lockActiveFormulasForApprovedVersion(
    tx: Prisma.TransactionClient,
    reportVersionId: string
  ) {
    await tx.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS global_computed_formula_locks (
        formula_id VARCHAR(191) NOT NULL,
        locked_by_report_version_id VARCHAR(191) NULL,
        locked_reason TEXT NULL,
        locked_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (formula_id),
        INDEX global_computed_formula_locks_locked_by_report_version_id_idx (locked_by_report_version_id)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);

    await tx.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS global_computed_formulas (
        id VARCHAR(191) NOT NULL,
        column_label VARCHAR(255) NOT NULL,
        expression TEXT NOT NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        INDEX global_computed_formulas_is_active_created_at_idx (is_active, created_at)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);

    await tx.$executeRawUnsafe(
      `
      INSERT INTO global_computed_formula_locks (
        formula_id,
        locked_by_report_version_id,
        locked_reason
      )
      SELECT
        id AS formula_id,
        ? AS locked_by_report_version_id,
        'Formula was active when a report version was approved.' AS locked_reason
      FROM global_computed_formulas
      WHERE is_active = 1
      ON DUPLICATE KEY UPDATE
        formula_id = formula_id
      `,
      reportVersionId
    );
  }

  private async captureQuestionSnapshotForPeriod(
    tx: Prisma.TransactionClient,
    reportingPeriodId: string,
    brandId: string
  ) {
    const assignments = await tx.brandQuestionActivation.findMany({
      where: {
        brandId,
        status: QuestionStatus.active,
        questionMaster: {
          status: QuestionStatus.active
        }
      },
      include: {
        questionMaster: true
      },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }]
    });
    const dedupedAssignments = this.deduplicateQuestionAssignments(assignments);

    try {
      await tx.$executeRawUnsafe(
        'DELETE FROM reporting_period_question_assignments WHERE reporting_period_id = ?',
        reportingPeriodId
      );

      for (const [index, assignment] of dedupedAssignments.entries()) {
        await tx.$executeRawUnsafe(
          `INSERT INTO reporting_period_question_assignments (
             id,
             reporting_period_id,
             brand_question_activation_id,
             question_master_id,
             question_text_snapshot,
             display_order,
             created_at,
             updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, NOW(3), NOW(3))`,
          this.generateQuestionSnapshotId(),
          reportingPeriodId,
          assignment.id,
          assignment.questionMasterId,
          assignment.questionMaster.questionText,
          index + 1
        );
      }

      await tx.$executeRawUnsafe(
        'UPDATE reporting_periods SET question_snapshot_captured_at = NOW(3) WHERE id = ?',
        reportingPeriodId
      );
    } catch (error) {
      if (this.isQuestionSnapshotSchemaMissingError(error)) {
        return;
      }

      throw error;
    }
  }

  private deduplicateQuestionAssignments<
    T extends {
      questionMasterId: string;
    }
  >(assignments: T[]) {
    const seen = new Set<string>();
    const result: T[] = [];

    for (const assignment of assignments) {
      if (seen.has(assignment.questionMasterId)) {
        continue;
      }

      seen.add(assignment.questionMasterId);
      result.push(assignment);
    }

    return result;
  }

  private generateQuestionSnapshotId() {
    return `qps_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  private isQuestionSnapshotSchemaMissingError(error: unknown) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
      return false;
    }

    if (error.code !== 'P2010' && error.code !== 'P2022' && error.code !== 'P2021') {
      return false;
    }

    const message = error.message.toLowerCase();
    const missingTable =
      typeof error.meta?.table === 'string' ? error.meta.table.toLowerCase() : '';
    const missingColumn =
      typeof error.meta?.column === 'string' ? error.meta.column.toLowerCase() : '';

    return (
      missingTable.includes('reporting_period_question_assignments') ||
      missingColumn.includes('question_snapshot_captured_at') ||
      message.includes('reporting_period_question_assignments') ||
      message.includes('question_snapshot_captured_at') ||
      message.includes('unknown column') ||
      message.includes("doesn't exist")
    );
  }
}
