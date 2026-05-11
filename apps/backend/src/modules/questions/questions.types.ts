import type {
  QuestionStatus,
  ReportWorkflowState
} from '@prisma/client';

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
    noteOptional: boolean;
    screenshots: Array<{
      id: string;
      displayOrder: number;
      screenshotUrl: string;
    }>;
  };
  relatedProductOptions: Array<{
    id: string;
    valueKey: string;
    label: string;
    sortOrder: number;
    status: 'active' | 'deprecated';
  }>;
  items: Array<{
    activation: {
      id: string;
      displayOrder: number;
    };
    question: {
      id: string;
      text: string;
      description: string | null;
      status: QuestionStatus;
    };
    entry: {
      id: string | null;
      mode: 'has_questions' | 'no_questions';
      questionCount: number;
      note: string | null;
      relatedProductBreakdown: Array<{
        id: string;
        relatedProductOptionId: string;
        valueKey: string;
        label: string;
        questionCount: number;
        displayOrder: number;
      }>;
      otherUnspecifiedCount: number;
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
    status: QuestionStatus;
    canRemove: boolean;
    removeBlockedReason: string | null;
    question: {
      id: string;
      text: string;
      description: string | null;
      status: QuestionStatus;
    };
    usage: {
      hasEvidence: boolean;
      hasApprovedEvidence: boolean;
    };
  }>;
  availableCatalog: Array<{
    id: string;
    text: string;
    description: string | null;
    status: QuestionStatus;
    usage: {
      assignedBrandCount: number;
    };
  }>;
  fullCatalog: Array<{
    id: string;
    text: string;
    description: string | null;
    status: QuestionStatus;
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
    description: string | null;
    status: QuestionStatus;
    canDelete: boolean;
    removeBlockedReason: string | null;
    usage: {
      assignedBrandCount: number;
      hasApprovedUsage: boolean;
    };
  }>;
};

export type SaveQuestionMasterInput = {
  questionText: string;
  description?: string | null;
  status?: QuestionStatus;
};

export type UpdateQuestionMasterInput = {
  questionText?: string;
  description?: string | null;
  status?: QuestionStatus;
};

export type SaveQuestionAssignmentsInput = {
  questionIds?: string[] | null;
};

export type SaveQuestionEntryInput = {
  mode?: 'has_questions' | 'no_questions' | null;
  questionCount?: number | null;
  note?: string | null;
  relatedProductBreakdown?: Array<{
    relatedProductOptionId?: string | null;
    valueKey?: string | null;
    questionCount?: number | null;
  }> | null;
  screenshots?: string[] | null;
};

export type SaveQuestionHighlightsInput = {
  note?: string | null;
  noteOptional?: boolean | null;
  screenshots?: string[] | null;
  actorName?: string | null;
  actorEmail?: string | null;
};
