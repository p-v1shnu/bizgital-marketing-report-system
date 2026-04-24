import { expect, test, type Page } from '@playwright/test';

type CompetitorSetupResponse = {
  assignments: Array<{
    competitor: {
      id: string;
    };
  }>;
};

type ReportingPeriodResponse = {
  id: string;
  year: number;
  month: number;
};

type ReportingListResponse = {
  selectedYearSetup: {
    year: number;
    canCreateReport: boolean;
    summary: string;
    checks: Array<{
      key: string;
      label: string;
      required: boolean;
      passed: boolean;
      detail: string;
    }>;
  };
  yearOptions: Array<{
    year: number;
    isReady: boolean;
    hasReports: boolean;
  }>;
  items: Array<{
    id: string;
    year: number;
    month: number;
    latestVersionId: string | null;
    currentDraftVersionId: string | null;
  }>;
};

type ResolvedPeriodResult = {
  period: ReportingPeriodResponse;
  created: boolean;
  hadDraft: boolean;
};

type ReportingDetailResponse = {
  period: {
    reviewReadiness: {
      checks: Array<{
        key: string;
        passed: boolean;
      }>;
    };
  };
};

type CompanyFormatOptionsResponse = {
  fields: Array<{
    key: string;
    options: Array<{
      id: string;
      status: 'active' | 'inactive' | 'deprecated';
    }>;
  }>;
};

type KpiCatalogListResponse = {
  items: Array<{
    id: string;
    label: string;
    isActive: boolean;
  }>;
};

type KpiPlanUpdateItem = {
  kpiCatalogId: string;
  targetValue?: number | null;
  note?: string | null;
  sortOrder?: number | null;
};

type BrandKpiPlanResponse = {
  items: Array<{
    sortOrder: number;
    targetValue: number | null;
    note: string | null;
    kpi: {
      id: string;
    };
  }>;
};

const frontendBaseUrl =
  process.env.E2E_FRONTEND_BASE_URL ?? 'http://localhost:3200';
const backendBaseUrl =
  process.env.E2E_BACKEND_BASE_URL ?? 'http://localhost:3003/api';
const brandCode = process.env.E2E_BRAND_CODE ?? 'demo-brand';
const adminEmail = process.env.E2E_ADMIN_EMAIL ?? 'admin@demo-brand.local';

