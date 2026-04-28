'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { toProtectedMediaUrl } from '@/lib/media-url';
import type { CompetitorOverviewResponse } from '@/lib/reporting-api';
import { cn } from '@/lib/utils';

import { DashboardChartCopyButton } from './dashboard-chart-copy-button';
import { getDashboardContentCanvasAspectClass } from './dashboard-content-canvas-ratio';
import { getDashboardContentNoteTypography } from './dashboard-content-note-typography';
import { useDashboardGlobalKpiControls } from './dashboard-global-kpi-controls';

type PreviousFollowerItem = {
  competitorId: string;
  followerCount: number | null;
};

type DashboardCompetitorAnalysisSectionProps = {
  overview: CompetitorOverviewResponse | null;
  previousVisiblePeriodLabel: string | null;
  previousFollowers: PreviousFollowerItem[];
  ownBrandSummary: {
    id: string;
    name: string;
    logoUrl: string | null;
    pageFollowers: number | null;
    monthlyPosts: number | null;
  } | null;
};

const contentWhiteBadgeClassName =
  'border-slate-300 bg-slate-100 text-slate-800 dark:border-slate-300 dark:bg-slate-100 dark:text-slate-800';

function formatMetricValue(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return 'N/A';
  }

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: value % 1 === 0 ? 0 : 2
  }).format(value);
}

function formatFollowerChange(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return 'N/A';
  }

  const normalized = value === 0 ? '0' : formatMetricValue(Math.abs(value));
  return value > 0 ? `+${normalized}` : value < 0 ? `-${normalized}` : normalized;
}

function normalizeHighlightNote(value: string | null | undefined) {
  const normalized = String(value ?? '').trim();

  if (!normalized) {
    return '';
  }

  // Keep user-entered new lines. If bullets were saved inline (" - "),
  // convert them back to per-line bullets for readability in captures.
  if (!normalized.includes('\n') && normalized.includes(' - ')) {
    return normalized.replace(/\s-\s+/g, '\n- ');
  }

  return normalized;
}

function normalizeOptionalUrl(value: string | null | undefined) {
  const normalized = String(value ?? '').trim();
  return normalized.length > 0 ? normalized : null;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getInitials(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return '?';
  }

  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length === 1) {
    return words[0]?.slice(0, 2).toUpperCase() ?? '?';
  }

  return `${words[0]?.[0] ?? ''}${words[1]?.[0] ?? ''}`.toUpperCase();
}

function BoardLogoCell({
  brandName,
  logoUrl,
  logoSizePx,
  fallbackFontPx
}: {
  brandName: string;
  logoUrl: string | null;
  logoSizePx: number;
  fallbackFontPx: number;
}) {
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const normalizedLogoUrl = toProtectedMediaUrl(logoUrl);

  if (normalizedLogoUrl && !imageLoadFailed) {
    return (
      <img
        alt={`${brandName} logo`}
        className="rounded-md border border-slate-200 bg-white object-contain"
        loading="lazy"
        onError={() => {
          setImageLoadFailed(true);
        }}
        src={normalizedLogoUrl}
        style={{
          width: `${logoSizePx}px`,
          height: `${logoSizePx}px`
        }}
      />
    );
  }

  return (
    <div
      className="flex items-center justify-center rounded-md border border-slate-200 bg-slate-50 font-semibold text-slate-700"
      style={{
        width: `${logoSizePx}px`,
        height: `${logoSizePx}px`,
        fontSize: `${fallbackFontPx}px`,
        lineHeight: `${Math.max(12, Math.round(fallbackFontPx * 1.12))}px`
      }}
    >
      {getInitials(brandName)}
    </div>
  );
}

type CompetitorBoardRow = {
  id: string;
  brandName: string;
  logoUrl: string | null;
  pageFollowers: number | null;
  monthlyPosts: number | null;
  isOwnBrand: boolean;
};

