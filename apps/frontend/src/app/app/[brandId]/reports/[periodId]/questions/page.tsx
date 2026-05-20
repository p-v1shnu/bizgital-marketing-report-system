import {
  getBrandCompanyFormatOptions,
  getMetricsKpiPreview,
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
  const metricsPreviewPromise = getMetricsKpiPreview(brandId, periodId).catch(() => null);
  const authContext = await getAuthContext();
  const currentMembership =
    authContext.user?.memberships.find((membership) => membership.brandCode === brandId) ?? null;
  const reportAccess = getMembershipReportAccess(currentMembership);
  let detail: ReportingDetailResponse | null = null;
  let questions: QuestionOverviewResponse | null = null;
  let loadError: string | null = null;

  const [detailResult, questionsResult, relatedProductsResult] = await Promise.allSettled([
    getReportingPeriodDetail(brandId, periodId),
    getQuestionOverview(brandId, periodId),
    getBrandCompanyFormatOptions(brandId, { includeDeprecated: true })
  ]);

  if (detailResult.status === 'fulfilled') {
    detail = detailResult.value;
  } else {
    loadError =
      detailResult.reason instanceof Error
        ? detailResult.reason.message
        : `Failed to load reporting period ${periodId}.`;
  }

  if (!detail) {
    return <WorkspaceUnavailableCard message={loadError ?? 'Unknown error.'} title="Questions workspace unavailable" />;
  }

  if (questionsResult.status === 'fulfilled') {
    questions = questionsResult.value;
    if (
      (!questions.relatedProductOptions || questions.relatedProductOptions.length === 0) &&
      relatedProductsResult.status === 'fulfilled'
    ) {
      const relatedProductField =
        relatedProductsResult.value.fields.find((field) => field.key === 'related_product') ?? null;
      if (relatedProductField) {
        questions = {
          ...questions,
          relatedProductOptions: relatedProductField.options
            .filter((option) => option.valueKey !== 'all')
            .map((option) => ({
              id: option.id,
              valueKey: option.valueKey,
              label: option.label,
              sortOrder: option.sortOrder,
              status: option.status
            }))
        };
      }
    }
  } else {
    loadError =
      questionsResult.reason instanceof Error
        ? questionsResult.reason.message
        : `Failed to load question overview for period ${periodId}.`;
  }

  if (!questions) {
    return (
      <ReportWorkspaceShell
        activeSection="questions"
        brandId={brandId}
        detail={detail}
        metricsPreviewPromise={metricsPreviewPromise}
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
      metricsPreviewPromise={metricsPreviewPromise}
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
