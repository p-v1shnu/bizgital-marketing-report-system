import { MessageSquareText } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getAuthContext, getMembershipReportAccess } from '@/lib/auth';
import type { DatasetOverviewResponse, ReportingDetailResponse } from '@/lib/reporting-api';
import { getDatasetOverview, getReportingPeriodDetail } from '@/lib/reporting-api';

import { ReportWorkspaceShell } from '../workspace-shell';
import { WorkspaceUnavailableCard } from '../workspace-unavailable-card';
import { MetricCommentaryManager } from './metric-commentary-manager';

type CommentaryPageProps = {
  params: Promise<{
    brandId: string;
    periodId: string;
  }>;
};

function buildReadOnlyReason(options: {
  isReadOnlyRole: boolean;
  isAwaitingDecision: boolean;
  isApproved: boolean;
  isRejected: boolean;
  canCreateOrResumeDraft: boolean;
}) {
  const { isReadOnlyRole, isAwaitingDecision, isApproved, isRejected, canCreateOrResumeDraft } =
    options;

  if (isReadOnlyRole) {
    if (isAwaitingDecision) {
      return 'Submitted - awaiting decision: this commentary section is read-only (locked).';
    }

    if (isApproved) {
      return 'Approved: this commentary section is read-only (locked).';
    }

    return 'This account has read-only report access.';
  }

  if (isAwaitingDecision) {
    return 'Submitted - awaiting decision: commentary is read-only (locked) until reviewer decision.';
  }

  if (isApproved) {
    return 'Approved: commentary is read-only (locked). Create a revision from Reports to continue editing.';
  }

  if (isRejected) {
    return 'Changes requested: commentary is read-only (locked). Create a revision from Reports to continue editing.';
  }

  if (canCreateOrResumeDraft) {
    return 'Read-only (locked): no active draft. Create or resume a draft to continue editing.';
  }

  return 'Read-only (locked): editing is unavailable for this month in the current mode.';
}

export default async function CommentaryPage({ params }: CommentaryPageProps) {
  const { brandId, periodId } = await params;
  const authContext = await getAuthContext();
  const currentMembership =
    authContext.user?.memberships.find((membership) => membership.brandCode === brandId) ?? null;
  const reportAccess = getMembershipReportAccess(currentMembership);
  const canCreateReports = reportAccess.canCreateReports;
  const isReadOnlyRole = reportAccess.isReadOnly;

  let detail: ReportingDetailResponse | null = null;
  let dataset: DatasetOverviewResponse | null = null;
  let loadError: string | null = null;

  try {
    detail = await getReportingPeriodDetail(brandId, periodId);
    dataset = await getDatasetOverview(brandId, periodId);
  } catch (error) {
    loadError =
      error instanceof Error
        ? error.message
        : `Failed to load commentary workspace for period ${periodId}.`;
  }

  if (!detail || !dataset) {
    return (
      <WorkspaceUnavailableCard
        message={loadError ?? 'Unknown error.'}
        title="Commentary workspace unavailable"
      />
    );
  }

  const latestVersionState = detail.period.latestVersionState;
  const isAwaitingDecision = detail.period.reviewReadiness.overall === 'awaiting_decision';
  const isApproved = detail.period.reviewReadiness.overall === 'published';
  const isRejected = latestVersionState === 'rejected';
  const canCreateOrResumeDraft =
    canCreateReports &&
    detail.period.availableActions.canCreateDraft &&
    !isAwaitingDecision &&
    !isApproved &&
    !isRejected;
  const isReadOnly = isReadOnlyRole || !detail.period.currentDraftVersionId;
  const readOnlyReason = isReadOnly
    ? buildReadOnlyReason({
        isReadOnlyRole,
        isAwaitingDecision,
        isApproved,
        isRejected,
        canCreateOrResumeDraft
      })
    : null;
  const displayedRequiredCount = dataset.metricCommentary.items.filter(
    (item) => item.requiresRemark
  ).length;
  const displayedCompletedCount = dataset.metricCommentary.items.filter((item) => {
    if (!item.requiresRemark) {
      return false;
    }

    const savedRemark = item.remark?.trim() ?? '';
    if (savedRemark.length > 0) {
      return true;
    }

    if (!dataset.metricCommentary.isFirstReportingMonth) {
      return false;
    }

    return dataset.metricCommentary.firstMonthDefaultRemark.trim().length > 0;
  }).length;
  const displayedMissingCount = Math.max(0, displayedRequiredCount - displayedCompletedCount);

  return (
    <ReportWorkspaceShell
      activeSection="commentary"
      brandId={brandId}
      detail={detail}
      periodId={periodId}
    >
      <div className="space-y-6">
        <div className="space-y-3">
          <Badge variant="outline">Graph commentary</Badge>
          <h1 className="font-serif text-5xl leading-none tracking-[-0.06em]">
            {detail.period.monthLabel}
          </h1>
          <p className="max-w-3xl text-base leading-7 text-muted-foreground">
            Write monthly reasons for each graph based on this month versus last month.
          </p>
        </div>

        <Card className="border-border/60 bg-background/55">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <MessageSquareText className="text-primary" />
              Commentary completion
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <div>
              Required remarks: {displayedRequiredCount}
            </div>
            <div>
              Completed remarks: {displayedCompletedCount}
            </div>
            <div>
              Missing remarks: {displayedMissingCount}
            </div>
            {displayedMissingCount > 0 ? (
              <div className="rounded-xl border border-amber-500/25 bg-amber-500/8 px-3 py-2 text-amber-700 dark:text-amber-300">
                Step stays in progress until all required graph remarks are complete.
              </div>
            ) : (
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/8 px-3 py-2 text-emerald-700 dark:text-emerald-300">
                Commentary is complete for this month.
              </div>
            )}
          </CardContent>
        </Card>

        <MetricCommentaryManager
          brandId={brandId}
          firstMonthDefaultRemark={dataset.metricCommentary.firstMonthDefaultRemark}
          importHref={`/app/${brandId}/reports/${periodId}/import`}
          initialItems={dataset.metricCommentary.items}
          isFirstReportingMonth={dataset.metricCommentary.isFirstReportingMonth}
          isReadOnly={isReadOnly}
          periodId={periodId}
          readOnlyReason={readOnlyReason}
          viewersInputReady={dataset.metricCommentary.viewersInputReady}
        />
      </div>
    </ReportWorkspaceShell>
  );
}
