import Link from 'next/link';
import { BadgeCheck, Building2, Calculator, Columns3, History, Image, Link2, Target, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAnyAdmin } from '@/lib/auth';
import {
  getBrands,
  getAdminAuditLogs,
  getComputedFormulas,
  getContentCountPolicy,
  getGlobalCompanyFormatOptions,
  getImportColumnMappingConfig,
  getImportTableLayout,
  getKpiCatalog,
  getMetaColumnCatalog,
  getTopContentDataSourcePolicy,
  getQuestionCatalog,
  getUsers,
  type BrandSummary,
  type AdminAuditLogListResponse,
  type ComputedFormulaListResponse,
  type GlobalCompanyFormatOptionsResponse,
  type KpiCatalogListResponse,
  type UserSummary
} from '@/lib/reporting-api';

import { BrandsManager } from './brands-manager';
import { AuditLogManager } from './audit-log-manager';
import { CompanyFormatOptionsManager } from './company-format-options-manager';
import { ContentPolicyManager } from './content-policy-manager';
import { FormulaManager } from './formula-manager';
import { ImportColumnLayoutManager } from './import-column-layout-manager';
import { ImportMappingManager } from './import-mapping-manager';
import { KpiCatalogManager } from './kpi-catalog-manager';
import { QuestionCatalogManager } from './question-catalog-manager';
import { UsersAccessManager } from './users-access-manager';

type SettingsTab =
  | 'users'
  | 'brands'
  | 'data-setup'
  | 'columns'
  | 'content-policy'
  | 'kpis'
  | 'questions'
  | 'audit-log';
type GlobalFieldTab = 'content_style' | 'media_format' | 'content_objective';

type SettingsPageProps = {
  searchParams?: Promise<{
    tab?: string;
    field?: string;
    q?: string;
    page?: string;
    limit?: string;
    message?: string;
    error?: string;
  }>;
};

const tabs: Array<{
  key: SettingsTab;
  label: string;
  icon: typeof Users;
}> = [
  { key: 'users', label: 'Users & Access', icon: Users },
  { key: 'brands', label: 'Brands', icon: Building2 },
  { key: 'data-setup', label: 'Data Setup', icon: Link2 },
  { key: 'columns', label: 'Company Format', icon: Columns3 },
  { key: 'content-policy', label: 'Content Policy', icon: Image },
  { key: 'kpis', label: 'KPI Catalog', icon: Target },
  { key: 'questions', label: 'Question Catalog', icon: BadgeCheck },
  { key: 'audit-log', label: 'Audit Log', icon: History }
];

const fieldLabelFallback = new Map<GlobalFieldTab, string>([
  ['content_style', 'Content Style'],
  ['media_format', 'Media Format'],
  ['content_objective', 'Content Objective']
]);

function parseSettingsTab(value?: string): SettingsTab {
  if (value === 'top-content') {
    return 'content-policy';
  }

  if (value === 'import-mapping' || value === 'formulas') {
    return 'data-setup';
  }

  return tabs.some(tab => tab.key === value) ? (value as SettingsTab) : 'users';
}

function parseFieldTab(value?: string): GlobalFieldTab {
  const allowed: GlobalFieldTab[] = ['content_style', 'media_format', 'content_objective'];
  return allowed.includes(value as GlobalFieldTab)
    ? (value as GlobalFieldTab)
    : 'content_style';
}

function settingsHref(tab: SettingsTab, field?: GlobalFieldTab) {
  const search = new URLSearchParams({ tab });
  if (tab === 'columns' && field) {
    search.set('field', field);
  }
  return `/app/settings?${search.toString()}`;
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.floor(parsed);
}