type PostSlot = {
  id: string;
  displayOrder: number;
  screenshotUrl: string;
  postUrl: string | null;
};

function buildFivePostSlots(input: {
  posts: Array<{
    id: string;
    displayOrder: number;
    screenshotUrl: string;
    postUrl: string | null;
  }>;
  fallbackNoActivityImageUrl: string | null;
}): Array<PostSlot | null> {
  const sorted = [...input.posts]
    .sort((left, right) => left.displayOrder - right.displayOrder)
    .slice(0, 5);
  const slots: Array<PostSlot | null> = Array.from({ length: 5 }, (_, index) => sorted[index] ?? null);

  if (!slots.some((slot) => slot !== null) && input.fallbackNoActivityImageUrl) {
    slots[0] = {
      id: 'no-activity-evidence',
      displayOrder: 1,
      screenshotUrl: input.fallbackNoActivityImageUrl,
      postUrl: null
    };
  }

  return slots;
}

export function DashboardCompetitorAnalysisSection({
  overview,
  previousVisiblePeriodLabel,
  previousFollowers,
  ownBrandSummary
}: DashboardCompetitorAnalysisSectionProps) {
  const {
    contentFollowerScale,
    contentBadgeScale,
    contentCardAspect,
    contentCanvasRatio,
    contentSpacing,
    contentShowSourceLink,
    contentCaptureBackground,
    contentNoteScale
  } = useDashboardGlobalKpiControls();
  const boardCanvasRef = useRef<HTMLDivElement | null>(null);
  const [boardCanvasSize, setBoardCanvasSize] = useState({ width: 0, height: 0 });

  const previousFollowerByCompetitorId = useMemo(
    () => new Map(previousFollowers.map((entry) => [entry.competitorId, entry.followerCount])),
    [previousFollowers]
  );

  const badgeScaleClass =
    contentBadgeScale === 'm'
      ? 'px-3 py-1 text-xs tracking-[0.14em]'
      : contentBadgeScale === 'xl'
        ? 'px-5 py-2 text-base font-bold tracking-[0.18em]'
        : 'px-4 py-1.5 text-sm font-bold tracking-[0.16em]';
  const captureMetricValueSizePx =
    contentFollowerScale === 'm' ? 36 : contentFollowerScale === 'xl' ? 60 : 48;
  const captureMetricLabelSizePx = Math.round(captureMetricValueSizePx / 2);
  const captureMetricValueLineHeightPx = Math.round(captureMetricValueSizePx * 1.08);
  const captureMetricLabelLineHeightPx = Math.round(captureMetricLabelSizePx * 1.2);
  const blockPaddingClass =
    contentSpacing === 'compact'
      ? 'p-3'
      : contentSpacing === 'relaxed'
        ? 'p-6'
        : 'p-5';
  const sectionGapClass =
    contentSpacing === 'compact'
      ? 'space-y-3'
      : contentSpacing === 'relaxed'
        ? 'space-y-5'
        : 'space-y-4';
  const gridGapClass =
    contentSpacing === 'compact'
      ? 'gap-2'
      : contentSpacing === 'relaxed'
        ? 'gap-4'
        : 'gap-3';
  const captureCardBackgroundClass =
    contentCaptureBackground === 'white' ? 'bg-white' : 'bg-white/85';
  const secondaryPanelClass =
    contentCaptureBackground === 'white' ? 'bg-white' : 'bg-white/80';
  const imageAspectClass =
    contentCardAspect === '1_1'
      ? 'aspect-square'
      : contentCardAspect === '9_16'
        ? 'aspect-[9/16]'
        : 'aspect-[4/5]';
  const noteTypography = getDashboardContentNoteTypography(contentNoteScale);
  const boardScaleByFollower =
    contentFollowerScale === 'm' ? 1 : contentFollowerScale === 'xl' ? 1.24 : 1.12;
  const boardScaleByCanvas =
    contentCanvasRatio === '4_3' ? 1.08 : contentCanvasRatio === '13_9' ? 1 : 0.94;
  const boardScale = boardScaleByFollower * boardScaleByCanvas;
  const boardTitleSizePx = Math.round(20 * boardScale);
  const boardSubtitleSizePx = Math.round(14 * boardScale);
  const leaderboardRows = useMemo(() => {
    if (!overview) {
      return [];
    }

    const rows: CompetitorBoardRow[] = overview.items.map((item) => {
      const competitorWithOptionalLogo = item.competitor as typeof item.competitor & {
        logoUrl?: string | null;
        logoImageUrl?: string | null;
      };
      const competitorLogoUrl = normalizeOptionalUrl(
        competitorWithOptionalLogo.logoUrl ??
          competitorWithOptionalLogo.logoImageUrl ??
          item.competitor.websiteUrl
      );

      return {
        id: item.competitor.id,
        brandName: item.competitor.name,
        logoUrl: competitorLogoUrl,
        pageFollowers: item.monitoring.followerCount,
        monthlyPosts: item.monitoring.monthlyPostCount,
        isOwnBrand: false
      };
    });

    if (ownBrandSummary) {
      rows.push({
        id: ownBrandSummary.id,
        brandName: ownBrandSummary.name,
        logoUrl: normalizeOptionalUrl(ownBrandSummary.logoUrl),
        pageFollowers: ownBrandSummary.pageFollowers,
        monthlyPosts: ownBrandSummary.monthlyPosts,
        isOwnBrand: true
      });
    }

    return rows
      .sort((left, right) => {
        const leftValue = left.pageFollowers;
        const rightValue = right.pageFollowers;
        if (leftValue === null && rightValue === null) {
          return left.brandName.localeCompare(right.brandName);
        }
        if (leftValue === null) {
          return 1;
        }
        if (rightValue === null) {
          return -1;
        }
        if (rightValue !== leftValue) {
          return rightValue - leftValue;
        }
        return left.brandName.localeCompare(right.brandName);
      })
      .map((row, index) => ({
        ...row,
        rank: index + 1
      }));
  }, [overview, ownBrandSummary]);
  const boardRowCount = Math.max(leaderboardRows.length, 1);

  useEffect(() => {
    const target = boardCanvasRef.current;
    if (!target) {
      return;
    }

    const updateSize = () => {
      const nextWidth = target.clientWidth;
      const nextHeight = target.clientHeight;
      setBoardCanvasSize((current) => {
        const widthChanged = Math.abs(current.width - nextWidth) > 0.5;
        const heightChanged = Math.abs(current.height - nextHeight) > 0.5;
        return widthChanged || heightChanged
          ? { width: nextWidth, height: nextHeight }
          : current;
      });
    };

    updateSize();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateSize);
      return () => window.removeEventListener('resize', updateSize);
    }

    const observer = new ResizeObserver(() => updateSize());
    observer.observe(target);
    return () => observer.disconnect();
  }, [contentCanvasRatio, boardRowCount]);

  const boardMetrics = useMemo(() => {
    const ratioHeightFactor =
      contentCanvasRatio === '4_3' ? 3 / 4 : contentCanvasRatio === '13_9' ? 9 / 13 : 9 / 16;
    const resolvedWidth = boardCanvasSize.width > 0 ? boardCanvasSize.width : 1280;
    const resolvedHeight =
      boardCanvasSize.height > 0 ? boardCanvasSize.height : Math.round(resolvedWidth * ratioHeightFactor);
    const userScale = contentFollowerScale === 'm' ? 0.95 : contentFollowerScale === 'xl' ? 1.18 : 1.06;
    const canvasPaddingPx = Math.round(clampNumber(resolvedHeight * 0.016, 8, 22));
    const innerHeight = Math.max(260, resolvedHeight - canvasPaddingPx * 2);
    const headerRatio = boardRowCount <= 3 ? 0.2 : boardRowCount <= 5 ? 0.17 : 0.14;
    const headerHeightPx = clampNumber(Math.round(innerHeight * headerRatio), 52, Math.round(innerHeight * 0.28));
    const rowHeightPx = Math.max(36, Math.floor((innerHeight - headerHeightPx) / boardRowCount));
    const cellPaddingX = Math.round(clampNumber(resolvedWidth * 0.012, 8, 22));
    const headerFontPx = Math.round(
      clampNumber(Math.min(rowHeightPx * 0.3, resolvedWidth * 0.02) * userScale, 12, 34)
    );
    const cellFontPx = Math.round(
      clampNumber(Math.min(rowHeightPx * 0.34, resolvedWidth * 0.023) * userScale, 13, 40)
    );
    const numericFontPx = Math.round(
      clampNumber(Math.min(rowHeightPx * 0.44, resolvedWidth * 0.028) * userScale, 15, 48)
    );
    const logoSizePx = Math.round(
      clampNumber(
        Math.min(rowHeightPx * 0.8, resolvedWidth * 0.11) * userScale,
        40,
        Math.max(40, rowHeightPx - 10)
      )
    );
    const brandBadgeFontPx = Math.max(10, Math.round(cellFontPx * 0.56));

    return {
      canvasPaddingPx,
      headerHeightPx,
      rowHeightPx,
      cellPaddingX,
      headerFontPx,
      cellFontPx,
      numericFontPx,
      logoSizePx,
      brandBadgeFontPx
    };
  }, [boardCanvasSize.height, boardCanvasSize.width, boardRowCount, contentCanvasRatio, contentFollowerScale]);

  if (!overview) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-600">
        Competitor overview is unavailable for this month.
      </div>
    );
  }

  if (overview.items.length === 0 && !ownBrandSummary) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-600">
        No competitor assignment for this month.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <article className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <h3
              className="font-semibold text-slate-900"
              style={{
                fontSize: `${boardTitleSizePx}px`,
                lineHeight: `${Math.round(boardTitleSizePx * 1.22)}px`
              }}
            >
              Brand follower board
            </h3>
            <div
              className="text-slate-600"
              style={{
                fontSize: `${boardSubtitleSizePx}px`,
                lineHeight: `${Math.round(boardSubtitleSizePx * 1.35)}px`
              }}
            >
              Combined ranking of your brand and competitors for this month.
            </div>
          </div>
          <DashboardChartCopyButton targetId="dashboard-content-competitor-analysis-brand-board-canvas" />
        </div>

        <div
          className="mt-3 rounded-md border border-slate-200 bg-white p-2"
          style={{ backgroundColor: '#ffffff' }}
        >
          <div
            className={cn(
              'w-full overflow-hidden rounded-md border border-slate-200 bg-white',
              getDashboardContentCanvasAspectClass(contentCanvasRatio)
            )}
            id="dashboard-content-competitor-analysis-brand-board-canvas"
            ref={boardCanvasRef}
            style={{ backgroundColor: '#ffffff' }}
          >
            <div className="h-full w-full overflow-hidden bg-white" style={{ padding: `${boardMetrics.canvasPaddingPx}px` }}>
              <table className="h-full w-full table-fixed border-collapse text-left">
                <thead className="bg-slate-50 uppercase tracking-[0.08em] text-slate-600">
                  <tr style={{ height: `${boardMetrics.headerHeightPx}px` }}>
                    <th
                      className="border-b border-slate-200 font-semibold"
                      style={{
                        fontSize: `${boardMetrics.headerFontPx}px`,
                        lineHeight: `${Math.round(boardMetrics.headerFontPx * 1.2)}px`,
                        padding: `0 ${boardMetrics.cellPaddingX}px`,
                        width: '10%'
                      }}
                    >
                      Rank
                    </th>
                    <th
                      className="border-b border-slate-200 font-semibold"
                      style={{
                        fontSize: `${boardMetrics.headerFontPx}px`,
                        lineHeight: `${Math.round(boardMetrics.headerFontPx * 1.2)}px`,
                        padding: `0 ${boardMetrics.cellPaddingX}px`,
                        width: '14%'
                      }}
                    >
                      Logo
                    </th>
                    <th
                      className="border-b border-slate-200 font-semibold"
                      style={{
                        fontSize: `${boardMetrics.headerFontPx}px`,
                        lineHeight: `${Math.round(boardMetrics.headerFontPx * 1.2)}px`,
                        padding: `0 ${boardMetrics.cellPaddingX}px`,
                        width: '32%'
                      }}
                    >
                      Brand
                    </th>
                    <th
                      className="border-b border-slate-200 font-semibold"
                      style={{
                        fontSize: `${boardMetrics.headerFontPx}px`,
                        lineHeight: `${Math.round(boardMetrics.headerFontPx * 1.2)}px`,
                        padding: `0 ${boardMetrics.cellPaddingX}px`,
                        width: '24%'
                      }}
                    >
                      Page followers
                    </th>
                    <th
                      className="border-b border-slate-200 font-semibold"
                      style={{
                        fontSize: `${boardMetrics.headerFontPx}px`,
                        lineHeight: `${Math.round(boardMetrics.headerFontPx * 1.2)}px`,
                        padding: `0 ${boardMetrics.cellPaddingX}px`,
                        width: '20%'
                      }}
                    >
                      Monthly posts
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboardRows.map((row) => (
                    <tr className="border-b border-slate-200 last:border-0" key={row.id} style={{ height: `${boardMetrics.rowHeightPx}px` }}>
                      <td
                        className="font-semibold text-slate-700"
                        style={{
                          fontSize: `${boardMetrics.cellFontPx}px`,
                          lineHeight: `${Math.round(boardMetrics.cellFontPx * 1.2)}px`,
                          padding: `0 ${boardMetrics.cellPaddingX}px`
                        }}
                      >
                        {row.rank}
                      </td>
                      <td
                        style={{
                          padding: `0 ${boardMetrics.cellPaddingX}px`
                        }}
                      >
                        <BoardLogoCell
                          brandName={row.brandName}
                          fallbackFontPx={Math.round(boardMetrics.cellFontPx * 0.72)}
                          logoSizePx={boardMetrics.logoSizePx}
                          logoUrl={row.logoUrl}
                        />
                      </td>
                      <td
                        style={{
                          padding: `0 ${boardMetrics.cellPaddingX}px`
                        }}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className="truncate font-semibold text-slate-900"
                            style={{
                              fontSize: `${boardMetrics.cellFontPx}px`,
                              lineHeight: `${Math.round(boardMetrics.cellFontPx * 1.2)}px`
                            }}
                          >
                            {row.brandName}
                          </span>
                          {row.isOwnBrand ? (
                            <Badge
                              className={contentWhiteBadgeClassName}
                              style={{
                                fontSize: `${boardMetrics.brandBadgeFontPx}px`,
                                lineHeight: `${Math.max(14, Math.round(boardMetrics.brandBadgeFontPx * 1.3))}px`
                              }}
                              variant="outline"
                            >
                              Our brand
                            </Badge>
                          ) : null}
                        </div>
                      </td>
                      <td
                        className="font-bold text-slate-900"
                        style={{
                          fontSize: `${boardMetrics.numericFontPx}px`,
                          lineHeight: `${Math.round(boardMetrics.numericFontPx * 1.16)}px`,
                          padding: `0 ${boardMetrics.cellPaddingX}px`
                        }}
                      >
                        {formatMetricValue(row.pageFollowers)}
                      </td>
                      <td
                        className="font-bold text-slate-900"
                        style={{
                          fontSize: `${boardMetrics.numericFontPx}px`,
                          lineHeight: `${Math.round(boardMetrics.numericFontPx * 1.16)}px`,
                          padding: `0 ${boardMetrics.cellPaddingX}px`
                        }}
                      >
                        {formatMetricValue(row.monthlyPosts)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </article>

      {overview.items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-600">
          No competitor assignment for this month.
        </div>
      ) : null}

      {overview.items.map((item) => {
        const competitorCaptureTargetId = `dashboard-content-competitor-analysis-${item.competitor.id}`;
        const competitorCanvasTargetId = `${competitorCaptureTargetId}-canvas`;
        const postSlots = buildFivePostSlots({
          posts: item.monitoring.posts,
          fallbackNoActivityImageUrl: item.monitoring.noActivityEvidenceImageUrl
        });
        const currentFollower = item.monitoring.followerCount;
        const previousFollower = previousFollowerByCompetitorId.get(item.competitor.id) ?? null;
        const followerChange =
          currentFollower !== null && previousFollower !== null
            ? currentFollower - previousFollower
            : null;
        const highlightNote = normalizeHighlightNote(item.monitoring.highlightNote);
        const hasHighlightNote = highlightNote.length > 0;
        const filledPostSlots = postSlots.filter((slot): slot is PostSlot => slot !== null);
        const filledPostSlotCount = filledPostSlots.length;
        const hasAnyScreenshot = filledPostSlots.length > 0;
        const sourceLinks = filledPostSlots
          .filter((slot) => Boolean(slot.postUrl))
          .map((slot) => ({ order: slot.displayOrder, url: slot.postUrl as string }));

        return (
          <article
            className={cn('rounded-2xl border border-slate-200 bg-white', blockPaddingClass, sectionGapClass)}
            key={item.competitor.id}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <h3 className="text-base font-semibold">{item.competitor.name}</h3>
                <div className="text-sm text-slate-600">{item.competitor.primaryPlatform}</div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  {item.assignment.isRequired ? (
                    <Badge className={cn(contentWhiteBadgeClassName, badgeScaleClass)} variant="outline">
                      Required
                    </Badge>
                  ) : null}
                  <Badge className={cn(contentWhiteBadgeClassName, badgeScaleClass)} variant="outline">
                    {item.monitoring.status === 'no_activity' ? 'No activity' : 'Has posts'}
                  </Badge>
                </div>
                <DashboardChartCopyButton targetId={competitorCanvasTargetId} />
              </div>
            </div>

            {hasAnyScreenshot || hasHighlightNote ? (
              <div className={cn('rounded-2xl border border-slate-200 p-3', captureCardBackgroundClass)}>
                <div
                  className={cn(
                    'w-full rounded-2xl bg-white p-3',
                    getDashboardContentCanvasAspectClass(contentCanvasRatio)
                  )}
                  id={competitorCanvasTargetId}
                >
                  <div className="flex h-full flex-col gap-4">
                    <div
                      className={cn(
                        'shrink-0 grid gap-2 rounded-2xl border border-slate-200 px-3 py-2 sm:grid-cols-3',
                        secondaryPanelClass
                      )}
                    >
                      <div>
                        <div
                          className="font-medium uppercase tracking-[0.08em] text-slate-600"
                          style={{
                            fontSize: `${captureMetricLabelSizePx}px`,
                            lineHeight: `${captureMetricLabelLineHeightPx}px`
                          }}
                        >
                          Follower previous month
                        </div>
                        <div
                          className="mt-1 font-bold tracking-tight text-slate-900"
                          style={{
                            fontSize: `${captureMetricValueSizePx}px`,
                            lineHeight: `${captureMetricValueLineHeightPx}px`
                          }}
                        >
                          {formatMetricValue(previousFollower)}
                        </div>
                      </div>
                      <div>
                        <div
                          className="font-medium uppercase tracking-[0.08em] text-slate-600"
                          style={{
                            fontSize: `${captureMetricLabelSizePx}px`,
                            lineHeight: `${captureMetricLabelLineHeightPx}px`
                          }}
                        >
                          Follower this month
                        </div>
                        <div
                          className="mt-1 font-bold tracking-tight text-slate-900"
                          style={{
                            fontSize: `${captureMetricValueSizePx}px`,
                            lineHeight: `${captureMetricValueLineHeightPx}px`
                          }}
                        >
                          {formatMetricValue(currentFollower)}
                        </div>
                      </div>
                      <div>
                        <div
                          className="font-medium uppercase tracking-[0.08em] text-slate-600"
                          style={{
                            fontSize: `${captureMetricLabelSizePx}px`,
                            lineHeight: `${captureMetricLabelLineHeightPx}px`
                          }}
                        >
                          Change
                        </div>
                        <div
                          className="mt-1 font-bold tracking-tight text-slate-900"
                          style={{
                            fontSize: `${captureMetricValueSizePx}px`,
                            lineHeight: `${captureMetricValueLineHeightPx}px`
                          }}
                        >
                          {formatFollowerChange(followerChange)}
                        </div>
                      </div>
                    </div>

                    <div className="min-h-0 flex-1 pt-1">
                      <div className="flex h-full items-start justify-center">
                        {hasAnyScreenshot ? (
                          <div
                            className={cn('grid h-full max-w-full', gridGapClass)}
                            style={{
                              gridTemplateColumns: `repeat(${filledPostSlotCount}, minmax(0, 1fr))`,
                              width: `${Math.min(100, (filledPostSlotCount / 5) * 100)}%`
                            }}
                          >
                            {filledPostSlots.map((slot) => {
                              const protectedScreenshotUrl = toProtectedMediaUrl(
                                slot.screenshotUrl
                              );

                              return (
                                <div
                                  className={cn(
                                    'min-h-0 min-w-0 overflow-hidden rounded-[16px] border border-slate-200 bg-white',
                                    imageAspectClass
                                  )}
                                  key={slot.id}
                                >
                                  <img
                                    alt={`${item.competitor.name} post ${slot.displayOrder}`}
                                    className="h-full w-full object-contain object-top"
                                    loading="lazy"
                                    src={protectedScreenshotUrl ?? slot.screenshotUrl}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="flex h-full w-full items-center justify-center rounded-2xl border border-dashed border-slate-200 text-sm text-slate-500">
                            No screenshot evidence
                          </div>
                        )}
                      </div>
                    </div>

                    {hasHighlightNote ? (
                      <div className="shrink-0 self-stretch">
                        <div className="w-full min-w-0 rounded-2xl border border-slate-200 bg-white px-5 py-4">
                          <div
                            className="font-semibold text-slate-800"
                            style={{
                              fontSize: `${noteTypography.titleSizePx}px`,
                              lineHeight: `${noteTypography.titleLineHeightPx}px`
                            }}
                          >
                            Highlight note
                          </div>
                          <p
                            className="mt-2 whitespace-pre-wrap break-words text-slate-800"
                            style={{
                              fontSize: `${noteTypography.bodySizePx}px`,
                              lineHeight: `${noteTypography.bodyLineHeightPx}px`
                            }}
                          >
                            {highlightNote}
                          </p>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-600">
                No screenshot evidence in this month.
              </div>
            )}

            {contentShowSourceLink ? (
              sourceLinks.length > 0 ? (
                <div
                  className={cn(
                    'rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-700',
                    secondaryPanelClass
                  )}
                >
                  <div className="mb-1 font-medium text-slate-800">Source links</div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    {sourceLinks.map((link) => (
                      <a
                        className="text-primary hover:underline"
                        href={link.url}
                        key={`${item.competitor.id}-post-link-${link.order}`}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Post #{link.order}
                      </a>
                    ))}
                  </div>
                </div>
              ) : (
                <div
                  className={cn(
                    'rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-600',
                    secondaryPanelClass
                  )}
                >
                  No post URL from competitor evidence.
                </div>
              )
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
