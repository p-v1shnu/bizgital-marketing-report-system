import { AlertCircle, FileText, Wrench } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ReportingDetailResponse } from '@/lib/reporting-api';
import { getReportingPeriodDetail } from '@/lib/reporting-api';
import { sectionStatusLabel } from '@/lib/reporting-ui';

import { ReportWorkspaceShell } from '../workspace-shell';
import { WorkspaceUnavailableCard } from '../workspace-unavailable-card';
import CommentaryPage from '../commentary/page';
import CompetitorsPage from '../competitors/page';
import ImportPage from '../import/page';
import MappingPage from '../mapping/page';
import MetricsPage from '../metrics/page';
import QuestionsPage from '../questions/page';
import ReviewPage from '../review/page';
import TopContentPage from '../top-content/page';

type WorkspaceSectionPageProps = {
  params: Promise<{
    brandId: string;
    periodId: string;
    section:
      | 'overview'
      | 'import'
      | 'mapping'
      | 'metrics'
      | 'top-content'
      | 'competitors'
      | 'questions'
      | 'commentary'
      | 'review'
      | 'history';
  }>;
};

export default async function WorkspaceSectionPage({
  params
}: WorkspaceSectionPageProps) {
  const { brandId, periodId, section } = await params;
  const concreteParams = Promise.resolve({ brandId, periodId });

  if (section === 'import') {
    return <ImportPage params={concreteParams} />;
  }

  if (section === 'mapping') {
    return <MappingPage params={concreteParams} />;
  }

  if (section === 'metrics') {
    return <MetricsPage params={concreteParams} />;
  }

  if (section === 'top-content') {
    return <TopContentPage params={concreteParams} />;
  }

  if (section === 'competitors') {
    return <CompetitorsPage params={concreteParams} />;
  }

  if (section === 'questions') {
    return <QuestionsPage params={concreteParams} />;
  }

  if (section === 'commentary') {
    return <CommentaryPage params={concreteParams} />;
  }

  if (section === 'review') {
    return <ReviewPage params={concreteParams} />;
  }

  let detail: ReportingDetailResponse | null = null;
  let loadError: string | null = null;

  try {
    detail = await getReportingPeriodDetail(brandId, periodId);
  } catch (error) {
    loadError =
      error instanceof Error
        ? error.message
        : 'Failed to load reporting workspace section.';
  }

  if (loadError || !detail) {
    return <WorkspaceUnavailableCard message={loadError ?? 'Unknown error.'} title="Workspace section unavailable" />;
  }

  const sectionMeta =
    detail.period.workspace.sections.find((item) => item.slug === section) ??
    null;

  return (
    <ReportWorkspaceShell
      activeSection={section}
      brandId={brandId}
      detail={detail}
      periodId={periodId}
    >
      <div className="space-y-6">
        <div className="space-y-3">
          <Badge variant="outline">{sectionMeta?.label ?? section}</Badge>
        <h1 className="font-serif text-5xl leading-none tracking-[-0.06em]">
          {detail.period.monthLabel}
        </h1>
        <p className="max-w-3xl text-base leading-7 text-muted-foreground">
          This section is reserved in the monthly workspace, but it is not part
          of the active monthly path yet. Use the live report sections and the
          review workflow for the current month.
        </p>
      </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <FileText className="text-primary" />
                {sectionMeta?.label ?? section}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-6 text-muted-foreground">
              <p>{sectionMeta?.detail ?? 'No section detail available yet.'}</p>
              <div className="rounded-2xl border border-border/60 bg-background/55 p-4">
                <p className="font-medium text-foreground">Current intent</p>
                <p className="mt-2">
                  This page is reserved for a later module and already sits in
                  the same month context as the active workflow sections.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <Wrench className="text-primary" />
                What comes here next
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
              <p>
                A later implementation pass can land here without changing the
                month header, navigation, or review structure.
              </p>
              <Badge variant="outline">
                Status: {sectionStatusLabel(sectionMeta?.status ?? 'pending')}
              </Badge>
            </CardContent>
          </Card>
        </div>
      </div>
    </ReportWorkspaceShell>
  );
}
