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
export const REPORT_METRIC_LABELS: Record<ReportMetricCommentaryKey, string> = {
  views: 'Total Views',
  viewers: 'Total Viewers',
  engagement: 'Total Engagement',
  video_views_3s: 'Total 3-second Video Views'
};
export type ReportMetricApplicability = 'applicable' | 'na';

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
