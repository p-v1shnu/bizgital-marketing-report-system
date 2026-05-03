import Link from 'next/link';
import { AlertCircle, ArrowRight, BarChart3, Database, Target } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  getMetricsOverview,
  getReportingPeriodDetail,
  type MetricsOverviewResponse,
  type ReportingDetailResponse
} from '@/lib/reporting-api';
import { getAuthContext, getMembershipReportAccess } from '@/lib/auth';

import { ReportSectionHeader } from '../report-section-header';
import { ReportWorkspaceShell } from '../workspace-shell';
import { WorkspaceUnavailableCard } from '../workspace-unavailable-card';
import { regenerateMetricsSnapshotAction } from './actions';

type MetricsPageProps = {
  params: Promise<{
    brandId: string;
    periodId: string;
  }>;
  searchParams?: Promise<{
    message?: string;
    error?: string;
  }>;
};

function formatMetricValue(value: number | null) {
  if (value === null) {
    return 'No data';
  }

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: value % 1 === 0 ? 0 : 2
  }).format(value);
}

function varianceTone(value: number | null) {
  if (value === null) {
    return 'text-muted-foreground';
  }

  if (value > 0) {
    return 'text-emerald-700 dark:text-emerald-300';
  }

  if (value < 0) {
    return 'text-rose-700 dark:text-rose-300';
  }

  return 'text-muted-foreground';
}

function formatTargetProgress(value: number) {
  return `${new Intl.NumberFormat('en-US', {
    maximumFractionDigits: value >= 100 ? 0 : 1
  }).format(value)}%`;
}

function buildKpiStatus(actualValue: number | null, targetValue: number | null) {
  if (targetValue === null || targetValue <= 0) {
    return {
      label: 'No target',
      badgeClass: 'border-border/60 text-muted-foreground',
      meterClass: 'bg-muted-foreground/30',
      progressPercent: null as number | null,
      progressText: 'Set yearly target'
    };
  }

  if (actualValue === null) {
    return {
      label: 'No data',
      badgeClass: 'border-amber-500/30 text-amber-700 dark:text-amber-300',
      meterClass: 'bg-amber-500/60',
      progressPercent: 0,
      progressText: 'No actual value'
    };
  }

  const ratio = actualValue / targetValue;
  const progressPercent = Math.max(0, Math.min(ratio * 100, 100));

  if (ratio >= 1) {
    return {
      label: ratio >= 1.2 ? 'Exceeded target' : 'Hit target',
      badgeClass: 'border-emerald-500/30 text-emerald-700 dark:text-emerald-300',
      meterClass: 'bg-emerald-500',
      progressPercent,
      progressText:
        ratio >= 10
          ? `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(ratio)}x target`
          : `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(ratio)}x target`
    };
  }

  if (ratio >= 0.8) {
    return {
      label: 'Near target',
      badgeClass: 'border-amber-500/30 text-amber-700 dark:text-amber-300',
      meterClass: 'bg-amber-500',
      progressPercent,
      progressText: formatTargetProgress(ratio * 100)
    };
  }

  return {
    label: 'Below target',
    badgeClass: 'border-rose-500/30 text-rose-700 dark:text-rose-300',
    meterClass: 'bg-rose-500',
    progressPercent,
    progressText: formatTargetProgress(ratio * 100)
  };
}

