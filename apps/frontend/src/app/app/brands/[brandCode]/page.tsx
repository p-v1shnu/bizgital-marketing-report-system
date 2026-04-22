import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  Target,
  Users,
  Waypoints
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireBrandAdminAccess } from '@/lib/auth';
import {
  getBrand,
  getBrandCompanyFormatOptions,
  getCompetitorYearSetup,
  getBrandKpiPlan,
  getKpiCatalog,
  getQuestionSetup,
  getReportingPeriods
} from '@/lib/reporting-api';
import { labelForState } from '@/lib/reporting-ui';

import { CompanyFormatOptionsManager } from '../../settings/company-format-options-manager';
import { BrandKpiPlanManager } from './brand-kpi-plan-manager';
import { CompetitorSetupManager } from '../../[brandId]/competitor-setup/competitor-setup-manager';
import { QuestionSetupManager } from '../../[brandId]/question-setup/question-setup-manager';

const tabs = [
  { key: 'overview', label: 'Overview', icon: Building2 },
  { key: 'members', label: 'Members', icon: Users },
  { key: 'kpi', label: 'KPI Targets', icon: Target },
  { key: 'competitors', label: 'Competitors', icon: Waypoints },
  { key: 'questions', label: 'Questions', icon: BadgeCheck },
  { key: 'columns', label: 'Columns', icon: Waypoints }
] as const;

type BrandAdminDetailPageProps = {
  params: Promise<{
    brandCode: string;
  }>;
  searchParams?: Promise<{
    tab?: string;
    year?: string;
    message?: string;
    error?: string;
  }>;
};

function adminTabHref(brandCode: string, tab: string) {
  return `/app/brands/${brandCode}?tab=${tab}`;
}

function resolveYear(rawYear: string | undefined) {
  const currentYear = new Date().getUTCFullYear();

  if (!rawYear) {
    return currentYear;
  }

  const parsed = Number(rawYear);
  if (!Number.isInteger(parsed) || parsed < 2000 || parsed > 3000) {
    return currentYear;
  }

  return parsed;
}

