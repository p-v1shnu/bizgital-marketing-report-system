import Link from 'next/link';
import {
  AlertCircle,
  BarChart3,
  Eye,
  FileBarChart2,
  Filter,
  Layers3,
  Megaphone,
  Palette,
  Package,
  Target,
  Users
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getAuthContext, getMembershipReportAccess } from '@/lib/auth';
import type {
  CompetitorOverviewResponse,
  QuestionOverviewResponse,
  ReportingListItem,
  TopContentOverviewResponse
} from '@/lib/reporting-api';
import {
  getBrand,
  getBrandKpiPlan,
  getCompetitorOverview,
  getDatasetOverview,
  getMetricsOverview,
  getQuestionOverview,
  getReportingPeriods,
  getTopContentOverview
} from '@/lib/reporting-api';
import {
  calculatePercentChange,
  formatChangePercent,
  formatSignedDelta,
  formatValue
} from '@/lib/format-metrics';
import { badgeToneForState, labelForState, monthLabel } from '@/lib/reporting-ui';

import {
  DashboardFollowersComparisonChart,
  type DashboardFollowersComparisonPoint
} from './dashboard-followers-comparison-chart';
import {
  DashboardGlobalKpiControls,
  DashboardGlobalKpiControlsProvider
} from './dashboard-global-kpi-controls';
import { DashboardContentLayout } from './dashboard-content-layout';
import {
  DashboardSingleMetricChart,
  type DashboardSingleMetricPoint
} from './dashboard-single-metric-chart';
import { DashboardChartCopyButton } from './dashboard-chart-copy-button';
import { DashboardCompetitorAnalysisSection } from './dashboard-competitor-analysis-section';
import {
  DashboardQuestionCategoryDistributionChart,
  type DashboardQuestionCategoryDistributionPoint
} from './dashboard-question-category-distribution-chart';
import {
  DashboardQuestionCategoryTrendChart,
  type DashboardQuestionCategoryTrendPoint,
  type DashboardQuestionCategoryTrendSeries
} from './dashboard-question-category-trend-chart';
import { DashboardTitleWithKpi } from './dashboard-title-with-kpi';
import { DashboardQuestionHighlightsCanvas } from './dashboard-question-highlights-canvas';
import { DashboardTopPostsSection } from './dashboard-top-posts-section';
import { EngagementVideoChart, type EngagementVideoChartPoint } from './engagement-video-chart';
import { DashboardContentPreviewScale } from './dashboard-content-preview-scale';
import { DashboardRemarkCopyButton } from './dashboard-remark-copy-button';
import { DashboardContentPeriodPicker } from './dashboard-content-period-picker';

type DashboardPageProps = {
  params: Promise<{
    brandId: string;
  }>;
  searchParams?: Promise<{
    startYear?: string;
    startMonth?: string;
    endYear?: string;
    endMonth?: string;
    includeSubmittedPreview?: string;
    view?: string;
    selectedPeriodId?: string;
  }>;
};

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const selectClassName =
  'flex h-11 w-full rounded-2xl border border-input bg-background/70 px-4 py-2 text-sm text-foreground shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring/60';
const chartCardClassName =
  'border-slate-200 bg-white text-slate-900 shadow-sm dark:border-slate-200 dark:bg-white dark:text-slate-900';
const contentWhiteBadgeClassName =
  'border-slate-300 bg-slate-100 text-slate-800 dark:border-slate-300 dark:bg-slate-100 dark:text-slate-800';
const contentSurfaceCardClassName =
  'rounded-xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-4';
const questionTrendColors = [
  '#10b981',
  '#f59e0b',
  '#3b82f6',
  '#8b5cf6',
  '#f97316',
  '#14b8a6',
  '#ef4444',
  '#6366f1'
];
const dashboardViewTabs = ['charts', 'content'] as const;
type DashboardViewTab = (typeof dashboardViewTabs)[number];
type DashboardRemarkMetricKey = 'views' | 'viewers' | 'engagement' | 'video_views_3s';
type DashboardRemarkMetricItem = {
  key: DashboardRemarkMetricKey;
  label: string;
  remark: string | null;
  requiresRemark: boolean;
  requirementDetail: string;
  currentValue: number | null;
  previousValue: number | null;
  hasPreviousValue: boolean;
  changePercent: number | null;
};

const dashboardRemarkMetricOrder: DashboardRemarkMetricKey[] = [
  'views',
  'viewers',
  'engagement',
  'video_views_3s'
];

function clampMonth(month: number) {
  return Math.min(Math.max(month, 1), 12);
}

function clampYear(year: number, minYear: number, maxYear: number) {
  return Math.min(Math.max(year, minYear), maxYear);
}

function toPeriodSerial(year: number, month: number) {
  return year * 12 + month;
}

function monthOnlyLabel(month: number) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long'
  }).format(new Date(Date.UTC(2000, month - 1, 1)));
}

type DashboardSourceState = 'approved' | 'submitted_preview';

type DashboardMetricValues = {
  views: number | null;
  engagement: number | null;
  video_views_3s: number | null;
  page_followers: number | null;
};

function getApprovedSnapshotMetric(
  item: ReportingListItem,
  key: 'engagement' | 'video_views_3s' | 'views' | 'page_followers' | 'viewers'
) {
  const metric = item.approvedSnapshot?.items.find(snapshotItem => snapshotItem.key === key);
  return metric?.value ?? null;
}

function monthShortLabel(year: number, month: number) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric'
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

type GoalMetricKey =
  | 'engagement'
  | 'video_views_3s'
  | 'views'
  | 'viewers'
  | 'page_followers'
  | 'page_visit';

const GOAL_METRIC_ALIASES: Record<GoalMetricKey, string[]> = {
  views: ['views'],
  viewers: ['viewers'],
  engagement: ['engagement'],
  video_views_3s: [
    'video_views_3s',
    '3_second_video_views',
    '3s_video_views',
    'three_second_video_views'
  ],
  page_followers: ['page_followers', 'page_follower', 'followers'],
  page_visit: ['page_visit', 'page_visits', 'page_views']
};

