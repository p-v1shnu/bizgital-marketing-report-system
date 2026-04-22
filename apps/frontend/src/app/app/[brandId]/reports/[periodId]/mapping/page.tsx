import Link from 'next/link';
import {
  AlertCircle,
  ArrowRight,
  GitBranch,
  Link2,
  Table2
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { requireAnyAdmin } from '@/lib/auth';
import {
  getMappingOverview,
  getReportingPeriodDetail,
  type MappingOverviewResponse,
  type ReportingDetailResponse
} from '@/lib/reporting-api';

import { ReportWorkspaceShell } from '../workspace-shell';
import { WorkspaceUnavailableCard } from '../workspace-unavailable-card';
import { saveMappingsAction } from './actions';

type MappingPageProps = {
  params: Promise<{
    brandId: string;
    periodId: string;
  }>;
  searchParams?: Promise<{
    message?: string;
    error?: string;
  }>;
};

export default async function MappingPage({
  params,
  searchParams
}: MappingPageProps) {
  const { brandId, periodId } = await params;
  await requireAnyAdmin(`/app/${brandId}/reports/${periodId}/import`);
  const resolvedSearchParams = searchParams ? await searchParams : {};
  let detail: ReportingDetailResponse | null = null;
  let overview: MappingOverviewResponse | null = null;
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
        title="Mapping workspace unavailable"
      />
    );
  }

  try {
    overview = await getMappingOverview(brandId, periodId);
  } catch (error) {
    loadError =
      error instanceof Error
        ? error.message
        : `Failed to load mapping overview for period ${periodId}.`;
  }

  if (!overview) {
    return (
      <ReportWorkspaceShell
        activeSection="mapping"
        brandId={brandId}
        detail={detail}
        periodId={periodId}
      >
        <WorkspaceUnavailableCard
          message={loadError ?? 'Unknown error.'}
          title="Mapping workspace unavailable"
        />
      </ReportWorkspaceShell>
    );
  }

  const hasProfiles =
    !!overview.latestImportJob && overview.latestImportJob.columnProfiles.length > 0;
  const mappedCount =
    overview.latestImportJob?.columnProfiles.filter(
      (profile) => profile.mappedTargetField !== null
    ).length ?? 0;

  return (
    <ReportWorkspaceShell
      activeSection="mapping"
      brandId={brandId}
      detail={detail}
      periodId={periodId}
    >
      <div className="space-y-6">
        <div className="space-y-3">
          <Badge variant="outline">Fallback utility</Badge>
          <h1 className="font-serif text-5xl leading-none tracking-[-0.06em]">
            {detail.period.monthLabel}
          </h1>
          <p className="max-w-3xl text-base leading-7 text-muted-foreground">
            Use mapping only when auto-match cannot resolve the latest upload.
            Saving this fallback step rebuilds the dataset used by Import,
            metrics, highlights, and review.
          </p>
        </div>

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

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <div className="grid gap-5">
            {mappedCount > 0 ? (
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">
                      {mappedCount} field{mappedCount === 1 ? '' : 's'} already mapped
                    </p>
                    <p className="text-sm leading-6 text-muted-foreground">
                      Save fallback updates here, then continue back to Import
                      to confirm the working table looks right.
                    </p>
                  </div>
                  <Button asChild variant="outline">
                    <Link href={`/app/${brandId}/reports/${periodId}/import`}>
                      Back to Import
                      <ArrowRight />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <Link2 className="text-primary" />
                  Column mapping
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {!overview.latestImportJob ? (
                  <div className="space-y-4 rounded-2xl border border-amber-500/25 bg-amber-500/8 p-5">
                    <div className="flex items-center gap-3 text-sm font-medium text-amber-700 dark:text-amber-300">
                      <AlertCircle className="size-4" />
                      Mapping is blocked until an import file exists
                    </div>
                    <p className="text-sm leading-6 text-muted-foreground">
                      Upload a source file in the import section first, then
                      come back here to map the source columns.
                    </p>
                    <Button asChild variant="secondary">
                      <Link href={`/app/${brandId}/reports/${periodId}/import`}>
                        Go to import
                        <ArrowRight />
                      </Link>
                    </Button>
                  </div>
                ) : !hasProfiles ? (
                  <div className="space-y-4 rounded-2xl border border-amber-500/25 bg-amber-500/8 p-5">
                    <div className="flex items-center gap-3 text-sm font-medium text-amber-700 dark:text-amber-300">
                      <AlertCircle className="size-4" />
                      Source columns are not profiled yet
                    </div>
                    <p className="text-sm leading-6 text-muted-foreground">
                      The latest import file is registered, but column profiling
                      is only available for CSV uploads at the moment.
                    </p>
                  </div>
                ) : (
                  <form action={saveMappingsAction} className="space-y-4">
                    <input name="brandId" type="hidden" value={brandId} />
                    <input name="periodId" type="hidden" value={periodId} />
                    {overview.latestImportJob.columnProfiles.map((profile) => (
                      <div
                        className="grid gap-3 rounded-2xl border border-border/60 bg-background/55 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.9fr)]"
                        key={profile.id}
                      >
                        <div className="space-y-2">
                          <input name="profileId" type="hidden" value={profile.id} />
                          <div className="text-sm font-medium">
                            {profile.sourcePosition}. {profile.sourceColumnName}
                          </div>
                          <div className="text-sm leading-6 text-muted-foreground">
                            {profile.sampleValue
                              ? `Sample: ${profile.sampleValue}`
                              : 'Sample profiling is still pending.'}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium" htmlFor={`mapping-target-${profile.id}`}>
                            Map to field
                          </label>
                          <Select
                            defaultValue={profile.mappedTargetField ?? ''}
                            id={`mapping-target-${profile.id}`}
                            name="targetField"
                          >
                            <option value="">Leave unmapped</option>
                            {overview.availableTargets.map((target) => (
                              <option key={target.key} value={target.key}>
                                {target.label}
                              </option>
                            ))}
                          </Select>
                        </div>
                      </div>
                    ))}

                    <div className="flex flex-wrap gap-3">
                      <Button type="submit">Save mappings</Button>
                      <Button asChild type="button" variant="outline">
                        <Link href={`/app/${brandId}/reports/${periodId}/import`}>
                          Back to Import
                        </Link>
                      </Button>
                    </div>
                  </form>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-5">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <Table2 className="text-primary" />
                  Latest import context
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
                {overview.latestImportJob ? (
                  <>
                    <p>File: {overview.latestImportJob.originalFilename}</p>
                    <p>Status: {overview.latestImportJob.status.replaceAll('_', ' ')}</p>
                    <p>
                      Profiled columns: {overview.latestImportJob.columnProfiles.length}
                    </p>
                    <p>
                      Persisted dataset rows: {overview.latestImportJob.persistedRowCount}
                    </p>
                  </>
                ) : (
                  <p>No import job yet for this period.</p>
                )}
              </CardContent>
            </Card>

            <Card className="border-primary/15">
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <GitBranch className="text-primary" />
                  What comes next
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
                <p>
                  Duplicate field assignments are blocked before save so the team
                  always has one clear source column per report field.
                </p>
                <p>
                  After mapping, continue in Import to review the working table
                  and finish any required edits in one place.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </ReportWorkspaceShell>
  );
}