function parseAuditLimit(value: string | undefined) {
  const parsed = Number(value);
  if (parsed === 20 || parsed === 50 || parsed === 100) {
    return parsed;
  }

  return 50;
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const adminContext = await requireAnyAdmin('/app/settings');
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const activeTab = parseSettingsTab(resolvedSearchParams.tab);
  const activeField = parseFieldTab(resolvedSearchParams.field);
  const auditQuery = String(resolvedSearchParams.q ?? '').trim();
  const auditPage = parsePositiveInt(resolvedSearchParams.page, 1);
  const auditLimit = parseAuditLimit(resolvedSearchParams.limit);

  const shouldLoadBrands = activeTab === 'users' || activeTab === 'brands';
  const shouldLoadUsers = activeTab === 'users' || activeTab === 'brands';
  const shouldLoadColumns = activeTab === 'columns' || activeTab === 'data-setup';
  const shouldLoadImportMapping = activeTab === 'data-setup';
  const shouldLoadContentPolicy = activeTab === 'content-policy';
  const shouldLoadFormulas = activeTab === 'data-setup' || activeTab === 'kpis';
  const shouldLoadKpis = activeTab === 'kpis';
  const shouldLoadQuestionCatalog = activeTab === 'questions';
  const shouldLoadAuditLog = activeTab === 'audit-log';

  const brandsResult = shouldLoadBrands
    ? await getBrands()
        .then(data => ({ data, error: null as string | null }))
        .catch(error => ({
          data: [] as BrandSummary[],
          error: error instanceof Error ? error.message : 'Failed to load brands.'
        }))
    : { data: [] as BrandSummary[], error: null as string | null };
  const usersResult = shouldLoadUsers
    ? await getUsers()
        .then(data => ({ data, error: null as string | null }))
        .catch(error => ({
          data: [] as UserSummary[],
          error: error instanceof Error ? error.message : 'Failed to load users.'
        }))
    : { data: [] as UserSummary[], error: null as string | null };
  const companyFormatOptionsResult = shouldLoadColumns
    ? await getGlobalCompanyFormatOptions({ includeDeprecated: true })
        .then(data => ({ data, error: null as string | null }))
        .catch(error => ({
          data: null,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to load global internal options.'
        }))
    : { data: null as GlobalCompanyFormatOptionsResponse | null, error: null as string | null };
  const formulasResult = shouldLoadFormulas
    ? await getComputedFormulas()
        .then(data => ({ data, error: null as string | null }))
        .catch(error => ({
          data: { items: [] } as ComputedFormulaListResponse,
          error: error instanceof Error ? error.message : 'Failed to load computed formulas.'
        }))
    : {
        data: { items: [] } as ComputedFormulaListResponse,
        error: null as string | null
      };
  const kpiCatalogResult = shouldLoadKpis
    ? await getKpiCatalog({ includeInactive: true })
        .then(data => ({ data, error: null as string | null }))
        .catch(error => ({
          data: {
            items: [],
            newBrandDefaultKpiCatalogIds: []
          } as KpiCatalogListResponse,
          error: error instanceof Error ? error.message : 'Failed to load KPI catalog.'
        }))
    : {
        data: {
          items: [],
          newBrandDefaultKpiCatalogIds: []
        } as KpiCatalogListResponse,
        error: null as string | null
      };
  const metaColumnsResult = shouldLoadFormulas || shouldLoadColumns
    ? await getMetaColumnCatalog({ limit: 150 })
        .then(data => ({ data, error: null as string | null }))
        .catch(error => ({
          data: { columns: [] },
          error: error instanceof Error ? error.message : 'Failed to load Meta columns.'
        }))
    : {
        data: { columns: [] },
        error: null as string | null
      };
  const importLayoutResult = shouldLoadColumns
    ? await getImportTableLayout()
        .then(data => ({ data, error: null as string | null }))
        .catch(error => ({
          data: { visibleSourceColumnLabels: [] },
          error:
            error instanceof Error
              ? error.message
              : 'Failed to load import table layout settings.'
        }))
    : {
        data: { visibleSourceColumnLabels: [] },
        error: null as string | null
      };
  const importMappingConfigResult = shouldLoadImportMapping
    ? await getImportColumnMappingConfig()
        .then(data => ({ data, error: null as string | null }))
        .catch(error => ({
          data: null,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to load import mapping settings.'
        }))
    : {
        data: null as Awaited<ReturnType<typeof getImportColumnMappingConfig>> | null,
        error: null as string | null
      };
  const contentCountPolicyResult = shouldLoadContentPolicy
    ? await getContentCountPolicy()
        .then(data => ({ data, error: null as string | null }))
        .catch(error => ({
          data: null,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to load Content count policy.'
        }))
    : {
        data: null as Awaited<ReturnType<typeof getContentCountPolicy>> | null,
        error: null as string | null
      };
  const topContentPolicyResult = shouldLoadContentPolicy
    ? await getTopContentDataSourcePolicy()
        .then(data => ({ data, error: null as string | null }))
        .catch(error => ({
          data: null,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to load Top Content data source policy.'
        }))
    : {
        data: null as Awaited<ReturnType<typeof getTopContentDataSourcePolicy>> | null,
        error: null as string | null
      };
  const questionCatalogResult = shouldLoadQuestionCatalog
    ? await getQuestionCatalog()
        .then(data => ({ data, error: null as string | null }))
        .catch(error => ({
          data: null,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to load question catalog.'
        }))
    : {
        data: null as Awaited<ReturnType<typeof getQuestionCatalog>> | null,
        error: null as string | null
      };
  const auditLogResult = shouldLoadAuditLog
    ? await getAdminAuditLogs({
        actorEmail: adminContext.user.email,
        q: auditQuery,
        page: auditPage,
        limit: auditLimit
      })
        .then(data => ({ data, error: null as string | null }))
        .catch(error => ({
          data: {
            items: [],
            pagination: {
              page: auditPage,
              limit: auditLimit,
              total: 0,
              totalPages: 1
            }
          } as AdminAuditLogListResponse,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to load admin audit logs.'
        }))
    : {
        data: {
          items: [],
          pagination: {
            page: auditPage,
            limit: auditLimit,
            total: 0,
            totalPages: 1
          }
        } as AdminAuditLogListResponse,
        error: null as string | null
      };

  const users = usersResult.data;
  const adminCount = users.filter(user =>
    user.isGlobalAdmin ||
    user.memberships.some(membership => membership.role === 'admin')
  ).length;

  const currentField =
    companyFormatOptionsResult.data?.fields.find(field => field.key === activeField) ?? null;

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Admin configuration
        </div>
        <h1 className="text-3xl font-semibold tracking-[-0.03em]">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Daily workflow stays in Import. Admin settings are separated by tab and deep links.
        </p>
      </div>

      {resolvedSearchParams.error ? (
        <div className="rounded-2xl border border-rose-500/25 bg-rose-500/8 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
          {resolvedSearchParams.error}
        </div>
      ) : null}
      {resolvedSearchParams.message ? (
        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/8 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          {resolvedSearchParams.message}
        </div>
      ) : null}

      <nav className="flex flex-wrap gap-2" aria-label="Settings navigation">
        {tabs.map(tab => (
          <Link
            className={`flex items-center gap-2 rounded-[22px] border px-4 py-3 text-sm transition ${
              activeTab === tab.key
                ? 'border-primary/25 bg-primary/10 text-foreground'
                : 'border-border/60 bg-background/60 text-muted-foreground hover:bg-background/80 hover:text-foreground'
            }`}
            href={settingsHref(tab.key)}
            key={tab.key}
          >
            <tab.icon className="size-4 text-primary" />
            {tab.label}
          </Link>
        ))}
      </nav>

      {activeTab === 'users' ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <Users className="text-primary" />
              Users & access
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-[20px] border border-border/60 bg-background/60 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Users</div>
                <div className="mt-2 text-xl font-semibold">{users.length}</div>
              </div>
              <div className="rounded-[20px] border border-border/60 bg-background/60 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Admin users</div>
                <div className="mt-2 text-xl font-semibold">{adminCount}</div>
              </div>
              <div className="rounded-[20px] border border-border/60 bg-background/60 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Brands</div>
                <div className="mt-2 text-xl font-semibold">{brandsResult.data.length}</div>
              </div>
            </div>

            {usersResult.error ? (
              <div className="rounded-[18px] border border-rose-500/25 bg-rose-500/8 px-3 py-3 text-sm text-rose-700 dark:text-rose-300">
                {usersResult.error}
              </div>
            ) : null}
            {brandsResult.error ? (
              <div className="rounded-[18px] border border-rose-500/25 bg-rose-500/8 px-3 py-3 text-sm text-rose-700 dark:text-rose-300">
                {brandsResult.error}
              </div>
            ) : null}

            <UsersAccessManager
              actorEmail={adminContext.user.email}
              actorName={adminContext.user.displayName}
              brands={brandsResult.data}
              users={users}
            />
          </CardContent>
        </Card>
      ) : null}

      {activeTab === 'brands' ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <Building2 className="text-primary" />
              Brand settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {brandsResult.error ? (
              <div className="rounded-[18px] border border-rose-500/25 bg-rose-500/8 px-3 py-3 text-sm text-rose-700 dark:text-rose-300">
                {brandsResult.error}
              </div>
            ) : usersResult.error ? (
              <div className="rounded-[18px] border border-rose-500/25 bg-rose-500/8 px-3 py-3 text-sm text-rose-700 dark:text-rose-300">
                {usersResult.error}
              </div>
            ) : (
              <BrandsManager
                actorEmail={adminContext.user.email}
                actorName={adminContext.user.displayName}
                brands={brandsResult.data}
                users={usersResult.data}
              />
            )}
          </CardContent>
        </Card>
      ) : null}

      {activeTab === 'data-setup' ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <Link2 className="text-primary" />
              Data setup
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="rounded-[20px] border border-border/60 bg-background/55 px-4 py-3 text-sm text-muted-foreground">
              Configure CSV schema once, then continue with table layout and formula logic in the same flow.
            </div>

            <section className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Link2 className="size-4 text-primary" />
                Step 1: Import mapping baseline
              </div>
              {importMappingConfigResult.error ? (
                <div className="rounded-[24px] border border-rose-500/25 bg-rose-500/8 px-4 py-4 text-sm text-rose-700 dark:text-rose-300">
                  {importMappingConfigResult.error}
                </div>
              ) : importMappingConfigResult.data ? (
                <ImportMappingManager
                  config={importMappingConfigResult.data}
                  returnPath={settingsHref('data-setup')}
                />
              ) : null}
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Columns3 className="size-4 text-primary" />
                Step 2: Table display layout
              </div>
              {metaColumnsResult.error ? (
                <div className="rounded-[18px] border border-rose-500/25 bg-rose-500/8 px-3 py-3 text-sm text-rose-700 dark:text-rose-300">
                  {metaColumnsResult.error}
                </div>
              ) : importLayoutResult.error ? (
                <div className="rounded-[18px] border border-rose-500/25 bg-rose-500/8 px-3 py-3 text-sm text-rose-700 dark:text-rose-300">
                  {importLayoutResult.error}
                </div>
              ) : (
                <ImportColumnLayoutManager
                  initialSelectedLabels={importLayoutResult.data.visibleSourceColumnLabels}
                  metaColumns={metaColumnsResult.data.columns}
                />
              )}
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Calculator className="size-4 text-primary" />
                Step 3: Formula manager
              </div>
              {formulasResult.error ? (
                <div className="rounded-[24px] border border-rose-500/25 bg-rose-500/8 px-4 py-4 text-sm text-rose-700 dark:text-rose-300">
                  {formulasResult.error}
                </div>
              ) : metaColumnsResult.error ? (
                <div className="rounded-[24px] border border-rose-500/25 bg-rose-500/8 px-4 py-4 text-sm text-rose-700 dark:text-rose-300">
                  {metaColumnsResult.error}
                </div>
              ) : (
                <FormulaManager
                  formulas={formulasResult.data.items}
                  metaColumns={metaColumnsResult.data.columns}
                />
              )}
              <div className="text-sm text-muted-foreground">
                Use expression format like <code>{'{{Views}} / {{Viewers}}'}</code>. Active formulas appear in Import content table after upload.
              </div>
            </section>
          </CardContent>
        </Card>
      ) : null}

      {activeTab === 'columns' ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <Columns3 className="text-primary" />
              Company format options
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <nav className="flex flex-wrap gap-2" aria-label="Column field tabs">
              {(['content_style', 'media_format', 'content_objective'] as GlobalFieldTab[]).map(
                field => (
                  <Link
                    className={`rounded-xl border px-3 py-2 text-sm transition ${
                      activeField === field
                        ? 'border-primary/25 bg-primary/10 text-foreground'
                        : 'border-border/60 bg-background/60 text-muted-foreground hover:text-foreground'
                    }`}
                    href={settingsHref('columns', field)}
                    key={field}
                  >
                    {fieldLabelFallback.get(field)}
                  </Link>
                )
              )}
            </nav>

            {!companyFormatOptionsResult.data ? (
              <div className="rounded-[24px] border border-rose-500/25 bg-rose-500/8 px-4 py-4 text-sm text-rose-700 dark:text-rose-300">
                {companyFormatOptionsResult.error ??
                  'Global internal options are unavailable right now.'}
              </div>
            ) : !currentField ? (
              <div className="rounded-[24px] border border-dashed border-border/60 px-4 py-4 text-sm text-muted-foreground">
                This field is not available in global scope.
              </div>
            ) : (
              <CompanyFormatOptionsManager
                fieldKey={currentField.key}
                fieldLabel={currentField.label || fieldLabelFallback.get(activeField) || activeField}
                options={currentField.options}
                scope="global"
              />
            )}
          </CardContent>
        </Card>
      ) : null}

      {activeTab === 'content-policy' ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <Image className="text-primary" />
              Content policy
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ContentPolicyManager
              contentCountPolicy={contentCountPolicyResult.data}
              contentCountPolicyError={contentCountPolicyResult.error}
              returnPath="/app/settings?tab=content-policy"
              topContentPolicy={topContentPolicyResult.data}
              topContentPolicyError={topContentPolicyResult.error}
            />
          </CardContent>
        </Card>
      ) : null}

      {activeTab === 'kpis' ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <Target className="text-primary" />
              KPI catalog
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {kpiCatalogResult.error ? (
              <div className="rounded-[24px] border border-rose-500/25 bg-rose-500/8 px-4 py-4 text-sm text-rose-700 dark:text-rose-300">
                {kpiCatalogResult.error}
              </div>
            ) : formulasResult.error ? (
              <div className="rounded-[24px] border border-rose-500/25 bg-rose-500/8 px-4 py-4 text-sm text-rose-700 dark:text-rose-300">
                {formulasResult.error}
              </div>
            ) : (
              <KpiCatalogManager
                formulas={formulasResult.data.items}
                items={kpiCatalogResult.data.items}
                newBrandDefaultKpiCatalogIds={kpiCatalogResult.data.newBrandDefaultKpiCatalogIds}
              />
            )}
            <div className="text-sm text-muted-foreground">
              KPI definitions are global, while each brand-year plan chooses the subset and targets for that year.
            </div>
          </CardContent>
        </Card>
      ) : null}

      {activeTab === 'questions' ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <BadgeCheck className="text-primary" />
              Question catalog
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-[20px] border border-border/60 bg-background/55 px-4 py-3 text-sm text-muted-foreground">
              Global question categories are managed in admin settings. Brand pages will only assign and reorder.
            </div>

            {!questionCatalogResult.data ? (
              <div className="rounded-[24px] border border-rose-500/25 bg-rose-500/8 px-4 py-4 text-sm text-rose-700 dark:text-rose-300">
                {questionCatalogResult.error ?? 'Question catalog is unavailable right now.'}
              </div>
            ) : (
              <QuestionCatalogManager initialCatalog={questionCatalogResult.data} />
            )}
          </CardContent>
        </Card>
      ) : null}

      {activeTab === 'audit-log' ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <History className="text-primary" />
              Audit log
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {auditLogResult.error ? (
              <div className="rounded-[24px] border border-rose-500/25 bg-rose-500/8 px-4 py-4 text-sm text-rose-700 dark:text-rose-300">
                {auditLogResult.error}
              </div>
            ) : (
              <AuditLogManager
                data={auditLogResult.data}
                limit={auditLimit}
                q={auditQuery}
              />
            )}
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}
