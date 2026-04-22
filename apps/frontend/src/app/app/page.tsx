import Link from 'next/link';
import { AlertCircle, ArrowRight, FolderKanban, Settings2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { requireAuth } from '@/lib/auth';
import type { BrandSummary, ReportingListItem } from '@/lib/reporting-api';
import { getBrands, getReportingPeriods } from '@/lib/reporting-api';
import { labelForState, monthLabel } from '@/lib/reporting-ui';

type WorkspaceRow = {
  brand: BrandSummary;
  draftCount: number;
  submittedCount: number;
  latestPeriod: Pick<
    ReportingListItem,
    'year' | 'month' | 'currentState' | 'latestVersionState'
  > | null;
};

type BrandWorkspacesPageProps = {
  searchParams?: Promise<{
    q?: string;
  }>;
};

function sortPeriodsDescending(left: { year: number; month: number }, right: { year: number; month: number }) {
  if (left.year !== right.year) {
    return right.year - left.year;
  }

  return right.month - left.month;
}

export default async function BrandWorkspacesPage({
  searchParams
}: BrandWorkspacesPageProps) {
  const auth = await requireAuth('/app');
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const searchKeyword = String(resolvedSearchParams.q ?? '').trim().toLowerCase();
  const currentYear = new Date().getUTCFullYear();
  const allowedBrandCodes = new Set(
    auth.user.memberships.map((membership) => membership.brandCode)
  );
  const adminBrandCodes = new Set(
    auth.user.memberships
      .filter((membership) => membership.role === 'admin')
      .map((membership) => membership.brandCode)
  );

  let brands: BrandSummary[] = [];
  let loadError: string | null = null;

  try {
    brands = (await getBrands()).filter(
      (brand) =>
        allowedBrandCodes.has(brand.code) &&
        String(brand.status ?? '')
          .trim()
          .toLowerCase() === 'active'
    );
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Failed to load brands.';
  }

  const rows: WorkspaceRow[] = await Promise.all(
    brands.map(async (brand) => {
      try {
        const reporting = await getReportingPeriods(brand.code, currentYear);
        const latestPeriod =
          [...reporting.items].sort(sortPeriodsDescending).map((item) => ({
            year: item.year,
            month: item.month,
            currentState: item.currentState,
            latestVersionState: item.latestVersionState
          }))[0] ?? null;

        return {
          brand,
          draftCount: reporting.items.filter((item) => item.currentDraftVersionId).length,
          submittedCount: reporting.items.filter(
            (item) => item.latestVersionState === 'submitted'
          ).length,
          latestPeriod
        };
      } catch {
        return {
          brand,
          draftCount: 0,
          submittedCount: 0,
          latestPeriod: null
        };
      }
    })
  );
  const filteredRows = searchKeyword
    ? rows.filter(({ brand }) => brand.name.toLowerCase().includes(searchKeyword))
    : rows;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Daily workspace
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.03em]">Brand workspaces</h1>
          <p className="text-sm text-muted-foreground">
            Select a brand to continue reports or review its current monthly queue.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {auth.canAccessAdmin ? (
            <Button asChild variant="outline">
              <Link href="/app/settings">
                <Settings2 />
                Open settings
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      {loadError ? (
        <Card className="border-rose-500/25 bg-rose-500/8">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <AlertCircle className="text-rose-600" />
              Brand workspaces unavailable
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {loadError}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <FolderKanban className="text-primary" />
            Assigned brands
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <form action="/app" className="pb-1" method="get">
            <Input
              defaultValue={resolvedSearchParams.q ?? ''}
              name="q"
              placeholder="Search assigned brand"
            />
          </form>
          {filteredRows.length === 0 ? (
            <div className="rounded-[24px] border border-border/60 bg-background/60 px-4 py-5 text-sm text-muted-foreground">
              {rows.length === 0
                ? 'No brands are available in this environment yet.'
                : 'No assigned brand matches your search.'}
            </div>
          ) : (
            filteredRows.map(({ brand, draftCount, submittedCount, latestPeriod }) => (
                <div
                  className="grid gap-4 rounded-[28px] border border-border/60 bg-background/60 p-4 md:grid-cols-[minmax(0,1.4fr)_120px_140px_160px_auto]"
                  key={brand.id}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      {brand.logoUrl ? (
                        <div className="size-10 overflow-hidden rounded-xl border border-border/60 bg-background/70">
                          <img
                            alt={`${brand.name} logo`}
                            className="h-full w-full object-cover"
                            src={brand.logoUrl}
                          />
                        </div>
                      ) : (
                        <div className="flex size-10 items-center justify-center rounded-xl border border-border/60 bg-background/70 text-sm font-semibold uppercase text-muted-foreground">
                          {brand.name.slice(0, 2)}
                        </div>
                      )}
                      <div className="text-lg font-semibold">{brand.name}</div>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      Drafts
                    </div>
                    <div className="mt-2 text-lg font-semibold">{draftCount}</div>
                  </div>

                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      Submitted
                    </div>
                    <div className="mt-2 text-lg font-semibold">{submittedCount}</div>
                  </div>

                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      Latest month
                    </div>
                    <div className="mt-2 text-sm font-medium">
                      {latestPeriod
                        ? monthLabel(latestPeriod.year, latestPeriod.month)
                        : 'No reports yet'}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {labelForState(
                        latestPeriod?.latestVersionState ?? latestPeriod?.currentState ?? null
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 md:justify-end">
                    {adminBrandCodes.has(brand.code) ? (
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/app/brands/${brand.code}`}>Manage</Link>
                      </Button>
                    ) : null}
                    <Button asChild size="sm">
                      <Link href={`/app/${brand.code}/reports`}>
                        Open workspace
                        <ArrowRight />
                      </Link>
                    </Button>
                  </div>
                </div>
              )
            )
          )}
        </CardContent>
      </Card>
    </section>
  );
}
