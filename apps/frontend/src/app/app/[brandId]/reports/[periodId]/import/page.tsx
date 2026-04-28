import Link from 'next/link';
import { AlertCircle, ArrowRight, Upload } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { getAuthContext, getMembershipReportAccess } from '@/lib/auth';
import {
  getBrandCampaigns,
  getBrandCompanyFormatOptions,
  getComputedFormulas,
  getDatasetOverview,
  getGlobalCompanyFormatOptions,
  getImportTableLayout,
  getImportJobs,
  getLatestImportPreview,
  getReportingPeriodDetail,
  getTopContentDataSourcePolicy,
  type GlobalCompanyFormatOptionsResponse,
  type ImportJobListResponse,
  type ReportingDetailResponse
} from '@/lib/reporting-api';
import {
  editModeLabel,
  sectionStatusLabel,
  sectionTone,
  workflowProgress,
  workflowStepNumber
} from '@/lib/reporting-ui';

import { createOrResumeDraftAction } from '../../actions';
import { ReopenReportButton } from '../../reopen-report-button';
import { ReportWorkspaceShell } from '../workspace-shell';
import { WorkspaceUnavailableCard } from '../workspace-unavailable-card';
import { uploadImportJobAction } from './actions';
import { ImportWorkingTable } from './import-working-table';

type ImportPageProps = {
  params: Promise<{
    brandId: string;
    periodId: string;
  }>;
  searchParams?: Promise<{
    message?: string;
    error?: string;
    mappingFallback?: string;
  }>;
};

const defaultVisibleSourceLabelMatchers = [
  /^views$/i,
  /^reach$/i,
  /^viewers$/i,
  /^page followers$/i,
  /^reactions,\s*comments and shares$/i,
  /^total clicks$/i,
  /^3[\s-]*second video views$/i,
  /^15[\s-]*second video views$/i
] as const;

const sourcePreviewPriorityMatchers = [
  /views?/i,
  /viewers?|followers?|reach/i,
  /engagement|reaction|comment|share|click/i,
  /3[\s-]*second/i,
  /15[\s-]*second/i
];

function getInitialVisibleSourceKeys(
  columns: Array<{
    key: string;
    label: string;
    rawLabel: string;
    sourcePosition: number;
  }>,
  preferredSourcePositions: number[],
  preferredSourceLabels: string[]
) {
  const normalizedPreferredLabels = preferredSourceLabels
    .map(label => normalizeLabel(label))
    .filter(label => !!label);
  const columnsByNormalizedLabel = new Map<string, (typeof columns)[number]>();
  for (const column of columns) {
    const rawKey = normalizeLabel(column.rawLabel);
    if (rawKey && !columnsByNormalizedLabel.has(rawKey)) {
      columnsByNormalizedLabel.set(rawKey, column);
    }

    const displayKey = normalizeLabel(column.label);
    if (displayKey && !columnsByNormalizedLabel.has(displayKey)) {
      columnsByNormalizedLabel.set(displayKey, column);
    }
  }
  const labelMatched = normalizedPreferredLabels
    .map(label => columnsByNormalizedLabel.get(label) ?? null)
    .filter((column): column is (typeof columns)[number] => column !== null);

  if (labelMatched.length > 0) {
    return Array.from(new Set(labelMatched.map(column => column.key))).slice(0, 12);
  }

  const defaultColumns = defaultVisibleSourceLabelMatchers
    .map(matcher => columns.find(column => matcher.test(column.rawLabel)) ?? null)
    .filter((column): column is (typeof columns)[number] => column !== null);

  if (defaultColumns.length > 0) {
    return defaultColumns.map(column => column.key);
  }

  const prioritized = preferredSourcePositions
    .map(sourcePosition => columns.find(column => column.sourcePosition === sourcePosition) ?? null)
    .filter((column): column is (typeof columns)[number] => column !== null);

  const matched = columns.filter(
    column =>
      !prioritized.some(prioritizedColumn => prioritizedColumn.sourcePosition === column.sourcePosition) &&
      sourcePreviewPriorityMatchers.some(matcher => matcher.test(column.rawLabel))
  );

  const visibleColumns = [...prioritized, ...matched];

  if (visibleColumns.length > 0) {
    return visibleColumns.slice(0, 8).map(column => column.key);
  }

  return columns.slice(0, 6).map(column => column.key);
}

