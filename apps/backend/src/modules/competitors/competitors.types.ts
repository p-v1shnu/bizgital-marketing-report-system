import type {
  CompetitorMonitoringStatus,
  CompetitorStatus,
  ReportWorkflowState
} from '@prisma/client';

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

export type SaveCompetitorMonitoringInput = {
  status?: CompetitorMonitoringStatus | null;
  followerCount?: number | null;
  monthlyPostCount?: number | null;
  highlightNote?: string | null;
  noActivityEvidenceImageUrl?: string | null;
  actorName?: string | null;
  actorEmail?: string | null;
  posts?: Array<{
    displayOrder?: number | null;
    screenshotUrl?: string | null;
    postUrl?: string | null;
  }>;
};

export type SaveCompetitorMasterInput = {
  name: string;
  primaryPlatform: string;
  status?: CompetitorStatus;
  websiteUrl?: string | null;
  facebookUrl?: string | null;
  instagramUrl?: string | null;
  tiktokUrl?: string | null;
  youtubeUrl?: string | null;
};

export type UpdateCompetitorMasterInput = Partial<SaveCompetitorMasterInput>;

export type UpdateAssignmentStatusInput = {
  status: CompetitorStatus;
  effectiveMonth?: number;
};
