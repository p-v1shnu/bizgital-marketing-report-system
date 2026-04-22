import type {
  BrandDropdownFieldKey,
  BrandDropdownOptionStatus,
  MappingTargetField,
  ComputedColumnOperation
} from '@prisma/client';

export type GlobalCompanyFormatOptionsResponse = {
  fields: Array<{
    key: BrandDropdownFieldKey;
    label: string;
    options: Array<{
      id: string;
      fieldKey: BrandDropdownFieldKey;
      valueKey: string;
      label: string;
      status: BrandDropdownOptionStatus;
      sortOrder: number;
    }>;
  }>;
};

export type CreateGlobalCompanyFormatOptionInput = {
  fieldKey: BrandDropdownFieldKey;
  label: string;
};

export type UpdateGlobalCompanyFormatOptionInput = {
  label?: string;
  status?: BrandDropdownOptionStatus;
};

export type ReorderGlobalCompanyFormatOptionsInput = {
  fieldKey: BrandDropdownFieldKey;
  optionIds: string[];
};

export type EngagementFormulaResponse = {
  key: 'engagement';
  label: string;
  operation: ComputedColumnOperation;
  sourceLabelA: string;
  sourceLabelB: string;
};

export type UpdateEngagementFormulaInput = {
  label?: string;
  sourceLabelA: string;
  sourceLabelB: string;
};

export type ComputedFormulaIssueCode =
  | 'syntax'
  | 'type'
  | 'divide_by_zero'
  | 'column_missing';

export type ComputedFormulaIssue = {
  code: ComputedFormulaIssueCode;
  message: string;
};

export type ComputedFormulaPreviewResponse = {
  isValid: boolean;
  result: number | null;
  referencedColumns: string[];
  issues: ComputedFormulaIssue[];
};

export type ComputedFormulaResponse = {
  id: string;
  columnLabel: string;
  expression: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deleteGuard: {
    canDelete: boolean;
    reason: string | null;
    lockedByReportVersionId: string | null;
    lockedAt: string | null;
  };
  preview: ComputedFormulaPreviewResponse;
};

export type CreateComputedFormulaInput = {
  columnLabel: string;
  expression: string;
  isActive?: boolean;
};

export type UpdateComputedFormulaInput = {
  columnLabel?: string;
  expression?: string;
  isActive?: boolean;
};

export type PreviewComputedFormulaInput = {
  expression: string;
  sample?: Record<string, string | null>;
};

export type MetaColumnCatalogResponse = {
  columns: Array<{
    label: string;
    sampleValue: string | null;
    lastSeenAt: string;
  }>;
};

export type ImportTableLayoutResponse = {
  visibleSourceColumnLabels: string[];
};

export type UpdateImportTableLayoutInput = {
  visibleSourceColumnLabels: string[];
};

export type TopContentDataSourcePolicyMode = 'csv_only' | 'csv_and_manual';

export type TopContentDataSourcePolicyResponse = {
  mode: TopContentDataSourcePolicyMode;
  label: string;
  excludeManualRows: boolean;
  excludedContentStyleValueKeys: string[];
  excludedContentStyleLabels: string[];
  contentStyleOptions: Array<{
    valueKey: string;
    label: string;
    status: BrandDropdownOptionStatus;
  }>;
  updatedAt: string | null;
  updatedBy: string | null;
  note: string | null;
};

export type UpdateTopContentDataSourcePolicyInput = {
  mode: TopContentDataSourcePolicyMode;
  actorEmail?: string | null;
  note?: string | null;
  excludedContentStyleValueKeys?: string[];
};

export type ImportColumnMappingRule = {
  targetField: string;
  baselineHeader: string;
  displayLabel: string;
  aliases: string[];
  required: boolean;
};

export type ImportColumnMappingDraft = {
  sourceFilename: string | null;
  uploadedHeaderCount: number;
  uploadedHeaders: string[];
  updatedAt: string;
  updatedBy: string | null;
  rules: ImportColumnMappingRule[];
};

export type ImportColumnMappingVersion = {
  versionId: string;
  sourceFilename: string | null;
  publishedAt: string;
  publishedBy: string | null;
  note: string | null;
  rules: ImportColumnMappingRule[];
};

export type ImportColumnMappingConfigResponse = {
  targetCatalog: Array<{
    key: MappingTargetField;
    label: string;
    description: string;
  }>;
  published: ImportColumnMappingVersion | null;
  draft: ImportColumnMappingDraft | null;
  history: ImportColumnMappingVersion[];
};

export type CreateImportColumnMappingDraftFromHeadersInput = {
  headers: string[];
  sourceFilename?: string | null;
  actorEmail?: string | null;
};

export type UpdateImportColumnMappingDraftInput = {
  sourceFilename?: string | null;
  uploadedHeaders?: string[];
  actorEmail?: string | null;
  rules: ImportColumnMappingRule[];
};

export type PublishImportColumnMappingInput = {
  actorEmail?: string | null;
  note?: string | null;
};

export type RollbackImportColumnMappingInput = {
  versionId: string;
  actorEmail?: string | null;
  note?: string | null;
};