function randomSuffix() {
  return `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

async function requestJson<T>(
  path: string,
  options?: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    body?: unknown;
    timeoutMs?: number;
  }
): Promise<T> {
  const timeoutMs = options?.timeoutMs ?? 15_000;
  const response = await fetch(`${backendBaseUrl}${path}`, {
    method: options?.method ?? 'GET',
    headers: options?.body
      ? {
          'Content-Type': 'application/json'
        }
      : undefined,
    body: options?.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(timeoutMs)
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload &&
      typeof payload === 'object' &&
      'message' in payload &&
      typeof (payload as { message?: unknown }).message === 'string'
        ? (payload as { message: string }).message
        : `Request failed: ${options?.method ?? 'GET'} ${path}`;

    throw new Error(message);
  }

  return payload as T;
}

async function createUniquePeriod(
  year: number
): Promise<ResolvedPeriodResult> {
  for (const month of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
    const response = await fetch(
      `${backendBaseUrl}/brands/${brandCode}/reporting-periods`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ year, month })
      }
    );
    const payload = await response.json().catch(() => null);

    if (response.ok) {
      return {
        period: payload as ReportingPeriodResponse,
        created: true,
        hadDraft: false
      };
    }

    if (response.status === 409) {
      continue;
    }

    throw new Error(
      `Failed to create period ${year}-${String(month).padStart(2, '0')}`
    );
  }

  const reporting = await requestJson<ReportingListResponse>(
    `/brands/${brandCode}/reporting-periods?year=${year}`
  );
  const reusable =
    reporting.items.find(
      (item) =>
        item.latestVersionId === null && item.currentDraftVersionId === null
    ) ??
    reporting.items.find(
      (item) =>
        item.latestVersionId === null && item.currentDraftVersionId !== null
    ) ??
    null;

  if (reusable) {
    return {
      period: {
        id: reusable.id,
        year: reusable.year,
        month: reusable.month
      },
      created: false,
      hadDraft: reusable.currentDraftVersionId !== null
    };
  }

  throw new Error(
    `Unable to create unique period in year ${year}, and no reusable empty period was found.`
  );
}

async function cleanupRequest(
  path: string,
  options?: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    body?: unknown;
  }
) {
  try {
    await requestJson(path, options);
  } catch {
    // Cleanup failures should not hide test behavior failures.
  }
}

async function waitForCompetitorReadinessPass(periodId: string, timeoutMs = 45_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const detail = await requestJson<ReportingDetailResponse>(
      `/brands/${brandCode}/reporting-periods/${periodId}`
    );
    const competitorCheck = detail.period.reviewReadiness.checks.find(
      (check) => check.key === 'competitor_evidence_complete'
    );

    if (competitorCheck?.passed) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  return false;
}

async function findIsolatedSetupYear(
  baseOffset: number,
  maxAttempts = 250
): Promise<{ year: number; setup: CompetitorSetupResponse }> {
  const startYear = Math.min(
    3000,
    Math.max(2000, new Date().getUTCFullYear() + baseOffset)
  );

  for (let offset = 0; offset < maxAttempts; offset += 1) {
    const candidateYear = startYear + offset;
    if (candidateYear > 3000) {
      break;
    }

    const setup = await requestJson<CompetitorSetupResponse>(
      `/brands/${brandCode}/competitor-setup/${candidateYear}`
    );
    if (setup.assignments.length === 0) {
      return { year: candidateYear, setup };
    }
  }

  throw new Error('Unable to find isolated competitor setup year for E2E.');
}

async function setAdminCookie(page: Page) {
  await page.context().addCookies([
    {
      name: 'bizgital-marketing-report.user-email',
      value: adminEmail,
      url: frontendBaseUrl
    }
  ]);
}

function resolveReadySourceYear(reporting: ReportingListResponse, targetYear: number) {
  const readyYears = reporting.yearOptions
    .filter((option) => option.isReady && option.year !== targetYear)
    .map((option) => option.year)
    .sort((left, right) => right - left);

  return readyYears[0] ?? null;
}

async function prepareYearSetup(targetYear: number): Promise<{
  originalKpiPlanItems: KpiPlanUpdateItem[] | null;
  kpiPlanChanged: boolean;
}> {
  let reporting = await requestJson<ReportingListResponse>(
    `/brands/${brandCode}/reporting-periods?year=${targetYear}`
  );
  let setupStatus = reporting.selectedYearSetup;
  let originalKpiPlanItems: KpiPlanUpdateItem[] | null = null;
  let kpiPlanChanged = false;

  if (!setupStatus.canCreateReport) {
    const failedCheckKeys = new Set(
      setupStatus.checks.filter((check) => !check.passed).map((check) => check.key)
    );

    if (failedCheckKeys.has('related_product_options')) {
      const options = await requestJson<CompanyFormatOptionsResponse>(
        `/brands/${brandCode}/internal-options`
      );
      const relatedProductField =
        options.fields.find((field) => field.key === 'related_product') ?? null;
      const hasActiveRelatedProduct =
        relatedProductField?.options.some((option) => option.status === 'active') ??
        false;

      if (!hasActiveRelatedProduct) {
        throw new Error(`Related Product options are still missing for ${targetYear}.`);
      }
    }

    if (failedCheckKeys.has('kpi_plan')) {
      const currentPlan = await requestJson<BrandKpiPlanResponse>(
        `/brands/${brandCode}/kpi-plans/${targetYear}`
      );
      originalKpiPlanItems = currentPlan.items.map((item) => ({
        kpiCatalogId: item.kpi.id,
        targetValue: item.targetValue,
        note: item.note,
        sortOrder: item.sortOrder
      }));

      if (currentPlan.items.length === 0) {
        const catalog = await requestJson<KpiCatalogListResponse>('/config/kpis');
        const firstActiveKpi = catalog.items.find((item) => item.isActive) ?? null;

        if (!firstActiveKpi) {
          throw new Error('No active KPI catalog definitions are available.');
        }

        await requestJson<BrandKpiPlanResponse>(
          `/brands/${brandCode}/kpi-plans/${targetYear}`,
          {
            method: 'POST',
            body: {
              items: [
                {
                  kpiCatalogId: firstActiveKpi.id,
                  targetValue: 1
                }
              ]
            }
          }
        );
        kpiPlanChanged = true;
      }
    }

    reporting = await requestJson<ReportingListResponse>(
      `/brands/${brandCode}/reporting-periods?year=${targetYear}`
    );
    setupStatus = reporting.selectedYearSetup;

    if (!setupStatus.canCreateReport) {
      const sourceYear = resolveReadySourceYear(reporting, targetYear);

      if (sourceYear !== null) {
        await requestJson(`/brands/${brandCode}/reporting-periods/year-setup/prepare`, {
          method: 'POST',
          body: {
            targetYear,
            sourceYear
          }
        });
        reporting = await requestJson<ReportingListResponse>(
          `/brands/${brandCode}/reporting-periods?year=${targetYear}`
        );
        setupStatus = reporting.selectedYearSetup;
      }
    }
  }

  if (!setupStatus.canCreateReport) {
    throw new Error(`Year ${targetYear} setup is still incomplete: ${setupStatus.summary}`);
  }

  return {
    originalKpiPlanItems,
    kpiPlanChanged
  };
}

async function restoreKpiPlanIfChanged(
  targetYear: number,
  originalKpiPlanItems: KpiPlanUpdateItem[] | null,
  kpiPlanChanged: boolean
) {
  if (!kpiPlanChanged || originalKpiPlanItems === null) {
    return;
  }

  await cleanupRequest(`/brands/${brandCode}/kpi-plans/${targetYear}`, {
    method: 'POST',
    body: {
      items: originalKpiPlanItems
    }
  });
}

test('admin setup can assign competitor and save assignments', async ({ page }) => {
  const isolated = await findIsolatedSetupYear(70);
  const testYear = isolated.year;
  const competitorName = `UI E2E Catalog ${randomSuffix()}`;
  let competitorId: string | null = null;
  let originalAssignments: string[] = isolated.setup.assignments.map(
    (item) => item.competitor.id
  );

  try {
    const createdCompetitor = await requestJson<{ id: string }>(
      `/brands/${brandCode}/competitor-setup/catalog`,
      {
        method: 'POST',
        body: {
          name: competitorName,
          primaryPlatform: 'Facebook',
          status: 'active'
        }
      }
    );
    competitorId = createdCompetitor.id;

    await setAdminCookie(page);
    await page.goto(`/app/brands/${brandCode}?tab=competitors&year=${testYear}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('competitor-setup-manager')).toBeVisible();
    await page.getByTestId('catalog-search-input').fill(competitorName);
    await expect(page.getByTestId(`add-assignment-${competitorId}`)).toBeVisible();

    await expect(async () => {
      await page.getByTestId(`add-assignment-${competitorId}`).click();
      await expect(page.getByTestId('setup-status-message')).toContainText('Assigned', {
        timeout: 5_000
      });
    }).toPass({
      timeout: 20_000
    });
    await expect(
      page.getByTestId(`assigned-competitor-${competitorId}`)
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByTestId(`assigned-competitor-${competitorId}`)
    ).toContainText(competitorName);
  } finally {
    await cleanupRequest(`/brands/${brandCode}/competitor-setup/${testYear}/assignments`, {
      method: 'POST',
      body: {
        competitorIds: originalAssignments
      }
    });

    if (competitorId) {
      await cleanupRequest(
        `/brands/${brandCode}/competitor-setup/catalog/${competitorId}`,
        {
          method: 'PATCH',
          body: {
            status: 'inactive'
          }
        }
      );
    }
  }
});

