import Link from 'next/link';
import { AlertCircle, FolderKanban, Settings2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAuth } from '@/lib/auth';
import type { BrandSummary, ReportingListItem } from '@/lib/reporting-api';
import { getBrands, getReportingPeriods } from '@/lib/reporting-api';
import { BrandWorkspacesListClient } from './brand-workspaces-list-client';

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
  const initialSearchQuery = String(resolvedSearchParams.q ?? '').trim();
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
        let latestPeriod: WorkspaceRow['latestPeriod'] = null;
        let draftCount = 0;
        let submittedCount = 0;

        for (const item of reporting.items) {
          if (item.currentDraftVersionId) {
            draftCount += 1;
          }

          if (item.latestVersionState === 'submitted') {
            submittedCount += 1;
          }

          if (
            !latestPeriod ||
            sortPeriodsDescending(item, latestPeriod) < 0
          ) {
            latestPeriod = {
              year: item.year,
              month: item.month,
              currentState: item.currentState,
              latestVersionState: item.latestVersionState
            };
          }
        }

        return {
          brand,
          draftCount,
          submittedCount,
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
        <CardContent>
          <BrandWorkspacesListClient
            adminBrandCodes={Array.from(adminBrandCodes)}
            initialQuery={initialSearchQuery}
            rows={rows}
          />
        </CardContent>
      </Card>
    </section>
  );
}
