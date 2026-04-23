import type {
  Brand,
  MappingTargetField,
  ReportWorkflowState,
  ReportingPeriod,
  ReportingPeriodState,
  ReportVersion
} from '@prisma/client';

export type ReportingPeriodWithVersions = ReportingPeriod & {
  brand: Brand;
  reportVersions: ReportVersion[];
};

export type ReviewReadinessCheckKey =
  | 'draft_exists'
  | 'dataset_materialized'
  | 'metric_snapshot_current'
  | 'competitor_evidence_complete'
  | 'question_evidence_complete'
  | 'required_top_content_cards_exist';

export type ReviewDeferredModuleKey = 'questions';

export type ReportingListItem = {
  id: string;
  brandId: string;
  brandCode: string;
  brandName: string;
  cadence: 'monthly';
  year: number;
  month: number;
  label: string;
  currentState: ReportingPeriodState;
  currentDraftVersionId: string | null;
  currentApprovedVersionId: string | null;
  latestVersionId: string | null;
  latestVersionState: ReportWorkflowState | null;
  versions: Array<{
    id: string;
    versionNo: number;
    workflowState: ReportWorkflowState;
    createdFromVersionId: string | null;
    submittedAt: string | null;
    approvedAt: string | null;
    rejectedAt: string | null;
    rejectionReason: string | null;
    supersededAt: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  activityLog: Array<{
    id: string;
    eventKey: string;
    label: string;
    at: string;
    actorName: string | null;
    actorEmail: string | null;
    reportVersionId: string | null;
    note: string | null;
  }>;
  approvedSnapshot: {
    reportVersionId: string;
    generatedAt: string;
    items: Array<{
      key: MappingTargetField;
      label: string;
      value: number;
    }>;
  } | null;
  availableActions: {
    canCreateDraft: boolean;
    canSubmitLatest: boolean;
    canApproveLatest: boolean;
    canReviseLatest: boolean;
    canReopenLatest: boolean;
  };
};

export type ReportingListResponse = {
  brand: {
    id: string;
    code: string;
    name: string;
    timezone: string;
  };
  year: number;
  cadence: 'monthly';
  yearOptions: Array<{
    year: number;
    isReady: boolean;
    hasReports: boolean;
  }>;
  selectedYearSetup: {
    year: number;
    canCreateReport: boolean;
    summary: string;
    checks: Array<{
      key:
        | 'kpi_plan'
        | 'competitor_assignments'
        | 'question_assignments'
        | 'related_product_options';
      label: string;
      required: boolean;
      passed: boolean;
      detail: string;
    }>;
  };
  suggestedNextPeriod: {
    year: number;
    month: number;
    label: string;
  };
  items: ReportingListItem[];
};

export type ReportingRecycleBinItem = {
  id: string;
  brandId: string;
  brandCode: string;
  brandName: string;
  cadence: 'monthly';
  year: number;
  month: number;
  label: string;
  createdAt: string;
  createdYear: number;
  deletedAt: string;
  deletedByName: string | null;
  deletedByEmail: string | null;
  purgeAt: string;
  latestVersionId: string | null;
  latestVersionState: ReportWorkflowState | null;
  latestVersionNo: number | null;
  latestVersionUpdatedAt: string | null;
  versionCount: number;
};

export type ReportingRecycleBinResponse = {
  brand: {
    id: string;
    code: string;
    name: string;
    timezone: string;
  };
  year: number;
  cadence: 'monthly';
  retentionDays: number;
  items: ReportingRecycleBinItem[];
};

export type ReportingDetailResponse = {
  brand: {
    id: string;
    code: string;
    name: string;
    timezone: string;
  };
  period: ReportingListItem & {
    monthLabel: string;
    latestVersion: ReportingListItem['versions'][number] | null;
    workspace: {
      sections: Array<{
        slug:
          | 'overview'
          | 'import'
          | 'mapping'
          | 'metrics'
          | 'top-content'
          | 'competitors'
          | 'questions'
          | 'review'
          | 'history';
        label: string;
        status: 'ready' | 'pending' | 'blocked';
        detail: string;
      }>;
    };
    reviewReadiness: {
      overall: 'not_ready' | 'ready_to_submit' | 'awaiting_decision' | 'published';
      canSubmit: boolean;
      blockingCount: number;
      summary: string;
      checks: Array<{
        key: ReviewReadinessCheckKey;
        label: string;
        passed: boolean;
        detail: string;
      }>;
      deferred: Array<{
        key: ReviewDeferredModuleKey;
        label: string;
        detail: string;
      }>;
    };
  };
};