function parseNumericText(value: string | null | undefined) {
  if (value == null) {
    return null;
  }

  const sanitized = String(value).replace(/,/g, '').trim();
  if (!sanitized) {
    return null;
  }

  const parsed = Number(sanitized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeMetricToken(value: string | null | undefined) {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function scoreMetricsItemForGoalMetric(
  item: Awaited<ReturnType<typeof getMetricsOverview>>['items'][number],
  goalMetric: Exclude<GoalMetricKey, 'page_visit'>
) {
  const aliases = GOAL_METRIC_ALIASES[goalMetric];
  const canonical = normalizeMetricToken(item.canonicalMetricKey);
  const key = normalizeMetricToken(item.key);
  const label = normalizeMetricToken(item.label);
  const sourceLabel = normalizeMetricToken(item.sourceLabel);
  let score = 0;

  for (const alias of aliases) {
    const normalizedAlias = normalizeMetricToken(alias);
    if (canonical === normalizedAlias) {
      score = Math.max(score, 140);
    }
    if (key === normalizedAlias) {
      score = Math.max(score, 130);
    }
    if (label === normalizedAlias || sourceLabel === normalizedAlias) {
      score = Math.max(score, 120);
    }
  }

  return score;
}

function getMetricsActualValue(
  items: Awaited<ReturnType<typeof getMetricsOverview>>['items'],
  goalMetric: Exclude<GoalMetricKey, 'page_visit'>
) {
  const ranked = items
    .map((item, index) => ({
      item,
      index,
      score: scoreMetricsItemForGoalMetric(item, goalMetric)
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      const leftHasActual = left.item.actualValue !== null && left.item.actualValue !== undefined;
      const rightHasActual =
        right.item.actualValue !== null && right.item.actualValue !== undefined;
      if (leftHasActual !== rightHasActual) {
        return rightHasActual ? 1 : -1;
      }

      if (right.item.rowCoverage !== left.item.rowCoverage) {
        return right.item.rowCoverage - left.item.rowCoverage;
      }

      return left.index - right.index;
    });

  const best = ranked[0]?.item ?? null;
  return best?.actualValue ?? null;
}

function getDashboardSourceState(
  item: ReportingListItem,
  includeSubmittedPreview: boolean
): DashboardSourceState | null {
  if (includeSubmittedPreview && item.latestVersionState === 'submitted') {
    return 'submitted_preview';
  }
  if (item.latestVersionState === 'approved') {
    return 'approved';
  }

  return null;
}

function parseDashboardView(value: string | undefined): DashboardViewTab {
  const normalizedValue = (value ?? '').toLowerCase().trim();
  if (dashboardViewTabs.includes(normalizedValue as DashboardViewTab)) {
    return normalizedValue as DashboardViewTab;
  }

  return 'charts';
}

function statusLabelForDashboardSource(sourceState: DashboardSourceState | null) {
  if (sourceState === 'submitted_preview') {
    return 'Submitted (Preview)';
  }
  if (sourceState === 'approved') {
    return 'Approved';
  }

  return 'No published data';
}

function getChangeToneClassName(changePercent: number | null) {
  if (changePercent === null || Number.isNaN(changePercent) || changePercent === 0) {
    return 'text-slate-600';
  }

  if (changePercent > 0) {
    return 'text-emerald-700';
  }

  return 'text-rose-700';
}

function buildDashboardHref(
  brandId: string,
  input: {
    startYear: number;
    startMonth: number;
    endYear: number;
    endMonth: number;
    includeSubmittedPreview: boolean;
    view: DashboardViewTab;
    selectedPeriodId?: string | null;
  }
) {
  const query = new URLSearchParams();
  query.set('startYear', String(input.startYear));
  query.set('startMonth', String(input.startMonth));
  query.set('endYear', String(input.endYear));
  query.set('endMonth', String(input.endMonth));
  query.set('view', input.view);

  if (input.includeSubmittedPreview) {
    query.set('includeSubmittedPreview', '1');
  }

  if (input.selectedPeriodId && input.selectedPeriodId.trim().length > 0) {
    query.set('selectedPeriodId', input.selectedPeriodId.trim());
  }

  return `/app/${brandId}/dashboard?${query.toString()}`;
}

function scoreKpiPlanItemForGoalMetric(
  item: Awaited<ReturnType<typeof getBrandKpiPlan>>['items'][number],
  goalMetric: GoalMetricKey
) {
  const aliases = GOAL_METRIC_ALIASES[goalMetric];
  const canonical = normalizeMetricToken(item.kpi.canonicalMetricKey);
  const key = normalizeMetricToken(item.kpi.key);
  const label = normalizeMetricToken(item.kpi.label);
  const formulaLabel = normalizeMetricToken(item.kpi.formulaLabel);
  const formulaSource = item.kpi.sourceType === 'formula_column';

  let score = 0;

  for (const alias of aliases) {
    const normalizedAlias = normalizeMetricToken(alias);
    const canonicalMatch = canonical === normalizedAlias;
    const keyMatch = key === normalizedAlias;
    const labelMatch = label === normalizedAlias;
    const formulaLabelMatch = formulaLabel === normalizedAlias;

    if (canonicalMatch) {
      score = Math.max(score, 140);
    }
    if (keyMatch) {
      score = Math.max(score, formulaSource ? 135 : 130);
    }
    if (labelMatch || formulaLabelMatch) {
      score = Math.max(score, formulaSource ? 125 : 120);
    }
  }

  return score;
}

function getGoalTargetValue(
  plan: Awaited<ReturnType<typeof getBrandKpiPlan>>,
  goalMetric: GoalMetricKey
) {
  const scored = plan.items
    .map((item, index) => ({
      item,
      index,
      score: scoreKpiPlanItemForGoalMetric(item, goalMetric)
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      const leftHasTarget = left.item.targetValue !== null && left.item.targetValue !== undefined;
      const rightHasTarget = right.item.targetValue !== null && right.item.targetValue !== undefined;

      if (leftHasTarget !== rightHasTarget) {
        return rightHasTarget ? 1 : -1;
      }

      if (left.item.sortOrder !== right.item.sortOrder) {
        return left.item.sortOrder - right.item.sortOrder;
      }

      return left.index - right.index;
    });

  const best = scored[0]?.item ?? null;
  return best?.targetValue ?? null;
}

export default async function DashboardPage({
  params,
  searchParams
}: DashboardPageProps) {
  const { brandId } = await params;
  const authContext = await getAuthContext();
  const currentMembership =
    authContext.user?.memberships.find((membership) => membership.brandCode === brandId) ?? null;
  const canToggleSubmittedPreview = getMembershipReportAccess(currentMembership).canApproveReports;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const currentDate = new Date();
  const currentYear = currentDate.getUTCFullYear();
  const currentMonth = currentDate.getUTCMonth() + 1;

  let brandDisplayName = brandId;
  let brandCode = brandId;
  let brandLogoUrl: string | null = null;
  let loadError: string | null = null;
  let items: ReportingListItem[] = [];
  let kpiGoalTargets: Array<{
    year: number;
    goals: Record<GoalMetricKey, number | null>;
  }> = [];

  try {
    const reportingData = await getReportingPeriods(brandId);
    brandDisplayName = reportingData.brand.name;
    brandCode = reportingData.brand.code;
    const brandDetails = await getBrand(reportingData.brand.code).catch(() => null);
    brandLogoUrl = brandDetails?.logoUrl ?? null;
    items = reportingData.items;
  } catch (error) {
    loadError =
      error instanceof Error
        ? error.message
        : 'Failed to load dashboard data from the backend.';
  }

  const availableYears = Array.from(new Set(items.map((item) => item.year)))
    .sort((left, right) => left - right);
  if (availableYears.length === 0) {
    availableYears.push(currentYear);
  }

  const minAvailableYear = availableYears[0] ?? currentYear;
  const maxAvailableYear = availableYears[availableYears.length - 1] ?? currentYear;
  const timelineItems = [...items].sort((left, right) => {
    if (left.year !== right.year) {
      return left.year - right.year;
    }
    return left.month - right.month;
  });
  const latestTimelineItem = timelineItems[timelineItems.length - 1] ?? null;
  const defaultEndYear = latestTimelineItem?.year ?? currentYear;
  const defaultEndMonth = latestTimelineItem?.month ?? currentMonth;
  const defaultStartDate = new Date(Date.UTC(defaultEndYear, defaultEndMonth - 3, 1));
  const defaultStartYear = defaultStartDate.getUTCFullYear();
  const defaultStartMonth = defaultStartDate.getUTCMonth() + 1;

  const parsedStartYear = Number(resolvedSearchParams?.startYear);
  const parsedStartMonth = Number(resolvedSearchParams?.startMonth);
  const parsedEndYear = Number(resolvedSearchParams?.endYear);
  const parsedEndMonth = Number(resolvedSearchParams?.endMonth);
  const includeSubmittedPreviewParam = (resolvedSearchParams?.includeSubmittedPreview ?? '')
    .toLowerCase()
    .trim();
  const includeSubmittedPreview =
    canToggleSubmittedPreview &&
    ['1', 'true', 'yes', 'on'].includes(includeSubmittedPreviewParam);
  const dashboardView = parseDashboardView(resolvedSearchParams?.view);
  const selectedPeriodIdParam = resolvedSearchParams?.selectedPeriodId?.trim() ?? '';
  const hasLegacyMonthOnlyFilter =
    !resolvedSearchParams?.startYear &&
    !resolvedSearchParams?.endYear &&
    (Number.isFinite(parsedStartMonth) || Number.isFinite(parsedEndMonth));

  const requestedStartYear = Number.isFinite(parsedStartYear)
    ? parsedStartYear
    : hasLegacyMonthOnlyFilter
      ? defaultEndYear
      : defaultStartYear;
  const requestedEndYear = Number.isFinite(parsedEndYear) ? parsedEndYear : defaultEndYear;
  const requestedStartMonth = Number.isFinite(parsedStartMonth)
    ? clampMonth(parsedStartMonth)
    : defaultStartMonth;
  const requestedEndMonth = Number.isFinite(parsedEndMonth)
    ? clampMonth(parsedEndMonth)
    : defaultEndMonth;

  const boundedStartYear = clampYear(requestedStartYear, minAvailableYear, maxAvailableYear);
  const boundedEndYear = clampYear(requestedEndYear, minAvailableYear, maxAvailableYear);

  const startPeriodSerial = toPeriodSerial(boundedStartYear, requestedStartMonth);
  const endPeriodSerial = toPeriodSerial(boundedEndYear, requestedEndMonth);
  const normalizedStartSerial = Math.min(startPeriodSerial, endPeriodSerial);
  const normalizedEndSerial = Math.max(startPeriodSerial, endPeriodSerial);

  const resolvedStartYear = Math.floor((normalizedStartSerial - 1) / 12);
  const resolvedStartMonth = normalizedStartSerial - resolvedStartYear * 12;
  const resolvedEndYear = Math.floor((normalizedEndSerial - 1) / 12);
  const resolvedEndMonth = normalizedEndSerial - resolvedEndYear * 12;

  const filteredItems = items
    .filter((item) => {
      const serial = toPeriodSerial(item.year, item.month);
      return serial >= normalizedStartSerial && serial <= normalizedEndSerial;
    })
    .sort((left, right) => {
      if (left.year !== right.year) {
        return right.year - left.year;
      }
      return right.month - left.month;
    });
  const approvedItems = filteredItems.filter(
    (item) => getDashboardSourceState(item, false) === 'approved'
  );
  const dashboardVisibleItems = filteredItems.filter(
    (item) => getDashboardSourceState(item, includeSubmittedPreview) !== null
  );
  const submittedPreviewItems = dashboardVisibleItems.filter(
    (item) => getDashboardSourceState(item, includeSubmittedPreview) === 'submitted_preview'
  );
  const activeItems = filteredItems.filter((item) => item.currentState !== 'not_started');
  const dashboardItemsForChart = [...dashboardVisibleItems].sort((left, right) => {
    if (left.year !== right.year) {
      return left.year - right.year;
    }
    return left.month - right.month;
  });
  const selectedContentPeriod =
    filteredItems.find((item) => item.id === selectedPeriodIdParam) ?? filteredItems[0] ?? null;
  const selectedContentSourceState = selectedContentPeriod
    ? getDashboardSourceState(selectedContentPeriod, includeSubmittedPreview)
    : null;
  const selectedContentPeriodLabel = selectedContentPeriod
    ? monthLabel(selectedContentPeriod.year, selectedContentPeriod.month)
    : null;
  const chartsTabHref = buildDashboardHref(brandId, {
    startYear: resolvedStartYear,
    startMonth: resolvedStartMonth,
    endYear: resolvedEndYear,
    endMonth: resolvedEndMonth,
    includeSubmittedPreview,
    view: 'charts',
    selectedPeriodId: selectedContentPeriod?.id ?? null
  });
  const contentTabHref = buildDashboardHref(brandId, {
    startYear: resolvedStartYear,
    startMonth: resolvedStartMonth,
    endYear: resolvedEndYear,
    endMonth: resolvedEndMonth,
    includeSubmittedPreview,
    view: 'content',
    selectedPeriodId: selectedContentPeriod?.id ?? null
  });
  const periodEnhancements = await Promise.all(
    dashboardItemsForChart.map(async (item) => {
      const [datasetOverview, competitorOverview] = await Promise.all([
        getDatasetOverview(brandId, item.id).catch(() => null),
        getCompetitorOverview(brandId, item.id).catch(() => null)
      ]);

      const pageFollowers = parseNumericText(datasetOverview?.manualHeader.pageFollowers);
      const viewers = parseNumericText(datasetOverview?.manualHeader.viewers);
      const pageVisit = parseNumericText(datasetOverview?.manualHeader.pageVisit);
      const competitorFollowerValues =
        competitorOverview?.items
          .map((entry) => entry.monitoring.followerCount)
          .filter((value): value is number => value !== null && Number.isFinite(value)) ?? [];
      const competitorsFollowersAverage =
        competitorFollowerValues.length > 0
          ? competitorFollowerValues.reduce((sum, value) => sum + value, 0) /
            competitorFollowerValues.length
          : null;

      return {
        periodId: item.id,
        pageFollowers,
        viewers,
        pageVisit,
        metricCommentaryIsFirstReportingMonth:
          datasetOverview?.metricCommentary.isFirstReportingMonth ?? false,
        metricCommentaryFirstMonthDefaultRemark:
          datasetOverview?.metricCommentary.firstMonthDefaultRemark ?? '',
        metricCommentaryItems:
          datasetOverview?.metricCommentary.items.map((metric) => ({
            key: metric.key,
            label: metric.label,
            remark: metric.remark,
            requiresRemark: metric.requiresRemark,
            requirementDetail: metric.requirementDetail,
            currentValue: metric.currentValue,
            previousValue: metric.previousValue,
            hasPreviousValue: metric.hasPreviousValue,
            changePercent: metric.changePercent
          })) ?? null,
        contentCountPreview:
          datasetOverview?.contentCount.preview?.countedContentCount ?? null,
        contentCountApprovedSnapshot:
          datasetOverview?.contentCount.approvedSnapshot?.countedContentCount ?? null,
        competitorsFollowersAverage
      };
    })
  );
  const enhancementByPeriodId = new Map(
    periodEnhancements.map((entry) => [entry.periodId, entry] as const)
  );

  const submittedMetricValues = await Promise.all(
    submittedPreviewItems.map(async (item) => {
      const metricsOverview = await getMetricsOverview(brandId, item.id).catch(() => null);

      const values: DashboardMetricValues = {
        views: metricsOverview
          ? getMetricsActualValue(metricsOverview.items, 'views') ??
            metricsOverview.dashboardValues.views
          : null,
        engagement: metricsOverview
          ? getMetricsActualValue(metricsOverview.items, 'engagement')
            ?? metricsOverview.dashboardValues.engagement
          : null,
        video_views_3s: metricsOverview
          ? getMetricsActualValue(metricsOverview.items, 'video_views_3s')
            ?? metricsOverview.dashboardValues.video_views_3s
          : null,
        page_followers: metricsOverview
          ? getMetricsActualValue(metricsOverview.items, 'page_followers')
            ?? metricsOverview.dashboardValues.page_followers
          : null
      };

      return {
        periodId: item.id,
        values
      };
    })
  );
  const submittedMetricValuesByPeriodId = new Map(
    submittedMetricValues.map((entry) => [entry.periodId, entry.values] as const)
  );
  const resolvePageFollowersValue = (item: ReportingListItem | null) => {
    if (!item) {
      return null;
    }

    const sourceState = getDashboardSourceState(item, includeSubmittedPreview) ?? 'approved';
    const submittedValues = submittedMetricValuesByPeriodId.get(item.id);
    const enhancement = enhancementByPeriodId.get(item.id);
    const snapshotValue = getApprovedSnapshotMetric(item, 'page_followers');

    return sourceState === 'submitted_preview'
      ? submittedValues?.page_followers ?? enhancement?.pageFollowers ?? null
      : snapshotValue ?? enhancement?.pageFollowers ?? null;
  };
  const resolvePageVisitValue = (item: ReportingListItem | null) => {
    if (!item) {
      return null;
    }

    const enhancement = enhancementByPeriodId.get(item.id);
    return enhancement?.pageVisit ?? null;
  };
  const resolveContentCountValue = (item: ReportingListItem | null) => {
    if (!item) {
      return null;
    }

    const sourceState = getDashboardSourceState(item, includeSubmittedPreview) ?? 'approved';
    const enhancement = enhancementByPeriodId.get(item.id);

    return sourceState === 'submitted_preview'
      ? enhancement?.contentCountPreview ?? enhancement?.contentCountApprovedSnapshot ?? null
      : enhancement?.contentCountApprovedSnapshot ?? enhancement?.contentCountPreview ?? null;
  };

  const chartPoints: EngagementVideoChartPoint[] = dashboardItemsForChart.map((item) => {
    const sourceState = getDashboardSourceState(item, includeSubmittedPreview) ?? 'approved';
    const submittedValues = submittedMetricValuesByPeriodId.get(item.id);
    const engagement =
      sourceState === 'submitted_preview'
        ? submittedValues?.engagement ?? null
        : getApprovedSnapshotMetric(item, 'engagement');
    const videoViews3s =
      sourceState === 'submitted_preview'
        ? submittedValues?.video_views_3s ?? null
        : getApprovedSnapshotMetric(item, 'video_views_3s');
    const engagementValue = engagement ?? 0;
    const videoViews3sValue = videoViews3s ?? 0;
    const total = engagementValue + videoViews3sValue;

    return {
      id: item.id,
      year: item.year,
      month: item.month,
      label: monthShortLabel(item.year, item.month),
      monthYearLabel: monthLabel(item.year, item.month),
      engagementValue,
      videoViews3sValue,
      engagementMissing: engagement === null,
      videoViews3sMissing: videoViews3s === null,
      total,
      statusLabel: sourceState === 'submitted_preview' ? 'Submitted (Preview)' : 'Approved'
    };
  });
  const totalViewsPoints: DashboardSingleMetricPoint[] = dashboardItemsForChart.map((item) => {
    const sourceState = getDashboardSourceState(item, includeSubmittedPreview) ?? 'approved';
    const submittedValues = submittedMetricValuesByPeriodId.get(item.id);
    return {
      id: item.id,
      year: item.year,
      month: item.month,
      label: monthShortLabel(item.year, item.month),
      monthYearLabel: monthLabel(item.year, item.month),
      value:
        sourceState === 'submitted_preview'
          ? submittedValues?.views ?? 0
          : getApprovedSnapshotMetric(item, 'views') ?? 0,
      statusLabel: sourceState === 'submitted_preview' ? 'Submitted (Preview)' : 'Approved'
    };
  });
  const totalVideo3sPoints: DashboardSingleMetricPoint[] = dashboardItemsForChart.map((item) => {
    const sourceState = getDashboardSourceState(item, includeSubmittedPreview) ?? 'approved';
    const submittedValues = submittedMetricValuesByPeriodId.get(item.id);
    return {
      id: item.id,
      year: item.year,
      month: item.month,
      label: monthShortLabel(item.year, item.month),
      monthYearLabel: monthLabel(item.year, item.month),
      value:
        sourceState === 'submitted_preview'
          ? submittedValues?.video_views_3s ?? 0
          : getApprovedSnapshotMetric(item, 'video_views_3s') ?? 0,
      statusLabel: sourceState === 'submitted_preview' ? 'Submitted (Preview)' : 'Approved'
    };
  });
  const totalViewersPoints: DashboardSingleMetricPoint[] = dashboardItemsForChart.map((item) => {
    const sourceState = getDashboardSourceState(item, includeSubmittedPreview) ?? 'approved';
    const enhancement = enhancementByPeriodId.get(item.id);
    const snapshotValue = getApprovedSnapshotMetric(item, 'viewers');
    return {
      id: item.id,
      year: item.year,
      month: item.month,
      label: monthShortLabel(item.year, item.month),
      monthYearLabel: monthLabel(item.year, item.month),
      value: sourceState === 'submitted_preview' ? enhancement?.viewers ?? 0 : snapshotValue ?? enhancement?.viewers ?? 0,
      statusLabel: sourceState === 'submitted_preview' ? 'Submitted (Preview)' : 'Approved'
    };
  });
  const totalEngagementPoints: DashboardSingleMetricPoint[] = dashboardItemsForChart.map((item) => {
    const sourceState = getDashboardSourceState(item, includeSubmittedPreview) ?? 'approved';
    const submittedValues = submittedMetricValuesByPeriodId.get(item.id);
    return {
      id: item.id,
      year: item.year,
      month: item.month,
      label: monthShortLabel(item.year, item.month),
      monthYearLabel: monthLabel(item.year, item.month),
      value:
        sourceState === 'submitted_preview'
          ? submittedValues?.engagement ?? 0
          : getApprovedSnapshotMetric(item, 'engagement') ?? 0,
      statusLabel: sourceState === 'submitted_preview' ? 'Submitted (Preview)' : 'Approved'
    };
  });
  const pageFollowersPoints: DashboardSingleMetricPoint[] = dashboardItemsForChart.map((item) => {
    const sourceState = getDashboardSourceState(item, includeSubmittedPreview) ?? 'approved';
    const submittedValues = submittedMetricValuesByPeriodId.get(item.id);
    const enhancement = enhancementByPeriodId.get(item.id);
    const snapshotValue = getApprovedSnapshotMetric(item, 'page_followers');
    return {
      id: item.id,
      year: item.year,
      month: item.month,
      label: monthShortLabel(item.year, item.month),
      monthYearLabel: monthLabel(item.year, item.month),
      value:
        sourceState === 'submitted_preview'
          ? submittedValues?.page_followers ?? enhancement?.pageFollowers ?? 0
          : snapshotValue ?? enhancement?.pageFollowers ?? 0,
      statusLabel: sourceState === 'submitted_preview' ? 'Submitted (Preview)' : 'Approved'
    };
  });
  const pageVisitPoints: DashboardSingleMetricPoint[] = dashboardItemsForChart.map((item) => {
    const sourceState = getDashboardSourceState(item, includeSubmittedPreview) ?? 'approved';
    const enhancement = enhancementByPeriodId.get(item.id);
    return {
      id: item.id,
      year: item.year,
      month: item.month,
      label: monthShortLabel(item.year, item.month),
      monthYearLabel: monthLabel(item.year, item.month),
      value: enhancement?.pageVisit ?? 0,
      statusLabel: sourceState === 'submitted_preview' ? 'Submitted (Preview)' : 'Approved'
    };
  });
  const followersComparisonPoints: DashboardFollowersComparisonPoint[] = dashboardItemsForChart.map(
    (item) => {
      const sourceState = getDashboardSourceState(item, includeSubmittedPreview) ?? 'approved';
      const submittedValues = submittedMetricValuesByPeriodId.get(item.id);
      const enhancement = enhancementByPeriodId.get(item.id);
      const brandFollowers =
        sourceState === 'submitted_preview'
          ? submittedValues?.page_followers ?? enhancement?.pageFollowers ?? 0
          : getApprovedSnapshotMetric(item, 'page_followers') ?? enhancement?.pageFollowers ?? 0;
      return {
        id: item.id,
        year: item.year,
        month: item.month,
        label: monthShortLabel(item.year, item.month),
        monthYearLabel: monthLabel(item.year, item.month),
        brandFollowers,
        competitorsFollowers: enhancement?.competitorsFollowersAverage ?? 0,
        statusLabel: sourceState === 'submitted_preview' ? 'Submitted (Preview)' : 'Approved'
      };
    }
  );
  const totalViewsValue = totalViewsPoints.reduce((sum, point) => sum + point.value, 0);
  const totalViewersValue = totalViewersPoints.reduce((sum, point) => sum + point.value, 0);
  const totalVideo3sValue = totalVideo3sPoints.reduce((sum, point) => sum + point.value, 0);
  const totalEngagementValue = totalEngagementPoints.reduce((sum, point) => sum + point.value, 0);
  const totalPageFollowersValue = pageFollowersPoints.reduce((sum, point) => sum + point.value, 0);
  const totalPageVisitsValue = pageVisitPoints.reduce((sum, point) => sum + point.value, 0);
  const totalFollowersComparisonValue = followersComparisonPoints.reduce(
    (sum, point) => sum + point.brandFollowers,
    0
  );
  const monthsMissingMetrics = chartPoints
    .filter(point => point.engagementMissing || point.videoViews3sMissing)
    .map(point => point.label);
  const latestApprovedItem = [...items]
    .filter((item) => item.currentApprovedVersionId)
    .sort((left, right) => {
      if (left.year !== right.year) {
        return right.year - left.year;
      }

      return right.month - left.month;
    })[0] ?? null;

  const kpiGoalYears = Array.from(
    new Set([currentYear - 1, currentYear, currentYear + 1, ...items.map((item) => item.year)])
  ).sort((left, right) => left - right);

  if (!loadError && kpiGoalYears.length > 0) {
    const plans = await Promise.all(
      kpiGoalYears.map(async (year) => {
        try {
          const plan = await getBrandKpiPlan(brandCode, year);

          return {
            year,
            goals: {
              views: getGoalTargetValue(plan, 'views'),
              viewers: getGoalTargetValue(plan, 'viewers'),
              video_views_3s: getGoalTargetValue(plan, 'video_views_3s'),
              engagement: getGoalTargetValue(plan, 'engagement'),
              page_followers: getGoalTargetValue(plan, 'page_followers'),
              page_visit: getGoalTargetValue(plan, 'page_visit')
            }
          };
        } catch {
          return {
            year,
            goals: {
              views: null,
              viewers: null,
              video_views_3s: null,
              engagement: null,
              page_followers: null,
              page_visit: null
            }
          };
        }
      })
    );

    kpiGoalTargets = plans;
  }

  const viewsGoalByYear = kpiGoalTargets.map((item) => ({
    year: item.year,
    value: item.goals.views
  }));
  const videoViews3sGoalByYear = kpiGoalTargets.map((item) => ({
    year: item.year,
    value: item.goals.video_views_3s
  }));
  const viewersGoalByYear = kpiGoalTargets.map((item) => ({
    year: item.year,
    value: item.goals.viewers
  }));
  const engagementGoalByYear = kpiGoalTargets.map((item) => ({
    year: item.year,
    value: item.goals.engagement
  }));
  const pageFollowersGoalByYear = kpiGoalTargets.map((item) => ({
    year: item.year,
    value: item.goals.page_followers
  }));
  let selectedTopContentOverview: TopContentOverviewResponse | null = null;
  let selectedQuestionOverview: QuestionOverviewResponse | null = null;
  let selectedCompetitorOverview: CompetitorOverviewResponse | null = null;
  let selectedRemarkItems: DashboardRemarkMetricItem[] | null = null;
  let selectedIsFirstReportingMonth = false;
  let selectedFirstMonthDefaultRemark = '';
  let selectedContentLoadErrors: string[] = [];
  let previousVisiblePeriodLabel: string | null = null;
  let previousFollowerByCompetitorId = new Map<string, number | null>();
  let questionTrendPoints: DashboardQuestionCategoryTrendPoint[] = [];
  let questionTrendSeries: DashboardQuestionCategoryTrendSeries[] = [];
  let questionTrendLoadFailedCount = 0;

  if (dashboardView === 'content' && selectedContentPeriod && selectedContentSourceState !== null) {
    const previousCalendarYear =
      selectedContentPeriod.month === 1
        ? selectedContentPeriod.year - 1
        : selectedContentPeriod.year;
    const previousCalendarMonth =
      selectedContentPeriod.month === 1 ? 12 : selectedContentPeriod.month - 1;
    previousVisiblePeriodLabel = monthLabel(previousCalendarYear, previousCalendarMonth);
    const previousCalendarPeriod =
      items.find(
        (item) =>
          item.year === previousCalendarYear && item.month === previousCalendarMonth
      ) ?? null;
    const previousVisiblePeriod =
      previousCalendarPeriod &&
      getDashboardSourceState(previousCalendarPeriod, includeSubmittedPreview) !== null
        ? previousCalendarPeriod
        : null;
    const selectedEnhancement = enhancementByPeriodId.get(selectedContentPeriod.id);
    selectedIsFirstReportingMonth = selectedEnhancement?.metricCommentaryIsFirstReportingMonth ?? false;
    selectedFirstMonthDefaultRemark =
      selectedEnhancement?.metricCommentaryFirstMonthDefaultRemark ?? '';
    selectedRemarkItems = selectedEnhancement?.metricCommentaryItems ?? null;
    const selectedContentReportVersionId =
      selectedContentSourceState === 'submitted_preview'
        ? selectedContentPeriod.latestVersionId
        : selectedContentPeriod.currentApprovedVersionId;

    const [topResult, questionResult, competitorResult, previousCompetitorResult] =
      await Promise.allSettled([
        getTopContentOverview(brandId, selectedContentPeriod.id, {
          reportVersionId: selectedContentReportVersionId
        }),
        getQuestionOverview(brandId, selectedContentPeriod.id),
        getCompetitorOverview(brandId, selectedContentPeriod.id),
        previousVisiblePeriod
          ? getCompetitorOverview(brandId, previousVisiblePeriod.id)
          : Promise.resolve(null)
      ]);

    if (topResult.status === 'fulfilled') {
      selectedTopContentOverview = topResult.value;
    } else {
      selectedContentLoadErrors.push('Top posts');
    }

    if (questionResult.status === 'fulfilled') {
      selectedQuestionOverview = questionResult.value;
    } else {
      selectedContentLoadErrors.push('Customer questions');
    }

    if (competitorResult.status === 'fulfilled') {
      selectedCompetitorOverview = competitorResult.value;
    } else {
      selectedContentLoadErrors.push('Competitor analysis');
    }

    if (
      previousCompetitorResult.status === 'fulfilled' &&
      previousCompetitorResult.value
    ) {
      previousFollowerByCompetitorId = new Map(
        previousCompetitorResult.value.items.map((entry) => [
          entry.competitor.id,
          entry.monitoring.followerCount
        ])
      );
    }
  }

  if (dashboardView === 'charts' && dashboardItemsForChart.length > 0) {
    const questionOverviewResults = await Promise.allSettled(
      dashboardItemsForChart.map((item) => getQuestionOverview(brandId, item.id))
    );
    const questionOverviewByPeriodId = new Map<string, QuestionOverviewResponse>();

    questionOverviewResults.forEach((result, index) => {
      const item = dashboardItemsForChart[index];
      if (!item) {
        return;
      }

      if (result.status === 'fulfilled') {
        questionOverviewByPeriodId.set(item.id, result.value);
      } else {
        questionTrendLoadFailedCount += 1;
      }
    });

    const categoryTotals = new Map<
      string,
      {
        id: string;
        label: string;
        total: number;
      }
    >();

    const rawTrendPoints: DashboardQuestionCategoryTrendPoint[] = dashboardItemsForChart.map(
      (item) => {
        const sourceState = getDashboardSourceState(item, includeSubmittedPreview) ?? 'approved';
        const questionOverview = questionOverviewByPeriodId.get(item.id);
        const point: DashboardQuestionCategoryTrendPoint = {
          id: item.id,
          label: monthShortLabel(item.year, item.month),
          monthYearLabel: monthLabel(item.year, item.month),
          statusLabel: sourceState === 'submitted_preview' ? 'Submitted (Preview)' : 'Approved',
          total: 0
        };

        if (!questionOverview) {
          return point;
        }

        let pointTotal = 0;
        questionOverview.items.forEach((entry) => {
          const count = entry.entry.mode === 'no_questions' ? 0 : entry.entry.questionCount;
          const dataKey = `question_${entry.question.id}`;
          point[dataKey] = count;
          pointTotal += count;

          const existing = categoryTotals.get(entry.question.id);
          if (existing) {
            existing.total += count;
          } else {
            categoryTotals.set(entry.question.id, {
              id: entry.question.id,
              label: entry.question.text,
              total: count
            });
          }
        });

        point.total = pointTotal;
        return point;
      }
    );

    questionTrendSeries = Array.from(categoryTotals.values())
      .sort((left, right) => {
        if (right.total !== left.total) {
          return right.total - left.total;
        }
        return left.label.localeCompare(right.label);
      })
      .map((entry, index) => ({
        id: entry.id,
        dataKey: `question_${entry.id}`,
        label: entry.label,
        color: questionTrendColors[index % questionTrendColors.length],
        total: entry.total
      }));

    questionTrendPoints = rawTrendPoints.map((point) => {
      const normalizedPoint: DashboardQuestionCategoryTrendPoint = { ...point };
      questionTrendSeries.forEach((series) => {
        if (typeof normalizedPoint[series.dataKey] !== 'number') {
          normalizedPoint[series.dataKey] = 0;
        }
      });
      return normalizedPoint;
    });
  }

  const selectedContentEnhancement = selectedContentPeriod
    ? enhancementByPeriodId.get(selectedContentPeriod.id)
    : null;
  const selectedContentSubmittedMetrics = selectedContentPeriod
    ? submittedMetricValuesByPeriodId.get(selectedContentPeriod.id)
    : null;
  const selectedPreviousCalendarYear =
    selectedContentPeriod && selectedContentPeriod.month === 1
      ? selectedContentPeriod.year - 1
      : selectedContentPeriod?.year ?? null;
  const selectedPreviousCalendarMonth =
    selectedContentPeriod && selectedContentPeriod.month === 1
      ? 12
      : selectedContentPeriod
        ? selectedContentPeriod.month - 1
        : null;
  const selectedPreviousCalendarPeriod =
    selectedPreviousCalendarYear !== null && selectedPreviousCalendarMonth !== null
      ? (items.find(
          (item) =>
            item.year === selectedPreviousCalendarYear &&
            item.month === selectedPreviousCalendarMonth
        ) ?? null)
      : null;
  const selectedPreviousVisiblePeriod =
    selectedPreviousCalendarPeriod &&
    getDashboardSourceState(selectedPreviousCalendarPeriod, includeSubmittedPreview) !== null
      ? selectedPreviousCalendarPeriod
      : null;
  const ownBrandFollowerCount =
    selectedContentPeriod && selectedContentSourceState !== null
      ? resolvePageFollowersValue(selectedContentPeriod)
      : null;
  const ownBrandMonthlyPostCount =
    selectedContentPeriod && selectedContentSourceState !== null
      ? resolveContentCountValue(selectedContentPeriod)
      : null;
  const previousPageFollowers =
    selectedContentSourceState !== null ? resolvePageFollowersValue(selectedPreviousVisiblePeriod) : null;
  const currentPageVisit =
    selectedContentSourceState !== null ? resolvePageVisitValue(selectedContentPeriod) : null;
  const previousPageVisit =
    selectedContentSourceState !== null ? resolvePageVisitValue(selectedPreviousVisiblePeriod) : null;
  const pageFollowersChangePercent = calculatePercentChange(ownBrandFollowerCount, previousPageFollowers);
  const pageVisitChangePercent = calculatePercentChange(currentPageVisit, previousPageVisit);
  const selectedMonthlyMediaBreakdown =
    selectedTopContentOverview?.monthlySummary?.contentByMediaFormat ?? [];
  const selectedMonthlyContentObjectiveBreakdown =
    selectedTopContentOverview?.monthlySummary?.contentByContentObjective ?? [];
  const selectedMonthlyContentStyleBreakdown =
    selectedTopContentOverview?.monthlySummary?.contentByContentStyle ?? [];
  const selectedMonthlyRelatedProductBreakdown =
    selectedTopContentOverview?.monthlySummary?.contentByRelatedProduct ?? [];
  const selectedMonthlyCampaignBreakdown =
    selectedTopContentOverview?.monthlySummary?.contentByCampaign ?? [];
  const selectedMonthlyContentTotal =
    selectedTopContentOverview?.monthlySummary?.totalContentCount ?? ownBrandMonthlyPostCount ?? 0;
  const selectedMonthlyCampaignPostCount =
    selectedTopContentOverview?.monthlySummary?.campaignPostCount ?? 0;
  const contentPeriodOptions = filteredItems.map((item) => ({
    id: item.id,
    label: `${monthLabel(item.year, item.month)} - ${statusLabelForDashboardSource(
      getDashboardSourceState(item, includeSubmittedPreview)
    )}`
  }));
  const ownBrandSummary =
    selectedContentPeriod && selectedContentSourceState !== null
      ? {
          id: `brand-${brandCode}`,
          name: brandDisplayName,
          logoUrl: brandLogoUrl,
          pageFollowers: ownBrandFollowerCount,
          monthlyPosts: ownBrandMonthlyPostCount
        }
      : null;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {brandDisplayName}
          </div>
          <h1 className="font-serif text-4xl leading-none tracking-[-0.05em]">
            Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            {includeSubmittedPreview
              ? 'Preview mode includes submitted months for your session only.'
              : 'Published brand reporting for approved months only.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline">
            {resolvedStartYear === resolvedEndYear
              ? String(resolvedEndYear)
              : `${resolvedStartYear}-${resolvedEndYear}`}
          </Badge>
        </div>
      </div>

      {loadError ? (
        <Card className="border-amber-500/25 bg-amber-500/8">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <AlertCircle className="text-amber-600" />
              Dashboard unavailable
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {loadError}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Layers3 className="size-4 text-primary" />
            Dashboard view
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              asChild
              size="sm"
              variant={dashboardView === 'charts' ? 'default' : 'outline'}
            >
              <Link href={chartsTabHref}>Charts</Link>
            </Button>
            <Button
              asChild
              size="sm"
              variant={dashboardView === 'content' ? 'default' : 'outline'}
            >
              <Link href={contentTabHref}>Monthly report content</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <DashboardGlobalKpiControlsProvider
        availableGoalYears={kpiGoalTargets
          .filter((item) => Object.values(item.goals).some((value) => value !== null))
          .map((item) => item.year)}
        defaultGoalYear={currentYear}
      >
        <DashboardGlobalKpiControls dashboardView={dashboardView} />

        <DashboardContentLayout
          sidebar={
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-3">
                    <Filter className="text-primary" />
                    Month filter
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form className="space-y-4" method="get">
                    <input name="view" type="hidden" value={dashboardView} />
                    {selectedContentPeriod ? (
                      <input
                        name="selectedPeriodId"
                        type="hidden"
                        value={selectedContentPeriod.id}
                      />
                    ) : null}
                    <div className="space-y-2">
                      <label className="text-sm font-medium" htmlFor="dashboard-start-year">
                        Start period
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          className={selectClassName}
                          defaultValue={String(resolvedStartYear)}
                          id="dashboard-start-year"
                          name="startYear"
                        >
                          {availableYears.map((year) => (
                            <option key={`start-year-${year}`} value={year}>
                              {year}
                            </option>
                          ))}
                        </select>
                        <select
                          className={selectClassName}
                          defaultValue={String(resolvedStartMonth)}
                          id="dashboard-start-month"
                          name="startMonth"
                        >
                          {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                            <option key={`start-month-${month}`} value={month}>
                              {monthOnlyLabel(month)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium" htmlFor="dashboard-end-year">
                        End period
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          className={selectClassName}
                          defaultValue={String(resolvedEndYear)}
                          id="dashboard-end-year"
                          name="endYear"
                        >
                          {availableYears.map((year) => (
                            <option key={`end-year-${year}`} value={year}>
                              {year}
                            </option>
                          ))}
                        </select>
                        <select
                          className={selectClassName}
                          defaultValue={String(resolvedEndMonth)}
                          id="dashboard-end-month"
                          name="endMonth"
                        >
                          {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                            <option key={`end-month-${month}`} value={month}>
                              {monthOnlyLabel(month)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {canToggleSubmittedPreview ? (
                      <label
                        className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background/70 px-4 py-3"
                        htmlFor="dashboard-preview-submitted"
                      >
                        <div>
                          <div className="text-sm font-medium">Include Submitted (Preview)</div>
                          <div className="text-xs text-muted-foreground">
                            Only visible to you in this dashboard session.
                          </div>
                        </div>
                        <input
                          className="size-4 accent-primary"
                          defaultChecked={includeSubmittedPreview}
                          id="dashboard-preview-submitted"
                          name="includeSubmittedPreview"
                          type="checkbox"
                          value="1"
                        />
                      </label>
                    ) : null}

                    <Button className="w-full" type="submit">
                      Apply filter
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Published snapshot</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3">
                  <div className="rounded-[24px] border border-border/60 bg-background/60 px-4 py-4">
                    <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      Approved months in range
                    </div>
                    <div className="mt-2 text-2xl font-semibold">{approvedItems.length}</div>
                    {includeSubmittedPreview ? (
                      <div className="mt-2 text-xs text-muted-foreground">
                        + {submittedPreviewItems.length} submitted month
                        {submittedPreviewItems.length === 1 ? '' : 's'} in preview
                      </div>
                    ) : null}
                  </div>
                  <div className="rounded-[24px] border border-border/60 bg-background/60 px-4 py-4">
                    <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      Active workspaces in range
                    </div>
                    <div className="mt-2 text-2xl font-semibold">{activeItems.length}</div>
                  </div>
                  <div className="rounded-[24px] border border-border/60 bg-background/60 px-4 py-4">
                    <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      Latest approved
                    </div>
                    <div className="mt-2 text-sm font-medium">
                      {latestApprovedItem
                        ? monthLabel(latestApprovedItem.year, latestApprovedItem.month)
                        : 'No approved reports'}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          }
        >
          {dashboardView === 'charts' ? (
            <>
              <Card className={chartCardClassName} id="dashboard-chart-card-total-views">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <BarChart3 className="shrink-0 text-primary" />
                      <DashboardTitleWithKpi
                        title="Total Views"
                        goalByYear={viewsGoalByYear}
                        totalValue={totalViewsValue}
                      />
                    </div>
                    <DashboardChartCopyButton targetId="dashboard-chart-card-total-views" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <DashboardSingleMetricChart
                    color="#f59e0b"
                    goalByYear={viewsGoalByYear}
                    points={totalViewsPoints}
                    seriesName="Views"
                  />
                </CardContent>
              </Card>

              <Card className={chartCardClassName} id="dashboard-chart-card-total-viewers">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <BarChart3 className="shrink-0 text-primary" />
                      <DashboardTitleWithKpi
                        title="Total Viewers"
                        goalByYear={viewersGoalByYear}
                        totalValue={totalViewersValue}
                      />
                    </div>
                    <DashboardChartCopyButton targetId="dashboard-chart-card-total-viewers" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <DashboardSingleMetricChart
                    color="#a855f7"
                    goalByYear={viewersGoalByYear}
                    points={totalViewersPoints}
                    seriesName="Viewers"
                  />
                </CardContent>
              </Card>

              <Card className={chartCardClassName} id="dashboard-chart-card-engagement-video">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <BarChart3 className="shrink-0 text-primary" />
                      <DashboardTitleWithKpi
                        title="Total Engagement and 3s Video Views"
                        goalByYear={[]}
                        totalValue={0}
                      />
                    </div>
                    <DashboardChartCopyButton targetId="dashboard-chart-card-engagement-video" />
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {dashboardItemsForChart.length === 0 ? (
                    <div className="rounded-[24px] border border-border/60 bg-background/60 px-4 py-5 text-sm text-muted-foreground">
                      {includeSubmittedPreview
                        ? 'No approved or submitted reports in this month range yet, so the chart is empty.'
                        : 'No approved reports in this month range yet, so the chart is empty.'}
                    </div>
                  ) : (
                    <EngagementVideoChart
                      monthsMissingMetrics={monthsMissingMetrics}
                      points={chartPoints}
                    />
                  )}
                </CardContent>
              </Card>

              <Card className={chartCardClassName} id="dashboard-chart-card-total-video-views-3s">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <BarChart3 className="shrink-0 text-primary" />
                      <DashboardTitleWithKpi
                        title="Total 3-second Video Views"
                        goalByYear={videoViews3sGoalByYear}
                        totalValue={totalVideo3sValue}
                      />
                    </div>
                    <DashboardChartCopyButton targetId="dashboard-chart-card-total-video-views-3s" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <DashboardSingleMetricChart
                    color="#ef4444"
                    goalByYear={videoViews3sGoalByYear}
                    points={totalVideo3sPoints}
                    seriesName="3s Video Views"
                  />
                </CardContent>
              </Card>

            <Card className={chartCardClassName} id="dashboard-chart-card-page-followers">
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <BarChart3 className="shrink-0 text-primary" />
                    <DashboardTitleWithKpi
                      title="Page Followers"
                      goalByYear={pageFollowersGoalByYear}
                      totalValue={totalPageFollowersValue}
                    />
                  </div>
                  <DashboardChartCopyButton targetId="dashboard-chart-card-page-followers" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <DashboardSingleMetricChart
                  color="#60a5fa"
                  goalByYear={pageFollowersGoalByYear}
                  points={pageFollowersPoints}
                  seriesName="Page Followers"
                />
              </CardContent>
            </Card>

            <Card className={chartCardClassName} id="dashboard-chart-card-page-visits">
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <BarChart3 className="shrink-0 text-primary" />
                    <DashboardTitleWithKpi
                      title="Page Visits"
                      goalByYear={[]}
                      totalValue={totalPageVisitsValue}
                    />
                  </div>
                  <DashboardChartCopyButton targetId="dashboard-chart-card-page-visits" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <DashboardSingleMetricChart
                  color="#818cf8"
                  goalByYear={[]}
                  points={pageVisitPoints}
                  seriesName="Page Visits"
                />
              </CardContent>
            </Card>

              <Card className={chartCardClassName} id="dashboard-chart-card-total-engagement">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <BarChart3 className="shrink-0 text-primary" />
                      <DashboardTitleWithKpi
                        title="Total Engagement"
                        goalByYear={engagementGoalByYear}
                        totalValue={totalEngagementValue}
                      />
                    </div>
                    <DashboardChartCopyButton targetId="dashboard-chart-card-total-engagement" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <DashboardSingleMetricChart
                    color="#10b981"
                    goalByYear={engagementGoalByYear}
                    points={totalEngagementPoints}
                    seriesName="Engagement"
                  />
                </CardContent>
              </Card>

            <Card className={chartCardClassName} id="dashboard-chart-card-page-followers-vs-competitors">
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <BarChart3 className="shrink-0 text-primary" />
                    <DashboardTitleWithKpi
                      title="Page Followers (Brand vs Competitors)"
                      goalByYear={pageFollowersGoalByYear}
                      totalValue={totalFollowersComparisonValue}
                    />
                  </div>
                  <DashboardChartCopyButton targetId="dashboard-chart-card-page-followers-vs-competitors" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <DashboardFollowersComparisonChart
                  goalByYear={pageFollowersGoalByYear}
                  points={followersComparisonPoints}
                />
              </CardContent>
            </Card>

            <Card className={chartCardClassName} id="dashboard-chart-card-question-category-trend">
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <BarChart3 className="shrink-0 text-primary" />
                    <DashboardTitleWithKpi
                      title="Customer Question Categories Trend"
                      goalByYear={[]}
                      totalValue={questionTrendPoints.reduce(
                        (sum, point) => sum + (Number(point.total ?? 0) || 0),
                        0
                      )}
                    />
                  </div>
                  <DashboardChartCopyButton targetId="dashboard-chart-card-question-category-trend" />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {questionTrendLoadFailedCount > 0 ? (
                  <div className="rounded-[20px] border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-xs text-amber-700 dark:text-amber-300">
                    Could not load question trend data for {questionTrendLoadFailedCount} month
                    {questionTrendLoadFailedCount === 1 ? '' : 's'}.
                  </div>
                ) : null}
                {questionTrendSeries.length === 0 || questionTrendPoints.length === 0 ? (
                  <div className="rounded-[24px] border border-border/60 bg-background/60 px-4 py-5 text-sm text-muted-foreground">
                    No question category data in this month range yet.
                  </div>
                ) : (
                  <DashboardQuestionCategoryTrendChart
                    points={questionTrendPoints}
                    series={questionTrendSeries}
                  />
                )}
              </CardContent>
            </Card>

            <div className="col-span-full">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-3">
                    <BarChart3 className="text-primary" />
                    Dashboard months
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {dashboardVisibleItems.length === 0 ? (
                    <div className="rounded-[24px] border border-border/60 bg-background/60 px-4 py-5 text-sm text-muted-foreground">
                      {includeSubmittedPreview
                        ? 'No approved or submitted reports exist inside this month range yet.'
                        : 'No approved reports exist inside this month range yet.'}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {dashboardVisibleItems.map((item) => {
                        const sourceState =
                          getDashboardSourceState(item, includeSubmittedPreview) ?? 'approved';

                        return (
                          <article
                            className="grid gap-4 rounded-[28px] border border-border/60 bg-background/60 p-4 lg:grid-cols-[minmax(0,1.4fr)_180px_auto]"
                            key={item.id}
                          >
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="text-lg font-semibold">{item.label}</div>
                                <Badge
                                  className={badgeToneForState(
                                    item.latestVersionState ?? item.currentState
                                  )}
                                  variant="outline"
                                >
                                  {labelForState(item.latestVersionState ?? item.currentState)}
                                </Badge>
                                {sourceState === 'submitted_preview' ? (
                                  <Badge variant="outline">Submitted (Preview)</Badge>
                                ) : null}
                              </div>
                              <div className="mt-2 text-sm text-muted-foreground">
                                {sourceState === 'submitted_preview'
                                  ? 'Visible in your preview mode only.'
                                  : 'Available to the brand dashboard.'}
                              </div>
                            </div>

                            <div>
                              <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                                Dashboard status
                              </div>
                              <div className="mt-2 text-sm font-medium">
                                {sourceState === 'submitted_preview'
                                  ? 'Preview: pending approval'
                                  : 'Published'}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 lg:justify-end">
                              <Button asChild size="sm" variant="outline">
                                <Link href={`/app/${brandId}/reports/${item.id}/import`}>
                                  Open report
                                </Link>
                              </Button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
            </>
          ) : (
            <div className="col-span-full space-y-5">
              <Card id="dashboard-content-overview">
                <CardHeader>
                  <CardTitle className="flex min-w-0 items-center gap-3">
                    <Layers3 className="shrink-0 text-primary" />
                    Monthly report content overview
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)]">
                    <DashboardContentPeriodPicker
                      className={selectClassName}
                      endMonth={resolvedEndMonth}
                      endYear={resolvedEndYear}
                      includeSubmittedPreview={includeSubmittedPreview}
                      options={contentPeriodOptions}
                      selectedPeriodId={selectedContentPeriod?.id ?? ''}
                      startMonth={resolvedStartMonth}
                      startYear={resolvedStartYear}
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button asChild size="sm" variant="outline">
                      <a href="#dashboard-content-monthly-summary">Monthly summary</a>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <a href="#dashboard-content-metric-remarks">Metric remarks</a>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <a href="#dashboard-content-top-3-views">Top 3 Views</a>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <a href="#dashboard-content-top-3-viewers-post">Top 3 Viewers (Post)</a>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <a href="#dashboard-content-top-3-engagement">Top 3 Engagement</a>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <a href="#dashboard-content-customer-questions">Customer questions</a>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <a href="#dashboard-content-competitor-analysis">Competitor analysis</a>
                    </Button>
                  </div>

                  {selectedContentPeriod ? (
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge variant="outline">{selectedContentPeriodLabel}</Badge>
                      <Badge
                        className={badgeToneForState(
                          selectedContentPeriod.latestVersionState ??
                            selectedContentPeriod.currentState
                        )}
                        variant="outline"
                      >
                        {labelForState(
                          selectedContentPeriod.latestVersionState ??
                            selectedContentPeriod.currentState
                        )}
                      </Badge>
                      {selectedContentSourceState === 'submitted_preview' ? (
                        <Badge variant="outline">Submitted (Preview)</Badge>
                      ) : null}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-border/60 px-4 py-4 text-sm text-muted-foreground">
                      No reporting month in this range yet.
                    </div>
                  )}
                </CardContent>
              </Card>

              <DashboardContentPreviewScale enabled={dashboardView === 'content'}>
                {selectedContentPeriod === null ? (
                  <Card>
                    <CardContent className="px-5 py-6 text-sm text-muted-foreground">
                      There is no month available in this range. Adjust the dashboard month filter.
                    </CardContent>
                  </Card>
                ) : selectedContentSourceState === null ? (
                  <Card>
                    <CardContent className="px-5 py-6 text-sm text-muted-foreground">
                      {`${
                        monthLabel(selectedContentPeriod.year, selectedContentPeriod.month)
                      } is not visible in dashboard content mode yet. Only Approved months and Submitted (Preview) months are shown.`}
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    {selectedContentLoadErrors.length > 0 ? (
                      <Card className="border-amber-500/25 bg-amber-500/8">
                        <CardContent className="px-5 py-4 text-sm text-amber-700 dark:text-amber-300">
                          Could not load: {selectedContentLoadErrors.join(', ')}.
                        </CardContent>
                      </Card>
                    ) : null}

                    <Card
                      className="border-slate-200 bg-white text-slate-900 shadow-sm dark:border-slate-200 dark:bg-white dark:text-slate-900"
                      id="dashboard-content-monthly-summary"
                    >
                      <CardHeader>
                        <CardTitle className="flex flex-wrap items-center justify-between gap-3">
                      <span>Monthly summary</span>
                          {selectedContentPeriodLabel ? (
                            <Badge className={contentWhiteBadgeClassName} variant="outline">
                              {selectedContentPeriodLabel}
                            </Badge>
                          ) : null}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="grid gap-3 md:grid-cols-3">
                          <article className={contentSurfaceCardClassName}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="text-xs uppercase tracking-[0.12em] text-slate-500">
                                Amount of contents
                              </div>
                              <span className="rounded-full bg-emerald-100 p-2 text-emerald-700">
                                <Layers3 className="h-4 w-4" />
                              </span>
                            </div>
                            <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
                              <div className="text-3xl font-semibold leading-none text-slate-900">
                                {formatValue(selectedMonthlyContentTotal)}
                              </div>
                              <div className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                                <Megaphone className="h-3.5 w-3.5" />
                                Campaign posts {formatValue(selectedMonthlyCampaignPostCount)}
                              </div>
                            </div>
                            <div className="mt-3 space-y-1.5 text-sm text-slate-700">
                              {selectedMonthlyMediaBreakdown.length === 0 ? (
                                <div className="text-slate-500">No media format data.</div>
                              ) : (
                                selectedMonthlyMediaBreakdown.map((item) => (
                                  <div
                                    className="flex items-center justify-between gap-3"
                                    key={`media-summary-${item.valueKey}`}
                                  >
                                    <span>{item.label}</span>
                                    <span className="font-medium">{formatValue(item.count)}</span>
                                  </div>
                                ))
                              )}
                            </div>
                            {selectedMonthlyCampaignBreakdown.length > 0 ? (
                              <div className="mt-3 border-t border-slate-200 pt-2">
                                <div className="text-[11px] uppercase tracking-[0.12em] text-slate-500">
                                  Campaign breakdown
                                </div>
                                <div className="mt-1 space-y-1 text-sm text-slate-700">
                                  {selectedMonthlyCampaignBreakdown.slice(0, 3).map((item) => (
                                    <div
                                      className="flex items-center justify-between gap-3"
                                      key={`campaign-summary-${item.valueKey}`}
                                    >
                                      <span>{item.label}</span>
                                      <span className="font-medium">{formatValue(item.count)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                          </article>

                          <article className={contentSurfaceCardClassName}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="text-xs uppercase tracking-[0.12em] text-slate-500">
                                Page Visits
                              </div>
                              <span className="rounded-full bg-sky-100 p-2 text-sky-700">
                                <Eye className="h-4 w-4" />
                              </span>
                            </div>
                            <div className="mt-2 text-3xl font-semibold leading-none text-slate-900">
                              {formatValue(currentPageVisit)}
                            </div>
                            <div
                              className={`mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium ${getChangeToneClassName(pageVisitChangePercent)}`}
                            >
                              Change: {formatChangePercent(pageVisitChangePercent)} (
                              {formatSignedDelta(currentPageVisit, previousPageVisit)})
                            </div>
                          </article>

                          <article className={contentSurfaceCardClassName}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="text-xs uppercase tracking-[0.12em] text-slate-500">
                                Page Followers
                              </div>
                              <span className="rounded-full bg-indigo-100 p-2 text-indigo-700">
                                <Users className="h-4 w-4" />
                              </span>
                            </div>
                            <div className="mt-2 text-3xl font-semibold leading-none text-slate-900">
                              {formatValue(ownBrandFollowerCount)}
                            </div>
                            <div
                              className={`mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium ${getChangeToneClassName(pageFollowersChangePercent)}`}
                            >
                              Change: {formatChangePercent(pageFollowersChangePercent)} (
                              {formatSignedDelta(ownBrandFollowerCount, previousPageFollowers)})
                            </div>
                          </article>
                        </div>

                        <div className="mt-3 grid gap-3 md:grid-cols-3">
                          <article className={contentSurfaceCardClassName}>
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-xs uppercase tracking-[0.12em] text-slate-500">
                                Content Objective
                              </div>
                              <Target className="h-4 w-4 text-sky-700" />
                            </div>
                            <div className="mt-2 space-y-1.5 text-sm text-slate-700">
                              {selectedMonthlyContentObjectiveBreakdown.length === 0 ? (
                                <div className="text-slate-500">No content objective data.</div>
                              ) : (
                                selectedMonthlyContentObjectiveBreakdown.map((item) => (
                                  <div
                                    className="flex items-center justify-between gap-3"
                                    key={`objective-summary-${item.valueKey}`}
                                  >
                                    <span>{item.label}</span>
                                    <span className="font-medium">{formatValue(item.count)}</span>
                                  </div>
                                ))
                              )}
                            </div>
                          </article>

                          <article className={contentSurfaceCardClassName}>
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-xs uppercase tracking-[0.12em] text-slate-500">
                                Content Style
                              </div>
                              <Palette className="h-4 w-4 text-violet-700" />
                            </div>
                            <div className="mt-2 space-y-1.5 text-sm text-slate-700">
                              {selectedMonthlyContentStyleBreakdown.length === 0 ? (
                                <div className="text-slate-500">No content style data.</div>
                              ) : (
                                selectedMonthlyContentStyleBreakdown.map((item) => (
                                  <div
                                    className="flex items-center justify-between gap-3"
                                    key={`style-summary-${item.valueKey}`}
                                  >
                                    <span>{item.label}</span>
                                    <span className="font-medium">{formatValue(item.count)}</span>
                                  </div>
                                ))
                              )}
                            </div>
                          </article>

                          <article className={contentSurfaceCardClassName}>
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-xs uppercase tracking-[0.12em] text-slate-500">
                                Related Product
                              </div>
                              <Package className="h-4 w-4 text-orange-700" />
                            </div>
                            <div className="mt-2 space-y-1.5 text-sm text-slate-700">
                              {selectedMonthlyRelatedProductBreakdown.length === 0 ? (
                                <div className="text-slate-500">No related product data.</div>
                              ) : (
                                selectedMonthlyRelatedProductBreakdown.map((item) => (
                                  <div
                                    className="flex items-center justify-between gap-3"
                                    key={`related-product-summary-${item.valueKey}`}
                                  >
                                    <span>{item.label}</span>
                                    <span className="font-medium">{formatValue(item.count)}</span>
                                  </div>
                                ))
                              )}
                            </div>
                          </article>
                        </div>
                      </CardContent>
                    </Card>

                    <Card
                      className="border-slate-200 bg-white text-slate-900 shadow-sm dark:border-slate-200 dark:bg-white dark:text-slate-900"
                      id="dashboard-content-metric-remarks"
                    >
                      <CardHeader>
                        <CardTitle className="flex flex-wrap items-center justify-between gap-3">
                          <span>Metric remarks</span>
                          {selectedContentPeriodLabel ? (
                            <Badge className={contentWhiteBadgeClassName} variant="outline">
                              {selectedContentPeriodLabel}
                            </Badge>
                          ) : null}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {!selectedRemarkItems ? (
                          <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-600">
                            Metric commentary is unavailable for this month.
                          </div>
                        ) : (
                          <div className="grid gap-3 lg:grid-cols-2">
                            {dashboardRemarkMetricOrder.map((metricKey) => {
                              const metric = selectedRemarkItems?.find(
                                (entry) => entry.key === metricKey
                              );
                              if (!metric) {
                                return null;
                              }

                              const isVideoNoDataMonth =
                                metric.key === 'video_views_3s' &&
                                !metric.requiresRemark &&
                                (metric.currentValue ?? 0) === 0;
                              const trimmedRemark = metric.remark?.trim() ?? '';
                              const requirementDetail = metric.requirementDetail.trim();
                              const displayRemark =
                                trimmedRemark.length > 0
                                  ? trimmedRemark
                                  : isVideoNoDataMonth
                                    ? 'No 3-second video views this month.'
                                  : selectedIsFirstReportingMonth && metric.requiresRemark
                                    ? selectedFirstMonthDefaultRemark
                                  : metric.requiresRemark
                                    ? 'Remark is required in report workspace.'
                                    : 'No remark for this month.';
                              const canCopy =
                                trimmedRemark.length > 0 ||
                                isVideoNoDataMonth ||
                                (selectedIsFirstReportingMonth && metric.requiresRemark);
                              const statusText = isVideoNoDataMonth
                                ? 'No video this month'
                                : metric.requiresRemark
                                  ? 'Required'
                                  : 'Optional';
                              const statusPillClassName = isVideoNoDataMonth
                                ? 'border-slate-300 bg-slate-100 text-slate-700'
                                : metric.requiresRemark
                                  ? 'border-amber-200 bg-amber-50 text-amber-700'
                                  : 'border-emerald-200 bg-emerald-50 text-emerald-700';
                              const showRequirementDetail =
                                requirementDetail.length > 0 &&
                                (!metric.requiresRemark ||
                                  requirementDetail.toLowerCase().includes('waiting') ||
                                  requirementDetail.toLowerCase().includes('import'));

                              return (
                                <article
                                  className="space-y-3 rounded-xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-4"
                                  key={`dashboard-content-metric-remark-${metric.key}`}
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="space-y-1">
                                      <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                                        <FileBarChart2 className="h-4 w-4 text-slate-500" />
                                        {metric.label}
                                      </h3>
                                      <div
                                        className={`text-sm font-medium ${getChangeToneClassName(
                                          metric.changePercent
                                        )}`}
                                      >
                                        Change: {formatChangePercent(metric.changePercent)} (
                                        {formatSignedDelta(metric.currentValue, metric.previousValue)})
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span
                                        className={`rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.08em] ${statusPillClassName}`}
                                      >
                                        {statusText}
                                      </span>
                                      <DashboardRemarkCopyButton disabled={!canCopy} text={displayRemark} />
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-2 gap-3">
                                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                                      <div className="text-xs uppercase tracking-[0.12em] text-slate-500">Previous</div>
                                      <div className="mt-1 font-medium text-slate-900">
                                        {metric.hasPreviousValue
                                          ? formatValue(metric.previousValue)
                                          : 'No previous'}
                                      </div>
                                    </div>
                                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                                      <div className="text-xs uppercase tracking-[0.12em] text-slate-500">Current</div>
                                      <div className="mt-1 font-medium text-slate-900">
                                        {formatValue(metric.currentValue)}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                                    <div className="text-xs uppercase tracking-[0.12em] text-slate-500">
                                      Remark
                                    </div>
                                    <div className="mt-1 whitespace-pre-wrap text-base text-slate-900">
                                      {displayRemark}
                                    </div>
                                  </div>

                                  {showRequirementDetail ? (
                                    <p className="text-sm text-slate-500">{requirementDetail}</p>
                                  ) : null}
                                </article>
                              );
                            })}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <Card
                      className="border-slate-200 bg-white text-slate-900 shadow-sm dark:border-slate-200 dark:bg-white dark:text-slate-900"
                      id="dashboard-content-top-posts"
                    >
                      <CardHeader>
                        <CardTitle className="flex flex-wrap items-center justify-between gap-3">
                          <span>Top posts</span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-5">
                        <DashboardTopPostsSection overview={selectedTopContentOverview} />
                      </CardContent>
                    </Card>

                    <Card
                      className="border-slate-200 bg-white text-slate-900 shadow-sm dark:border-slate-200 dark:bg-white dark:text-slate-900"
                      id="dashboard-content-customer-questions"
                    >
                      <CardHeader>
                        <CardTitle className="flex flex-wrap items-center justify-between gap-3">
                          <span>Customer questions</span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {selectedQuestionOverview ? (
                          selectedQuestionOverview.items.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-600">
                              No question assignment for this month.
                            </div>
                          ) : (
                            <div className="space-y-4">
                              {(() => {
                                const questionDistributionPoints: DashboardQuestionCategoryDistributionPoint[] =
                                  selectedQuestionOverview.items
                                    .map((item) => ({
                                      id: item.activation.id,
                                      label: item.question.text,
                                      count:
                                        item.entry.mode === 'no_questions'
                                          ? 0
                                          : item.entry.questionCount
                                    }))
                                    .sort((left, right) => right.count - left.count);

                                return (
                                  <article className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <h3 className="text-base font-semibold">
                                        Question category chart ({selectedContentPeriodLabel ?? 'This month'})
                                      </h3>
                                      <div className="flex items-center gap-2">
                                        <Badge className={contentWhiteBadgeClassName} variant="outline">
                                          {questionDistributionPoints.length} category(s)
                                        </Badge>
                                        <DashboardChartCopyButton targetId="dashboard-content-customer-questions-category-chart-canvas" />
                                      </div>
                                    </div>
                                    {questionDistributionPoints.length === 0 ? (
                                      <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-600">
                                        No category data for this month.
                                      </div>
                                    ) : (
                                      <DashboardQuestionCategoryDistributionChart
                                        captureTargetId="dashboard-content-customer-questions-category-chart-canvas"
                                        periodLabel={selectedContentPeriodLabel}
                                        points={questionDistributionPoints}
                                      />
                                    )}
                                  </article>
                                );
                              })()}

                              <article className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/40 p-2.5">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <h3 className="text-xs font-medium uppercase tracking-[0.1em] text-slate-600">
                                    Category count summary
                                  </h3>
                                  <Badge className={contentWhiteBadgeClassName} variant="outline">
                                    {selectedQuestionOverview.items.length} category(s)
                                  </Badge>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  {selectedQuestionOverview.items
                                    .map((item) => ({
                                      id: item.activation.id,
                                      label: item.question.text,
                                      count:
                                        item.entry.mode === 'no_questions'
                                          ? 0
                                          : item.entry.questionCount
                                    }))
                                    .sort((left, right) => right.count - left.count)
                                    .map((item) => (
                                      <div
                                        className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5"
                                        key={`question-count-${item.id}`}
                                      >
                                        <div className="max-w-[220px] truncate text-xs font-medium text-slate-700">
                                          {item.label}
                                        </div>
                                        <div className="text-sm font-semibold text-slate-900">
                                          {formatValue(item.count)}
                                        </div>
                                      </div>
                                    ))}
                                </div>
                              </article>

                              <DashboardQuestionHighlightsCanvas
                                captureTargetId="dashboard-content-customer-questions-canvas"
                                highlightNote={selectedQuestionOverview.highlights.note}
                                screenshots={selectedQuestionOverview.highlights.screenshots}
                              />
                            </div>
                          )
                        ) : (
                          <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-600">
                            Customer question overview is unavailable for this month.
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <Card
                      className="border-slate-200 bg-white text-slate-900 shadow-sm dark:border-slate-200 dark:bg-white dark:text-slate-900"
                      id="dashboard-content-competitor-analysis"
                    >
                      <CardHeader>
                        <CardTitle className="flex flex-wrap items-center justify-between gap-3">
                          <span>Competitor analysis</span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <DashboardCompetitorAnalysisSection
                          overview={selectedCompetitorOverview}
                          ownBrandSummary={ownBrandSummary}
                          previousFollowers={Array.from(previousFollowerByCompetitorId.entries()).map(
                            ([competitorId, followerCount]) => ({
                              competitorId,
                              followerCount
                            })
                          )}
                          previousVisiblePeriodLabel={previousVisiblePeriodLabel}
                        />
                      </CardContent>
                    </Card>
                  </>
                )}
              </DashboardContentPreviewScale>
            </div>
          )}
        </DashboardContentLayout>
      </DashboardGlobalKpiControlsProvider>
    </section>
  );
}

