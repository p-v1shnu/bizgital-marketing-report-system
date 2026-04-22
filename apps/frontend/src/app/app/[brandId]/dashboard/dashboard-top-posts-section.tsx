'use client';

import { Badge } from '@/components/ui/badge';
import type { TopContentOverviewResponse } from '@/lib/reporting-api';
import { cn } from '@/lib/utils';

import { DashboardChartCopyButton } from './dashboard-chart-copy-button';
import { useDashboardGlobalKpiControls } from './dashboard-global-kpi-controls';

type DashboardTopPostsSectionProps = {
  overview: TopContentOverviewResponse | null;
};

const topSlotOrder = ['top_engagement', 'top_views', 'top_reach'] as const;
const topSlotLabelFallbacks: Record<(typeof topSlotOrder)[number], string> = {
  top_engagement: 'Top 3 Engagement',
  top_views: 'Top 3 Views',
  top_reach: 'Top 3 Reach'
};
const contentWhiteBadgeClassName =
  'border-slate-300 bg-slate-100 text-slate-800 dark:border-slate-300 dark:bg-slate-100 dark:text-slate-800';

function formatMetricValue(value: number) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: value % 1 === 0 ? 0 : 2
  }).format(value);
}

export function DashboardTopPostsSection({ overview }: DashboardTopPostsSectionProps) {
  const {
    presentationMode,
    contentMetricScale,
    contentBadgeScale,
    contentCardAspect,
    contentSpacing,
    contentShowDatasetRow,
    contentShowSourceLink,
    contentCaptureBackground
  } = useDashboardGlobalKpiControls();

  if (!overview) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-600">
        Top post overview is unavailable for this month.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {topSlotOrder.map((slotKey) => {
        const cards = overview.cards
          .filter((card) => card.slotKey === slotKey)
          .sort((left, right) => left.rankPosition - right.rankPosition);
        const slotLabel = cards[0]?.slotLabel ?? topSlotLabelFallbacks[slotKey];
        const slotCaptureTargetId = `dashboard-content-top-posts-${slotKey}-cards`;
        const aspectClass =
          contentCardAspect === '1_1'
            ? 'aspect-square'
            : contentCardAspect === '9_16'
              ? 'aspect-[9/16]'
              : 'aspect-[4/5]';
        const gridGapClass =
          contentSpacing === 'compact'
            ? 'gap-3'
            : contentSpacing === 'relaxed'
              ? 'gap-5'
              : 'gap-4';
        const articlePaddingClass =
          contentSpacing === 'compact'
            ? 'p-3'
            : contentSpacing === 'relaxed'
              ? 'p-5'
              : 'p-4';
        const articleVerticalGapClass =
          contentSpacing === 'compact'
            ? 'space-y-3'
            : contentSpacing === 'relaxed'
              ? 'space-y-5'
              : 'space-y-4';
        const badgeScaleClass =
          contentBadgeScale === 'm'
            ? 'px-4 py-1.5 text-sm tracking-[0.16em]'
            : contentBadgeScale === 'xl'
              ? 'px-6 py-2.5 text-lg font-bold tracking-[0.2em]'
              : 'px-5 py-2 text-base font-bold tracking-[0.18em]';
        const metricLabelClass =
          contentMetricScale === 's'
            ? 'text-lg'
            : contentMetricScale === 'l'
              ? 'text-2xl'
              : 'text-xl';
        const metricValueClass =
          contentMetricScale === 's'
            ? 'text-3xl'
            : contentMetricScale === 'l'
              ? 'text-5xl'
              : 'text-4xl';
        const normalMetricValueClass =
          contentMetricScale === 's'
            ? 'text-xl'
            : contentMetricScale === 'l'
              ? 'text-3xl'
              : 'text-2xl';
        const normalMetricLabelClass =
          contentMetricScale === 's'
            ? 'text-sm'
            : contentMetricScale === 'l'
              ? 'text-lg'
              : 'text-base';
        const captureCardBackgroundClass =
          contentCaptureBackground === 'white' ? 'bg-white' : 'bg-white/85';
        const captureMetricBackgroundClass =
          contentCaptureBackground === 'white' ? 'bg-white' : 'bg-white/80';

        return (
          <section className="space-y-3" key={`top-slot-${slotKey}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3
                className={cn(
                  'font-semibold',
                  presentationMode ? 'text-xl tracking-[-0.02em]' : 'text-base'
                )}
              >
                {slotLabel}
              </h3>
              <div className="flex items-center gap-2">
                <Badge className={contentWhiteBadgeClassName} variant="outline">
                  {cards.length > 0 ? `${cards.length} card(s)` : 'No data'}
                </Badge>
                <DashboardChartCopyButton targetId={slotCaptureTargetId} />
              </div>
            </div>

            {cards.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-600">
                No screenshot data for this top category.
              </div>
            ) : (
              <div
                className={cn('grid md:grid-cols-2 2xl:grid-cols-3', gridGapClass)}
                id={slotCaptureTargetId}
              >
                {cards.map((card) => (
                  <article
                    className={cn(
                      'rounded-2xl border border-slate-200',
                      articlePaddingClass,
                      presentationMode
                        ? `${articleVerticalGapClass} ${captureCardBackgroundClass} shadow-sm`
                        : 'space-y-3 bg-white'
                    )}
                    key={card.id}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        className={cn(
                          contentWhiteBadgeClassName,
                          badgeScaleClass
                        )}
                        variant="outline"
                      >
                        Top #{card.rankPosition}
                      </Badge>
                      <Badge
                        className={cn(
                          contentWhiteBadgeClassName,
                          badgeScaleClass
                        )}
                        variant="outline"
                      >
                        {card.metricLabel}
                      </Badge>
                    </div>

                    {card.screenshotUrl ? (
                      <img
                        alt={`${card.slotLabel} rank ${card.rankPosition}`}
                        className={cn(
                          'w-full rounded-2xl border border-slate-200 bg-slate-50 object-contain',
                          aspectClass
                        )}
                        loading="lazy"
                        src={card.screenshotUrl}
                      />
                    ) : (
                      <div
                        className={cn(
                          'flex w-full items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-100 text-sm text-slate-600',
                          aspectClass
                        )}
                      >
                        No screenshot
                      </div>
                    )}

                    {presentationMode ? (
                      <div
                        className={cn(
                          'rounded-2xl border border-slate-200 px-4 py-3 text-center',
                          captureMetricBackgroundClass
                        )}
                      >
                        <div className={cn('font-semibold tracking-tight text-slate-700', metricLabelClass)}>
                          {card.metricLabel}
                        </div>
                        <div
                          className={cn(
                            'mt-1 font-bold leading-none tracking-tight text-slate-900',
                            metricValueClass
                          )}
                        >
                          {formatMetricValue(card.headlineValue)}
                        </div>
                        {contentShowDatasetRow || contentShowSourceLink ? (
                          <div className="mt-2 space-y-1 text-xs text-slate-600">
                            {contentShowDatasetRow ? (
                              <div>Dataset row: {card.datasetRow.rowNumber}</div>
                            ) : null}
                            {contentShowSourceLink && card.postUrl ? (
                              <a
                                className="text-primary hover:underline"
                                href={card.postUrl}
                                rel="noreferrer"
                                target="_blank"
                              >
                                Open source post
                              </a>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center">
                        <div
                          className={cn(
                            'font-semibold tracking-tight text-slate-700',
                            normalMetricLabelClass
                          )}
                        >
                          {card.metricLabel}
                        </div>
                        <div
                          className={cn(
                            'mt-1 font-bold leading-none tracking-tight text-slate-900',
                            normalMetricValueClass
                          )}
                        >
                          {formatMetricValue(card.headlineValue)}
                        </div>
                        {contentShowDatasetRow || contentShowSourceLink ? (
                          <div className="mt-2 space-y-1 text-xs text-slate-600">
                            {contentShowDatasetRow ? (
                              <div>Dataset row: {card.datasetRow.rowNumber}</div>
                            ) : null}
                            {contentShowSourceLink && card.postUrl ? (
                              <a
                                className="text-primary hover:underline"
                                href={card.postUrl}
                                rel="noreferrer"
                                target="_blank"
                              >
                                Open source post
                              </a>
                            ) : null}
                            {contentShowSourceLink && !card.postUrl ? (
                              <div>No post URL from CSV source.</div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
