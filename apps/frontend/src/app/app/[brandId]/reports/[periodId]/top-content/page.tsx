import { Card, CardContent } from '@/components/ui/card';
import { getMembershipReportAccess, requireBrandAccess } from '@/lib/auth';
import {
  getReportingPeriodDetail,
  getTopContentOverview,
  type ReportingDetailResponse,
  type TopContentOverviewResponse
} from '@/lib/reporting-api';

import { ReportWorkspaceShell } from '../workspace-shell';
import { WorkspaceUnavailableCard } from '../workspace-unavailable-card';
import { TopContentManager } from './top-content-manager';

type TopContentPageProps = {
  params: Promise<{
    brandId: string;
    periodId: string;
  }>;
  searchParams?: Promise<{
    message?: string;
    error?: string;
  }>;
};

export default async function TopContentPage({
  params,
  searchParams
}: TopContentPageProps) {
  const { brandId, periodId } = await params;
  const auth = await requireBrandAccess(
    brandId,
    `/app/${brandId}/reports/${periodId}/top-content`
  );
  const resolvedSearchParams = searchParams ? await searchParams : {};
  let topContent: TopContentOverviewResponse | null = null;
  let detail: ReportingDetailResponse | null = null;
  let loadError: string | null = null;

  try {
    topContent = await getTopContentOverview(brandId, periodId);
  } catch (error) {
    loadError =
      error instanceof Error
        ? error.message
        : `Failed to load top content overview for period ${periodId}.`;
  }

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
        title="Top content workspace unavailable"
      />
    );
  }

  if (!topContent) {
    return (
      <ReportWorkspaceShell
        activeSection="top-content"
        brandId={brandId}
        detail={detail}
        periodId={periodId}
      >
        <WorkspaceUnavailableCard
          message={loadError ?? 'Unknown error.'}
          title="Top content workspace unavailable"
        />
      </ReportWorkspaceShell>
    );
  }

  const currentMembership =
    auth.brandMemberships.find(membership => membership.brandCode === brandId) ?? null;
  const reportAccess = getMembershipReportAccess(currentMembership);
  const isReadOnly = reportAccess.isReadOnly || !detail.period.currentDraftVersionId;
  const canOpenMapping = auth.brandMemberships.some(
    (membership) => membership.role === 'admin'
  );
  const mappingHref =
    canOpenMapping && topContent.readiness.state === 'blocked'
      ? `/app/${brandId}/reports/${periodId}/mapping`
      : null;

  return (
    <ReportWorkspaceShell
      activeSection="top-content"
      brandId={brandId}
      detail={detail}
      periodId={periodId}
    >
      <div className="space-y-6">
        {resolvedSearchParams?.message ? (
          <Card className="border-emerald-500/25 bg-emerald-500/8">
            <CardContent className="pt-6 text-sm text-emerald-700 dark:text-emerald-300">
              {resolvedSearchParams.message}
            </CardContent>
          </Card>
        ) : null}

        {resolvedSearchParams?.error ? (
          <Card className="border-rose-500/25 bg-rose-500/8">
            <CardContent className="pt-6 text-sm text-rose-700 dark:text-rose-300">
              {resolvedSearchParams.error}
            </CardContent>
          </Card>
        ) : null}

        <TopContentManager
          brandId={brandId}
          initialOverview={topContent}
          isReadOnly={isReadOnly}
          mappingHref={mappingHref}
          monthLabel={detail.period.monthLabel}
          periodId={periodId}
        />
      </div>
    </ReportWorkspaceShell>
  );
}
