import {
  getCompetitorOverview,
  getReportingPeriodDetail,
  type CompetitorOverviewResponse,
  type ReportingDetailResponse
} from '@/lib/reporting-api';
import { getAuthContext, getMembershipReportAccess } from '@/lib/auth';

import { ReportWorkspaceShell } from '../workspace-shell';
import { WorkspaceUnavailableCard } from '../workspace-unavailable-card';
import { CompetitorMonitoringWorkspace } from './competitor-monitoring-workspace';

type CompetitorsPageProps = {
  params: Promise<{
    brandId: string;
    periodId: string;
  }>;
};

export default async function CompetitorsPage({ params }: CompetitorsPageProps) {
  const { brandId, periodId } = await params;
  const authContext = await getAuthContext();
  const currentMembership =
    authContext.user?.memberships.find((membership) => membership.brandCode === brandId) ?? null;
  const reportAccess = getMembershipReportAccess(currentMembership);
  let detail: ReportingDetailResponse | null = null;
  let competitors: CompetitorOverviewResponse | null = null;
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
    return (
      <WorkspaceUnavailableCard
        message={loadError ?? 'Unknown error.'}
        title="Competitors workspace unavailable"
      />
    );
  }

  try {
    competitors = await getCompetitorOverview(brandId, periodId);
  } catch (error) {
    loadError =
      error instanceof Error
        ? error.message
        : `Failed to load competitor overview for period ${periodId}.`;
  }

  if (!competitors) {
    return (
      <ReportWorkspaceShell
        activeSection="competitors"
        brandId={brandId}
        detail={detail}
        periodId={periodId}
      >
        <WorkspaceUnavailableCard
          message={loadError ?? 'Unknown error.'}
          title="Competitors workspace unavailable"
        />
      </ReportWorkspaceShell>
    );
  }

  return (
    <ReportWorkspaceShell
      activeSection="competitors"
      brandId={brandId}
      detail={detail}
      periodId={periodId}
    >
      <CompetitorMonitoringWorkspace
        brandId={brandId}
        initialOverview={competitors}
        isReadOnly={reportAccess.isReadOnly || !detail.period.currentDraftVersionId}
        monthLabel={detail.period.monthLabel}
        periodId={periodId}
      />
    </ReportWorkspaceShell>
  );
}
