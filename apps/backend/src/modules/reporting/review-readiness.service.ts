import { Injectable } from '@nestjs/common';
import { ReportWorkflowState } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { CompetitorsService } from '../competitors/competitors.service';
import { ManualMetricsService } from '../manual-metrics/manual-metrics.service';
import { MetricsService } from '../metrics/metrics.service';
import { QuestionsService } from '../questions/questions.service';
import { TopContentService } from '../top-content/top-content.service';
import type {
  ReportingDetailResponse,
  ReportingPeriodWithVersions
} from './reporting.types';

type ReviewReadiness =
  ReportingDetailResponse['period']['reviewReadiness'] & {
    targetVersionId: string | null;
  };

@Injectable()
export class ReviewReadinessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly competitorsService: CompetitorsService,
    private readonly manualMetricsService: ManualMetricsService,
    private readonly metricsService: MetricsService,
    private readonly questionsService: QuestionsService,
    private readonly topContentService: TopContentService
  ) {}

  async evaluatePeriod(period: ReportingPeriodWithVersions): Promise<ReviewReadiness> {
    const currentDraft =
      period.reportVersions.find(
        (version) => version.workflowState === ReportWorkflowState.draft
      ) ?? null;
    const latestVersion = period.reportVersions[0] ?? null;
    const targetVersion = currentDraft ?? latestVersion;

    if (!targetVersion) {
      return {
        targetVersionId: null,
        overall: 'not_ready',
        canSubmit: false,
        blockingCount: 7,
        summary: 'Create the first draft before review readiness can be evaluated.',
        checks: [
          {
            key: 'draft_exists',
            label: 'Draft exists',
            passed: false,
            detail: 'Create or revise a draft before this month can be submitted.'
          },
          {
            key: 'dataset_materialized',
            label: 'Dataset materialized',
            passed: false,
            detail: 'Import and mapping must produce a persisted dataset first.'
          },
          {
            key: 'metric_snapshot_current',
            label: 'Metric snapshot exists and is current',
            passed: false,
            detail: 'Generate a metric snapshot for the current draft before submit.'
          },
          {
            key: 'metric_commentary_complete',
            label: 'Metric commentary complete',
            passed: false,
            detail: 'Complete graph remarks for all required metrics before submit.'
          },
          {
            key: 'competitor_evidence_complete',
            label: 'Competitor monitoring complete',
            passed: false,
            detail: 'Complete competitor monitoring for every assigned competitor before submit.'
          },
          {
            key: 'question_evidence_complete',
            label: 'Question monitoring complete',
            passed: false,
            detail: 'Complete question monitoring for every active question category before submit.'
          },
          {
            key: 'required_top_content_cards_exist',
            label: 'Required top content cards exist',
            passed: false,
            detail: 'Generate the required current top content highlight cards before submit.'
          }
        ],
        deferred: this.getDeferredModules()
      };
    }

    const [
      datasetRowCount,
      metricSnapshotStatus,
      metricValues,
      manualHeaderMetrics,
      metricCommentary,
      competitorReadiness,
      questionReadiness,
      topContentStatus
    ] = await Promise.all([
      this.prisma.datasetRow.count({
        where: {
          reportVersionId: targetVersion.id
        }
      }),
      this.metricsService.getSnapshotStatusForReportVersion(targetVersion.id),
      this.metricsService.getDashboardMetricValuesForReportVersion(targetVersion.id),
      this.manualMetricsService.getReportManualMetrics(targetVersion.id),
      this.manualMetricsService.getReportMetricCommentary(targetVersion.id),
      this.competitorsService.getReadinessForReportVersion(targetVersion.id),
      this.questionsService.getReadinessForReportVersion(targetVersion.id),
      this.topContentService.getCurrentnessForReportVersion(targetVersion.id)
    ]);

    const hasDraft = !!currentDraft;
    const latestWorkflowState = latestVersion?.workflowState ?? null;
    const hasLockedReviewVersion =
      latestWorkflowState === ReportWorkflowState.submitted ||
      latestWorkflowState === ReportWorkflowState.approved;
    const manualMonthlyInputsComplete =
      manualHeaderMetrics.viewers !== null &&
      manualHeaderMetrics.viewers > 0 &&
      manualHeaderMetrics.pageFollowers !== null &&
      manualHeaderMetrics.pageFollowers > 0 &&
      manualHeaderMetrics.pageVisit !== null &&
      manualHeaderMetrics.pageVisit > 0;
    const requireVideoCommentary = (metricValues.video_views_3s ?? 0) > 0;
    const requiredCommentaryKeys: Array<
      'views' | 'viewers' | 'engagement' | 'video_views_3s'
    > = ['views', 'viewers', 'engagement'];
    if (requireVideoCommentary) {
      requiredCommentaryKeys.push('video_views_3s');
    }
    const metricCommentaryByKey = new Map(metricCommentary.map(item => [item.key, item]));
    const missingMetricRemarks = requiredCommentaryKeys.filter((key) => {
      const remark = metricCommentaryByKey.get(key)?.remark ?? null;
      return !remark || remark.trim().length === 0;
    });
    const missingMetricRemarkLabels = missingMetricRemarks.map((key) =>
      metricCommentaryByKey.get(key)?.label ?? key
    );
    const metricCommentaryComplete =
      manualMonthlyInputsComplete && missingMetricRemarks.length === 0;
    const datasetMaterialized = datasetRowCount > 0;
    const metricSnapshotItemCount = metricSnapshotStatus.summary.metricCount;
    const metricSnapshotCurrent =
      metricSnapshotStatus.state === 'ready' && manualMonthlyInputsComplete;
    const requiredTopContentCardsExist = topContentStatus.isCurrent;

    const checks: ReviewReadiness['checks'] = [
      {
        key: 'draft_exists',
        label: 'Draft exists',
        passed: hasDraft || hasLockedReviewVersion,
        detail: hasDraft
          ? `Draft v${currentDraft.versionNo} is active for this reporting month.`
          : hasLockedReviewVersion
            ? this.getLockedVersionDetail(latestWorkflowState)
          : this.getNoDraftDetail(latestVersion?.workflowState ?? null)
      },
      {
        key: 'dataset_materialized',
        label: 'Dataset materialized',
        passed: datasetMaterialized,
        detail: datasetMaterialized
          ? `${datasetRowCount} dataset row${datasetRowCount === 1 ? '' : 's'} are persisted for the review target.`
          : 'Import and mapping must materialize a persisted dataset before submit.'
      },
      {
        key: 'metric_snapshot_current',
        label: 'Metric snapshot exists and is current',
        passed: metricSnapshotCurrent,
        detail: metricSnapshotCurrent
          ? `Metric snapshot is present for this ${hasDraft ? 'draft' : 'version'} and includes ${metricSnapshotItemCount} metric item${metricSnapshotItemCount === 1 ? '' : 's'}.`
          : !manualMonthlyInputsComplete
            ? 'Complete Manual monthly inputs (Viewers, Page Followers, Page Visit) in Import before this month can be marked ready.'
            : metricSnapshotStatus.detail
      },
      {
        key: 'metric_commentary_complete',
        label: 'Metric commentary complete',
        passed: metricCommentaryComplete,
        detail: !manualMonthlyInputsComplete
          ? 'Complete Manual monthly inputs (Viewers, Page Followers, Page Visit) in Import before adding commentary.'
          : metricCommentaryComplete
            ? `${requiredCommentaryKeys.length}/${requiredCommentaryKeys.length} required graph remarks are complete.`
            : `Complete Graph remarks for required metrics (${missingMetricRemarkLabels.join(', ')}). ${
                requireVideoCommentary
                  ? ''
                  : '3-second Video Views remark is optional because this month total is 0.'
              }`
      },
      {
        key: 'competitor_evidence_complete',
        label: 'Competitor monitoring complete',
        passed: competitorReadiness.isComplete,
        detail: competitorReadiness.detail
      },
      {
        key: 'question_evidence_complete',
        label: 'Question monitoring complete',
        passed: questionReadiness.isComplete,
        detail: questionReadiness.detail
      },
      {
        key: 'required_top_content_cards_exist',
        label: 'Required top content cards exist',
        passed: requiredTopContentCardsExist,
        detail: requiredTopContentCardsExist
          ? `${topContentStatus.currentSlotCount}/${topContentStatus.requiredSlotCount} required top content cards are current.`
          : topContentStatus.detail
      }
    ];

    const blockingCount = checks.filter((check) => !check.passed).length;
    const canSubmit =
      hasDraft &&
      latestVersion?.id === currentDraft.id &&
      latestVersion?.workflowState === ReportWorkflowState.draft &&
      blockingCount === 0;

    return {
      targetVersionId: targetVersion.id,
      overall: this.resolveOverall(latestVersion?.workflowState ?? null, canSubmit),
      canSubmit,
      blockingCount,
      summary: this.buildSummary(
        latestWorkflowState,
        hasDraft,
        blockingCount
      ),
      checks,
      deferred: this.getDeferredModules()
    };
  }

  private resolveOverall(
    workflowState: ReportWorkflowState | null,
    canSubmit: boolean
  ): ReviewReadiness['overall'] {
    if (workflowState === ReportWorkflowState.approved) {
      return 'published';
    }

    if (workflowState === ReportWorkflowState.submitted) {
      return 'awaiting_decision';
    }

    if (canSubmit) {
      return 'ready_to_submit';
    }

    return 'not_ready';
  }

  private buildSummary(
    workflowState: ReportWorkflowState | null,
    hasDraft: boolean,
    blockingCount: number
  ) {
    if (workflowState === ReportWorkflowState.approved) {
      return 'The latest version is approved and already feeding approved-only surfaces.';
    }

    if (workflowState === ReportWorkflowState.submitted) {
      return 'The latest version has already been submitted and is waiting for an approval decision.';
    }

    if (!hasDraft) {
      return 'Create or revise a draft before review readiness can move forward.';
    }

    if (blockingCount === 0) {
      return 'All required monthly checks pass. This draft is ready to submit.';
    }

    return `${blockingCount} blocking check${blockingCount === 1 ? '' : 's'} still need attention before submit.`;
  }

  private getNoDraftDetail(workflowState: ReportWorkflowState | null) {
    if (workflowState === ReportWorkflowState.submitted) {
      return 'The latest version is already submitted and no editable draft is active.';
    }

    if (workflowState === ReportWorkflowState.approved) {
      return 'The latest version is approved. Create a new revision draft to make changes.';
    }

    if (workflowState === ReportWorkflowState.rejected) {
      return 'The latest version is rejected. Create a revision draft to continue fixing it.';
    }

    return 'Create or revise a draft before this month can be submitted.';
  }

  private getLockedVersionDetail(workflowState: ReportWorkflowState | null) {
    if (workflowState === ReportWorkflowState.submitted) {
      return 'The submitted version is complete and is currently waiting for an approval decision.';
    }

    if (workflowState === ReportWorkflowState.approved) {
      return 'The approved version remains available for dashboard and review history.';
    }

    return 'The latest locked version is available for review.';
  }

  private getDeferredModules(): ReviewReadiness['deferred'] {
    return [];
  }
}
