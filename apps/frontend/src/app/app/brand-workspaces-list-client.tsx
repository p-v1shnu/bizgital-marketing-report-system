'use client';

import Link from 'next/link';
import { ArrowRight, X } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toProtectedMediaUrl } from '@/lib/media-url';
import type { BrandSummary, ReportingListItem } from '@/lib/reporting-api';
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

type BrandWorkspacesListClientProps = {
  rows: WorkspaceRow[];
  adminBrandCodes: string[];
  initialQuery?: string;
};

export function BrandWorkspacesListClient({
  rows,
  adminBrandCodes,
  initialQuery
}: BrandWorkspacesListClientProps) {
  const [query, setQuery] = useState(String(initialQuery ?? ''));
  const normalizedQuery = query.trim().toLowerCase();
  const adminBrandCodeSet = useMemo(() => new Set(adminBrandCodes), [adminBrandCodes]);

  const filteredRows = useMemo(() => {
    if (!normalizedQuery) {
      return rows;
    }

    return rows.filter(({ brand }) => brand.name.toLowerCase().includes(normalizedQuery));
  }, [normalizedQuery, rows]);

  return (
    <div className="space-y-3">
      <div className="relative pb-1">
        <Input
          name="q"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search assigned brand"
          value={query}
        />
        {query ? (
          <button
            aria-label="Clear search"
            className="absolute right-3 top-1/2 inline-flex -translate-y-1/2 items-center justify-center rounded-md p-1 text-muted-foreground transition hover:text-foreground"
            onClick={() => setQuery('')}
            type="button"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>
      <div className="text-xs text-muted-foreground">
        Showing {filteredRows.length} of {rows.length} brand{rows.length === 1 ? '' : 's'}
      </div>

      {filteredRows.length === 0 ? (
        <div className="rounded-[24px] border border-border/60 bg-background/60 px-4 py-5 text-sm text-muted-foreground">
          {rows.length === 0
            ? 'No brands are available in this environment yet.'
            : 'No assigned brand matches your search.'}
        </div>
      ) : (
        filteredRows.map(({ brand, draftCount, submittedCount, latestPeriod }) => {
          const protectedBrandLogoUrl = toProtectedMediaUrl(brand.logoUrl);

          return (
            <div
              className="grid gap-4 rounded-[28px] border border-border/60 bg-background/60 p-4 md:grid-cols-[minmax(0,1.4fr)_120px_140px_160px_auto]"
              key={brand.id}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  {protectedBrandLogoUrl ? (
                    <div className="size-10 overflow-hidden rounded-xl border border-border/60 bg-background/70">
                      <img
                        alt={`${brand.name} logo`}
                        className="h-full w-full object-cover"
                        decoding="async"
                        loading="lazy"
                        src={protectedBrandLogoUrl}
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
                  {latestPeriod ? monthLabel(latestPeriod.year, latestPeriod.month) : 'No reports yet'}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {labelForState(
                    latestPeriod?.latestVersionState ?? latestPeriod?.currentState ?? null
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 md:justify-end">
                {adminBrandCodeSet.has(brand.code) ? (
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
          );
        })
      )}
    </div>
  );
}
