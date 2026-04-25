export type ReportWorkflowState =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'superseded';

export type CanonicalTargetField =
  | 'views'
  | 'viewers'
  | 'page_followers'
  | 'engagement'
  | 'video_views_3s';

export type CanonicalFieldDataType = 'string' | 'number' | 'date' | 'url';
export type CanonicalFieldInputType = 'text' | 'number' | 'date' | 'url';

export type ReportingPeriodState =
  | 'not_started'
  | 'in_progress'
  | 'submitted'
  | 'approved'
  | 'rejected';

export type CompetitorStatus = 'active' | 'inactive';
export type CompetitorMonitoringStatus = 'has_posts' | 'no_activity';

export type MediaPresignUploadResponse = {
  method: 'PUT';
  uploadUrl: string;
  publicUrl: string;
  objectKey: string;
  headers: Record<string, string>;
  expiresInSeconds: number;
  maxBytes: number;
};

export type MediaDeleteObjectResponse = {
  deleted: boolean;
  skipped: boolean;
  objectKey: string | null;
  reason?: string;
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
      key: CanonicalTargetField;
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

export type ReportingYearSetupCheck = {
  key:
    | 'kpi_plan'
    | 'competitor_assignments'
    | 'question_assignments'
    | 'related_product_options';
  label: string;
  required: boolean;
  passed: boolean;
  detail: string;
};

export type ReportingYearSetupStatus = {
  year: number;
  canCreateReport: boolean;
  summary: string;
  checks: ReportingYearSetupCheck[];
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
  selectedYearSetup: ReportingYearSetupStatus;
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

export type PrepareReportingYearSetupResponse = {
  brand: {
    id: string;
    code: string;
    name: string;
  };
  sourceYear: number;
  targetYear: number;
  copied: {
    kpiItemCount: number;
    competitorAssignmentCount: number;
  };
  setup: ReportingYearSetupStatus;
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

export type BrandSummary = {
  id: string;
  code: string;
  name: string;
  timezone: string;
  status: string;
  createdAt: string;
  activatedAt: string | null;
  deactivatedAt: string | null;
  logoUrl?: string | null;
  memberships: Array<{
    id: string;
    role: 'admin' | 'content' | 'approver' | 'viewer';
    permissions?: {
      canCreateReports: boolean;
      canApproveReports: boolean;
    };
    user: {
      id: string;
      email: string;
      displayName: string;
      status: string;
    };
  }>;
};

export type BrandCampaignStatus = 'active' | 'inactive';
export type BrandCampaignChannel =
  | 'facebook'
  | 'instagram'
  | 'tiktok'
  | 'youtube'
  | 'x'
  | 'line'
  | 'website'
  | 'other';
export type BrandCampaignObjective = 'awareness' | 'engagement' | 'conversion';

export type BrandCampaignItem = {
  id: string;
  year: number;
  name: string;
  status: BrandCampaignStatus;
  channel: BrandCampaignChannel | null;
  objective: BrandCampaignObjective | null;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BrandCampaignListResponse = {
  brand: {
    id: string;
    code: string;
    name: string;
  };
  year: number;
  yearOptions: Array<{
    year: number;
    hasCampaigns: boolean;
  }>;
  items: BrandCampaignItem[];
};

export type CreateBrandCampaignPayload = {
  year: number;
  name: string;
  status?: BrandCampaignStatus;
  channel?: BrandCampaignChannel | null;
  objective?: BrandCampaignObjective | null;
  startDate?: string | null;
  endDate?: string | null;
  notes?: string | null;
};

export type UpdateBrandCampaignPayload = {
  name?: string;
  status?: BrandCampaignStatus;
  channel?: BrandCampaignChannel | null;
  objective?: BrandCampaignObjective | null;
  startDate?: string | null;
  endDate?: string | null;
  notes?: string | null;
};

export type CompanyFormatFieldKey =
  | 'content_style'
  | 'related_product'
  | 'media_format'
  | 'campaign_base'
  | 'content_objective';

export type CompanyFormatOptionStatus = 'active' | 'deprecated';

export type GlobalCompanyFormatOptionsResponse = {
  fields: Array<{
    key: CompanyFormatFieldKey;
    label: string;
    options: Array<{
      id: string;
      fieldKey: CompanyFormatFieldKey;
      valueKey: string;
      label: string;
      status: CompanyFormatOptionStatus;
      sortOrder: number;
    }>;
  }>;
};

export type BrandCompanyFormatOptionsResponse = {
  brand: {
    id: string;
    code: string;
    name: string;
  };
  fields: GlobalCompanyFormatOptionsResponse['fields'];
};

export type EngagementFormulaResponse = {
  key: 'engagement';
  label: string;
  operation: 'sum';
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

export type ComputedFormulaListResponse = {
  items: ComputedFormulaResponse[];
};

export type KpiSourceType = 'canonical_metric' | 'formula_column';

export type KpiCatalogItem = {
  id: string;
  key: string;
  label: string;
  description: string | null;
  sourceType: KpiSourceType;
  canonicalMetricKey: CanonicalTargetField | null;
  formulaId: string | null;
  formulaLabel: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  usage: {
    activePlanCount: number;
  };
};

export type KpiCatalogListResponse = {
  items: KpiCatalogItem[];
  newBrandDefaultKpiCatalogIds: string[];
};

export type BrandKpiPlanResponse = {
  brand: {
    id: string;
    code: string;
    name: string;
  };
  year: number;
  plan: {
    id: string | null;
    itemCount: number;
    updatedAt: string | null;
    approvedReportCount?: number;
    hasLegacyCoverageGap?: boolean;
  };
  items: Array<{
    id: string;
    sortOrder: number;
    targetValue: number | null;
    note: string | null;
    canRemove?: boolean;
    removeBlockedReason?: string | null;
    usage?: {
      approvedReportCount: number;
      blockedByLegacyCoverageGap: boolean;
    };
    kpi: {
      id: string;
      key: string;
      label: string;
      description: string | null;
      sourceType: KpiSourceType;
      canonicalMetricKey: CanonicalTargetField | null;
      formulaId: string | null;
      formulaLabel: string | null;
      isActive: boolean;
    };
  }>;
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

export type TopContentDataSourcePolicyMode = 'csv_only' | 'csv_and_manual';
export type ContentCountPolicyMode = 'csv_only' | 'csv_and_manual';

export type ContentCountPolicyResponse = {
  mode: ContentCountPolicyMode;
  label: string;
  excludeManualRows: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
  note: string | null;
};

export type TopContentDataSourcePolicyResponse = {
  mode: TopContentDataSourcePolicyMode;
  label: string;
  excludeManualRows: boolean;
  excludedContentStyleValueKeys: string[];
  excludedContentStyleLabels: string[];
  contentStyleOptions: Array<{
    valueKey: string;
    label: string;
    status: CompanyFormatOptionStatus;
  }>;
  updatedAt: string | null;
  updatedBy: string | null;
  note: string | null;
};

export type ImportColumnMappingRule = {
  targetField: string;
  baselineHeader: string;
  displayLabel: string;
  aliases: string[];
  required: boolean;
};

export type ImportColumnMappingConfigResponse = {
  targetCatalog: Array<{
    key: CanonicalTargetField;
    label: string;
    description: string;
  }>;
  published: {
    versionId: string;
    sourceFilename: string | null;
    publishedAt: string;
    publishedBy: string | null;
    note: string | null;
    rules: ImportColumnMappingRule[];
  } | null;
  draft: {
    sourceFilename: string | null;
    uploadedHeaderCount: number;
    uploadedHeaders: string[];
    updatedAt: string;
    updatedBy: string | null;
    rules: ImportColumnMappingRule[];
  } | null;
  history: Array<{
    versionId: string;
    sourceFilename: string | null;
    publishedAt: string;
    publishedBy: string | null;
    note: string | null;
    rules: ImportColumnMappingRule[];
  }>;
};

export type UserSummary = {
  id: string;
  email: string;
  displayName: string;
  status: 'active' | 'invited' | 'inactive';
  hasPassword: boolean;
  microsoftLinked: boolean;
  allowPassword: boolean;
  allowMicrosoft: boolean;
  signInMethod: 'microsoft_only' | 'password_only' | 'microsoft_and_password';
  memberships: Array<{
    id: string;
    role: 'admin' | 'content' | 'approver' | 'viewer';
    permissions?: {
      canCreateReports: boolean;
      canApproveReports: boolean;
    };
    brand: {
      id: string;
      code: string;
      name: string;
      status: 'active' | 'inactive';
    };
  }>;
  isBootstrapSuperAdmin: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SuperAdminBootstrapStatus = {
  mode: 'auto' | 'force' | 'disabled';
  setupRequired: boolean;
  enforceSetup: boolean;
  hasBootstrapSuperAdmin: boolean;
  activeAdminCount: number;
  reason: 'ready' | 'disabled' | 'forced_for_testing' | 'missing_bootstrap_super_admin';
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
    status: 'uploaded' | 'ready_for_mapping' | 'failed';
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
    status: 'uploaded' | 'ready_for_mapping' | 'failed';
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
    status: 'uploaded' | 'ready_for_mapping' | 'failed';
    createdAt: string;
    persistedRowCount: number;
    columnProfiles: Array<{
      id: string;
      sourceColumnName: string;
      sourceRawColumnName: string;
      sourcePosition: number;
      sampleValue: string | null;
      mappedTargetField: CanonicalTargetField | null;
    }>;
  } | null;
  availableTargets: Array<{
    key: CanonicalTargetField;
    label: string;
    description: string;
  }>;
  validation: {
    targetFieldsMustBeUnique: boolean;
  };
};

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
    status: 'uploaded' | 'ready_for_mapping' | 'failed';
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
  contentCount: {
    preview: {
      reportVersionId: string;
      countedContentCount: number;
      csvRowCount: number;
      manualRowCount: number;
      policyMode: ContentCountPolicyMode;
      policyLabel: string;
      policyUpdatedAt: string | null;
      policyUpdatedBy: string | null;
      policyNote: string | null;
    } | null;
    approvedSnapshot: {
      reportVersionId: string;
      capturedAt: string;
      approvedAt: string | null;
      countedContentCount: number;
      csvRowCount: number;
      manualRowCount: number;
      policyMode: ContentCountPolicyMode;
      policyLabel: string;
      policyUpdatedAt: string | null;
      policyUpdatedBy: string | null;
      policyNote: string | null;
    } | null;
  };
  preview: {
    totalRows: number;
    shownRows: number;
    truncated: boolean;
    columns: Array<{
      targetField: CanonicalTargetField;
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
    key: 'duplicate_targets' | 'csv_only_preview' | 'storage_unavailable';
    message: string;
  }>;
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
  items: Array<{
    id: string;
    key: string;
    label: string;
    description: string | null;
    sourceType: KpiSourceType;
    sourceLabel: string;
    canonicalMetricKey: CanonicalTargetField | null;
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
    mode: TopContentDataSourcePolicyMode;
    label: string;
    excludeManualRows: boolean;
  };
  cards: Array<{
    id: string;
    slotKey: 'top_views' | 'top_engagement' | 'top_reach';
    slotLabel: string;
    metricKey: CanonicalTargetField;
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

export type CompetitorOverviewResponse = {
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
    requiredCompetitorCount: number;
    completedCompetitorCount: number;
  };
  items: Array<{
    assignment: {
      status: CompetitorStatus;
      isRequired: boolean;
    };
    competitor: {
      id: string;
      name: string;
      primaryPlatform: string;
      displayOrder: number;
      websiteUrl: string | null;
      facebookUrl: string | null;
      instagramUrl: string | null;
      tiktokUrl: string | null;
      youtubeUrl: string | null;
    };
    evidence: {
      id: string | null;
      title: string | null;
      note: string | null;
      postUrl: string | null;
      capturedMetricLabel: string | null;
      capturedMetricValue: number | null;
      isComplete: boolean;
    };
    monitoring: {
      id: string | null;
      status: CompetitorMonitoringStatus | null;
      followerCount: number | null;
      monthlyPostCount: number | null;
      highlightNote: string | null;
      noActivityEvidenceImageUrl: string | null;
      posts: Array<{
        id: string;
        displayOrder: number;
        screenshotUrl: string;
        postUrl: string | null;
      }>;
      completion: {
        hasFollower: boolean;
        hasValidStatus: boolean;
        hasRequiredEvidence: boolean;
      };
      isComplete: boolean;
    };
  }>;
};

export type CompetitorCatalogResponse = {
  brand: {
    id: string;
    code: string;
    name: string;
  };
  items: Array<{
    id: string;
    name: string;
    primaryPlatform: string;
    status: CompetitorStatus;
    websiteUrl: string | null;
    facebookUrl: string | null;
    instagramUrl: string | null;
    tiktokUrl: string | null;
    youtubeUrl: string | null;
    usage: {
      assignedBrandCount: number;
      assignedYearCount: number;
    };
  }>;
};

export type CompetitorYearSetupResponse = {
  brand: {
    id: string;
    code: string;
    name: string;
    timezone: string;
  };
  year: number;
  summary: {
    totalAssigned: number;
    activeCatalogCount: number;
  };
  assignments: Array<{
    id: string;
    displayOrder: number;
    status: CompetitorStatus;
    canRemove: boolean;
    removeBlockedReason: string | null;
    competitor: {
      id: string;
      name: string;
      primaryPlatform: string;
      status: CompetitorStatus;
      websiteUrl: string | null;
      facebookUrl: string | null;
      instagramUrl: string | null;
      tiktokUrl: string | null;
      youtubeUrl: string | null;
    };
  }>;
  availableCompetitors: CompetitorCatalogResponse['items'];
};

export type QuestionOverviewResponse = {
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
    requiredQuestionCount: number;
    completedQuestionCount: number;
  };
  highlights: {
    note: string | null;
    screenshots: Array<{
      id: string;
      displayOrder: number;
      screenshotUrl: string;
    }>;
  };
  items: Array<{
    activation: {
      id: string;
      displayOrder: number;
    };
    question: {
      id: string;
      text: string;
      status: 'active' | 'inactive';
    };
    entry: {
      id: string | null;
      mode: 'has_questions' | 'no_questions';
      questionCount: number;
      note: string | null;
      screenshots: Array<{
        id: string;
        displayOrder: number;
        screenshotUrl: string;
      }>;
      isComplete: boolean;
    };
  }>;
};

export type QuestionSetupResponse = {
  brand: {
    id: string;
    code: string;
    name: string;
  };
  summary: {
    assignedCount: number;
    activeCatalogCount: number;
  };
  assignments: Array<{
    id: string;
    displayOrder: number;
    status: 'active' | 'inactive';
    canRemove: boolean;
    removeBlockedReason: string | null;
    question: {
      id: string;
      text: string;
      status: 'active' | 'inactive';
    };
    usage: {
      hasEvidence: boolean;
      hasApprovedEvidence: boolean;
    };
  }>;
  availableCatalog: Array<{
    id: string;
    text: string;
    status: 'active' | 'inactive';
    usage: {
      assignedBrandCount: number;
    };
  }>;
  fullCatalog: Array<{
    id: string;
    text: string;
    status: 'active' | 'inactive';
    usage: {
      assignedBrandCount: number;
    };
  }>;
};

export type QuestionCatalogResponse = {
  summary: {
    totalCount: number;
    activeCount: number;
    inactiveCount: number;
  };
  items: Array<{
    id: string;
    text: string;
    status: 'active' | 'inactive';
    canDelete: boolean;
    removeBlockedReason: string | null;
    usage: {
      assignedBrandCount: number;
      hasApprovedUsage: boolean;
    };
  }>;
};

export type AdminAuditLogListResponse = {
  items: Array<{
    id: string;
    time: string;
    actor: {
      userId: string | null;
      name: string | null;
      email: string | null;
    };
    action: {
      key: string;
      label: string;
    };
    entity: {
      type: 'USER' | 'BRAND' | 'REPORT' | 'CONTENT';
      id: string | null;
      label: string | null;
    };
    summary: string;
    metadata: Record<string, unknown> | null;
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

const AUTH_USER_EMAIL_COOKIE_NAME = 'bizgital-marketing-report.user-email';
const INTERNAL_API_SECRET_HEADER = 'X-Internal-Api-Secret';

export function getBackendApiBaseUrl() {
  if (typeof window !== 'undefined') {
    return process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api';
  }

  return (
    process.env.INTERNAL_API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    'http://localhost:3003/api'
  );
}

function resolveInternalApiSecret() {
  if (typeof window !== 'undefined') {
    return null;
  }

  const configuredSecret = (process.env.INTERNAL_API_AUTH_SECRET ?? '').trim();

  if (configuredSecret) {
    return configuredSecret;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('INTERNAL_API_AUTH_SECRET is required in production.');
  }

  return null;
}

async function readServerCookieHeader() {
  if (typeof window !== 'undefined') {
    return null;
  }

  try {
    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();
    return cookieStore
      .getAll()
      .map(cookie => `${cookie.name}=${encodeURIComponent(cookie.value)}`)
      .join('; ') || null;
  } catch {
    return null;
  }
}

export async function backendFetch(
  input: Parameters<typeof globalThis.fetch>[0],
  init?: Parameters<typeof globalThis.fetch>[1]
) {
  const headers = new Headers(init?.headers);
  const serverCookieHeader = await readServerCookieHeader();

  if (serverCookieHeader && !headers.has('Cookie')) {
    headers.set('Cookie', serverCookieHeader);
  }

  const internalApiSecret = serverCookieHeader ? null : resolveInternalApiSecret();

  if (internalApiSecret && !headers.has(INTERNAL_API_SECRET_HEADER)) {
    headers.set(INTERNAL_API_SECRET_HEADER, internalApiSecret);
  }

  return globalThis.fetch(input, {
    ...init,
    headers,
    credentials: init?.credentials ?? 'include'
  });
}

const fetch = backendFetch;

function readActorEmailFromClientCookie() {
  if (typeof document === 'undefined') {
    return null;
  }

  const cookiePair = document.cookie
    .split(';')
    .map(item => item.trim())
    .find(item => item.startsWith(`${AUTH_USER_EMAIL_COOKIE_NAME}=`));

  if (!cookiePair) {
    return null;
  }

  const encodedValue = cookiePair.slice(`${AUTH_USER_EMAIL_COOKIE_NAME}=`.length);
  const decodedValue = decodeURIComponent(encodedValue).trim().toLowerCase();
  return decodedValue || null;
}

function withActorFromCookie(body?: Record<string, unknown>) {
  if (typeof document === 'undefined') {
    return body;
  }

  const actorEmail = readActorEmailFromClientCookie();
  if (!actorEmail) {
    return body;
  }

  const nextBody: Record<string, unknown> = body ? { ...body } : {};
  if (!nextBody.actorEmail) {
    nextBody.actorEmail = actorEmail;
  }

  return nextBody;
}

async function readResponseErrorMessage(
  response: Response,
  fallbackMessage: string
) {
  let message = fallbackMessage;

  try {
    const payload = (await response.json()) as { message?: string | string[] };

    if (Array.isArray(payload.message)) {
      message = payload.message.join(', ');
    } else if (payload.message) {
      message = payload.message;
    }
  } catch {
    message = response.statusText || fallbackMessage;
  }

  if (response.status === 404) {
    return `${message} (HTTP 404). This usually means backend route is outdated; rebuild/restart backend service.`;
  }

  return `${message} (HTTP ${response.status}).`;
}

async function fetchWithTransient5xxRetry(
  url: string,
  init: RequestInit,
  fallbackMessage: string
) {
  const transientStatuses = new Set([500, 502, 503, 504]);
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetch(url, init);
    if (response.ok) {
      return response;
    }

    const shouldRetry = attempt < maxAttempts && transientStatuses.has(response.status);
    if (shouldRetry) {
      await new Promise(resolve => setTimeout(resolve, 150));
      continue;
    }

    throw new Error(await readResponseErrorMessage(response, fallbackMessage));
  }

  throw new Error(fallbackMessage);
}

export async function getBrands(): Promise<BrandSummary[]> {
  const response = await fetch(`${getBackendApiBaseUrl()}/brands`, {
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error('Failed to load brands.');
  }

  return response.json();
}

export async function getBrand(brandCode: string): Promise<BrandSummary> {
  const response = await fetch(`${getBackendApiBaseUrl()}/brands/${brandCode}`, {
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(`Failed to load brand ${brandCode}.`);
  }

  return response.json();
}

export async function createBrand(payload: {
  code?: string;
  name: string;
  timezone?: string;
  status?: 'active' | 'inactive';
  logoUrl?: string | null;
  responsibleUserIds?: string[];
}) {
  return postReportingAction('/brands', payload);
}

export async function updateBrand(
  brandCode: string,
  payload: {
    name?: string;
    timezone?: string;
    status?: 'active' | 'inactive';
    logoUrl?: string | null;
    responsibleUserIds?: string[];
  }
) {
  return postReportingAction(`/brands/${brandCode}`, payload);
}

export async function deleteBrand(brandCode: string) {
  return deleteReportingAction(`/brands/${brandCode}`);
}

export async function getBrandCampaigns(
  brandCode: string,
  options?: {
    year?: number;
    includeInactive?: boolean;
  }
): Promise<BrandCampaignListResponse> {
  const searchParams = new URLSearchParams();

  if (typeof options?.year === 'number' && Number.isInteger(options.year)) {
    searchParams.set('year', String(options.year));
  }

  if (options?.includeInactive) {
    searchParams.set('includeInactive', 'true');
  }

  const query = searchParams.toString();
  const response = await fetch(
    `${getBackendApiBaseUrl()}/brands/${brandCode}/campaigns${query ? `?${query}` : ''}`,
    {
      cache: 'no-store'
    }
  );

  if (!response.ok) {
    throw new Error(
      await readResponseErrorMessage(
        response,
        `Failed to load campaigns for brand ${brandCode}.`
      )
    );
  }

  return response.json();
}

export async function createBrandCampaign(
  brandCode: string,
  payload: CreateBrandCampaignPayload
): Promise<{ item: BrandCampaignItem }> {
  return postReportingAction(`/brands/${brandCode}/campaigns`, payload);
}

export async function updateBrandCampaign(
  brandCode: string,
  campaignId: string,
  payload: UpdateBrandCampaignPayload
): Promise<{ item: BrandCampaignItem }> {
  return postReportingAction(`/brands/${brandCode}/campaigns/${campaignId}`, payload);
}

export async function deleteBrandCampaign(
  brandCode: string,
  campaignId: string
): Promise<{ deleted: boolean }> {
  return deleteReportingAction(`/brands/${brandCode}/campaigns/${campaignId}`);
}

export async function getUsers(): Promise<UserSummary[]> {
  const response = await fetch(`${getBackendApiBaseUrl()}/users`, {
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(await readResponseErrorMessage(response, 'Failed to load users.'));
  }

  return response.json();
}

export async function getSuperAdminBootstrapStatus(): Promise<SuperAdminBootstrapStatus> {
  const response = await fetch(`${getBackendApiBaseUrl()}/users/bootstrap/status`, {
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(
      await readResponseErrorMessage(response, 'Failed to load Super Admin setup status.')
    );
  }

  return response.json();
}

export async function bootstrapSuperAdmin(payload: {
  email: string;
  displayName: string;
  password: string;
}) {
  return postReportingAction('/users/bootstrap/super-admin', payload);
}

export async function getAdminAuditLogs(params: {
  actorEmail: string;
  q?: string;
  page?: number;
  limit?: number;
}): Promise<AdminAuditLogListResponse> {
  const searchParams = new URLSearchParams({
    actorEmail: params.actorEmail
  });

  if (params.q) {
    searchParams.set('q', params.q);
  }
  if (params.page !== undefined) {
    searchParams.set('page', String(params.page));
  }
  if (params.limit !== undefined) {
    searchParams.set('limit', String(params.limit));
  }

  const response = await fetch(
    `${getBackendApiBaseUrl()}/admin/audit-logs?${searchParams.toString()}`,
    {
      cache: 'no-store'
    }
  );

  if (!response.ok) {
    throw new Error(
      await readResponseErrorMessage(response, 'Failed to load admin audit logs.')
    );
  }

  return response.json();
}

export async function createUser(payload: {
  email: string;
  displayName: string;
  status?: 'active' | 'invited' | 'inactive';
  signInMethod?: 'microsoft_only' | 'password_only' | 'microsoft_and_password';
  password?: string;
  memberships?: Array<{
    brandCode: string;
    role: 'admin' | 'content' | 'approver' | 'viewer';
  }>;
}) {
  return postReportingAction('/users', payload);
}

export async function updateUser(
  userId: string,
  payload: {
    email?: string;
    displayName?: string;
    status?: 'active' | 'invited' | 'inactive';
    signInMethod?: 'microsoft_only' | 'password_only' | 'microsoft_and_password';
    password?: string;
    memberships?: Array<{
      brandCode: string;
    role: 'admin' | 'content' | 'approver' | 'viewer';
    }>;
    replaceMemberships?: boolean;
  }
) {
  return postReportingAction(`/users/${userId}`, payload);
}

export async function deleteUser(userId: string) {
  return deleteReportingAction(`/users/${userId}`);
}

export async function loginWithPassword(payload: {
  email: string;
  password: string;
}) {
  return postReportingAction('/users/auth/password-login', payload);
}

export async function loginWithMicrosoft(payload: {
  oid: string;
  email?: string;
  displayName?: string;
}) {
  return postReportingAction('/users/auth/microsoft-login', payload);
}

export async function getGlobalCompanyFormatOptions(
  options?: {
    includeDeprecated?: boolean;
  }
): Promise<GlobalCompanyFormatOptionsResponse> {
  const params = new URLSearchParams();

  if (options?.includeDeprecated) {
    params.set('includeDeprecated', 'true');
  }

  const suffix = params.toString();
  const response = await fetch(
    `${getBackendApiBaseUrl()}/config/internal-options${suffix ? `?${suffix}` : ''}`,
    {
      cache: 'no-store'
    }
  );

  if (!response.ok) {
    throw new Error(
      await readResponseErrorMessage(
        response,
        'Failed to load global internal options.'
      )
    );
  }

  return response.json();
}

export async function getBrandCompanyFormatOptions(
  brandCode: string,
  options?: {
    includeDeprecated?: boolean;
  }
): Promise<BrandCompanyFormatOptionsResponse> {
  const params = new URLSearchParams();

  if (options?.includeDeprecated) {
    params.set('includeDeprecated', 'true');
  }

  const suffix = params.toString();
  const response = await fetch(
    `${getBackendApiBaseUrl()}/brands/${brandCode}/internal-options${suffix ? `?${suffix}` : ''}`,
    {
      cache: 'no-store'
    }
  );

  if (!response.ok) {
    throw new Error(
      await readResponseErrorMessage(
        response,
        `Failed to load internal options for ${brandCode}.`
      )
    );
  }

  return response.json();
}

export async function createGlobalCompanyFormatOption(
  payload: {
    fieldKey: CompanyFormatFieldKey;
    label: string;
  }
) {
  return postReportingAction('/config/internal-options', payload);
}

export async function updateGlobalCompanyFormatOption(
  optionId: string,
  payload: {
    label?: string;
    status?: CompanyFormatOptionStatus;
  }
) {
  return postReportingAction(`/config/internal-options/${optionId}`, payload);
}

export async function deleteGlobalCompanyFormatOption(optionId: string) {
  const response = await fetch(`${getBackendApiBaseUrl()}/config/internal-options/${optionId}`, {
    method: 'DELETE',
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(
      await readResponseErrorMessage(response, 'Failed to delete global internal option.')
    );
  }

  return response.json();
}

export async function reorderGlobalCompanyFormatOptions(
  payload: {
    fieldKey: CompanyFormatFieldKey;
    optionIds: string[];
  }
) {
  return postReportingAction('/config/internal-options/reorder', payload);
}

export async function createBrandCompanyFormatOption(
  brandCode: string,
  payload: {
    fieldKey: CompanyFormatFieldKey;
    label: string;
  }
) {
  return postReportingAction(`/brands/${brandCode}/internal-options`, payload);
}

export async function updateBrandCompanyFormatOption(
  brandCode: string,
  optionId: string,
  payload: {
    label?: string;
    status?: CompanyFormatOptionStatus;
  }
) {
  return postReportingAction(
    `/brands/${brandCode}/internal-options/${optionId}`,
    payload
  );
}

export async function reorderBrandCompanyFormatOptions(
  brandCode: string,
  payload: {
    fieldKey: CompanyFormatFieldKey;
    optionIds: string[];
  }
) {
  return postReportingAction(
    `/brands/${brandCode}/internal-options/reorder`,
    payload
  );
}

export async function getEngagementFormula(): Promise<EngagementFormulaResponse> {
  const response = await fetch(`${getBackendApiBaseUrl()}/config/computed-columns/engagement`, {
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(
      await readResponseErrorMessage(response, 'Failed to load engagement formula.')
    );
  }

  return response.json();
}

export async function updateEngagementFormula(payload: {
  label?: string;
  sourceLabelA: string;
  sourceLabelB: string;
}) {
  return postReportingAction('/config/computed-columns/engagement', payload);
}

export async function getMetaColumnCatalog(
  options?: {
    limit?: number;
  }
): Promise<MetaColumnCatalogResponse> {
  const params = new URLSearchParams();
  if (options?.limit !== undefined) {
    params.set('limit', String(options.limit));
  }

  const response = await fetchWithTransient5xxRetry(
    `${getBackendApiBaseUrl()}/config/meta-columns${params.toString() ? `?${params.toString()}` : ''}`,
    {
      cache: 'no-store'
    },
    'Failed to load Meta column catalog.'
  );

  return response.json();
}

export async function getComputedFormulas(options?: {
  activeOnly?: boolean;
}): Promise<ComputedFormulaListResponse> {
  const params = new URLSearchParams();
  if (options?.activeOnly) {
    params.set('activeOnly', 'true');
  }

  const response = await fetchWithTransient5xxRetry(
    `${getBackendApiBaseUrl()}/config/computed-formulas${params.toString() ? `?${params.toString()}` : ''}`,
    {
      cache: 'no-store'
    },
    'Failed to load computed formulas.'
  );

  return response.json();
}

export async function createComputedFormula(payload: {
  columnLabel: string;
  expression: string;
  isActive?: boolean;
}) {
  return postReportingAction('/config/computed-formulas', payload);
}

export async function getKpiCatalog(options?: {
  includeInactive?: boolean;
}): Promise<KpiCatalogListResponse> {
  const params = new URLSearchParams();
  if (options?.includeInactive) {
    params.set('includeInactive', 'true');
  }

  const response = await fetch(
    `${getBackendApiBaseUrl()}/config/kpis${params.toString() ? `?${params.toString()}` : ''}`,
    {
      cache: 'no-store'
    }
  );

  if (!response.ok) {
    throw new Error(await readResponseErrorMessage(response, 'Failed to load KPI catalog.'));
  }

  return response.json();
}

export async function createKpiCatalogItem(payload: {
  label: string;
  description?: string | null;
  sourceType: KpiSourceType;
  canonicalMetricKey?: CanonicalTargetField | null;
  formulaId?: string | null;
  isActive?: boolean;
}) {
  return postReportingAction('/config/kpis', payload);
}

export async function updateKpiCatalogItem(
  kpiId: string,
  payload: {
    label?: string;
    description?: string | null;
    sourceType?: KpiSourceType;
    canonicalMetricKey?: CanonicalTargetField | null;
    formulaId?: string | null;
    isActive?: boolean;
  }
) {
  return postReportingAction(`/config/kpis/${kpiId}`, payload);
}

export async function deleteKpiCatalogItem(kpiId: string) {
  return deleteReportingAction(`/config/kpis/${kpiId}`);
}

export async function getBrandKpiPlan(
  brandCode: string,
  year: number
): Promise<BrandKpiPlanResponse> {
  const response = await fetch(`${getBackendApiBaseUrl()}/brands/${brandCode}/kpi-plans/${year}`, {
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(
      await readResponseErrorMessage(
        response,
        `Failed to load KPI plan for ${brandCode} ${year}.`
      )
    );
  }

  return response.json();
}

export async function updateBrandKpiPlan(
  brandCode: string,
  year: number,
  payload: {
    items: Array<{
      kpiCatalogId: string;
      targetValue?: number | null;
      note?: string | null;
      sortOrder?: number | null;
    }>;
  }
) {
  return postReportingAction(`/brands/${brandCode}/kpi-plans/${year}`, payload);
}

export async function updateComputedFormula(
  formulaId: string,
  payload: {
    columnLabel?: string;
    expression?: string;
    isActive?: boolean;
  }
) {
  return postReportingAction(`/config/computed-formulas/${formulaId}`, payload);
}

export async function deleteComputedFormula(formulaId: string) {
  return deleteReportingAction(`/config/computed-formulas/${formulaId}`);
}

export async function previewComputedFormula(payload: {
  expression: string;
  sample?: Record<string, string | null>;
}): Promise<ComputedFormulaPreviewResponse> {
  const response = await fetch(`${getBackendApiBaseUrl()}/config/computed-formulas/preview`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload),
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(
      await readResponseErrorMessage(response, 'Failed to preview formula.')
    );
  }

  return response.json();
}

export async function getImportTableLayout(): Promise<ImportTableLayoutResponse> {
  const response = await fetch(`${getBackendApiBaseUrl()}/config/import-table-layout`, {
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(
      await readResponseErrorMessage(response, 'Failed to load import table layout settings.')
    );
  }

  return response.json();
}

export async function updateImportTableLayout(payload: {
  visibleSourceColumnLabels: string[];
}) {
  return postReportingAction('/config/import-table-layout', payload);
}

export async function getTopContentDataSourcePolicy(): Promise<TopContentDataSourcePolicyResponse> {
  const response = await fetch(`${getBackendApiBaseUrl()}/config/top-content-data-source-policy`, {
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(
      await readResponseErrorMessage(
        response,
        'Failed to load top content data source policy.'
      )
    );
  }

  return response.json();
}

export async function getContentCountPolicy(): Promise<ContentCountPolicyResponse> {
  const response = await fetch(`${getBackendApiBaseUrl()}/config/content-count-policy`, {
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(
      await readResponseErrorMessage(response, 'Failed to load content count policy.')
    );
  }

  return response.json();
}

export async function updateTopContentDataSourcePolicy(payload: {
  mode: TopContentDataSourcePolicyMode;
  actorEmail?: string | null;
  note?: string | null;
  excludedContentStyleValueKeys?: string[];
}) {
  return postReportingAction('/config/top-content-data-source-policy', payload);
}

export async function updateContentCountPolicy(payload: {
  mode: ContentCountPolicyMode;
  actorEmail?: string | null;
  note?: string | null;
}) {
  return postReportingAction('/config/content-count-policy', payload);
}

export async function getImportColumnMappingConfig(): Promise<ImportColumnMappingConfigResponse> {
  const response = await fetch(`${getBackendApiBaseUrl()}/config/import-column-mapping`, {
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(
      await readResponseErrorMessage(response, 'Failed to load import column mapping config.')
    );
  }

  return response.json();
}

export async function createImportColumnMappingDraftFromHeaders(payload: {
  headers: string[];
  sourceFilename?: string | null;
  actorEmail?: string | null;
}) {
  return postReportingAction('/config/import-column-mapping/draft/from-headers', payload);
}

export async function updateImportColumnMappingDraft(payload: {
  sourceFilename?: string | null;
  uploadedHeaders?: string[];
  actorEmail?: string | null;
  rules: ImportColumnMappingRule[];
}) {
  return postReportingAction('/config/import-column-mapping/draft', payload);
}

export async function discardImportColumnMappingDraft() {
  return postReportingAction('/config/import-column-mapping/draft/discard', {});
}

export async function publishImportColumnMapping(payload?: {
  actorEmail?: string | null;
  note?: string | null;
}) {
  return postReportingAction('/config/import-column-mapping/publish', payload ?? {});
}

export async function rollbackImportColumnMapping(payload: {
  versionId: string;
  actorEmail?: string | null;
  note?: string | null;
}) {
  return postReportingAction('/config/import-column-mapping/rollback', payload);
}

export async function getReportingPeriods(
  brandId: string,
  year?: number
): Promise<ReportingListResponse> {
  const yearQuery = typeof year === 'number' ? `?year=${year}` : '';
  const response = await fetch(
    `${getBackendApiBaseUrl()}/brands/${brandId}/reporting-periods${yearQuery}`,
    {
      cache: 'no-store'
    }
  );

  if (!response.ok) {
    throw new Error(
      await readResponseErrorMessage(
        response,
        `Failed to load reporting periods for ${brandId}.`
      )
    );
  }

  return response.json();
}

export async function prepareReportingYearSetup(payload: {
  brandId: string;
  targetYear: number;
  sourceYear?: number;
}): Promise<PrepareReportingYearSetupResponse> {
  return postReportingAction(
    `/brands/${payload.brandId}/reporting-periods/year-setup/prepare`,
    {
      targetYear: payload.targetYear,
      sourceYear: payload.sourceYear
    }
  );
}

export async function getReportingRecycleBin(
  brandId: string,
  year?: number
): Promise<ReportingRecycleBinResponse> {
  const yearQuery = typeof year === 'number' ? `?year=${year}` : '';
  const response = await fetch(
    `${getBackendApiBaseUrl()}/brands/${brandId}/reporting-periods/recycle-bin${yearQuery}`,
    {
      cache: 'no-store'
    }
  );

  if (!response.ok) {
    throw new Error(
      await readResponseErrorMessage(
        response,
        `Failed to load recycle bin for ${brandId}.`
      )
    );
  }

  return response.json();
}

export async function getReportingPeriodDetail(
  brandId: string,
  periodId: string
): Promise<ReportingDetailResponse> {
  const response = await fetch(
    `${getBackendApiBaseUrl()}/brands/${brandId}/reporting-periods/${periodId}`,
    {
      cache: 'no-store'
    }
  );

  if (!response.ok) {
    throw new Error(
      await readResponseErrorMessage(
        response,
        `Failed to load reporting period ${periodId}.`
      )
    );
  }

  return response.json();
}

export async function deleteReportingPeriod(periodId: string) {
  return deleteReportingAction(`/reporting-periods/${periodId}`);
}

export async function restoreReportingPeriod(payload: {
  periodId: string;
  actorName?: string | null;
  actorEmail?: string | null;
}) {
  return postReportingAction(`/reporting-periods/${payload.periodId}/restore`, {
    actorName: payload.actorName ?? null,
    actorEmail: payload.actorEmail ?? null
  });
}

export async function getImportJobs(
  brandId: string,
  periodId: string
): Promise<ImportJobListResponse> {
  const response = await fetch(
    `${getBackendApiBaseUrl()}/brands/${brandId}/reporting-periods/${periodId}/import-jobs`,
    {
      cache: 'no-store'
    }
  );

  if (!response.ok) {
    throw new Error(
      await readResponseErrorMessage(
        response,
        `Failed to load import jobs for period ${periodId}.`
      )
    );
  }

  return response.json();
}

export async function getLatestImportPreview(
  brandId: string,
  periodId: string
): Promise<ImportPreviewResponse> {
  const response = await fetch(
    `${getBackendApiBaseUrl()}/brands/${brandId}/reporting-periods/${periodId}/import-jobs/preview`,
    {
      cache: 'no-store'
    }
  );

  if (!response.ok) {
    throw new Error(
      await readResponseErrorMessage(
        response,
        `Failed to load import preview for period ${periodId}.`
      )
    );
  }

  return response.json();
}

export async function getMappingOverview(
  brandId: string,
  periodId: string
): Promise<MappingOverviewResponse> {
  const response = await fetch(
    `${getBackendApiBaseUrl()}/brands/${brandId}/reporting-periods/${periodId}/mapping`,
    {
      cache: 'no-store'
    }
  );

  if (!response.ok) {
    throw new Error(
      await readResponseErrorMessage(
        response,
        `Failed to load mapping overview for period ${periodId}.`
      )
    );
  }

  return response.json();
}

export async function getDatasetOverview(
  brandId: string,
  periodId: string
): Promise<DatasetOverviewResponse> {
  const response = await fetch(
    `${getBackendApiBaseUrl()}/brands/${brandId}/reporting-periods/${periodId}/dataset`,
    {
      cache: 'no-store'
    }
  );

  if (!response.ok) {
    throw new Error(
      await readResponseErrorMessage(
        response,
        `Failed to load dataset overview for period ${periodId}.`
      )
    );
  }

  return response.json();
}

export async function getMetricsOverview(
  brandId: string,
  periodId: string
): Promise<MetricsOverviewResponse> {
  const response = await fetch(
    `${getBackendApiBaseUrl()}/brands/${brandId}/reporting-periods/${periodId}/metrics`,
    {
      cache: 'no-store'
    }
  );

  if (!response.ok) {
    throw new Error(
      await readResponseErrorMessage(
        response,
        `Failed to load metrics overview for period ${periodId}.`
      )
    );
  }

  return response.json();
}

export async function getMetricsKpiPreview(
  brandId: string,
  periodId: string
): Promise<MetricsKpiPreviewResponse> {
  const response = await fetch(
    `${getBackendApiBaseUrl()}/brands/${brandId}/reporting-periods/${periodId}/metrics/preview`,
    {
      cache: 'no-store'
    }
  );

  if (!response.ok) {
    throw new Error(
      await readResponseErrorMessage(
        response,
        `Failed to load KPI preview for period ${periodId}.`
      )
    );
  }

  return response.json();
}

export async function getTopContentOverview(
  brandId: string,
  periodId: string
): Promise<TopContentOverviewResponse> {
  const response = await fetch(
    `${getBackendApiBaseUrl()}/brands/${brandId}/reporting-periods/${periodId}/top-content`,
    {
      cache: 'no-store'
    }
  );

  if (!response.ok) {
    throw new Error(
      await readResponseErrorMessage(
        response,
        `Failed to load top content overview for period ${periodId}.`
      )
    );
  }

  return response.json();
}

export async function saveTopContentCard(
  brandId: string,
  periodId: string,
  cardId: string,
  payload: {
    screenshotUrl?: string | null;
  }
) {
  const requestPayload = withActorFromCookie(payload as Record<string, unknown>) ?? payload;
  const response = await fetch(
    `${getBackendApiBaseUrl()}/brands/${brandId}/reporting-periods/${periodId}/top-content/${cardId}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestPayload),
      cache: 'no-store',
      keepalive: true
    }
  );

  if (!response.ok) {
    throw new Error(
      await readResponseErrorMessage(
        response,
        `Failed to save top content card ${cardId}.`
      )
    );
  }

  return response.json();
}

export async function getCompetitorOverview(
  brandId: string,
  periodId: string
): Promise<CompetitorOverviewResponse> {
  const response = await fetch(
    `${getBackendApiBaseUrl()}/brands/${brandId}/reporting-periods/${periodId}/competitors`,
    {
      cache: 'no-store'
    }
  );

  if (!response.ok) {
    throw new Error(
      await readResponseErrorMessage(
        response,
        `Failed to load competitor overview for period ${periodId}.`
      )
    );
  }

  return response.json();
}

export async function saveCompetitorMonitoring(
  brandId: string,
  periodId: string,
  competitorId: string,
  payload: {
    status?: CompetitorMonitoringStatus | null;
    followerCount?: number | null;
    monthlyPostCount?: number | null;
    highlightNote?: string | null;
    noActivityEvidenceImageUrl?: string | null;
    posts?: Array<{
      displayOrder?: number | null;
      screenshotUrl?: string | null;
      postUrl?: string | null;
    }>;
  }
) {
  return postReportingAction(
    `/brands/${brandId}/reporting-periods/${periodId}/competitors/${competitorId}/monitoring`,
    payload
  );
}

export async function getCompetitorCatalog(
  brandId: string
): Promise<CompetitorCatalogResponse> {
  const response = await fetch(
    `${getBackendApiBaseUrl()}/brands/${brandId}/competitor-setup/catalog`,
    {
      cache: 'no-store'
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to load competitor catalog for brand ${brandId}.`);
  }

  return response.json();
}

export async function createCompetitorMaster(
  brandId: string,
  payload: {
    name: string;
    primaryPlatform: string;
    status?: CompetitorStatus;
    websiteUrl?: string | null;
    facebookUrl?: string | null;
    instagramUrl?: string | null;
    tiktokUrl?: string | null;
    youtubeUrl?: string | null;
  }
) {
  return postReportingAction(`/brands/${brandId}/competitor-setup/catalog`, payload);
}

export async function updateCompetitorMaster(
  brandId: string,
  competitorId: string,
  payload: {
    name?: string;
    primaryPlatform?: string;
    status?: CompetitorStatus;
    websiteUrl?: string | null;
    facebookUrl?: string | null;
    instagramUrl?: string | null;
    tiktokUrl?: string | null;
    youtubeUrl?: string | null;
  }
) {
  const response = await fetch(
    `${getBackendApiBaseUrl()}/brands/${brandId}/competitor-setup/catalog/${competitorId}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      cache: 'no-store'
    }
  );

  if (!response.ok) {
    throw new Error(await readResponseErrorMessage(response, 'Failed to update competitor.'));
  }

  return response.json();
}

export async function deleteCompetitorMaster(brandId: string, competitorId: string) {
  return deleteReportingAction(
    `/brands/${brandId}/competitor-setup/catalog/${competitorId}`
  );
}

export async function getCompetitorYearSetup(
  brandId: string,
  year: number
): Promise<CompetitorYearSetupResponse> {
  const response = await fetch(
    `${getBackendApiBaseUrl()}/brands/${brandId}/competitor-setup/${year}`,
    {
      cache: 'no-store'
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to load competitor setup for year ${year}.`);
  }

  return response.json();
}

export async function saveCompetitorYearAssignments(
  brandId: string,
  year: number,
  competitorIds: string[]
) {
  return postReportingAction(
    `/brands/${brandId}/competitor-setup/${year}/assignments`,
    { competitorIds }
  );
}

export async function updateCompetitorYearAssignmentStatus(
  brandId: string,
  year: number,
  competitorId: string,
  payload: {
    status: CompetitorStatus;
    effectiveMonth?: number;
  }
) {
  const response = await fetch(
    `${getBackendApiBaseUrl()}/brands/${brandId}/competitor-setup/${year}/assignments/${competitorId}/status`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      cache: 'no-store'
    }
  );

  if (!response.ok) {
    throw new Error(
      await readResponseErrorMessage(
        response,
        'Failed to update competitor assignment status.'
      )
    );
  }

  return response.json();
}

export async function copyCompetitorYearAssignments(
  brandId: string,
  sourceYear: number,
  targetYear: number
) {
  return postReportingAction(
    `/brands/${brandId}/competitor-setup/${targetYear}/copy-from/${sourceYear}`
  );
}

export async function getQuestionSetup(
  brandId: string
): Promise<QuestionSetupResponse> {
  const response = await fetch(
    `${getBackendApiBaseUrl()}/brands/${brandId}/question-setup`,
    {
      cache: 'no-store'
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to load question setup for brand ${brandId}.`);
  }

  return response.json();
}

export async function getQuestionCatalog(): Promise<QuestionCatalogResponse> {
  const response = await fetch(`${getBackendApiBaseUrl()}/config/questions/catalog`, {
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(
      await readResponseErrorMessage(response, 'Failed to load global question catalog.')
    );
  }

  return response.json();
}

export async function createQuestionCatalogItem(payload: {
  questionText: string;
  status?: 'active' | 'inactive';
}) {
  return postReportingAction('/config/questions/catalog', payload);
}

export async function updateQuestionCatalogItem(
  questionId: string,
  payload: {
    questionText?: string;
    status?: 'active' | 'inactive';
  }
) {
  const response = await fetch(
    `${getBackendApiBaseUrl()}/config/questions/catalog/${questionId}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      cache: 'no-store'
    }
  );

  if (!response.ok) {
    throw new Error(
      await readResponseErrorMessage(response, 'Failed to update question category.')
    );
  }

  return response.json();
}

export async function deleteQuestionCatalogItem(questionId: string) {
  const response = await fetch(
    `${getBackendApiBaseUrl()}/config/questions/catalog/${questionId}`,
    {
      method: 'DELETE',
      cache: 'no-store'
    }
  );

  if (!response.ok) {
    throw new Error(
      await readResponseErrorMessage(response, 'Failed to delete question category.')
    );
  }

  return response.json();
}

export async function saveQuestionAssignments(
  brandId: string,
  questionIds: string[]
) {
  return postReportingAction(`/brands/${brandId}/question-setup/assignments`, {
    questionIds
  });
}

export async function createMediaPresignedUpload(payload: {
  scope?: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<MediaPresignUploadResponse> {
  const response = await fetch(`${getBackendApiBaseUrl()}/media/presign-upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
    credentials: 'include'
  });

  if (!response.ok) {
    throw new Error(
      await readResponseErrorMessage(response, 'Failed to prepare media upload.')
    );
  }

  return response.json();
}

export async function deleteMediaObject(payload: {
  publicUrl?: string;
  objectKey?: string;
}): Promise<MediaDeleteObjectResponse> {
  const response = await fetch(`${getBackendApiBaseUrl()}/media/delete-object`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
    credentials: 'include'
  });

  if (!response.ok) {
    throw new Error(
      await readResponseErrorMessage(response, 'Failed to delete media object.')
    );
  }

  return response.json();
}

export async function getQuestionOverview(
  brandId: string,
  periodId: string
): Promise<QuestionOverviewResponse> {
  const response = await fetch(
    `${getBackendApiBaseUrl()}/brands/${brandId}/reporting-periods/${periodId}/questions`,
    {
      cache: 'no-store'
    }
  );

  if (!response.ok) {
    throw new Error(
      await readResponseErrorMessage(
        response,
        `Failed to load question overview for period ${periodId}.`
      )
    );
  }

  return response.json();
}

export async function saveQuestionEntry(
  brandId: string,
  periodId: string,
  activationId: string,
  payload: {
    mode: 'has_questions' | 'no_questions';
    questionCount: number;
    note?: string | null;
    screenshots?: string[];
  }
) {
  return postReportingAction(
    `/brands/${brandId}/reporting-periods/${periodId}/questions/${activationId}`,
    payload
  );
}

export async function saveQuestionHighlights(
  brandId: string,
  periodId: string,
  payload: {
    note?: string | null;
    screenshots: string[];
  }
) {
  return postReportingAction(
    `/brands/${brandId}/reporting-periods/${periodId}/questions/highlights`,
    payload
  );
}

export async function postReportingAction(
  path: string,
  body?: Record<string, unknown>
) {
  const requestBody = withActorFromCookie(body);
  const response = await fetch(`${getBackendApiBaseUrl()}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: requestBody ? JSON.stringify(requestBody) : undefined,
    cache: 'no-store'
  });

  if (!response.ok) {
    let message = 'Request failed.';

    try {
      const payload = (await response.json()) as { message?: string | string[] };

      if (Array.isArray(payload.message)) {
        message = payload.message.join(', ');
      } else if (payload.message) {
        message = payload.message;
      }
    } catch {
      message = response.statusText || message;
    }

    throw new Error(message);
  }

  return response.json();
}

export async function deleteReportingAction(path: string) {
  const response = await fetch(`${getBackendApiBaseUrl()}${path}`, {
    method: 'DELETE',
    cache: 'no-store'
  });

  if (!response.ok) {
    let message = 'Request failed.';

    try {
      const payload = (await response.json()) as { message?: string | string[] };

      if (Array.isArray(payload.message)) {
        message = payload.message.join(', ');
      } else if (payload.message) {
        message = payload.message;
      }
    } catch {
      message = response.statusText || message;
    }

    throw new Error(message);
  }

  return response.json();
}
