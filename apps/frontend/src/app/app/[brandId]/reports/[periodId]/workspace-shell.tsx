import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  ArrowRight,
  BarChart3,
  ChevronRight,
  ClipboardCheck,
  FolderGit2
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  getMetricsKpiPreview,
  type MetricsKpiPreviewResponse,
  type ReportingDetailResponse
} from '@/lib/reporting-api';
import {
  editModeLabel,
  isReadOnlyMode,
  readinessHelpText,
  recommendedWorkflowAction,
  labelForState,
  reportSectionHref,
  readinessLabel,
  readinessOpenItemsLabel,
  readinessTone,
  sectionStatusLabel,
  sectionTone,
  visibleWorkspaceSections,
  workflowProgress,
  workflowStepNumber
} from '@/lib/reporting-ui';

type ReportWorkspaceShellProps = {
  brandId: string;
  periodId: string;
  activeSection:
    | 'overview'
    | 'import'
    | 'mapping'
    | 'metrics'
    | 'top-content'
    | 'competitors'
    | 'questions'
    | 'commentary'
    | 'review'
    | 'history';
  detail: ReportingDetailResponse;
  children: ReactNode;
  layout?: 'default' | 'canvas';
};

type KpiPreview = {
  label: string;
  detail: string;
  toneClassName: string;
};

function buildKpiPreview(preview: MetricsKpiPreviewResponse | null): KpiPreview {
  if (!preview) {
    return {
      label: 'No data',
      detail: '0/0 achieved',
      toneClassName: 'border-border/60 bg-background/60 text-muted-foreground'
    };
  }

  const toneClassName =
    preview.state === 'all_targets_hit'
      ? 'border-emerald-500/25 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
      : preview.state === 'at_risk'
        ? 'border-rose-500/25 bg-rose-500/12 text-rose-700 dark:text-rose-300'
        : preview.state === 'in_progress'
          ? 'border-amber-500/25 bg-amber-500/12 text-amber-700 dark:text-amber-300'
          : 'border-border/60 bg-background/60 text-muted-foreground';

  return {
    label: preview.label,
    detail: `${Math.max(0, preview.hitCount)}/${Math.max(0, preview.totalCount)} achieved`,
    toneClassName
  };
}

