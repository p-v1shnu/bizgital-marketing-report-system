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
): Promise<ReportingPeriodResponse> {
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
      return payload as ReportingPeriodResponse;
    }

    if (response.status === 409) {
      continue;
    }

    throw new Error(
      `Failed to create period ${year}-${String(month).padStart(2, '0')}`
    );
  }

  throw new Error(`Unable to create unique period in year ${year}.`);
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

async function waitForCompetitorReadinessPass(periodId: string, timeoutMs = 20_000) {
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

async function setAdminCookie(page: Page) {
  await page.context().addCookies([
    {
      name: 'bizgital-marketing-report.user-email',
      value: adminEmail,
      url: frontendBaseUrl
    }
  ]);
}

test('admin setup can assign competitor and save assignments', async ({ page }) => {
  const testYear = new Date().getUTCFullYear() + 70;
  const competitorName = `UI E2E Catalog ${randomSuffix()}`;
  let competitorId: string | null = null;
  let originalAssignments: string[] = [];

  try {
    const setup = await requestJson<CompetitorSetupResponse>(
      `/brands/${brandCode}/competitor-setup/${testYear}`
    );
    originalAssignments = setup.assignments.map((item) => item.competitor.id);

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
    await page
      .getByTestId(`add-assignment-${competitorId}`)
      .evaluate((element: HTMLElement) => element.click());
    await expect(
      page.getByTestId(`assigned-competitor-${competitorId}`)
    ).toBeVisible();

    await expect(page.getByTestId('setup-status-message')).toContainText('Assigned');
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
  const testYear = new Date().getUTCFullYear() + 80;
  const competitorName = `UI E2E Monitoring ${randomSuffix()}`;
  let competitorId: string | null = null;
  let periodId: string | null = null;
  let originalAssignments: string[] = [];

  try {
    const setup = await requestJson<CompetitorSetupResponse>(
      `/brands/${brandCode}/competitor-setup/${testYear}`
    );
    originalAssignments = setup.assignments.map((item) => item.competitor.id);

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

    const period = await createUniquePeriod(testYear);
    periodId = period.id;
    await requestJson(`/reporting-periods/${periodId}/drafts`, {
      method: 'POST'
    });

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
    await page
      .getByTestId('no-activity-evidence-input')
      .fill('https://example.com/no-activity-proof.png');
    await page.getByTestId('save-now-button').click();

    await expect(page.getByTestId(`competitor-checklist-${competitorId}`)).toContainText(
      'Complete',
      { timeout: 15_000 }
    );
    await expect(page.getByTestId(`competitor-checklist-${competitorId}`)).toContainText(
      'Saved',
      { timeout: 15_000 }
    );
    await expect(page.getByTestId('monitoring-readiness-banner')).toContainText(
      'Competitor section ready',
      { timeout: 15_000 }
    );

    expect(await waitForCompetitorReadinessPass(periodId)).toBeTruthy();
  } finally {
    if (periodId) {
      await cleanupRequest(`/reporting-periods/${periodId}`, { method: 'DELETE' });
    }

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
  const testYear = new Date().getUTCFullYear() + 81;
  const competitorName = `UI E2E Has Posts ${randomSuffix()}`;
  let competitorId: string | null = null;
  let periodId: string | null = null;
  let originalAssignments: string[] = [];

  try {
    const setup = await requestJson<CompetitorSetupResponse>(
      `/brands/${brandCode}/competitor-setup/${testYear}`
    );
    originalAssignments = setup.assignments.map((item) => item.competitor.id);

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

    const period = await createUniquePeriod(testYear);
    periodId = period.id;
    await requestJson(`/reporting-periods/${periodId}/drafts`, {
      method: 'POST'
    });

    await setAdminCookie(page);
    await page.goto(`/app/${brandCode}/reports/${periodId}/competitors`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByTestId('competitor-monitoring-workspace')).toBeVisible();
    await expect(page.getByTestId(`competitor-checklist-${competitorId}`)).toBeVisible();

    await page.getByTestId(`competitor-checklist-${competitorId}`).click();
    await page.getByTestId('follower-input').fill('1500');
    await page.getByTestId('status-has-posts-button').click();

    const addPostButton = page.getByRole('button', { name: 'Add post' });
    await addPostButton.click();
    await page.getByPlaceholder('Post URL (optional)').first().fill('https://facebook.com/example/posts/1');
    await page.getByTestId('save-now-button').click();
    await expect(page.getByTestId(`competitor-checklist-${competitorId}`)).toContainText(
      'Post URL/note requires screenshot URL.'
    );

    await page
      .getByPlaceholder('Screenshot URL (required)')
      .first()
      .fill('https://example.com/post-1.png');

    for (let index = 2; index <= 5; index += 1) {
      await addPostButton.click();
      await page
        .getByPlaceholder('Screenshot URL (required)')
        .nth(index - 1)
        .fill(`https://example.com/post-${index}.png`);
    }

    await expect(page.getByText('Posts (5/5)')).toBeVisible();
    await expect(addPostButton).toBeDisabled();

    await page.getByTestId('save-now-button').click();
    await expect(page.getByTestId(`competitor-checklist-${competitorId}`)).toContainText(
      'Complete',
      { timeout: 15_000 }
    );
    await expect(page.getByTestId(`competitor-checklist-${competitorId}`)).toContainText(
      'Saved',
      { timeout: 15_000 }
    );

    expect(await waitForCompetitorReadinessPass(periodId)).toBeTruthy();
  } finally {
    if (periodId) {
      await cleanupRequest(`/reporting-periods/${periodId}`, { method: 'DELETE' });
    }

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
