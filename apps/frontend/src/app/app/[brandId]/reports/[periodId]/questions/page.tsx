import {
  getQuestionOverview,
  getReportingPeriodDetail,
  type QuestionOverviewResponse,
  type ReportingDetailResponse
} from '@/lib/reporting-api';
import { getAuthContext, getMembershipReportAccess } from '@/lib/auth';

import { ReportWorkspaceShell } from '../workspace-shell';
import { WorkspaceUnavailableCard } from '../workspace-unavailable-card';
import { QuestionsManager } from './questions-manager';

type QuestionsPageProps = {
  params: Promise<{
    brandId: string;
    periodId: string;
  }>;
};

export default async function QuestionsPage({ params }: QuestionsPageProps) {
  const { brandId, periodId } = await params;
  const authContext = await getAuthContext();
  const currentMembership =
    authContext.user?.memberships.find((membership) => membership.brandCode === brandId) ?? null;
  const reportAccess = getMembershipReportAccess(currentMembership);
  let detail: ReportingDetailResponse | null = null;
  let questions: QuestionOverviewResponse | null = null;
  let loadError: string | null = null;

  try {
    detail = await getReportingPeriodDetail(brandId, periodId);
  } catch (error) {
    loadError =
      error instanceof Error
        ? error.message
        : `Failed to load reporting period ${periodId}.`;
  }

  if (!detail) {
    return <WorkspaceUnavailableCard message={loadError ?? 'Unknown error.'} title="Questions workspace unavailable" />;
  }

  try {
    questions = await getQuestionOverview(brandId, periodId);
  } catch (error) {
    loadError =
      error instanceof Error
        ? error.message
        : `Failed to load question overview for period ${periodId}.`;
  }

  if (!questions) {
    return (
      <ReportWorkspaceShell
        activeSection="questions"
        brandId={brandId}
        detail={detail}
        periodId={periodId}
      >
        <WorkspaceUnavailableCard
          message={loadError ?? 'Unknown error.'}
          title="Questions workspace unavailable"
        />
      </ReportWorkspaceShell>
    );
  }

  return (
    <ReportWorkspaceShell
      activeSection="questions"
      brandId={brandId}
      detail={detail}
      periodId={periodId}
    >
      <QuestionsManager
        brandId={brandId}
        initialOverview={questions}
        isReadOnly={reportAccess.isReadOnly || !detail.period.currentDraftVersionId}
        monthLabel={detail.period.monthLabel}
        periodId={periodId}
      />
    </ReportWorkspaceShell>
  );
}
