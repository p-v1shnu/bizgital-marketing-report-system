import type {
  MappingTargetField,
  ReportWorkflowState
} from '@prisma/client';
import type { TopContentSlotKey } from './top-content.constants';

export type TopContentOverviewResponse = {
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
  generation: {
    reportVersionId: string | null;
    generatedCount: number;
    requiredSlotCount: number;
    currentSlotCount: number;
    isCurrent: boolean;
  };
  dataSourcePolicy: {
    mode: 'csv_only' | 'csv_and_manual';
    label: string;
    excludeManualRows: boolean;
  };
  cards: Array<{
    id: string;
    slotKey: TopContentSlotKey;
    slotLabel: string;
    metricKey: MappingTargetField;
    metricLabel: string;
    headlineValue: number;
    rankPosition: number;
    screenshotUrl: string | null;
    postUrl: string | null;
    selectionBasis: string;
    datasetRow: {
      id: string;
      rowNumber: number;
    };
  }>;
};