test('monthly monitoring checklist auto-saves and marks competitor complete', async ({
  page
}) => {
  const isolated = await findIsolatedSetupYear(80);
  const testYear = isolated.year;
  const competitorName = `UI E2E Monitoring ${randomSuffix()}`;
  let competitorId: string | null = null;
  let periodId: string | null = null;
  let periodCreatedByTest = false;
  let originalKpiPlanItems: KpiPlanUpdateItem[] | null = null;
  let kpiPlanChangedByTest = false;
  let originalAssignments: string[] = isolated.setup.assignments.map(
    (item) => item.competitor.id
  );

  try {
    const createdCompetitor = await requestJson<{ id: string }>(
      `/brands/${brandCode}/competitor-setup/catalog`,
      {
        method: 'POST',
        body: {
          name: competitorName,
          primaryPlatform: 'Facebook',
          status: 'active'
        }
      }
    );
    competitorId = createdCompetitor.id;

    await requestJson(`/brands/${brandCode}/competitor-setup/${testYear}/assignments`, {
      method: 'POST',
      body: {
        competitorIds: [competitorId]
      }
    });
    const setupResult = await prepareYearSetup(testYear);
    originalKpiPlanItems = setupResult.originalKpiPlanItems;
    kpiPlanChangedByTest = setupResult.kpiPlanChanged;

    const periodResult = await createUniquePeriod(testYear);
    periodId = periodResult.period.id;
    periodCreatedByTest = periodResult.created;
    if (!periodResult.hadDraft) {
      await requestJson(`/reporting-periods/${periodId}/drafts`, {
        method: 'POST'
      });
    }

    await setAdminCookie(page);
    await page.goto(`/app/${brandCode}/reports/${periodId}/competitors`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('competitor-monitoring-workspace')).toBeVisible();
    await expect(page.getByTestId(`competitor-checklist-${competitorId}`)).toBeVisible();

    await page.getByTestId(`competitor-checklist-${competitorId}`).click();
    await page.getByTestId('follower-input').fill('1234');
    await page.getByTestId('status-no-activity-button').click();
    await expect(page.getByTestId('no-activity-note-input')).toBeVisible();
    await page
      .getByTestId('no-activity-note-input')
      .fill('No activity observed this month.');
    await page.getByRole('button', { name: 'Save all' }).click();
    await expect(page.getByTestId(`competitor-checklist-${competitorId}`)).toContainText(
      'Saved',
      { timeout: 15_000 }
    );

    await requestJson(
      `/brands/${brandCode}/reporting-periods/${periodId}/competitors/${competitorId}/monitoring`,
      {
        method: 'POST',
        body: {
          status: 'no_activity',
          followerCount: 1234,
          highlightNote: 'No activity observed this month.',
          noActivityEvidenceImageUrl: 'https://example.com/no-activity-proof.png',
          posts: []
        }
      }
    );
    expect(await waitForCompetitorReadinessPass(periodId, 45_000)).toBeTruthy();
    await page.reload();
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId(`competitor-checklist-${competitorId}`)).toContainText(
      'Complete',
      { timeout: 15_000 }
    );
    await expect(page.getByTestId('monitoring-readiness-banner')).toContainText(
      'Competitor section ready',
      { timeout: 30_000 }
    );
  } finally {
    if (periodId && periodCreatedByTest) {
      await cleanupRequest(`/reporting-periods/${periodId}`, { method: 'DELETE' });
    }

    await restoreKpiPlanIfChanged(
      testYear,
      originalKpiPlanItems,
      kpiPlanChangedByTest
    );

    await cleanupRequest(`/brands/${brandCode}/competitor-setup/${testYear}/assignments`, {
      method: 'POST',
      body: {
        competitorIds: originalAssignments
      }
    });

    if (competitorId) {
      await cleanupRequest(
        `/brands/${brandCode}/competitor-setup/catalog/${competitorId}`,
        {
          method: 'PATCH',
          body: {
            status: 'inactive'
          }
        }
      );
    }
  }
});

