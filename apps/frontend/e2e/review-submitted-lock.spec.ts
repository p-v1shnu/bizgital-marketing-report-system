import { expect, test, type Page } from '@playwright/test';

type ReportingListResponse = {
  items: Array<{
    id: string;
    year: number;
    label: string;
    latestVersionState: string | null;
  }>;
};

const frontendBaseUrl =
  process.env.E2E_FRONTEND_BASE_URL ?? 'http://localhost:3200';
const backendBaseUrl =
  process.env.E2E_BACKEND_BASE_URL ?? 'http://localhost:3003/api';
const brandCode = process.env.E2E_BRAND_CODE ?? 'demo-brand';
const adminEmail = process.env.E2E_ADMIN_EMAIL ?? 'admin@demo-brand.local';

async function requestJson<T>(path: string): Promise<T> {
  const response = await fetch(`${backendBaseUrl}${path}`, {
    method: 'GET',
    signal: AbortSignal.timeout(15_000)
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload &&
      typeof payload === 'object' &&
      'message' in payload &&
      typeof (payload as { message?: unknown }).message === 'string'
        ? (payload as { message: string }).message
        : `Request failed: GET ${path}`;

    throw new Error(message);
  }

  return payload as T;
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

async function findSubmittedPeriod() {
  const currentYear = new Date().getUTCFullYear();
  const candidateYears = Array.from({ length: 7 }, (_, index) => currentYear - 3 + index);

  for (const year of candidateYears) {
    const reportList = await requestJson<ReportingListResponse>(
      `/brands/${brandCode}/reporting-periods?year=${year}`
    );
    const submitted = reportList.items.find(
      (item) => item.latestVersionState === 'submitted'
    );

    if (submitted) {
      return submitted;
    }
  }

  return null;
}

test('submitted month is locked on import and reports status is not duplicated', async ({
  page
}) => {
  const submitted = await findSubmittedPeriod();

  test.skip(!submitted, 'No submitted period exists for this brand/year.');

  await setAdminCookie(page);

  await page.goto(`/app/${brandCode}/reports/${submitted!.id}/import`);
  await page.waitForLoadState('networkidle');

  await expect(
    page.getByText('Submitted - awaiting decision').first()
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Create or resume draft' })
  ).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Open review' })).toBeVisible();

  await page.goto(`/app/${brandCode}/reports?year=${submitted!.year}`);
  await page.waitForLoadState('networkidle');

  const row = page.locator('tr', { hasText: submitted!.label });
  await expect(row).toBeVisible();
  await expect(
    row.getByText('Submitted - awaiting decision', { exact: true })
  ).toHaveCount(1);
  await expect(row.getByText('Read-only (locked)', { exact: true })).toHaveCount(1);
});
