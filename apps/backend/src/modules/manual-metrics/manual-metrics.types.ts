export type ManualHeaderMetricValues = {
  viewers: number | null;
  pageFollowers: number | null;
  pageVisit: number | null;
};

export type UpdateManualHeaderMetricInput = {
  viewers?: string | null;
  pageFollowers?: string | null;
  pageVisit?: string | null;
};

export const REPORT_METRIC_COMMENTARY_KEYS = [
  'views',
  'viewers',
  'engagement',
  'video_views_3s'
] as const;

export type ReportMetricCommentaryKey = (typeof REPORT_METRIC_COMMENTARY_KEYS)[number];
export const FIRST_MONTH_DEFAULT_REMARK =
  'First reporting month, no previous-month comparison.';
export const REPORT_METRIC_LABELS: Record<ReportMetricCommentaryKey, string> = {
  views: 'Total Views',
  viewers: 'Total Viewers',
  engagement: 'Total Engagement',
  video_views_3s: 'Total 3-second Video Views'
};
export type ReportMetricApplicability = 'applicable' | 'na';

export type ReportMetricDashboardValues = {
  views: number | null;
  viewers: number | null;
  engagement: number | null;
  video_views_3s: number | null;
  page_followers: number | null;
  page_visit: number | null;
};

export function pickDashboardValueForMetric(
  values: ReportMetricDashboardValues,
  key: ReportMetricCommentaryKey
) {
  return values[key];
}

export function calculateChangePercent(
  currentValue: number | null,
  previousValue: number | null
) {
  if (currentValue === null || previousValue === null || previousValue === 0) {
    return null;
  }

  return ((currentValue - previousValue) / Math.abs(previousValue)) * 100;
}

export type ReportMetricCommentaryEntry = {
  key: ReportMetricCommentaryKey;
  label: string;
  applicability: ReportMetricApplicability;
  remark: string | null;
};

export type UpdateReportMetricCommentaryInput = {
  entries: Array<{
    key: ReportMetricCommentaryKey;
    applicability?: ReportMetricApplicability | null;
    remark?: string | null;
  }>;
};