export default async function BrandAdminDetailPage({
  params,
  searchParams
}: BrandAdminDetailPageProps) {
  const { brandCode } = await params;
  await requireBrandAdminAccess(brandCode, `/app/brands/${brandCode}`);
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const activeTab = tabs.some(tab => tab.key === resolvedSearchParams.tab)
    ? resolvedSearchParams.tab ?? 'overview'
    : 'overview';
  const activeYear = new Date().getUTCFullYear();
  const kpiPlanYear = resolveYear(resolvedSearchParams.year);
  const competitorSetupYear = resolveYear(resolvedSearchParams.year);

  const [brand, reporting] = await Promise.all([
    getBrand(brandCode),
    activeTab === 'overview'
      ? getReportingPeriods(brandCode, activeYear).catch(() => null)
      : Promise.resolve(null)
  ]);
  const relatedProductsResult =
    activeTab === 'columns'
      ? await getBrandCompanyFormatOptions(brandCode, { includeDeprecated: true })
          .then(data => ({ data, error: null as string | null }))
          .catch(error => ({
            data: null,
            error:
              error instanceof Error
                ? error.message
                : 'Failed to load related products for this brand.'
          }))
      : { data: null, error: null as string | null };
  const kpiPlanResult =
    activeTab === 'kpi'
      ? await getBrandKpiPlan(brandCode, kpiPlanYear)
          .then(data => ({ data, error: null as string | null }))
          .catch(error => ({
            data: null,
            error: error instanceof Error ? error.message : 'Failed to load KPI plan.'
          }))
      : { data: null, error: null as string | null };
  const kpiCatalogResult =
    activeTab === 'kpi'
      ? await getKpiCatalog({ includeInactive: true })
          .then(data => ({ data, error: null as string | null }))
          .catch(error => ({
            data: null,
            error: error instanceof Error ? error.message : 'Failed to load KPI catalog.'
          }))
      : { data: null, error: null as string | null };
  const competitorSetupResult =
    activeTab === 'competitors'
      ? await getCompetitorYearSetup(brandCode, competitorSetupYear)
          .then(data => ({ data, error: null as string | null }))
          .catch(error => ({
            data: null,
            error:
              error instanceof Error
                ? error.message
              : 'Failed to load competitor setup.'
          }))
      : { data: null, error: null as string | null };
  const questionSetupResult =
    activeTab === 'questions'
      ? await getQuestionSetup(brandCode)
          .then(data => ({ data, error: null as string | null }))
          .catch(error => ({
            data: null,
            error:
              error instanceof Error
                ? error.message
                : 'Failed to load question setup.'
          }))
      : { data: null, error: null as string | null };
  const relatedProductField =
    relatedProductsResult.data?.fields.find(field => field.key === 'related_product') ?? null;

  const reportCount = reporting?.items.length ?? 0;
  const submittedCount =
    reporting?.items.filter(item => item.latestVersionState === 'submitted').length ?? 0;
  const approvedCount =
    reporting?.items.filter(item => item.currentApprovedVersionId).length ?? 0;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Brand administration</Badge>
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-[-0.03em]">{brand.name}</h1>
            <div className="mt-1 text-sm text-muted-foreground">{brand.code}</div>
          </div>
        </div>

        <Button asChild>
          <Link href={`/app/${brand.code}/reports`}>
            Open workspace
            <ArrowRight />
          </Link>
        </Button>
      </div>

      <nav className="flex flex-wrap gap-2" aria-label="Brand admin navigation">
        {tabs.map(tab => (
          <Link
            className={`flex items-center gap-2 rounded-[22px] border px-4 py-3 text-sm transition ${
              activeTab === tab.key
                ? 'border-primary/25 bg-primary/10 text-foreground'
                : 'border-border/60 bg-background/60 text-muted-foreground hover:bg-background/80 hover:text-foreground'
            }`}
            href={adminTabHref(brand.code, tab.key)}
            key={tab.key}
          >
            <tab.icon className="size-4 text-primary" />
            {tab.label}
          </Link>
        ))}
      </nav>

      {resolvedSearchParams.message ? (
        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/8 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          {resolvedSearchParams.message}
        </div>
      ) : null}
      {resolvedSearchParams.error ? (
        <div className="rounded-2xl border border-rose-500/25 bg-rose-500/8 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
          {resolvedSearchParams.error}
        </div>
      ) : null}

      {activeTab === 'overview' ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_320px]">
          <Card>
            <CardHeader>
              <CardTitle>Brand summary</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              <div className="rounded-[24px] border border-border/60 bg-background/60 px-4 py-4">
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  Members
                </div>
                <div className="mt-2 text-2xl font-semibold">{brand.memberships.length}</div>
              </div>
              <div className="rounded-[24px] border border-border/60 bg-background/60 px-4 py-4">
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  Monthly reports
                </div>
                <div className="mt-2 text-2xl font-semibold">{reportCount}</div>
              </div>
              <div className="rounded-[24px] border border-border/60 bg-background/60 px-4 py-4">
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  Approved
                </div>
                <div className="mt-2 text-2xl font-semibold">{approvedCount}</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Admin separation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>Use this area for brand-level configuration.</p>
              <p>Daily reporting continues in the brand workspace.</p>
              <p>Pending submissions this year: {submittedCount}</p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {activeTab === 'members' ? (
        <Card>
          <CardHeader>
            <CardTitle>Members</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {brand.memberships.map(membership => (
              <div
                className="grid gap-4 rounded-[24px] border border-border/60 bg-background/60 p-4 md:grid-cols-[minmax(0,1fr)_160px_140px]"
                key={membership.id}
              >
                <div className="min-w-0">
                  <div className="text-base font-medium">{membership.user.displayName}</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {membership.user.email}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    Role
                  </div>
                  <div className="mt-2 text-sm font-medium">{membership.role}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    Status
                  </div>
                  <div className="mt-2 text-sm font-medium">{membership.user.status}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {activeTab === 'kpi' ? (
        <Card>
          <CardHeader>
            <CardTitle>KPI targets</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-[20px] border border-border/60 bg-background/55 px-4 py-3 text-sm text-muted-foreground">
              Brand-year KPI plans choose the KPI definitions that apply for that year. Different years can use different KPI counts.
            </div>

            {!kpiPlanResult.data || !kpiCatalogResult.data ? (
              <div className="rounded-[18px] border border-rose-500/25 bg-rose-500/8 px-3 py-3 text-sm text-rose-700 dark:text-rose-300">
                {kpiPlanResult.error ?? kpiCatalogResult.error ?? 'KPI planning is unavailable right now.'}
              </div>
            ) : (
              <BrandKpiPlanManager
                brandCode={brand.code}
                catalog={kpiCatalogResult.data.items}
                initialYear={kpiPlanYear}
                plan={kpiPlanResult.data}
              />
            )}
          </CardContent>
        </Card>
      ) : null}

      {activeTab === 'competitors' ? (
        <Card>
          <CardHeader>
            <CardTitle>Competitors</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-[20px] border border-border/60 bg-background/55 px-4 py-3 text-sm text-muted-foreground">
              Competitor setup is brand-scoped admin configuration. This controls
              which competitors content teams must complete each month.
            </div>

            {!competitorSetupResult.data ? (
              <div className="rounded-[18px] border border-rose-500/25 bg-rose-500/8 px-3 py-3 text-sm text-rose-700 dark:text-rose-300">
                {competitorSetupResult.error ?? 'Competitor setup is unavailable right now.'}
              </div>
            ) : (
              <CompetitorSetupManager
                brandId={brand.code}
                initialSetup={competitorSetupResult.data}
                initialYear={competitorSetupYear}
              />
            )}
          </CardContent>
        </Card>
      ) : null}

      {activeTab === 'questions' ? (
        <Card>
          <CardHeader>
            <CardTitle>Questions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-[20px] border border-border/60 bg-background/55 px-4 py-3 text-sm text-muted-foreground">
              Question setup is brand-scoped assignment from the global catalog.
              Content teams will complete these categories every month.
            </div>
            {!questionSetupResult.data ? (
              <div className="rounded-[18px] border border-rose-500/25 bg-rose-500/8 px-3 py-3 text-sm text-rose-700 dark:text-rose-300">
                {questionSetupResult.error ?? 'Question setup is unavailable right now.'}
              </div>
            ) : (
              <QuestionSetupManager
                brandId={brand.code}
                initialSetup={questionSetupResult.data}
              />
            )}
          </CardContent>
        </Card>
      ) : null}

      {activeTab === 'columns' ? (
        <Card>
          <CardHeader>
            <CardTitle>Columns</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <div className="rounded-[20px] border border-border/60 bg-background/55 px-4 py-3">
              Related Product is brand-level. Manage active/inactive items, order, and delete options that are not used in approved reports.
            </div>
            <div className="rounded-[20px] border border-border/60 bg-background/55 px-4 py-3">
              Shared dropdowns and formulas stay in global settings.
              <div className="mt-2">
                <Button asChild size="sm" variant="outline">
                  <Link href="/app/settings?tab=columns&field=content_style">
                    Open global table settings
                  </Link>
                </Button>
              </div>
            </div>

            {!relatedProductsResult.data || !relatedProductField ? (
              <div className="rounded-[18px] border border-rose-500/25 bg-rose-500/8 px-3 py-3 text-sm text-rose-700 dark:text-rose-300">
                {relatedProductsResult.error ??
                  'Related Product options are unavailable right now.'}
              </div>
            ) : (
              <CompanyFormatOptionsManager
                brandCode={brand.code}
                fieldKey="related_product"
                fieldLabel="Related Product"
                options={relatedProductField.options}
                scope="brand"
              />
            )}
          </CardContent>
        </Card>
      ) : null}

      {activeTab === 'overview' && reporting ? (
        <Card>
          <CardHeader>
            <CardTitle>Current reporting periods</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {reporting.items.length === 0 ? (
              <div className="text-sm text-muted-foreground">No reporting periods yet.</div>
            ) : (
              reporting.items.map(item => (
                <div
                  className="grid gap-4 rounded-[24px] border border-border/60 bg-background/60 p-4 md:grid-cols-[minmax(0,1fr)_180px]"
                  key={item.id}
                >
                  <div className="font-medium">{item.label}</div>
                  <div className="text-sm text-muted-foreground md:text-right">
                    {labelForState(item.latestVersionState ?? item.currentState)}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}