export async function ReportWorkspaceShell({
  brandId,
  periodId,
  activeSection,
  detail,
  children,
  layout = 'default'
}: ReportWorkspaceShellProps) {
  const metricsPreview = await getMetricsKpiPreview(brandId, periodId).catch(() => null);
  const kpiPreview = buildKpiPreview(metricsPreview);
  const kpiHref = `/app/${brandId}/reports/${periodId}/metrics`;
  const progress = workflowProgress(detail);
  const recommendedAction = recommendedWorkflowAction(detail, brandId, periodId);
  const activeSectionMeta =
    detail.period.workspace.sections.find((section) => section.slug === activeSection) ?? null;
  const activeStepNumber = workflowStepNumber(activeSection);
  const reviewHref = reportSectionHref(brandId, periodId, 'review');
  const isRecommendedSectionActive =
    recommendedAction.section?.slug === activeSection;
  const readOnlyMode = isReadOnlyMode(detail);
  const sectionLinks = visibleWorkspaceSections(detail).map((section) => ({
    ...section,
    href: reportSectionHref(brandId, periodId, section.slug)
  }));
  const topTabs = (
    <div className="overflow-x-auto pb-1">
      <div className="flex min-w-max gap-2">
        {sectionLinks.map((section) => (
          <Link
            className={`rounded-full border px-4 py-2 text-sm transition ${
              section.slug === activeSection
                ? 'border-primary/30 bg-primary/10 text-foreground'
                : 'border-border/60 bg-background/70 text-muted-foreground hover:border-border hover:text-foreground'
            }`}
            href={section.href}
            key={section.slug}
          >
            <span className="font-medium">{section.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );

  if (layout === 'canvas') {
    return (
      <section className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="outline">{detail.brand.name}</Badge>
          <Badge variant="outline">{detail.period.monthLabel}</Badge>
          <Link
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition ${kpiPreview.toneClassName}`}
            href={kpiHref}
          >
            <BarChart3 className="size-4" />
            <span className="font-medium">KPI Check</span>
            <span className="text-xs opacity-85">
              · {kpiPreview.detail}
            </span>
          </Link>
        </div>

        {topTabs}

        <div className="min-w-0">{children}</div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="outline">{detail.brand.name}</Badge>
        <Badge variant="outline">{detail.period.monthLabel}</Badge>
        <Link
          className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition ${kpiPreview.toneClassName}`}
          href={kpiHref}
        >
          <BarChart3 className="size-4" />
          <span className="font-medium">KPI Check</span>
          <span className="text-xs opacity-85">
            · {kpiPreview.detail}
          </span>
        </Link>
      </div>

      {topTabs}

      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-5">
          <Card className={readinessTone(detail.period.reviewReadiness.overall)}>
            <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <ClipboardCheck className="text-primary" />
              Workflow status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">
                  {readinessLabel(detail.period.reviewReadiness.overall)}
                </Badge>
                <Badge variant="outline">
                  {readinessOpenItemsLabel(detail.period.reviewReadiness.blockingCount)}
                </Badge>
                <Badge variant="outline">
                  {editModeLabel(readOnlyMode)}
                </Badge>
              </div>
              <p>{readinessHelpText(detail.period.reviewReadiness.overall)}</p>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-2xl border border-border/60 bg-background/75 p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    Current step
                  </div>
                  <div className="mt-2 text-lg font-semibold text-foreground">
                    {activeStepNumber
                      ? `${activeStepNumber}/${progress.totalCount} ${activeSectionMeta?.label ?? 'Workflow'}`
                      : activeSectionMeta?.label ?? 'Workflow'}
                  </div>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/75 p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    Ready sections
                  </div>
                  <div className="mt-2 text-lg font-semibold text-foreground">
                    {progress.readyCount}/{progress.totalCount}
                  </div>
                </div>
                <div className="rounded-2xl border border-border/60 bg-background/75 p-4 sm:col-span-2 xl:col-span-1">
                  <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    Next action
                  </div>
                  <div className="mt-2 text-lg font-semibold text-foreground">
                    {recommendedAction.section?.label ?? 'Import'}
                  </div>
                </div>
              </div>
              <Button asChild className="w-full">
                <Link href={recommendedAction.href}>
                  {isRecommendedSectionActive
                    ? activeSection === 'review'
                      ? 'Stay in review center'
                      : 'Continue in this section'
                    : recommendedAction.label}
                  <ArrowRight />
                </Link>
              </Button>
              {recommendedAction.href !== reviewHref ? (
                <Button asChild className="w-full" variant="outline">
                  <Link href={reviewHref}>Open review center</Link>
                </Button>
              ) : null}
              <p className="rounded-2xl border border-border/60 bg-background/70 p-4">
                Period state: {labelForState(detail.period.currentState)}.
                {` `}
                Users can stay on the main monthly path without guessing where to go next.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <FolderGit2 className="text-primary" />
                Monthly workflow
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              {sectionLinks.map((section) => {
                return (
                  <Link
                    className={`group rounded-2xl border px-4 py-3 transition ${
                      section.slug === activeSection
                        ? 'border-primary/30 bg-primary/8'
                        : 'border-transparent hover:border-border hover:bg-card/70'
                    }`}
                    href={section.href}
                    key={section.slug}
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="flex items-center gap-3 text-sm font-medium">
                        <span className="flex size-7 items-center justify-center rounded-full border border-border/60 bg-background/80 text-xs text-muted-foreground">
                          {workflowStepNumber(section.slug) ?? '•'}
                        </span>
                        {section.label}
                      </span>
                      <div className="flex items-center gap-2">
                        {recommendedAction.section?.slug === section.slug &&
                        section.slug !== activeSection ? (
                          <Badge variant="outline">Next</Badge>
                        ) : null}
                        <ChevronRight className="size-4 opacity-0 transition group-hover:opacity-100" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Badge className={sectionTone(section.status)} variant="outline">
                        {sectionStatusLabel(section.status)}
                      </Badge>
                      <p className="text-xs leading-5 text-muted-foreground">
                        {section.detail}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </CardContent>
          </Card>
        </aside>

        <div className="min-w-0">{children}</div>
      </div>
    </section>
  );
}
