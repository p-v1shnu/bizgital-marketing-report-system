import Link from 'next/link';
import { AlertCircle, CalendarPlus, FileText, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getAuthContext, getMembershipReportAccess } from '@/lib/auth';
import type {
  ReportingListItem,
  ReportingRecycleBinItem,
  ReportingYearSetupStatus
} from '@/lib/reporting-api';
import {
  getReportingRecycleBin,
  getReportingPeriodDetail,
  getReportingPeriods
} from '@/lib/reporting-api';
import {
  badgeToneForState,
  editModeLabel,
  isReadOnlyMode,
  labelForState,
  monthLabel,
  recommendedWorkflowAction,
  workflowProgress
} from '@/lib/reporting-ui';
import { buildRollingYearValues } from '@/lib/year-options';

import { ApproveVersionButton } from './approve-version-button';
import { CreateReportForm } from './create-report-form';
import { DeleteReportButton } from './delete-report-button';
import { ReportActivityLogButton } from './report-activity-log-button';
import { ReportActionsMenuButton } from './report-actions-menu-button';
import { ReviseVersionMenuButton } from './revise-version-menu-button';
import { ReopenReportButton } from './reopen-report-button';
import { ReportsYearControls } from './reports-year-controls';
import { RequestChangesButton } from './request-changes-button';
import { RestoreReportButton } from './restore-report-button';
import { SubmitVersionButton } from './submit-version-button';

type ReportsPageProps = {
  params: Promise<{
    brandId: string;
  }>;
  searchParams?: Promise<{
    year?: string;
    message?: string;
    error?: string;
  }>;
};

type PeriodDetail = Awaited<ReturnType<typeof getReportingPeriodDetail>>;
const compactBadgeClass = 'px-2 py-[3px] text-[10px] tracking-[0.11em]';
const compactStatusBadgeClass = 'px-2 py-[3px] text-[10px] tracking-[0.11em]';

function sortPeriodsDescending(left: { year: number; month: number }, right: { year: number; month: number }) {
  if (left.year !== right.year) {
    return right.year - left.year;
  }

  return right.month - left.month;
}

function normalizeSelectedYear(rawYear: string | undefined, fallbackYear: number) {
  if (!rawYear) {
    return fallbackYear;
  }

  const parsed = Number.parseInt(rawYear, 10);
  if (!Number.isFinite(parsed)) {
    return fallbackYear;
  }

  if (parsed < 2000 || parsed > 3000) {
    return fallbackYear;
  }

  return parsed;
}

function detailForItem(detailsById: Map<string, PeriodDetail>, item: ReportingListItem) {
  return detailsById.get(item.id) ?? null;
}

function openHrefForItem(
  brandId: string,
  item: ReportingListItem
) {
  return `/app/${brandId}/reports/${item.id}/import`;
}

