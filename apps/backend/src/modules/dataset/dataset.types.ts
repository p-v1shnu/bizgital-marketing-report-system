import type { ImportJobStatus, MappingTargetField, ReportWorkflowState } from '@prisma/client';

import type {
  CanonicalFieldDataType,
  CanonicalFieldInputType
} from '../mapping/mapping-targets';

export type DatasetOverviewResponse = {
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
    state: 'blocked' | 'ready';
    detail: string;
  };
  latestImportJob: {
    id: string;
    originalFilename: string;
    status: ImportJobStatus;
    profiledColumnCount: number;
    mappedColumnCount: number;
    persistedRowCount: number;
    createdAt: string;
  } | null;
  mappingSummary: {
    profiledColumnCount: number;
    mappedColumnCount: number;
    unmappedColumnCount: number;
  };
  materialization: {
    source: 'persisted';
    rowCount: number;
    cellCount: number;
  };
  manualHeader: {
    viewers: string | null;
    pageFollowers: string | null;
    pageVisit: string | null;
  };
  preview: {
    totalRows: number;
    shownRows: number;
    truncated: boolean;
    columns: Array<{
      targetField: MappingTargetField;
      label: string;
      sourceColumnName: string;
      sourcePosition: number;
      dataType: CanonicalFieldDataType;
      inputType: CanonicalFieldInputType;
      isMetric: boolean;
    }>;
    rows: Array<{
      datasetRowId: string;
      rowNumber: number;
      cells: Record<
        string,
        {
          effectiveValue: string | null;
          importedValue: string | null;
          overrideValue: string | null;
          isOverridden: boolean;
        }
      >;
    }>;
  } | null;
  warnings: Array<{
    key: 'duplicate_targets' | 'storage_unavailable';
    message: string;
  }>;
};

export type UpdateDatasetValuesInput = {
  rows: Array<{
    rowNumber: number;
    values: Partial<Record<MappingTargetField, string | null>>;
  }>;
  manualSourceRows?: Array<{
    rowNumber: number;
    values: Record<string, string | null>;
  }>;
  manualFormulaRows?: Array<{
    rowNumber: number;
    values: Record<string, string | null>;
  }>;
  manualHeader?: {
    viewers?: string | null;
    pageFollowers?: string | null;
    pageVisit?: string | null;
  };
};

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
    state: 'blocked' | 'ready';
    detail: string;
  };
  summary: {
    datasetRowCount: number;
    overriddenCellCount: number;
    metricCount: number;
  };
  items: Array<{
    key: MappingTargetField;
    label: string;
    value: number;
    rowCoverage: number;
    overrideCount: number;
    sourceColumnName: string | null;
    sourceAliasLabel: string | null;
  }>;
};
