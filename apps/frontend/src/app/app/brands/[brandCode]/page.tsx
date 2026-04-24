import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  Building2,
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
import { BrandYearSetupManager } from './brand-year-setup-manager';
import { QuestionSetupManager } from '../../[brandId]/question-setup/question-setup-manager';

const tabs = [
  { key: 'overview', label: 'Overview', icon: Building2 },
  { key: 'members', label: 'Members', icon: Users },
  { key: 'year-setup', label: 'Year Setup', icon: BadgeCheck },
  { key: 'questions', label: 'Questions', icon: BadgeCheck },
  { key: 'columns', label: 'Columns', icon: Waypoints }
] as const;
const REPORTS_PER_PAGE = 12;

type BrandAdminDetailPageProps = {
  params: Promise<{
    brandCode: string;
  }>;
  searchParams?: Promise<{
    tab?: string;
    year?: string;
    reportsPage?: string;
    message?: string;
    error?: string;
  }>;
};

function adminTabHref(brandCode: string, tab: string, year?: string) {
  const params = new URLSearchParams();
  params.set('tab', tab);

  if (year) {
    params.set('year', year);
  }

  return `/app/brands/${brandCode}?${params.toString()}`;
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

function resolvePositiveInteger(rawValue: string | undefined, fallback: number) {
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return parsed;
}

function overviewReportsHref(brandCode: string, page: number, year?: string) {
  const params = new URLSearchParams();
  params.set('tab', 'overview');

  if (year) {
    params.set('year', year);
  }

  if (page > 1) {
    params.set('reportsPage', String(page));
  }

  return `/app/brands/${brandCode}?${params.toString()}`;
}

export default async function BrandAdminDetailPage({
  params,
  searchParams
}: BrandAdminDetailPageProps) {
  const { brandCode } = await params;
  await requireBrandAdminAccess(brandCode, `/app/brands/${brandCode}`);
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const normalizedTab =
    resolvedSearchParams.tab === 'kpi' || resolvedSearchParams.tab === 'competitors'
      ? 'year-setup'
      : resolvedSearchParams.tab;
  const activeTab = tabs.some(tab => tab.key === normalizedTab)
    ? normalizedTab ?? 'overview'
    : 'overview';
  const activeYear = new Date().getUTCFullYear();
  const yearSetupYear = resolveYear(resolvedSearchParams.year);

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
  const yearSetupResult =
    activeTab === 'year-setup'
      ? await Promise.all([
          getReportingPeriods(brandCode, yearSetupYear),
          getKpiCatalog({ includeInactive: true }),
          getBrandKpiPlan(brandCode, yearSetupYear),
          getCompetitorYearSetup(brandCode, yearSetupYear)
        ])
          .then(([reportingYear, kpiCatalog, kpiPlan, competitorSetup]) => ({
            data: {
              reportingYear,
              kpiCatalog,
              kpiPlan,
              competitorSetup
            },
            error: null as string | null
          }))
          .catch(error => ({
            data: null,
            error:
              error instanceof Error
                ? error.message
                : 'Failed to load year setup.'
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
  const reportTotalPages = Math.max(1, Math.ceil(reportCount / REPORTS_PER_PAGE));
  const reportPage = Math.min(
    resolvePositiveInteger(resolvedSearchParams.reportsPage, 1),
    reportTotalPages
  );
  const reportPageStart = (reportPage - 1) * REPORTS_PER_PAGE;
  const visibleReportingItems =
    reporting?.items.slice(reportPageStart, reportPageStart + REPORTS_PER_PAGE) ?? [];
  const reportRangeStart = reportCount === 0 ? 0 : reportPageStart + 1;
  const reportRangeEnd =
    reportCount === 0
      ? 0
      : Math.min(reportCount, reportPageStart + visibleReportingItems.length);
  const canGoPrevReportPage = reportPage > 1;
  const canGoNextReportPage = reportPage < reportTotalPages;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Brand administration</Badge>
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-[-0.03em]">{brand.name}</h1>
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
            href={adminTabHref(brand.code, tab.key, resolvedSearchParams.year)}
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

      {activeTab === 'year-setup' ? (
        <Card>
          <CardHeader>
            <CardTitle>Year setup</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!yearSetupResult.data ? (
              <div className="rounded-[18px] border border-rose-500/25 bg-rose-500/8 px-3 py-3 text-sm text-rose-700 dark:text-rose-300">
                {yearSetupResult.error ?? 'Year setup is unavailable right now.'}
              </div>
            ) : (
              <BrandYearSetupManager
                brandCode={brand.code}
                hasExplicitYear={Boolean(resolvedSearchParams.year)}
                initialCompetitorSetup={yearSetupResult.data.competitorSetup}
                initialEditorTab={
                  resolvedSearchParams.tab === 'competitors' ? 'competitors' : 'kpi'
                }
                initialKpiCatalog={yearSetupResult.data.kpiCatalog.items}
                initialKpiPlan={yearSetupResult.data.kpiPlan}
                initialSetup={yearSetupResult.data.reportingYear.selectedYearSetup}
                initialYear={yearSetupResult.data.reportingYear.year}
                initialYearOptions={yearSetupResult.data.reportingYear.yearOptions}
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
              <>
                {visibleReportingItems.map(item => (
                  <div
                    className="grid gap-4 rounded-[24px] border border-border/60 bg-background/60 p-4 md:grid-cols-[minmax(0,1fr)_180px]"
                    key={item.id}
                  >
                    <div className="font-medium">{item.label}</div>
                    <div className="text-sm text-muted-foreground md:text-right">
                      {labelForState(item.latestVersionState ?? item.currentState)}
                    </div>
                  </div>
                ))}
                {reportTotalPages > 1 ? (
                  <div className="flex items-center justify-between gap-3 pt-2">
                    <div className="text-xs text-muted-foreground">
                      Showing {reportRangeStart}-{reportRangeEnd} of {reportCount} (page {reportPage}{' '}
                      of {reportTotalPages})
                    </div>
                    <div className="flex gap-2">
                      <Button asChild disabled={!canGoPrevReportPage} size="sm" variant="outline">
                        <Link
                          href={overviewReportsHref(
                            brand.code,
                            Math.max(1, reportPage - 1),
                            resolvedSearchParams.year
                          )}
                        >
                          Previous
                        </Link>
                      </Button>
                      <Button asChild disabled={!canGoNextReportPage} size="sm" variant="outline">
                        <Link
                          href={overviewReportsHref(
                            brand.code,
                            Math.min(reportTotalPages, reportPage + 1),
                            resolvedSearchParams.year
                          )}
                        >
                          Next
                        </Link>
                      </Button>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}