function formatTimestamp(value: string | null) {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleString('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatMonthYear(value: string) {
  return new Date(value).toLocaleString('en-GB', {
    year: 'numeric',
    month: 'long'
  });
}

function truncateInlineNote(value: string, maxLength = 140) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1)}…`;
}

function formatCompactTimestamps(submittedAt: string | null, updatedAt: string | null) {
  const submitted = formatTimestamp(submittedAt);
  const updated = formatTimestamp(updatedAt);

  if (submittedAt && submitted !== '-') {
    return `Submitted ${submitted} • Updated ${updated}`;
  }

  return `Updated ${updated}`;
}

function formatPurgeCountdown(purgeAt: string) {
  const diffMs = new Date(purgeAt).getTime() - Date.now();
  if (diffMs <= 0) {
    return 'Expiring soon';
  }

  const daysLeft = Math.max(1, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
  return daysLeft === 1 ? '1 day left' : `${daysLeft} days left`;
}

function renderVersionBadges(item: ReportingListItem) {
  const latestVersion = item.versions[0];

  if (!latestVersion) {
    return null;
  }

  return (
    <div className="mt-2 flex flex-wrap gap-1">
      <Badge
        className={`${badgeToneForState(latestVersion.workflowState)} ${compactBadgeClass}`}
        variant="outline"
      >
        v{latestVersion.versionNo} {labelForState(latestVersion.workflowState)}
      </Badge>
      {item.versions.length > 1 ? (
        <Badge className={compactBadgeClass} variant="outline">
          +{item.versions.length - 1} more versions
        </Badge>
      ) : null}
    </div>
  );
}

function buildSecondaryActions(options: {
  brandId: string;
  canCreateReports: boolean;
  canApproveReports: boolean;
  item: ReportingListItem;
  selectedYear: number;
}): ReactNode[] {
  const { brandId, canCreateReports, canApproveReports, item, selectedYear } = options;
  const actions: ReactNode[] = [];
  const inlineButtonClass = 'h-8 shrink-0 rounded-full px-3 text-xs';
  const inlineButtonVariant = 'outline';

  if (canCreateReports && item.availableActions.canSubmitLatest && item.latestVersionId) {
    actions.push(
      <SubmitVersionButton
        brandId={brandId}
        key="submit"
        periodId={item.id}
        triggerClassName={inlineButtonClass}
        triggerLabel="Submit"
        triggerVariant={inlineButtonVariant}
        versionId={item.latestVersionId}
        year={selectedYear}
      />
    );
  }

  if (canApproveReports && item.availableActions.canApproveLatest && item.latestVersionId) {
    actions.push(
      <ApproveVersionButton
        brandId={brandId}
        key="approve"
        triggerClassName={inlineButtonClass}
        triggerLabel="Approve"
        triggerVariant={inlineButtonVariant}
        versionId={item.latestVersionId}
        year={selectedYear}
      />
    );
  }

  if (canApproveReports && item.availableActions.canReopenLatest && item.latestVersionId) {
    actions.push(
      <RequestChangesButton
        brandId={brandId}
        key="request-changes"
        periodId={item.id}
        redirectTo="reports"
        triggerClassName={inlineButtonClass}
        triggerLabel="Request changes"
        triggerVariant={inlineButtonVariant}
        versionId={item.latestVersionId}
        year={selectedYear}
      />
    );
  }

  if (
    canCreateReports &&
    !canApproveReports &&
    item.availableActions.canReopenLatest &&
    item.latestVersionId
  ) {
    actions.push(
      <ReopenReportButton
        brandId={brandId}
        key="reopen"
        periodId={item.id}
        redirectTo="reports"
        triggerClassName={inlineButtonClass}
        triggerLabel="Request edit access"
        triggerVariant={inlineButtonVariant}
        versionId={item.latestVersionId}
        year={selectedYear}
      />
    );
  }

  if (canCreateReports && !item.currentApprovedVersionId) {
    actions.push(
      <DeleteReportButton
        brandId={brandId}
        key="delete"
        periodId={item.id}
        periodLabel={item.label}
        triggerClassName={inlineButtonClass}
        triggerLabel="Delete"
        triggerVariant={inlineButtonVariant}
        year={selectedYear}
      />
    );
  }

  return actions;
}

function buildMoreActions(options: {
  brandId: string;
  canCreateReports: boolean;
  item: ReportingListItem;
  selectedYear: number;
}): ReactNode[] {
  const { brandId, canCreateReports, item, selectedYear } = options;
  const actions: ReactNode[] = [];
  const menuButtonClass = 'w-full justify-start rounded-xl px-3';
  const menuButtonVariant = 'ghost';

  actions.push(
    <ReportActivityLogButton
      compact
      key="activity-log"
      activityLog={item.activityLog}
      periodLabel={item.label}
      versions={item.versions}
    />
  );
  actions.push(
    <Link
      className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-muted/60"
      href={`/app/${brandId}/reports/${item.id}/history`}
      key="history-page"
    >
      Open history page
    </Link>
  );

  if (canCreateReports && item.availableActions.canReviseLatest && item.latestVersionId) {
    actions.push(
      <ReviseVersionMenuButton
        brandId={brandId}
        key="revise"
        mode="button"
        periodId={item.id}
        periodLabel={item.label}
        triggerClassName={menuButtonClass}
        triggerLabel="Create revision"
        triggerVariant={menuButtonVariant}
        versionId={item.latestVersionId}
        year={selectedYear}
      />
    );
  } else {
    actions.push(
      <button
        className="block w-full cursor-not-allowed rounded-xl px-3 py-2 text-left text-sm text-muted-foreground/60"
        disabled
        key="revise-disabled"
        type="button"
      >
        Create revision
      </button>
    );
  }

  return actions;
}

export default async function ReportsPage({
  params,
  searchParams
}: ReportsPageProps) {
  const { brandId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const authContext = await getAuthContext();
  const currentMembership =
    authContext.user?.memberships.find((membership) => membership.brandCode === brandId) ?? null;
  const reportAccess = getMembershipReportAccess(currentMembership);
  const canCreateReports = reportAccess.canCreateReports;
  const canApproveReports = reportAccess.canApproveReports;
  const currentYear = new Date().getUTCFullYear();
  const currentMonth = new Date().getUTCMonth() + 1;
  const selectedYear = normalizeSelectedYear(resolvedSearchParams?.year, currentYear);

  let items: ReportingListItem[] = [];
  let recycleBinItems: ReportingRecycleBinItem[] = [];
  let yearOptions: Array<{
    year: number;
    isReady: boolean;
    hasReports: boolean;
  }> = [];
  let selectedYearSetup: ReportingYearSetupStatus = {
    year: selectedYear,
    canCreateReport: true,
    summary: 'Year setup is ready.',
    checks: []
  };
  let recycleRetentionDays = 7;
  let detailsById = new Map<string, PeriodDetail>();
  let brandDisplayName = brandId;
  let loadError: string | null = null;
  let recycleLoadError: string | null = null;
  let suggestedCreateYear = currentYear;
  let suggestedCreateMonth = currentMonth;
  let suggestedCreateLabel = monthLabel(suggestedCreateYear, suggestedCreateMonth);

  try {
    const reportingData = await getReportingPeriods(brandId, selectedYear);
    brandDisplayName = reportingData.brand.name;
    yearOptions = reportingData.yearOptions;
    selectedYearSetup = reportingData.selectedYearSetup;
    items = [...reportingData.items].sort(sortPeriodsDescending);
    suggestedCreateYear = reportingData.suggestedNextPeriod.year;
    suggestedCreateMonth = reportingData.suggestedNextPeriod.month;
    suggestedCreateLabel = reportingData.suggestedNextPeriod.label;

    try {
      const recycleBinData = await getReportingRecycleBin(brandId, selectedYear);
      recycleBinItems = recycleBinData.items;
      recycleRetentionDays = recycleBinData.retentionDays;
    } catch (error) {
      recycleLoadError =
        error instanceof Error
          ? error.message
          : 'Failed to load recycle bin data from the backend.';
    }

    const detailResults = await Promise.all(
      reportingData.items.map(async (item) => {
        try {
          return await getReportingPeriodDetail(brandId, item.id);
        } catch {
          return null;
        }
      })
    );

    detailsById = new Map(
      detailResults
        .filter((detail): detail is PeriodDetail => detail !== null)
        .map((detail) => [detail.period.id, detail])
    );
  } catch (error) {
    loadError =
      error instanceof Error
        ? error.message
        : 'Failed to load reporting data from the backend.';
  }

  const draftCount = items.filter((item) => item.currentDraftVersionId).length;
  const readyToSubmitCount = items.filter((item) => {
    const detail = detailForItem(detailsById, item);
    return detail?.period.reviewReadiness.canSubmit;
  }).length;
  const submittedCount = items.filter(
    (item) => item.latestVersionState === 'submitted'
  ).length;
  const baseYearOptions =
    yearOptions.length > 0
      ? yearOptions
      : [
          {
            year: selectedYear,
            isReady: selectedYearSetup.canCreateReport,
            hasReports: items.length > 0
          }
        ];
  const yearOptionByYear = new Map(baseYearOptions.map((option) => [option.year, option]));
  const yearDropdownOptions = buildRollingYearValues([
    ...yearOptionByYear.keys(),
    selectedYear
  ]).map((year) => {
    return (
      yearOptionByYear.get(year) ?? {
        year,
        isReady: false,
        hasReports: false
      }
    );
  });

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {brandDisplayName}
          </div>
          <h2 className="text-2xl font-semibold tracking-[-0.03em]">Reports</h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {selectedYear > 2000 ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`/app/${brandId}/reports?year=${selectedYear - 1}`}>
                {selectedYear - 1}
              </Link>
            </Button>
          ) : null}
          <Badge variant="outline">{selectedYear}</Badge>
          {selectedYear < 3000 ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`/app/${brandId}/reports?year=${selectedYear + 1}`}>
                {selectedYear + 1}
              </Link>
            </Button>
          ) : null}

          <ReportsYearControls
            brandId={brandId}
            currentYear={currentYear}
            selectedYear={selectedYear}
            yearOptions={yearDropdownOptions}
          />
        </div>
      </div>

      {resolvedSearchParams?.message ? (
        <Card className="border-emerald-500/25 bg-emerald-500/8">
          <CardContent className="pt-6 text-sm text-emerald-700 dark:text-emerald-300">
            {resolvedSearchParams.message}
          </CardContent>
        </Card>
      ) : null}

      {resolvedSearchParams?.error ? (
        <Card className="border-rose-500/25 bg-rose-500/8">
          <CardContent className="pt-6 text-sm text-rose-700 dark:text-rose-300">
            {resolvedSearchParams.error}
          </CardContent>
        </Card>
      ) : null}

      {loadError ? (
        <Card className="border-amber-500/25 bg-amber-500/8">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <AlertCircle className="text-amber-600" />
              Reports unavailable
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {loadError}
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-5">
        <Card id="create-report">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <CalendarPlus className="text-primary" />
              Create new report
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-[24px] border border-border/60 bg-background/60 px-4 py-4 text-sm text-muted-foreground">
              Default month follows the latest report in the selected year.
              <div className="mt-2 font-medium text-foreground">
                Suggested: {suggestedCreateLabel}
              </div>
            </div>

            {canCreateReports ? (
              <CreateReportForm
                brandId={brandId}
                layout="horizontal"
                recycleBinItems={recycleBinItems}
                selectedYear={selectedYear}
                suggestedCreateMonth={suggestedCreateMonth}
                suggestedCreateYear={suggestedCreateYear}
                selectedYearSetup={selectedYearSetup}
              />
            ) : (
              <div className="rounded-[20px] border border-border/60 bg-background/50 px-4 py-4 text-sm text-muted-foreground">
                This account cannot create report drafts. Contact a workspace manager to grant
                <span className="font-medium text-foreground"> create/edit permission</span>.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-3">
                <FileText className="text-primary" />
                Monthly reports
              </CardTitle>
              <div className="flex flex-wrap gap-2">
                <Badge className={compactBadgeClass} variant="outline">
                  {draftCount} drafts
                </Badge>
                <Badge className={compactBadgeClass} variant="outline">
                  {readyToSubmitCount} ready
                </Badge>
                <Badge className={compactBadgeClass} variant="outline">
                  {submittedCount} submitted
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {items.length === 0 ? (
              <div className="rounded-[24px] border border-border/60 bg-background/60 px-4 py-5 text-sm text-muted-foreground">
                No reports exist in {selectedYear}. Create the next monthly report from
                the create panel above.
              </div>
            ) : (
              <div className="rounded-[24px] border border-border/60 bg-background/55">
                <div className="hidden overflow-x-auto 2xl:block">
                  <table className="min-w-[1280px] w-full table-fixed text-left text-sm">
                    <thead className="border-b border-border/60 bg-background/70 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      <tr>
                        <th className="w-[14%] px-3 py-3 font-medium">Month</th>
                        <th className="w-[13%] px-2 py-3 font-medium">Status</th>
                        <th className="w-[10%] px-3 py-3 font-medium">Workflow</th>
                        <th className="w-[25%] px-3 py-3 font-medium">Next step</th>
                        <th className="w-[10%] whitespace-nowrap px-2 py-3 font-medium">Submitted at</th>
                        <th className="w-[10%] whitespace-nowrap px-2 py-3 font-medium">Updated at</th>
                        <th className="w-[18%] whitespace-nowrap px-3 py-3 font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => {
                        const detail = detailForItem(detailsById, item);
                        const nextAction = detail
                          ? recommendedWorkflowAction(detail, brandId, item.id)
                          : null;
                        const progress = detail ? workflowProgress(detail) : null;
                        const latestVersion = item.versions[0] ?? null;
                        const reviewerRequestNote = latestVersion?.rejectionReason?.trim() ?? '';
                        const hasReviewerRequest = reviewerRequestNote.length > 0;
                        const shouldHighlightReviewerRequest =
                          hasReviewerRequest &&
                          (item.latestVersionState === 'draft' ||
                            item.latestVersionState === 'rejected');
                        const nextStepTitle = shouldHighlightReviewerRequest
                          ? 'Apply reviewer changes'
                          : nextAction?.section?.label ?? 'Open report';
                        const nextStepDetail = shouldHighlightReviewerRequest
                          ? `Reviewer requested: "${truncateInlineNote(reviewerRequestNote)}". Update the report and submit again.`
                          : detail?.period.reviewReadiness.summary ??
                            'Open this report to continue the monthly workflow.';
                        const inlineActions = buildSecondaryActions({
                          brandId,
                          canCreateReports,
                          canApproveReports,
                          item,
                          selectedYear
                        });
                        const moreActions = buildMoreActions({
                          brandId,
                          canCreateReports,
                          item,
                          selectedYear
                        });

                        return (
                          <tr
                            className="border-b border-border/50 last:border-b-0"
                            key={item.id}
                          >
                            <td className="w-[14%] px-3 py-4 align-top">
                              <div className="font-medium text-foreground">{item.label}</div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {item.currentApprovedVersionId
                                  ? 'Published month available'
                                  : 'Operational month workspace'}
                              </div>
                              {renderVersionBadges(item)}
                            </td>
                            <td className="w-[13%] px-2 py-4 align-top">
                              <div className="flex flex-col gap-2">
                                <Badge
                                  className={`${badgeToneForState(
                                    item.latestVersionState ?? item.currentState
                                  )} ${compactStatusBadgeClass}`}
                                  variant="outline"
                                >
                                  {labelForState(item.latestVersionState ?? item.currentState)}
                                </Badge>
                                <Badge className={compactStatusBadgeClass} variant="outline">
                                  {detail
                                    ? editModeLabel(isReadOnlyMode(detail))
                                    : editModeLabel(!item.currentDraftVersionId)}
                                </Badge>
                                {shouldHighlightReviewerRequest ? (
                                  <Badge
                                    className={`border-amber-500/25 bg-amber-500/12 text-amber-700 dark:text-amber-300 ${compactStatusBadgeClass}`}
                                    variant="outline"
                                  >
                                    Reviewer requested changes
                                  </Badge>
                                ) : null}
                              </div>
                            </td>
                            <td className="w-[10%] px-3 py-4 align-top text-muted-foreground">
                              {progress
                                ? `${progress.readyCount}/${progress.totalCount} sections ready`
                                : '-'}
                            </td>
                            <td className="w-[25%] px-3 py-4 align-top">
                              <div className="font-medium text-foreground">{nextStepTitle}</div>
                              <div className="mt-1 overflow-hidden text-xs text-muted-foreground [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                                {nextStepDetail}
                              </div>
                            </td>
                            <td className="w-[10%] whitespace-nowrap px-2 py-4 align-top text-muted-foreground">
                              {formatTimestamp(latestVersion?.submittedAt ?? null)}
                            </td>
                            <td className="w-[10%] whitespace-nowrap px-2 py-4 align-top text-muted-foreground">
                              {formatTimestamp(latestVersion?.updatedAt ?? null)}
                            </td>
                            <td className="w-[18%] px-3 py-4 align-top">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                                  <Button asChild className="shrink-0" size="sm">
                                    <Link href={openHrefForItem(brandId, item)}>Open</Link>
                                  </Button>
                                  {inlineActions}
                                </div>
                                {moreActions.length > 0 ? (
                                  <ReportActionsMenuButton className="shrink-0">
                                    {moreActions}
                                  </ReportActionsMenuButton>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="divide-y divide-border/50 2xl:hidden">
                  {items.map((item) => {
                    const detail = detailForItem(detailsById, item);
                    const nextAction = detail
                      ? recommendedWorkflowAction(detail, brandId, item.id)
                      : null;
                    const progress = detail ? workflowProgress(detail) : null;
                    const latestVersion = item.versions[0] ?? null;
                    const reviewerRequestNote = latestVersion?.rejectionReason?.trim() ?? '';
                    const hasReviewerRequest = reviewerRequestNote.length > 0;
                    const shouldHighlightReviewerRequest =
                      hasReviewerRequest &&
                      (item.latestVersionState === 'draft' ||
                        item.latestVersionState === 'rejected');
                    const nextStepTitle = shouldHighlightReviewerRequest
                      ? 'Apply reviewer changes'
                      : nextAction?.section?.label ?? 'Open report';
                    const nextStepDetail = shouldHighlightReviewerRequest
                      ? `Reviewer requested: "${truncateInlineNote(reviewerRequestNote)}". Update the report and submit again.`
                      : detail?.period.reviewReadiness.summary ??
                        'Open this report to continue the monthly workflow.';
                    const compactInlineActions = buildSecondaryActions({
                      brandId,
                      canCreateReports,
                      canApproveReports,
                      item,
                      selectedYear
                    });
                    const compactMoreActions = buildMoreActions({
                      brandId,
                      canCreateReports,
                      item,
                      selectedYear
                    });

                    return (
                      <article className="space-y-4 px-4 py-4" key={item.id}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-medium text-foreground">{item.label}</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {item.currentApprovedVersionId
                                ? 'Published month available'
                                : 'Operational month workspace'}
                            </div>
                            {renderVersionBadges(item)}
                          </div>

                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <Button asChild size="sm">
                              <Link href={openHrefForItem(brandId, item)}>Open</Link>
                            </Button>
                            {compactInlineActions}
                            {compactMoreActions.length > 0 ? (
                              <ReportActionsMenuButton>
                                {compactMoreActions}
                              </ReportActionsMenuButton>
                            ) : null}
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Badge
                              className={`${badgeToneForState(
                                item.latestVersionState ?? item.currentState
                              )} ${compactStatusBadgeClass}`}
                              variant="outline"
                            >
                              {labelForState(item.latestVersionState ?? item.currentState)}
                            </Badge>
                            <Badge className={compactStatusBadgeClass} variant="outline">
                              {detail
                                ? editModeLabel(isReadOnlyMode(detail))
                                : editModeLabel(!item.currentDraftVersionId)}
                            </Badge>
                            {shouldHighlightReviewerRequest ? (
                              <Badge
                                className={`border-amber-500/25 bg-amber-500/12 text-amber-700 dark:text-amber-300 ${compactStatusBadgeClass}`}
                                variant="outline"
                              >
                                Reviewer requested changes
                              </Badge>
                            ) : null}
                          </div>

                          <div className="space-y-2 text-sm text-muted-foreground">
                            <p>{progress ? `${progress.readyCount}/${progress.totalCount} sections ready` : '-'}</p>
                            <p className="text-xs">
                              {formatCompactTimestamps(
                                latestVersion?.submittedAt ?? null,
                                latestVersion?.updatedAt ?? null
                              )}
                            </p>
                          </div>
                        </div>

                        <div>
                          <div className="font-medium text-foreground">{nextStepTitle}</div>
                          <div className="mt-1 overflow-hidden text-xs text-muted-foreground [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                            {nextStepDetail}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-3">
                <Trash2 className="text-primary" />
                Recycle Bin
              </CardTitle>
              <Badge className={compactBadgeClass} variant="outline">
                {recycleBinItems.length} items
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {recycleLoadError ? (
              <div className="rounded-[24px] border border-amber-500/25 bg-amber-500/8 px-4 py-5 text-sm text-amber-700 dark:text-amber-300">
                {recycleLoadError}
              </div>
            ) : recycleBinItems.length === 0 ? (
              <div className="rounded-[24px] border border-border/60 bg-background/60 px-4 py-5 text-sm text-muted-foreground">
                Recycle Bin is empty. Deleted reports stay here for {recycleRetentionDays} days
                before permanent deletion.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-[24px] border border-border/60 bg-background/55 px-4 py-4 text-sm text-muted-foreground">
                  Auto-delete policy: deleted reports are kept for {recycleRetentionDays} days.
                  You can restore them before the displayed expiry time. After expiry, the system
                  permanently deletes report data and media from Recycle Bin automatically.
                </div>
                <div className="rounded-[24px] border border-border/60 bg-background/55">
                <div className="divide-y divide-border/50">
                  {recycleBinItems.map((item) => {
                    const deletedBy =
                      item.deletedByName ??
                      item.deletedByEmail ??
                      'Unknown user';

                    return (
                      <article
                        className="flex flex-wrap items-start justify-between gap-3 px-4 py-4"
                        key={item.id}
                      >
                        <div className="space-y-2">
                          <div className="font-medium text-foreground">{item.label}</div>
                          <div className="text-xs text-muted-foreground">
                            Created {formatMonthYear(item.createdAt)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Deleted {formatTimestamp(item.deletedAt)} by {deletedBy}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Badge className={compactStatusBadgeClass} variant="outline">
                              Expires {formatTimestamp(item.purgeAt)}
                            </Badge>
                            <Badge className={compactStatusBadgeClass} variant="outline">
                              {formatPurgeCountdown(item.purgeAt)}
                            </Badge>
                            <Badge className={compactStatusBadgeClass} variant="outline">
                              {item.versionCount} version{item.versionCount === 1 ? '' : 's'}
                            </Badge>
                          </div>
                        </div>

                        {canCreateReports ? (
                          <RestoreReportButton
                            brandId={brandId}
                            className="h-8 rounded-full px-3 text-xs"
                            periodId={item.id}
                            year={new Date(item.deletedAt).getUTCFullYear()}
                          />
                        ) : (
                          <div className="text-xs text-muted-foreground">
                            You do not have permission to restore reports.
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