function statusBannerClass(kind: 'success' | 'error') {
  return kind === 'success'
    ? 'border-emerald-500/20 bg-emerald-500/8 text-emerald-700 dark:text-emerald-300'
    : 'border-rose-500/20 bg-rose-500/8 text-rose-700 dark:text-rose-300';
}

function normalizeLabel(value: string) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function lockedImportReason(options: {
  isReadOnlyRole: boolean;
  isAwaitingDecision: boolean;
  isApproved: boolean;
  isRejected: boolean;
  canCreateOrResumeDraft: boolean;
}) {
  const {
    isReadOnlyRole,
    isAwaitingDecision,
    isApproved,
    isRejected,
    canCreateOrResumeDraft
  } = options;

  if (isReadOnlyRole) {
    if (isAwaitingDecision) {
      return 'Submitted - awaiting decision: this import view is read-only (locked).';
    }

    if (isApproved) {
      return 'Approved: this import view is read-only (locked).';
    }

    return 'This account has read-only report access.';
  }

  if (isAwaitingDecision) {
    return 'Submitted - awaiting decision: this import view is read-only (locked) until reviewer decision.';
  }

  if (isApproved) {
    return 'Approved: this import view is read-only (locked). Create a revision from Reports to continue editing.';
  }

  if (isRejected) {
    return 'Changes requested: this import view is read-only (locked). Create a revision from Reports to continue editing.';
  }

  if (canCreateOrResumeDraft) {
    return 'Read-only (locked): no active draft. Create or resume a draft to continue editing.';
  }

  return 'Read-only (locked): editing is unavailable for this month in the current mode.';
}

function mergeCompanyFormatFields(
  globalFields: GlobalCompanyFormatOptionsResponse['fields'],
  brandFields: GlobalCompanyFormatOptionsResponse['fields']
) {
  const sharedGlobalFields = globalFields.filter(
    field => field.key !== 'related_product' && field.key !== 'campaign_base'
  );
  const relatedProductField =
    brandFields.find(field => field.key === 'related_product') ?? null;
  const merged = relatedProductField
    ? [...sharedGlobalFields, relatedProductField]
    : sharedGlobalFields;
  const preferredOrder = ['content_style', 'related_product', 'media_format', 'content_objective'];

  return merged.sort(
    (left, right) =>
      preferredOrder.indexOf(left.key) - preferredOrder.indexOf(right.key)
  );
}