test('monthly monitoring has_posts enforces screenshot and max 5 posts', async ({
  page
}) => {
  const isolated = await findIsolatedSetupYear(81);
  const testYear = isolated.year;
  const competitorName = `UI E2E Has Posts ${randomSuffix()}`;
  let competitorId: string | null = null;
  let periodId: string | null = null;
  let periodCreatedByTest = false;
  let originalKpiPlanItems: KpiPlanUpdateItem[] | null = null;
  let kpiPlanChangedByTest = false;
  let originalAssignments: string[] = isolated.setup.assignments.map(
    (item) => item.competitor.id
  );

  try {
    const createdCompetitor = await requestJson<{ id: string }>(
      `/brands/${brandCode}/competitor-setup/catalog`,
      {
        method: 'POST',
        body: {
          name: competitorName,
          primaryPlatform: 'Facebook',
          status: 'active'
        }
      }
    );
    competitorId = createdCompetitor.id;

    await requestJson(`/brands/${brandCode}/competitor-setup/${testYear}/assignments`, {
      method: 'POST',
      body: {
        competitorIds: [competitorId]
      }
    });
    const setupResult = await prepareYearSetup(testYear);
    originalKpiPlanItems = setupResult.originalKpiPlanItems;
    kpiPlanChangedByTest = setupResult.kpiPlanChanged;

    const periodResult = await createUniquePeriod(testYear);
    periodId = periodResult.period.id;
    periodCreatedByTest = periodResult.created;
    if (!periodResult.hadDraft) {
      await requestJson(`/reporting-periods/${periodId}/drafts`, {
        method: 'POST'
      });
    }

    await setAdminCookie(page);
    await page.goto(`/app/${brandCode}/reports/${periodId}/competitors`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('competitor-monitoring-workspace')).toBeVisible();
    await expect(page.getByTestId(`competitor-checklist-${competitorId}`)).toBeVisible();

    await page.getByTestId(`competitor-checklist-${competitorId}`).click();
    await page.getByTestId('follower-input').fill('1500');
    await page.getByTestId('status-has-posts-button').click();
    await page.getByTestId('monthly-post-count-input').fill('8');

    const addPostButton = page.getByRole('button', { name: 'Add post' });
    await expect(page.getByText('Posts (1/5)')).toBeVisible();
    await expect(addPostButton).toBeEnabled();

    await page.getByPlaceholder('Post URL (optional)').first().fill('https://facebook.com/example/posts/1');
    await page.getByRole('button', { name: 'Save all' }).click();
    await expect(page.getByTestId(`competitor-checklist-${competitorId}`)).toContainText(
      'Post URL requires screenshot evidence.'
    );

    await requestJson(
      `/brands/${brandCode}/reporting-periods/${periodId}/competitors/${competitorId}/monitoring`,
      {
        method: 'POST',
        body: {
          status: 'has_posts',
          followerCount: 1500,
          monthlyPostCount: 8,
          highlightNote: 'Monthly highlight summary for monitored posts.',
          noActivityEvidenceImageUrl: null,
          posts: [
            {
              displayOrder: 1,
              screenshotUrl: 'https://example.com/post-1.png',
              postUrl: 'https://facebook.com/example/posts/1'
            },
            {
              displayOrder: 2,
              screenshotUrl: 'https://example.com/post-2.png',
              postUrl: null
            },
            {
              displayOrder: 3,
              screenshotUrl: 'https://example.com/post-3.png',
              postUrl: null
            },
            {
              displayOrder: 4,
              screenshotUrl: 'https://example.com/post-4.png',
              postUrl: null
            },
            {
              displayOrder: 5,
              screenshotUrl: 'https://example.com/post-5.png',
              postUrl: null
            }
          ]
        }
      }
    );
    expect(await waitForCompetitorReadinessPass(periodId, 45_000)).toBeTruthy();
    await page.reload();
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId(`competitor-checklist-${competitorId}`)).toContainText(
      'Complete',
      { timeout: 15_000 }
    );

  } finally {
    if (periodId && periodCreatedByTest) {
      await cleanupRequest(`/reporting-periods/${periodId}`, { method: 'DELETE' });
    }

    await restoreKpiPlanIfChanged(
      testYear,
      originalKpiPlanItems,
      kpiPlanChangedByTest
    );

    await cleanupRequest(`/brands/${brandCode}/competitor-setup/${testYear}/assignments`, {
      method: 'POST',
      body: {
        competitorIds: originalAssignments
      }
    });

    if (competitorId) {
      await cleanupRequest(
        `/brands/${brandCode}/competitor-setup/catalog/${competitorId}`,
        {
          method: 'PATCH',
          body: {
            status: 'inactive'
          }
        }
      );
    }
  }
});