export default async function MetricsPage({
  params,
  searchParams
}: MetricsPageProps) {
  const { brandId, periodId } = await params;
  const authContext = await getAuthContext();
  const currentMembership =
    authContext.user?.memberships.find((membership) => membership.brandCode === brandId) ?? null;
  const reportAccess = getMembershipReportAccess(currentMembership);
  const canCreateReports = reportAccess.canCreateReports;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  let detail: ReportingDetailResponse | null = null;
  let metrics: MetricsOverviewResponse | null = null;
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
        title="Metrics workspace unavailable"
      />
    );
  }

  try {
    metrics = await getMetricsOverview(brandId, periodId);
  } catch (error) {
    loadError =
      error instanceof Error
        ? error.message
        : `Failed to load metrics overview for period ${periodId}.`;
  }

  if (!metrics) {
    return (
      <ReportWorkspaceShell
        activeSection="metrics"
        brandId={brandId}
        detail={detail}
        periodId={periodId}
      >
        <WorkspaceUnavailableCard
          message={loadError ?? 'Unknown error.'}
          title="Metrics workspace unavailable"
        />
      </ReportWorkspaceShell>
    );
  }

  const canShowCards = metrics.items.length > 0;

  return (
    <ReportWorkspaceShell
      activeSection="metrics"
      brandId={brandId}
      detail={detail}
      periodId={periodId}
    >
      <div className="space-y-6">
        <ReportSectionHeader
          badges={<Badge variant="outline">Brand KPI metrics</Badge>}
          description={`Metrics now follow the brand's KPI plan for ${metrics.plan.year}. Each card shows the KPI definition, actual monthly result, and yearly target in one place.`}
          title={`KPI metrics for ${detail.period.monthLabel}`}
        />

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

        <div className="grid gap-5">
          <div className="grid gap-5">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <Target className="text-primary" />
                  KPI plan metrics
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div
                  className={`rounded-2xl border p-5 text-sm leading-6 ${
                    metrics.readiness.state === 'ready'
                      ? 'border-emerald-500/25 bg-emerald-500/8 text-emerald-700 dark:text-emerald-300'
                      : 'border-amber-500/25 bg-amber-500/8 text-amber-700 dark:text-amber-300'
                  }`}
                >
                  {metrics.readiness.detail}
                </div>

                {metrics.readiness.state === 'pending' && canCreateReports ? (
                  <form action={regenerateMetricsSnapshotAction}>
                    <input name="brandId" type="hidden" value={brandId} />
                    <input name="periodId" type="hidden" value={periodId} />
                    <Button type="submit">Regenerate current snapshot</Button>
                  </form>
                ) : null}

                {canShowCards ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {metrics.items.map(item => {
                      const showSourceAlias =
                        item.sourceAliasLabel &&
                        item.sourceAliasLabel.trim().toLowerCase() !==
                          item.sourceLabel.trim().toLowerCase();
                      const sourceAliasText = showSourceAlias
                        ? item.sourceAliasLabel
                        : 'same as source label';
                      const status = buildKpiStatus(item.actualValue, item.targetValue);

                      return (
                        <Card className="border-border/60 bg-background/60" key={item.id}>
                          <CardContent className="space-y-4 pt-6">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 space-y-1">
                                <div className="text-sm font-medium text-muted-foreground">
                                  {item.label}
                                </div>
                                <div className="break-words text-xs text-muted-foreground">
                                  Source: {item.sourceLabel}
                                </div>
                              </div>
                              <span
                                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-center text-[11px] font-medium leading-4 ${status.badgeClass}`}
                              >
                                {status.label}
                              </span>
                            </div>

                            {status.progressPercent !== null ? (
                              <div className="space-y-1">
                                <div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                                  <span className="shrink-0">Target progress</span>
                                  <span className="min-w-0 truncate text-right">{status.progressText}</span>
                                </div>
                                <div className="h-2 overflow-hidden rounded-full bg-border/50">
                                  <div
                                    className={`h-full ${status.meterClass}`}
                                    style={{ width: `${status.progressPercent}%` }}
                                  />
                                </div>
                              </div>
                            ) : (
                              <div className="text-xs text-muted-foreground">{status.progressText}</div>
                            )}

                            <div className="grid gap-3 lg:grid-cols-2">
                              <div className="min-w-0">
                                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                                  Actual
                                </div>
                                <div className="mt-2 min-w-0 font-serif text-[clamp(1.55rem,2.1vw,2.35rem)] leading-[1.02] tracking-[-0.03em] tabular-nums">
                                  {formatMetricValue(item.actualValue)}
                                </div>
                              </div>
                              <div className="min-w-0">
                                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                                  Target
                                </div>
                                <div className="mt-2 min-w-0 font-serif text-[clamp(1.55rem,2.1vw,2.35rem)] leading-[1.02] tracking-[-0.03em] tabular-nums">
                                  {formatMetricValue(item.targetValue)}
                                </div>
                              </div>
                            </div>

                            <div className={`text-sm font-medium ${varianceTone(item.varianceValue)}`}>
                              Variance: {formatMetricValue(item.varianceValue)}
                            </div>

                            <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-xs leading-5 text-muted-foreground">
                              <span className="text-muted-foreground/80">Rows</span>
                              <span>{item.rowCoverage}</span>
                              <span className="text-muted-foreground/80">Overrides</span>
                              <span>{item.overrideCount}</span>
                              <span className="text-muted-foreground/80">Imported</span>
                              <span className="break-words">{item.sourceColumnName ?? 'n/a'}</span>
                              <span className="text-muted-foreground/80">Alias</span>
                              <span className="break-words">{sourceAliasText}</span>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-border/60 px-4 py-8 text-sm text-muted-foreground">
                    This brand-year KPI plan does not have any KPI items yet.
                  </div>
                )}

                {metrics.readiness.state === 'blocked' ? (
                  <div className="flex flex-wrap gap-3">
                    <Button asChild variant="secondary">
                      <Link href={`/app/brands/${brandId}?tab=kpi`}>
                        Open yearly KPI plan
                        <ArrowRight />
                      </Link>
                    </Button>
                    <Button asChild variant="outline">
                      <Link href={`/app/${brandId}/reports/${periodId}/import`}>
                        Go to import
                        <ArrowRight />
                      </Link>
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Card className="rounded-2xl border-border/40 bg-background/35 shadow-none">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="flex items-center gap-2 text-base text-muted-foreground">
                  <Database className="size-4 text-muted-foreground/70" />
                  Metric basis
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pb-4 text-xs leading-5 text-muted-foreground">
                <div className="grid grid-cols-[140px_1fr] gap-x-2">
                  <span className="text-muted-foreground/80">KPI plan year</span>
                  <span>{metrics.plan.year}</span>
                  <span className="text-muted-foreground/80">Planned KPI items</span>
                  <span>{metrics.plan.itemCount}</span>
                  <span className="text-muted-foreground/80">Dataset rows</span>
                  <span>{metrics.summary.datasetRowCount}</span>
                  <span className="text-muted-foreground/80">Manual overrides</span>
                  <span>{metrics.summary.overriddenCellCount}</span>
                  <span className="text-muted-foreground/80">Snapshot generated</span>
                  <span>
                    {metrics.snapshot
                      ? new Intl.DateTimeFormat('en-US', {
                          dateStyle: 'medium',
                          timeStyle: 'short'
                        }).format(new Date(metrics.snapshot.generatedAt))
                      : 'not yet'}
                  </span>
                  <span className="text-muted-foreground/80">Snapshot status</span>
                  <span>
                    {metrics.snapshot
                      ? metrics.snapshot.isCurrent
                        ? 'Current'
                        : 'Needs refresh'
                      : 'Missing'}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-border/40 bg-background/30 shadow-none">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="flex items-center gap-2 text-base text-muted-foreground">
                  <BarChart3 className="size-4 text-muted-foreground/70" />
                  What comes next
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pb-4 text-xs leading-5 text-muted-foreground">
                <p>
                  Yearly KPI planning now controls which metrics appear here, so different years can track different KPI sets.
                </p>
                <p>
                  Snapshot freshness still matters because top content and review use the canonical metric layer underneath.
                </p>
              </CardContent>
            </Card>

            {metrics.readiness.state !== 'ready' ? (
              <Card className="rounded-2xl border-amber-500/25 bg-amber-500/7 shadow-none md:col-span-2">
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="flex items-center gap-2 text-base text-amber-700 dark:text-amber-300">
                    <AlertCircle className="size-4 text-amber-700 dark:text-amber-300" />
                    Why metrics need attention
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-4 text-xs leading-5 text-amber-700 dark:text-amber-300">
                  {metrics.readiness.state === 'pending'
                    ? 'A snapshot is missing or stale for the current draft. Regenerate it here before submit.'
                    : 'This month needs both import-ready data and a configured KPI plan before KPI cards can fully render.'}
                </CardContent>
              </Card>
            ) : null}
          </div>
        </div>
      </div>
    </ReportWorkspaceShell>
  );
}
