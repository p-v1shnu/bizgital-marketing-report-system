import type {
  KpiSourceType,
  MappingTargetField,
  ReportWorkflowState
} from '@prisma/client';

export type MetricsOverviewResponse = {
  brand: {
    id: string;
    code: string;
    name: string;
    timezone: string;
  };
  period: {
    id: string;
    year: number;
    month: number;
    label: string;
    currentDraftVersionId: string | null;
    latestVersionState: ReportWorkflowState | null;
  };
  readiness: {
    state: 'blocked' | 'pending' | 'ready';
    detail: string;
  };
  snapshot: {
    id: string;
    reportVersionId: string;
    generatedAt: string;
    isCurrent: boolean;
  } | null;
  summary: {
    datasetRowCount: number;
    overriddenCellCount: number;
    metricCount: number;
  };
  plan: {
    id: string | null;
    year: number;
    itemCount: number;
    updatedAt: string | null;
  };
  dashboardValues: {
    views: number | null;
    viewers: number | null;
    engagement: number | null;
    video_views_3s: number | null;
    page_followers: number | null;
    page_visit: number | null;
  };
  items: Array<{
    id: string;
    key: string;
    label: string;
    description: string | null;
    sourceType: KpiSourceType;
    sourceLabel: string;
    canonicalMetricKey: MappingTargetField | null;
    formulaId: string | null;
    targetValue: number | null;
    actualValue: number | null;
    varianceValue: number | null;
    rowCoverage: number;
    overrideCount: number;
    sourceColumnName: string | null;
    sourceAliasLabel: string | null;
  }>;
};

export type MetricsKpiPreviewResponse = {
  state: 'all_targets_hit' | 'in_progress' | 'at_risk' | 'no_data' | 'no_target';
  label: string;
  detail: string;
  hitCount: number;
  totalCount: number;
  measuredCount: number;
};