export default async function ImportPage({ params, searchParams }: ImportPageProps) {
  const { brandId, periodId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const authContext = await getAuthContext();
  const currentBrandMembership =
    authContext.user?.memberships.find((membership) => membership.brandCode === brandId) ?? null;
  const reportAccess = getMembershipReportAccess(currentBrandMembership);
  const canCreateReports = reportAccess.canCreateReports;
  const isReadOnlyRole = reportAccess.isReadOnly;
  const canAccessImportMappingAdmin = !!authContext.user && authContext.canAccessAdmin;
  let detail: ReportingDetailResponse | null = null;
  let importJobs: ImportJobListResponse | null = null;
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
        title="Import workspace unavailable"
      />
    );
  }

  try {
    importJobs = await getImportJobs(brandId, periodId);
  } catch (error) {
    loadError =
      error instanceof Error
        ? error.message
        : `Failed to load import jobs for period ${periodId}.`;
  }

  if (!importJobs) {
    return (
      <ReportWorkspaceShell
        activeSection="import"
        brandId={brandId}
        detail={detail}
        layout="canvas"
        periodId={periodId}
      >
        <WorkspaceUnavailableCard
          message={loadError ?? 'Unknown error.'}
          title="Import workspace unavailable"
        />
      </ReportWorkspaceShell>
    );
  }

  const sourcePreviewResult = await getLatestImportPreview(brandId, periodId).catch(() => null);
  const [globalCompanyFormatOptionsResult, brandCompanyFormatOptionsResult, campaignsResult] =
    await Promise.all([
    getGlobalCompanyFormatOptions({
      includeDeprecated: true
    }).catch(() => null),
    getBrandCompanyFormatOptions(brandId, {
      includeDeprecated: true
    }).catch(() => null),
    getBrandCampaigns(brandId, {
      year: detail.period.year
    }).catch(() => null)
  ]);
  const [computedFormulasResult, importLayoutResult, topContentPolicyResult] = await Promise.all([
    getComputedFormulas({
      activeOnly: true
    }).catch(() => ({ items: [] })),
    getImportTableLayout().catch(() => ({ visibleSourceColumnLabels: [] })),
    getTopContentDataSourcePolicy().catch(() => ({
      mode: 'csv_only' as const,
      label: 'CSV only (manual rows excluded)',
      excludeManualRows: true,
      updatedAt: null,
      updatedBy: null,
      note: null
    }))
  ]);
  const datasetResult = sourcePreviewResult?.importJob
    ? await getDatasetOverview(brandId, periodId).catch(() => null)
    : null;

  const sourcePreview = sourcePreviewResult?.preview ?? null;
  const datasetPreview = datasetResult?.preview ?? null;
  const latestJob = sourcePreviewResult?.importJob ?? importJobs.items[0] ?? null;
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
  const canReopenForEditing =
    canCreateReports && detail.period.availableActions.canReopenLatest;
  const canUpload = !!importJobs.period.currentDraftVersionId && canCreateReports;
  const mappingHref = `/app/settings?tab=import-mapping`;
  const periodMappingHref = `/app/${brandId}/reports/${periodId}/mapping`;
  const canAccessPeriodMapping = canCreateReports && !isReadOnlyRole;
  const hasSourceRows = !!sourcePreview && sourcePreview.rows.length > 0;
  const isReadOnly = isReadOnlyRole || !detail.period.currentDraftVersionId;
  const readOnlyReason = isReadOnly
    ? lockedImportReason({
        isReadOnlyRole,
        isAwaitingDecision,
        isApproved,
        isRejected,
        canCreateOrResumeDraft
      })
    : null;
  const preferredSourcePositions =
    datasetPreview?.columns.map(column => column.sourcePosition) ?? [];
  const initialVisibleSourceKeys = sourcePreview
    ? getInitialVisibleSourceKeys(
        sourcePreview.columns,
        preferredSourcePositions,
        importLayoutResult.visibleSourceColumnLabels
      )
    : [];
  const shouldSuppressErrorBanner =
    !!resolvedSearchParams?.error &&
    (hasSourceRows || latestJob?.status === 'ready_for_mapping');
  const isWorkingTableEditable = !!datasetPreview && datasetPreview.rows.length > 0;
  const companyFormatFields = mergeCompanyFormatFields(
    globalCompanyFormatOptionsResult?.fields ?? [],
    brandCompanyFormatOptionsResult?.fields ?? []
  );
  const campaignOptions = (campaignsResult?.items ?? [])
    .filter((campaign) => campaign.status === 'active')
    .map((campaign) => campaign.name);
  const activeWorkflowSections = detail.period.workspace.sections.filter(
    section =>
      section.slug !== 'overview' &&
      section.slug !== 'metrics' &&
      section.slug !== 'mapping' &&
      section.slug !== 'history'
  );
  const progress = workflowProgress(detail);
  const shouldShowMappingFallback =
    resolvedSearchParams.mappingFallback === 'true' ||
    (!!latestJob && latestJob.status === 'ready_for_mapping' && !datasetPreview);

  return (
    <ReportWorkspaceShell
      activeSection="import"
      brandId={brandId}
      detail={detail}
      layout="canvas"
      periodId={periodId}
    >
      <div className="space-y-5">
        {(resolvedSearchParams?.message ||
          (resolvedSearchParams?.error && !shouldSuppressErrorBanner)) && (
          <div
            className={`rounded-2xl border px-4 py-3 text-sm ${
              resolvedSearchParams?.error && !shouldSuppressErrorBanner
                ? statusBannerClass('error')
                : statusBannerClass('success')
            }`}
          >
            {resolvedSearchParams?.error && !shouldSuppressErrorBanner
              ? resolvedSearchParams.error
              : resolvedSearchParams?.message}
          </div>
        )}

        <details className="rounded-2xl border border-border/60 bg-background/55 px-4 py-3">
          <summary className="cursor-pointer list-none text-sm font-medium text-foreground">
            Monthly steps ({progress.readyCount}/{progress.totalCount} ready)
          </summary>
          <div className="mt-3 grid gap-2">
            {activeWorkflowSections.map(section => (
              (() => {
                const isImportSection = section.slug === 'import';
                const isImportLockedView =
                  isImportSection &&
                  (isReadOnlyRole || isAwaitingDecision || isApproved || isRejected);
                const statusClass = isImportLockedView
                  ? 'rounded-full border border-slate-500/25 bg-slate-500/8 px-2 py-0.5 text-xs text-slate-700 dark:text-slate-300'
                  : `rounded-full border px-2 py-0.5 text-xs ${sectionTone(section.status)}`;
                const statusLabel = isImportLockedView
                  ? editModeLabel(true)
                  : sectionStatusLabel(section.status);
                const detailLabel = isImportLockedView
                  ? isAwaitingDecision
                    ? 'Submitted data exists. Editing is locked while waiting for reviewer decision.'
                    : isApproved
                      ? 'Approved version is locked. Create a revision to make changes.'
                    : isRejected
                      ? 'Changes requested. Create a revision to continue editing.'
                        : 'Submitted data exists. Editing is limited to users with create/edit permission.'
                  : section.detail;

                return (
                  <div
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-sm"
                    key={section.slug}
                  >
                    <div className="flex items-center gap-2 text-foreground">
                      <span className="inline-flex size-6 items-center justify-center rounded-full border border-border/60 bg-background text-xs text-muted-foreground">
                        {workflowStepNumber(section.slug) ?? '•'}
                      </span>
                      {section.label}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={statusClass}>{statusLabel}</span>
                      <span className="text-xs text-muted-foreground">{detailLabel}</span>
                    </div>
                  </div>
                );
              })()
            ))}
          </div>
        </details>

        <Card>
          <CardContent className="space-y-4 pt-6">
            {canUpload ? (
              <form
                action={uploadImportJobAction}
                className="grid items-end gap-3 xl:grid-cols-[minmax(260px,1.2fr)_220px]"
              >
                <input name="brandId" type="hidden" value={brandId} />
                <input name="periodId" type="hidden" value={periodId} />
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="report-import-file-input">
                    Import file
                  </label>
                  <Input
                    accept=".csv,.xls,.xlsx"
                    className="h-11"
                    id="report-import-file-input"
                    name="file"
                    type="file"
                  />
                </div>
                <Button className="h-11 w-full xl:self-end" type="submit">
                  <Upload />
                  Upload file
                </Button>
              </form>
            ) : (
              <div className="grid items-end gap-3 xl:grid-cols-[minmax(260px,1.2fr)_220px]">
                <div className="flex h-11 items-center rounded-2xl border border-border/60 bg-background/60 px-4 text-sm text-muted-foreground">
                  {isReadOnlyRole
                    ? `${editModeLabel(true)}: read-only access`
                    : canCreateOrResumeDraft
                      ? 'Draft required before upload'
                      : 'Read-only (locked)'}
                </div>
                {isReadOnlyRole ? (
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button asChild className="h-11 min-w-[160px]" variant="outline">
                      <Link href={`/app/${brandId}/reports/${periodId}/review`}>Open review</Link>
                    </Button>
                  </div>
                ) : canCreateOrResumeDraft ? (
                  <form action={createOrResumeDraftAction}>
                    <input name="brandId" type="hidden" value={brandId} />
                    <input name="year" type="hidden" value={detail.period.year} />
                    <input name="periodId" type="hidden" value={periodId} />
                    <Button className="h-11 w-full" type="submit">
                      Create or resume draft
                    </Button>
                  </form>
                ) : canReopenForEditing && detail.period.latestVersionId ? (
                  <div className="flex w-full justify-end">
                    <ReopenReportButton
                      brandId={brandId}
                      periodId={periodId}
                      redirectTo="import"
                      triggerClassName="h-11 w-full"
                      triggerLabel="Request edit access"
                      triggerVariant="default"
                      versionId={detail.period.latestVersionId}
                      year={detail.period.year}
                    />
                  </div>
                ) : isApproved || isRejected ? (
                  <Button asChild className="h-11 w-full" variant="outline">
                    <Link href={`/app/${brandId}/reports?year=${detail.period.year}`}>
                      Open reports list
                    </Link>
                  </Button>
                ) : (
                  <Button asChild className="h-11 w-full" variant="outline">
                    <Link href={`/app/${brandId}/reports/${periodId}/review`}>Open review</Link>
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {shouldShowMappingFallback ? (
          <Card className="border-amber-500/25 bg-amber-500/8">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
              <div className="space-y-1">
                <div className="text-sm font-medium text-foreground">
                  Mapping fallback is available for this upload
                </div>
                <p className="text-sm text-muted-foreground">
                  Auto-map could not complete every required field. Open month mapping to finalize this file,
                  then return to Import.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {canAccessPeriodMapping ? (
                  <Button asChild size="sm" variant="secondary">
                    <Link href={periodMappingHref}>
                      Open month mapping
                      <ArrowRight />
                    </Link>
                  </Button>
                ) : null}
                {canAccessImportMappingAdmin ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href={mappingHref}>
                      Open mapping settings
                      <ArrowRight />
                    </Link>
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Card id="report-canvas">
          <CardContent className="space-y-4 pt-6">
            {hasSourceRows && sourcePreview ? (
              <div className="space-y-4">
                <ImportWorkingTable
                  activeFormulas={computedFormulasResult.items}
                  brandId={brandId}
                  campaignOptions={campaignOptions}
                  companyFormatFields={companyFormatFields}
                  contentCount={datasetResult?.contentCount ?? null}
                  datasetPreview={datasetPreview}
                  initialVisibleSourceKeys={initialVisibleSourceKeys}
                  isReadOnly={isReadOnly}
                  isWorkingTableEditable={isWorkingTableEditable}
                  manualHeader={datasetResult?.manualHeader ?? null}
                  periodId={periodId}
                  readOnlyReason={readOnlyReason}
                  sourcePreview={sourcePreview}
                  topContentManualRowsExcluded={topContentPolicyResult.excludeManualRows}
                  uploadedFilename={latestJob?.originalFilename ?? null}
                />
              </div>
            ) : latestJob ? (
              <div className="rounded-2xl border border-border/60 bg-background/55 px-4 py-5">
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 size-4 text-muted-foreground" />
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-foreground">Upload received</div>
                    <div className="text-sm text-muted-foreground">
                      The upload is recorded, but the working table is not ready yet. Refresh once and continue in
                      this screen.
                    </div>
                    {shouldShowMappingFallback ? (
                      canAccessPeriodMapping ? (
                        <div className="flex flex-wrap gap-2">
                          <Button asChild size="sm" variant="secondary">
                            <Link href={periodMappingHref}>
                              Open month mapping
                              <ArrowRight />
                            </Link>
                          </Button>
                          {canAccessImportMappingAdmin ? (
                            <Button asChild size="sm" variant="outline">
                              <Link href={mappingHref}>
                                Open mapping settings
                                <ArrowRight />
                              </Link>
                            </Button>
                          ) : null}
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground">
                          Please ask a workspace manager to update import mapping settings.
                        </div>
                      )
                    ) : null}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border/60 bg-background/40 px-4 py-10 text-center text-sm text-muted-foreground">
                Upload a source file and the working table will appear here immediately.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ReportWorkspaceShell>
  );
}
