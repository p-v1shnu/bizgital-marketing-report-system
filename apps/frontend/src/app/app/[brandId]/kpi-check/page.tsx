import { Target } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  getBrand,
  getBrandKpiPlan,
  getComputedFormulas,
  getImportColumnMappingConfig
} from '@/lib/reporting-api';

import { KpiCheckClient } from './kpi-check-client';

type KpiCheckPageProps = {
  params: Promise<{
    brandId: string;
  }>;
};

function resolveYearByTimezone(timezone: string | null | undefined) {
  const fallbackYear = new Date().getUTCFullYear();
  const timeZone = timezone?.trim();

  if (!timeZone) {
    return fallbackYear;
  }

  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric'
    }).formatToParts(new Date());
    const yearPart = parts.find((part) => part.type === 'year')?.value ?? '';
    const parsedYear = Number(yearPart);
    return Number.isFinite(parsedYear) ? parsedYear : fallbackYear;
  } catch {
    return fallbackYear;
  }
}

export default async function KpiCheckPage({ params }: KpiCheckPageProps) {
  const { brandId } = await params;

  const brand = await getBrand(brandId).catch(() => null);
  const activeYear = resolveYearByTimezone(brand?.timezone);
  const [planResult, formulasResult, mappingResult] = await Promise.all([
    getBrandKpiPlan(brandId, activeYear)
      .then((data) => ({ data, error: null as string | null }))
      .catch((error) => ({
        data: null,
        error: error instanceof Error ? error.message : 'Failed to load KPI plan.'
      })),
    getComputedFormulas({ activeOnly: true })
      .then((data) => ({ data, error: null as string | null }))
      .catch((error) => ({
        data: { items: [] as Awaited<ReturnType<typeof getComputedFormulas>>['items'] },
        error: error instanceof Error ? error.message : 'Failed to load formulas.'
      })),
    getImportColumnMappingConfig()
      .then((data) => ({ data, error: null as string | null }))
      .catch((error) => ({
        data: null,
        error:
          error instanceof Error ? error.message : 'Failed to load import column mappings.'
      }))
  ]);

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Quick operational check
        </div>
        <h2 className="text-2xl font-semibold tracking-[-0.03em]">KPI Check</h2>
        <p className="text-sm text-muted-foreground">
          Upload CSV and see KPI progress immediately using the brand KPI plan for {activeYear}.
        </p>
      </div>

      {planResult.error ? (
        <Card className="border-rose-500/25 bg-rose-500/8">
          <CardContent className="pt-6 text-sm text-rose-700 dark:text-rose-300">
            {planResult.error}
          </CardContent>
        </Card>
      ) : null}

      {formulasResult.error ? (
        <Card className="border-amber-500/25 bg-amber-500/8">
          <CardContent className="pt-6 text-sm text-amber-700 dark:text-amber-300">
            {formulasResult.error}
          </CardContent>
        </Card>
      ) : null}

      {mappingResult.error ? (
        <Card className="border-amber-500/25 bg-amber-500/8">
          <CardContent className="pt-6 text-sm text-amber-700 dark:text-amber-300">
            {mappingResult.error}
          </CardContent>
        </Card>
      ) : null}

      {!planResult.data ? (
        <Card className="border-dashed border-border/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <Target className="text-primary" />
              KPI check unavailable
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            KPI plan is required before this quick check can run.
          </CardContent>
        </Card>
      ) : planResult.data.items.length === 0 ? (
        <Card className="border-dashed border-border/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <Target className="text-primary" />
              No KPI items in {activeYear}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Configure KPI plan items for this year, then return to KPI Check.
          </CardContent>
        </Card>
      ) : (
        <KpiCheckClient
          formulas={formulasResult.data.items}
          mappingRules={mappingResult.data?.published?.rules ?? []}
          planItems={planResult.data.items}
          planYear={activeYear}
        />
      )}
    </section>
  );
}

