import type {
  ImportJobStatus,
  MappingTargetField,
  ReportWorkflowState
} from '@prisma/client';

export type MappingOverviewResponse = {
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
  latestImportJob: {
    id: string;
    originalFilename: string;
    status: ImportJobStatus;
    createdAt: string;
    persistedRowCount: number;
    columnProfiles: Array<{
      id: string;
      sourceColumnName: string;
      sourceRawColumnName: string;
      sourcePosition: number;
      sampleValue: string | null;
      mappedTargetField: MappingTargetField | null;
    }>;
  } | null;
  availableTargets: Array<{
    key: MappingTargetField;
    label: string;
    description: string;
  }>;
  validation: {
    targetFieldsMustBeUnique: boolean;
  };
};
