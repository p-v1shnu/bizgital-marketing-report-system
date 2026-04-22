import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  ShieldAlert
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getAuthContext, getMembershipReportAccess } from '@/lib/auth';
import {
  getReportingPeriodDetail,
  type ReportingDetailResponse
} from '@/lib/reporting-api';
import {
  editModeLabel,
  isReadOnlyMode,
  readinessHelpText,
  readinessLabel,
  readinessOpenItemsLabel,
  readinessTone
} from '@/lib/reporting-ui';

import { ApproveVersionButton } from '../../approve-version-button';
import { ReopenReportButton } from '../../reopen-report-button';
import { RequestChangesButton } from '../../request-changes-button';
import { SubmitVersionButton } from '../../submit-version-button';
import { ReportWorkspaceShell } from '../workspace-shell';
import { WorkspaceUnavailableCard } from '../workspace-unavailable-card';

type ReviewPageProps = {
  params: Promise<{
    brandId: string;
    periodId: string;
  }>;
};

const checklistSectionHref: Record<string, string | null> = {
  draft_exists: null,
  dataset_materialized: 'import',
  metric_snapshot_current: 'metrics',
  competitor_evidence_complete: 'competitors',
  question_evidence_complete: 'questions',
  required_top_content_cards_exist: 'top-content'
};

