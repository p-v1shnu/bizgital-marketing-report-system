import type {
  ReportWorkflowState,
  ReportingDetailResponse,
  ReportingPeriodState
} from './reporting-api';

type WorkflowState = ReportingPeriodState | ReportWorkflowState | null;
type WorkspaceSection = ReportingDetailResponse['period']['workspace']['sections'][number];
type WorkspaceSectionSlug = WorkspaceSection['slug'];
type WorkspaceSectionStatus = WorkspaceSection['status'];
type ReviewReadinessOverall = ReportingDetailResponse['period']['reviewReadiness']['overall'];

export const CORE_WORKFLOW_SECTION_ORDER = [
  'import',
  'top-content',
  'competitors',
  'questions',
  'review'
] as const satisfies ReadonlyArray<WorkspaceSectionSlug>;

export function badgeToneForState(state: WorkflowState) {
  switch (state) {
    case 'approved':
      return 'border-emerald-500/25 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300';
    case 'submitted':
      return 'border-amber-500/25 bg-amber-500/12 text-amber-700 dark:text-amber-300';
    case 'rejected':
      return 'border-rose-500/25 bg-rose-500/12 text-rose-700 dark:text-rose-300';
    case 'draft':
    case 'in_progress':
      return 'border-sky-500/25 bg-sky-500/12 text-sky-700 dark:text-sky-300';
    case 'superseded':
      return 'border-zinc-500/25 bg-zinc-500/12 text-zinc-700 dark:text-zinc-300';
    default:
      return 'border-border bg-secondary text-secondary-foreground';
  }
}

export function labelForState(state: WorkflowState) {
  if (!state) {
    return 'Not started';
  }

  const labels: Record<Exclude<WorkflowState, null>, string> = {
    not_started: 'Not started',
    in_progress: 'In progress',
    draft: 'In progress',
    submitted: 'Submitted - awaiting decision',
    approved: 'Approved',
    rejected: 'Changes requested',
    superseded: 'Superseded'
  };

  return labels[state];
}

export function monthLabel(year: number, month: number) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric'
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export function readinessTone(overall: ReviewReadinessOverall) {
  switch (overall) {
    case 'published':
      return 'border-emerald-500/25 bg-emerald-500/8';
    case 'awaiting_decision':
      return 'border-amber-500/25 bg-amber-500/8';
    case 'ready_to_submit':
      return 'border-sky-500/25 bg-sky-500/8';
    default:
      return 'border-rose-500/20 bg-rose-500/7';
  }
}

export function readinessLabel(overall: ReviewReadinessOverall) {
  switch (overall) {
    case 'published':
      return 'Approved';
    case 'awaiting_decision':
      return 'Submitted - awaiting decision';
    case 'ready_to_submit':
      return 'Ready for review';
    default:
      return 'In progress';
  }
}

export function readinessHelpText(overall: ReviewReadinessOverall) {
  switch (overall) {
    case 'published':
      return 'This month is approved. The submitted version is now read-only.';
    case 'awaiting_decision':
      return 'Submitted by users with create/edit permission. Reviewers can review and decide from this version.';
    case 'ready_to_submit':
      return 'All required checks are complete. Users with create/edit permission can submit this month for approval.';
    default:
      return 'Required inputs are still in progress before this month can be submitted for review.';
  }
}

export function sectionStatusLabel(status: WorkspaceSectionStatus) {
  switch (status) {
    case 'ready':
      return 'Ready';
    case 'pending':
    case 'blocked':
      return 'In progress';
    default:
      return status;
  }
}

export function editModeLabel(isReadOnly: boolean) {
  return isReadOnly ? 'Read-only (locked)' : 'Editable';
}

export function isReadOnlyMode(detail: ReportingDetailResponse) {
  return (
    !detail.period.currentDraftVersionId ||
    detail.period.latestVersionState === 'submitted' ||
    detail.period.latestVersionState === 'approved'
  );
}

export function readinessOpenItemsLabel(count: number) {
  if (count === 0) {
    return 'No open items';
  }

  return `${count} open item${count === 1 ? '' : 's'}`;
}

export function sectionTone(
  status: ReportingDetailResponse['period']['workspace']['sections'][number]['status']
) {
  switch (status) {
    case 'ready':
      return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
    case 'blocked':
      return 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300';
    default:
      return 'border-border bg-secondary text-secondary-foreground';
  }
}

export function reportSectionHref(
  brandId: string,
  periodId: string,
  section: WorkspaceSectionSlug
) {
  return section === 'overview'
    ? `/app/${brandId}/reports/${periodId}/import`
    : `/app/${brandId}/reports/${periodId}/${section}`;
}

export function coreWorkflowSections(detail: ReportingDetailResponse) {
  const sectionsBySlug = new Map(
    detail.period.workspace.sections.map((section) => [section.slug, section] as const)
  );

  return CORE_WORKFLOW_SECTION_ORDER.map((slug) => sectionsBySlug.get(slug)).filter(
    (section): section is WorkspaceSection => section !== undefined
  );
}

export function visibleWorkspaceSections(detail: ReportingDetailResponse) {
  return detail.period.workspace.sections.filter(
    section =>
      section.slug !== 'overview' &&
      section.slug !== 'metrics' &&
      section.slug !== 'mapping' &&
      section.slug !== 'history'
  );
}

export function workflowProgress(detail: ReportingDetailResponse) {
  const sections = coreWorkflowSections(detail);

  return {
    sections,
    readyCount: sections.filter((section) => section.status === 'ready').length,
    totalCount: sections.length
  };
}

export function workflowStepNumber(section: WorkspaceSectionSlug) {
  const index = CORE_WORKFLOW_SECTION_ORDER.findIndex((item) => item === section);
  return index === -1 ? null : index + 1;
}

export function recommendedWorkflowAction(
  detail: ReportingDetailResponse,
  brandId: string,
  periodId: string
) {
  const sections = coreWorkflowSections(detail);
  const reviewSection =
    sections.find((section) => section.slug === 'review') ??
    detail.period.workspace.sections.find((section) => section.slug === 'review');
  const firstIncompleteSection = sections.find(
    (section) => section.slug !== 'review' && section.status !== 'ready'
  );
  const targetSection =
    detail.period.latestVersionState === 'submitted' ||
    detail.period.latestVersionState === 'approved'
      ? reviewSection ?? firstIncompleteSection ?? sections[0]
      : firstIncompleteSection ?? reviewSection ?? sections[0];

  if (!targetSection) {
    return {
      href: `/app/${brandId}/reports/${periodId}/import`,
      label: 'Start in import',
      section: null
    };
  }

  let label = `Continue to ${targetSection.label}`;

  if (targetSection.slug === 'review') {
    if (detail.period.latestVersionState === 'submitted') {
      label = 'Open review';
    } else if (detail.period.latestVersionState === 'approved') {
      label = 'Open review history';
    } else if (detail.period.reviewReadiness.canSubmit) {
      label = 'Open review and submit';
    } else {
      label = 'Complete required items';
    }
  } else if (targetSection.status === 'blocked') {
    label = `Go to ${targetSection.label}`;
  }

  return {
    href: reportSectionHref(brandId, periodId, targetSection.slug),
    label,
    section: targetSection
  };
}
