import type { ImportJob, ImportJobStatus, ReportVersion, ReportWorkflowState } from '@prisma/client';

export type ImportJobWithVersion = ImportJob & {
  reportVersion: ReportVersion;
};

export type ImportJobListResponse = {
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
  items: Array<{
    id: string;
    reportVersionId: string;
    originalFilename: string;
    storedFilename: string;
    storagePath: string;
    mimeType: string | null;
    fileSize: number;
    status: ImportJobStatus;
    createdAt: string;
    updatedAt: string;
  }>;
};

export type ImportPreviewResponse = {
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
  importJob: {
    id: string;
    originalFilename: string;
    status: ImportJobStatus;
    createdAt: string;
    sourceType: 'csv' | 'excel';
    sheetName: string | null;
  } | null;
  preview: {
    columns: Array<{
      key: string;
      label: string;
      rawLabel: string;
      sourcePosition: number;
    }>;
    rows: Array<{
      rowNumber: number;
      cells: Record<string, string | null>;
    }>;
    totalRows: number;
    shownRows: number;
    truncated: boolean;
  } | null;
};