export default async function ReviewPage({ params }: ReviewPageProps) {
  const { brandId, periodId } = await params;
  const authContext = await getAuthContext();
  const currentMembership =
    authContext.user?.memberships.find((membership) => membership.brandCode === brandId) ?? null;
  const reportAccess = getMembershipReportAccess(currentMembership);
  const canCreateReports = reportAccess.canCreateReports;
  const canApproveReports = reportAccess.canApproveReports;
  const isReadOnlyRole = reportAccess.isReadOnly;
  let detail: ReportingDetailResponse | null = null;
  let loadError: string | null = null;

  try {
    detail = await getReportingPeriodDetail(brandId, periodId);
  } catch (error) {
    loadError =
      error instanceof Error
        ? error.message
        : `Failed to load reporting period ${periodId}.`;
  }

  if (!detail) {
    return (
      <WorkspaceUnavailableCard
        message={loadError ?? 'Unknown error.'}
        title="Review workspace unavailable"
      />
    );
  }

  const { period } = detail;
  const failedChecks = period.reviewReadiness.checks.filter((check) => !check.passed);
  const passedChecks = period.reviewReadiness.checks.filter((check) => check.passed);
  const firstActionableCheck =
    failedChecks.find((check) => checklistSectionHref[check.key] !== null) ?? null;
  const firstActionableHref = firstActionableCheck
    ? `/app/${brandId}/reports/${periodId}/${checklistSectionHref[firstActionableCheck.key]}`
    : null;
  const isReadOnly = isReadOnlyMode(detail);
  const isAwaitingDecision = period.reviewReadiness.overall === 'awaiting_decision';
  const isPublished = period.reviewReadiness.overall === 'published';
  const canReviewerDecide =
    canApproveReports &&
    period.latestVersionId &&
    (period.availableActions.canApproveLatest || period.availableActions.canReopenLatest);
  const canReopenForEditing =
    canCreateReports &&
    !canApproveReports &&
    period.availableActions.canReopenLatest &&
    !!period.latestVersionId;

  return (
    <ReportWorkspaceShell
      activeSection="review"
      brandId={brandId}
      detail={detail}
      periodId={periodId}
    >
      <div className="space-y-6">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="outline">{readinessLabel(period.reviewReadiness.overall)}</Badge>
            <Badge variant="outline">
              {readinessOpenItemsLabel(period.reviewReadiness.blockingCount)}
            </Badge>
            <Badge variant="outline">
              {editModeLabel(isReadOnly || isReadOnlyRole)}
            </Badge>
          </div>
          <div className="space-y-3">
            <h1 className="font-serif text-5xl leading-none tracking-[-0.06em]">
              Review center for {period.monthLabel}
            </h1>
            <p className="max-w-3xl text-base leading-7 text-muted-foreground">
              {readinessHelpText(period.reviewReadiness.overall)}
            </p>
          </div>
        </div>

        <div className="grid gap-5">
          <div className="grid gap-5">
            <Card className={readinessTone(period.reviewReadiness.overall)}>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <ClipboardCheck className="text-primary" />
                  Submission status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm leading-6 text-muted-foreground">
                  {period.reviewReadiness.summary}
                </p>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-border/60 bg-background/75 p-4">
                    <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      Checks passed
                    </div>
                    <div className="mt-2 text-2xl font-semibold">
                      {passedChecks.length}/{period.reviewReadiness.checks.length}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-background/75 p-4">
                    <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      Open items
                    </div>
                    <div className="mt-2 text-2xl font-semibold">
                      {period.reviewReadiness.blockingCount}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-background/75 p-4">
                    <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      Current version
                    </div>
                    <div className="mt-2 text-2xl font-semibold">
                      {period.latestVersion ? `v${period.latestVersion.versionNo}` : 'None'}
                    </div>
                  </div>
                </div>

                {canCreateReports && period.reviewReadiness.canSubmit && period.latestVersionId ? (
                  <div className="space-y-3">
                    <SubmitVersionButton
                      brandId={brandId}
                      periodId={periodId}
                      versionId={period.latestVersionId}
                      year={period.year}
                      triggerClassName="w-full"
                      triggerLabel="Submit latest draft"
                      triggerVariant="default"
                    />
                    <p className="text-xs text-muted-foreground">
                      Before submit, the system re-syncs Competitors, Questions, and Top Content one more time.
                    </p>
                  </div>
                ) : canReviewerDecide ? (
                  <div className="space-y-3">
                    <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      Reviewer actions
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {period.availableActions.canApproveLatest && period.latestVersionId ? (
                        <ApproveVersionButton
                          brandId={brandId}
                          triggerVariant="outline"
                          versionId={period.latestVersionId}
                          year={period.year}
                        />
                      ) : null}
                      {period.availableActions.canReopenLatest && period.latestVersionId ? (
                        <RequestChangesButton
                          brandId={brandId}
                          periodId={periodId}
                          redirectTo="review"
                          versionId={period.latestVersionId}
                          year={period.year}
                        />
                      ) : null}
                    </div>
                  </div>
                ) : isAwaitingDecision ? (
                  canReopenForEditing ? (
                    <div className="space-y-3">
                      <div className="rounded-2xl border border-amber-500/25 bg-amber-500/8 p-4 text-sm leading-6 text-amber-700 dark:text-amber-300">
                        Submitted and waiting for approver decision. You can request edit access to continue editing.
                      </div>
                      <ReopenReportButton
                        brandId={brandId}
                        periodId={periodId}
                        redirectTo="review"
                        triggerVariant="default"
                        versionId={period.latestVersionId!}
                        year={period.year}
                      />
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-amber-500/25 bg-amber-500/8 p-4 text-sm leading-6 text-amber-700 dark:text-amber-300">
                      Submitted and waiting for approver decision. Inputs remain locked until a decision is made.
                    </div>
                  )
                ) : isPublished ? (
                  <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/8 p-4 text-sm leading-6 text-emerald-700 dark:text-emerald-300">
                    Approved. This month is complete and now read-only.
                  </div>
                ) : firstActionableHref ? (
                  <Button asChild className="w-full" variant="secondary">
                    <Link href={firstActionableHref}>
                      Open next required section
                      <ArrowRight />
                    </Link>
                  </Button>
                ) : (
                  <div className="rounded-2xl border border-amber-500/25 bg-amber-500/8 p-4 text-sm leading-6 text-amber-700 dark:text-amber-300">
                    This month is still in progress. Complete required sections to enable submission.
                  </div>
                )}
              </CardContent>
            </Card>

            {failedChecks.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-3">
                    <ShieldAlert className="text-amber-600" />
                    What still needs attention
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  {failedChecks.map((check) => {
                    const targetSection = checklistSectionHref[check.key];
                    const targetHref = targetSection
                      ? `/app/${brandId}/reports/${periodId}/${targetSection}`
                      : null;

                    return (
                      <div
                        className="rounded-3xl border border-border/60 bg-background/60 p-5"
                        key={check.key}
                      >
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-3 text-sm font-medium">
                            <ShieldAlert className="size-4 text-amber-600" />
                            {check.label}
                          </div>
                          <Badge variant="outline">In progress</Badge>
                        </div>
                        <p className="text-sm leading-6 text-muted-foreground">
                          {check.detail}
                        </p>
                        {targetHref ? (
                          <div className="mt-4">
                            <Button asChild size="sm" variant="outline">
                              <Link href={targetHref}>
                                Open related section
                                <ArrowRight />
                              </Link>
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle>Checks already complete</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                {passedChecks.map((check) => (
                  <div
                    className="rounded-2xl border border-emerald-500/20 bg-emerald-500/8 p-4"
                    key={check.key}
                  >
                    <div className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 className="size-4" />
                      {check.label}
                    </div>
                    <p className="text-sm leading-6 text-emerald-700 dark:text-emerald-300">
                      {check.detail}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="grid content-start gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Review basis</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 text-muted-foreground">
                  <span>Status</span>
                  <span className="text-foreground">{readinessLabel(period.reviewReadiness.overall)}</span>
                  <span>Edit mode</span>
                  <span className="text-foreground">{editModeLabel(isReadOnly || isReadOnlyRole)}</span>
                  <span>Checks passed</span>
                  <span className="text-foreground">
                    {passedChecks.length}/{period.reviewReadiness.checks.length}
                  </span>
                  <span>Open items</span>
                  <span className="text-foreground">{period.reviewReadiness.blockingCount}</span>
                  <span>Current version</span>
                  <span className="text-foreground">
                    {period.latestVersion ? `v${period.latestVersion.versionNo}` : 'None'}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle>What happens next</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
                {isAwaitingDecision ? (
                  <p>
                    This month is already submitted. Approvers can approve or request changes from this version.
                  </p>
                ) : isPublished ? (
                  <p>
                    This month is approved and complete. Open report history for previous versions when needed.
                  </p>
                ) : failedChecks.length > 0 ? (
                  <>
                    <p>
                      Complete required items on the left, then return to submit for review.
                    </p>
                    <p>
                      First required item: <span className="text-foreground">{firstActionableCheck?.label ?? failedChecks[0]?.label}</span>
                    </p>
                    {firstActionableHref ? (
                      <Button asChild className="w-full" size="sm" variant="outline">
                        <Link href={firstActionableHref}>
                          Open first required item
                          <ArrowRight />
                        </Link>
                      </Button>
                    ) : null}
                  </>
                ) : (
                  <>
                    <p>
                      All required checks are complete. Users with create/edit permission can submit this version for review.
                    </p>
                    <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/8 px-3 py-2 text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 className="size-4" />
                      Ready for review
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {period.reviewReadiness.deferred.length > 0 ? (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle>Deferred modules</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm leading-6 text-muted-foreground">
                  {period.reviewReadiness.deferred.map((item) => (
                    <p key={item.key}>
                      <span className="text-foreground">{item.label}</span>: {item.detail}
                    </p>
                  ))}
                </CardContent>
              </Card>
            ) : null}
          </div>
        </div>
      </div>
    </ReportWorkspaceShell>
  );
}
