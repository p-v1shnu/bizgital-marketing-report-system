import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { config as loadEnv } from 'dotenv';

for (const candidate of [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '../../.env')
]) {
  if (existsSync(candidate)) {
    loadEnv({ path: candidate });
    break;
  }
}

type ParsedArgs = {
  baseUrl: string;
  brandCode: string | null;
  setupYear: number;
  keepData: boolean;
  showHelp: boolean;
};

type StepResult = {
  name: string;
  ok: boolean;
  detail: string;
};

type ApiErrorPayload = {
  message?: string | string[];
};

class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(status: number, payload: unknown, fallback: string) {
    super(parseApiMessage(payload, fallback));
    this.status = status;
    this.payload = payload;
  }
}

type BrandListItem = {
  code: string;
  name: string;
};

type CompetitorCatalogResponse = {
  items: Array<{
    id: string;
    name: string;
    primaryPlatform: string;
    status: 'active' | 'inactive';
  }>;
};

type CompetitorSetupResponse = {
  assignments: Array<{
    competitor: {
      id: string;
    };
  }>;
};

type CreatePeriodResponse = {
  id: string;
  year: number;
  month: number;
};

type ReportingListResponse = {
  yearOptions: Array<{
    year: number;
    isReady: boolean;
    hasReports: boolean;
  }>;
  suggestedNextPeriod: {
    year: number;
    month: number;
    label: string;
  } | null;
  items: Array<{
    id: string;
    year: number;
    month: number;
    latestVersionId: string | null;
    currentDraftVersionId: string | null;
  }>;
};

type DraftResponse = {
  id: string;
};

type ReportingDetailResponse = {
  period: {
    currentDraftVersionId: string | null;
    latestVersionId: string | null;
    reviewReadiness: {
      checks: Array<{
        key: string;
        passed: boolean;
        detail: string;
      }>;
    };
    workspace: {
      sections: Array<{
        slug: string;
        status: 'ready' | 'pending' | 'blocked';
        detail: string;
      }>;
    };
  };
};

type CompetitorOverviewResponse = {
  items: Array<{
    competitor: {
      id: string;
      name: string;
    };
    monitoring: {
      status: 'has_posts' | 'no_activity' | null;
      isComplete: boolean;
    };
  }>;
};

const TEST_COMPETITOR_NAME_PREFIX = 'E2E - Monitoring Flow';

function parseArgs(argv: string[]): ParsedArgs {
  const showHelp = argv.includes('--help') || argv.includes('-h');
  const keepData = argv.includes('--keep-data');

  const baseUrlArg = argv.find((value) => value.startsWith('--base-url='));
  const brandArg = argv.find((value) => value.startsWith('--brand='));
  const setupYearArg = argv.find((value) => value.startsWith('--setup-year='));

  const fallbackBaseUrl =
    process.env.E2E_API_BASE_URL ??
    process.env.INTERNAL_API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    'http://localhost:3003/api';

  let setupYear = new Date().getUTCFullYear() + 20;
  if (setupYearArg) {
    const parsed = Number(setupYearArg.split('=')[1] || 0);
    if (Number.isInteger(parsed) && parsed >= 2000 && parsed <= 3000) {
      setupYear = parsed;
    }
  }

  return {
    baseUrl: (baseUrlArg?.split('=')[1] || fallbackBaseUrl).replace(/\/$/, ''),
    brandCode: brandArg?.split('=')[1] || null,
    setupYear,
    keepData,
    showHelp
  };
}

function printHelp() {
  console.log(`
E2E competitor workflow checks (Admin setup + Monitoring + Readiness)

Usage:
  npx tsx scripts/e2e-competitor-workflow.ts [--brand=BRAND_CODE] [--setup-year=YYYY] [--base-url=URL] [--keep-data]

Examples:
  npx tsx scripts/e2e-competitor-workflow.ts --brand=ACME
  npx tsx scripts/e2e-competitor-workflow.ts --base-url=http://localhost:3003/api
  npx tsx scripts/e2e-competitor-workflow.ts --brand=ACME --setup-year=2090 --keep-data
`);
}

function parseApiMessage(payload: unknown, fallback: string) {
  if (
    payload &&
    typeof payload === 'object' &&
    'message' in payload &&
    Array.isArray((payload as ApiErrorPayload).message)
  ) {
    return ((payload as { message: string[] }).message).join(', ');
  }

  if (
    payload &&
    typeof payload === 'object' &&
    'message' in payload &&
    typeof (payload as ApiErrorPayload).message === 'string'
  ) {
    return String((payload as { message: string }).message);
  }

  return fallback;
}

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function requestJson<T>(
  baseUrl: string,
  path: string,
  options?: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    body?: unknown;
  }
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options?.method ?? 'GET',
    headers: options?.body
      ? {
          'Content-Type': 'application/json'
        }
      : undefined,
    body: options?.body ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload,
      `Request failed: ${options?.method ?? 'GET'} ${path}`
    );
  }

  return payload as T;
}

async function requestExpectStatus(
  baseUrl: string,
  path: string,
  expectedStatus: number,
  options?: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    body?: unknown;
  }
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options?.method ?? 'GET',
    headers: options?.body
      ? {
          'Content-Type': 'application/json'
        }
      : undefined,
    body: options?.body ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json().catch(() => null);

  if (response.status !== expectedStatus) {
    throw new Error(
      `Expected HTTP ${expectedStatus} for ${options?.method ?? 'GET'} ${path}, got ${response.status}: ${parseApiMessage(
        payload,
        'Unexpected response.'
      )}`
    );
  }

  return payload;
}

function findCompetitorCheck(detail: ReportingDetailResponse) {
  return (
    detail.period.reviewReadiness.checks.find(
      (item) => item.key === 'competitor_evidence_complete'
    ) ?? null
  );
}

function findCompetitorSection(detail: ReportingDetailResponse) {
  return (
    detail.period.workspace.sections.find((section) => section.slug === 'competitors') ??
    null
  );
}

function resolveReadySourceYear(reporting: ReportingListResponse, targetYear: number) {
  const readyYears = reporting.yearOptions
    .filter((option) => option.isReady && option.year !== targetYear)
    .map((option) => option.year)
    .sort((left, right) => right - left);

  return readyYears[0] ?? null;
}

async function createUniquePeriod(
  baseUrl: string,
  brandCode: string,
  year: number
) {
  const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  for (const month of months) {
    try {
      const created = await requestJson<CreatePeriodResponse>(
        baseUrl,
        `/brands/${brandCode}/reporting-periods`,
        {
          method: 'POST',
          body: {
            year,
            month
          }
        }
      );

      return created;
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        continue;
      }
      throw error;
    }
  }

  const reporting = await requestJson<ReportingListResponse>(
    baseUrl,
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
      id: reusable.id,
      year: reusable.year,
      month: reusable.month
    };
  }

  throw new Error(
    `Unable to create a unique reporting period in year ${year}, and no reusable empty period was found.`
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.showHelp) {
    printHelp();
    return;
  }

  const startedAt = Date.now();
  const steps: StepResult[] = [];
  const cleanupWarnings: string[] = [];

  let brandCode = args.brandCode;
  let competitorId: string | null = null;
  let competitorCreated = false;
  let originalCompetitorStatus: 'active' | 'inactive' | null = null;
  let periodId: string | null = null;
  let periodCreatedByTest = false;

  const requestedSetupYear = args.setupYear;
  const requestedCopyYear = requestedSetupYear + 1;
  let setupYear = requestedSetupYear;
  let copyYear = requestedCopyYear;
  const originalAssignments = new Map<number, string[]>();

  function record(name: string, ok: boolean, detail: string) {
    steps.push({ name, ok, detail });
  }

  try {
    await requestJson(args.baseUrl, '/health');
    record('Health check', true, `Connected to ${args.baseUrl}`);

    if (!brandCode) {
      const brands = await requestJson<BrandListItem[]>(args.baseUrl, '/brands');
      assertCondition(brands.length > 0, 'No brands found in this environment.');
      brandCode = brands[0].code;
      record('Resolve brand', true, `Using first brand: ${brandCode}`);
    } else {
      record('Resolve brand', true, `Using provided brand: ${brandCode}`);
    }

    assertCondition(brandCode, 'Brand code is required.');

    const setupYearContext = await requestJson<ReportingListResponse>(
      args.baseUrl,
      `/brands/${brandCode}/reporting-periods?year=${requestedSetupYear}`
    );
    const requestedYearIsReady =
      setupYearContext.yearOptions.find((option) => option.year === requestedSetupYear)
        ?.isReady ?? false;
    const sourceYearForRequestedSetup = resolveReadySourceYear(
      setupYearContext,
      requestedSetupYear
    );

    if (!requestedYearIsReady && sourceYearForRequestedSetup === null) {
      const suggestedYear = setupYearContext.suggestedNextPeriod?.year ?? null;
      const fallbackReadyYear =
        setupYearContext.yearOptions
          .filter((option) => option.isReady)
          .map((option) => option.year)
          .sort((left, right) => right - left)[0] ?? null;
      const fallbackYear = suggestedYear ?? fallbackReadyYear;

      if (
        fallbackYear !== null &&
        Number.isInteger(fallbackYear) &&
        fallbackYear >= 2000 &&
        fallbackYear <= 3000 &&
        fallbackYear !== requestedSetupYear
      ) {
        setupYear = fallbackYear;
        copyYear = fallbackYear + 1;
        record(
          'Resolve setup year',
          true,
          `Requested ${requestedSetupYear} is not ready; using fallback year ${setupYear}.`
        );
      } else {
        record('Resolve setup year', true, `Using requested year ${setupYear}.`);
      }
    } else {
      record('Resolve setup year', true, `Using requested year ${setupYear}.`);
    }

    const competitorName = `${TEST_COMPETITOR_NAME_PREFIX} (${brandCode})`;
    const catalog = await requestJson<CompetitorCatalogResponse>(
      args.baseUrl,
      `/brands/${brandCode}/competitor-setup/catalog`
    );
    const existing = catalog.items.find((item) => item.name === competitorName) ?? null;

    if (existing) {
      competitorId = existing.id;
      originalCompetitorStatus = existing.status;
      await requestJson(
        args.baseUrl,
        `/brands/${brandCode}/competitor-setup/catalog/${competitorId}`,
        {
          method: 'PATCH',
          body: {
            status: 'active',
            primaryPlatform: existing.primaryPlatform || 'Facebook'
          }
        }
      );
      record('Catalog create/edit', true, `Reused existing competitor ${competitorId}`);
    } else {
      const created = await requestJson<{ id: string }>(
        args.baseUrl,
        `/brands/${brandCode}/competitor-setup/catalog`,
        {
          method: 'POST',
          body: {
            name: competitorName,
            primaryPlatform: 'Facebook',
            status: 'active',
            websiteUrl: 'https://example.com',
            facebookUrl: 'https://facebook.com/example'
          }
        }
      );
      competitorId = created.id;
      competitorCreated = true;
      originalCompetitorStatus = 'inactive';
      record('Catalog create/edit', true, `Created competitor ${competitorId}`);
    }

    assertCondition(competitorId, 'Failed to resolve competitor ID.');

    for (const year of [setupYear, copyYear]) {
      const setup = await requestJson<CompetitorSetupResponse>(
        args.baseUrl,
        `/brands/${brandCode}/competitor-setup/${year}`
      );
      originalAssignments.set(
        year,
        setup.assignments.map((item) => item.competitor.id)
      );
    }

    await requestJson(
      args.baseUrl,
      `/brands/${brandCode}/competitor-setup/${setupYear}/assignments`,
      {
        method: 'POST',
        body: {
          competitorIds: [competitorId]
        }
      }
    );

    const assignedSetup = await requestJson<CompetitorSetupResponse>(
      args.baseUrl,
      `/brands/${brandCode}/competitor-setup/${setupYear}`
    );
    assertCondition(
      assignedSetup.assignments.length === 1 &&
        assignedSetup.assignments[0].competitor.id === competitorId,
      'Setup year assignment verification failed.'
    );
    record(
      'Year assignment',
      true,
      `Assigned 1 competitor for ${setupYear}`
    );

    await requestJson(
      args.baseUrl,
      `/brands/${brandCode}/competitor-setup/${copyYear}/copy-from/${setupYear}`,
      {
        method: 'POST'
      }
    );

    const copiedSetup = await requestJson<CompetitorSetupResponse>(
      args.baseUrl,
      `/brands/${brandCode}/competitor-setup/${copyYear}`
    );
    assertCondition(
      copiedSetup.assignments.some((item) => item.competitor.id === competitorId),
      'Copy-year verification failed.'
    );
    record('Copy year', true, `Copied assignments ${setupYear} -> ${copyYear}`);

    const reportingForSetupYear = await requestJson<ReportingListResponse>(
      args.baseUrl,
      `/brands/${brandCode}/reporting-periods?year=${setupYear}`
    );
    const sourceYearForSetup = resolveReadySourceYear(reportingForSetupYear, setupYear);
    const setupYearIsReady =
      reportingForSetupYear.yearOptions.find((option) => option.year === setupYear)
        ?.isReady ?? false;

    if (sourceYearForSetup !== null) {
      await requestJson(
        args.baseUrl,
        `/brands/${brandCode}/reporting-periods/year-setup/prepare`,
        {
          method: 'POST',
          body: {
            targetYear: setupYear,
            sourceYear: sourceYearForSetup
          }
        }
      );
      record(
        'Prepare year setup',
        true,
        `Prepared ${setupYear} from ${sourceYearForSetup}`
      );
    } else {
      if (setupYearIsReady) {
        record(
          'Prepare year setup',
          true,
          `Skipped: year ${setupYear} is already ready.`
        );
      } else {
        record(
          'Prepare year setup',
          true,
          `Skipped: no ready source year available for ${setupYear}`
        );
      }
    }

    const existingPeriods = await requestJson<ReportingListResponse>(
      args.baseUrl,
      `/brands/${brandCode}/reporting-periods?year=${setupYear}`
    );
    const existingPeriodIds = new Set(existingPeriods.items.map((item) => item.id));

    const createdPeriod = await createUniquePeriod(args.baseUrl, brandCode, setupYear);
    periodId = createdPeriod.id;
    periodCreatedByTest = !existingPeriodIds.has(createdPeriod.id);
    record(
      'Create period',
      true,
      `${periodCreatedByTest ? 'Created' : 'Reused'} period ${createdPeriod.year}-${String(createdPeriod.month).padStart(2, '0')} (${periodId})`
    );

    let draftId: string | null = null;
    try {
      const draft = await requestJson<DraftResponse>(
        args.baseUrl,
        `/reporting-periods/${periodId}/drafts`,
        {
          method: 'POST'
        }
      );
      draftId = draft.id;
      record('Create draft', true, `Draft id: ${draft.id}`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        const detail = await requestJson<ReportingDetailResponse>(
          args.baseUrl,
          `/brands/${brandCode}/reporting-periods/${periodId}`
        );
        draftId = detail.period.currentDraftVersionId;
        assertCondition(draftId, 'Expected an existing draft version after HTTP 409.');
        record('Create draft', true, `Reused existing draft id: ${draftId}`);
      } else {
        throw error;
      }
    }

    const overviewBefore = await requestJson<CompetitorOverviewResponse>(
      args.baseUrl,
      `/brands/${brandCode}/reporting-periods/${periodId}/competitors`
    );
    assertCondition(
      overviewBefore.items.some((item) => item.competitor.id === competitorId),
      'Assigned competitor is missing from monthly competitor overview.'
    );
    record('Monitoring scope', true, 'Assigned competitor appears in monthly overview');

    await requestJson(
      args.baseUrl,
      `/brands/${brandCode}/reporting-periods/${periodId}/competitors/${competitorId}/monitoring`,
      {
        method: 'POST',
        body: {
          followerCount: 1200
        }
      }
    );

    const detailAfterIncomplete = await requestJson<ReportingDetailResponse>(
      args.baseUrl,
      `/brands/${brandCode}/reporting-periods/${periodId}`
    );
    const incompleteCheck = findCompetitorCheck(detailAfterIncomplete);
    const incompleteSection = findCompetitorSection(detailAfterIncomplete);
    assertCondition(
      incompleteCheck && !incompleteCheck.passed,
      'Competitor readiness check should fail when status/evidence is incomplete.'
    );
    assertCondition(
      incompleteSection && incompleteSection.status !== 'ready',
      'Competitor section should not be ready on incomplete monitoring.'
    );
    record('Readiness blocked (incomplete)', true, incompleteCheck.detail);

    await requestExpectStatus(
      args.baseUrl,
      `/brands/${brandCode}/reporting-periods/${periodId}/competitors/${competitorId}/monitoring`,
      400,
      {
        method: 'POST',
        body: {
          status: 'has_posts',
          followerCount: 1200,
          monthlyPostCount: 10,
          highlightNote: 'Monthly highlight summary for monitored posts.',
          posts: Array.from({ length: 6 }, (_, index) => ({
            displayOrder: index + 1,
            screenshotUrl: `https://example.com/post-${index + 1}.png`
          }))
        }
      }
    );
    record('Validation: max 5 posts', true, 'HTTP 400 returned for 6 posts');

    await requestExpectStatus(
      args.baseUrl,
      `/brands/${brandCode}/reporting-periods/${periodId}/competitors/${competitorId}/monitoring`,
      400,
      {
        method: 'POST',
        body: {
          status: 'has_posts',
          followerCount: 1200,
          monthlyPostCount: 2,
          highlightNote: 'Monthly highlight summary for monitored posts.',
          posts: []
        }
      }
    );
    record(
      'Validation: at least 1 highlight screenshot',
      true,
      'HTTP 400 returned when has_posts mode is saved without any highlighted post screenshot'
    );

    await requestExpectStatus(
      args.baseUrl,
      `/brands/${brandCode}/reporting-periods/${periodId}/competitors/${competitorId}/monitoring`,
      400,
      {
        method: 'POST',
        body: {
          status: 'has_posts',
          followerCount: 1200,
          monthlyPostCount: 1,
          highlightNote: 'Monthly highlight summary for monitored posts.',
          posts: [
            {
              displayOrder: 1,
              screenshotUrl: 'https://example.com/post-1.png'
            },
            {
              displayOrder: 2,
              screenshotUrl: 'https://example.com/post-2.png'
            }
          ]
        }
      }
    );
    record(
      'Validation: monthly post count >= highlights',
      true,
      'HTTP 400 returned when monthly post count is lower than highlighted post screenshots'
    );

    await requestJson(
      args.baseUrl,
      `/brands/${brandCode}/reporting-periods/${periodId}/competitors/${competitorId}/monitoring`,
      {
        method: 'POST',
        body: {
          status: 'no_activity',
          highlightNote: 'No posts detected this month.',
          noActivityEvidenceImageUrl: 'https://example.com/no-activity-evidence.png'
        }
      }
    );

    const detailAfterMissingFollower = await requestJson<ReportingDetailResponse>(
      args.baseUrl,
      `/brands/${brandCode}/reporting-periods/${periodId}`
    );
    const missingFollowerCheck = findCompetitorCheck(detailAfterMissingFollower);
    assertCondition(
      missingFollowerCheck && !missingFollowerCheck.passed,
      'Competitor readiness should fail when follower count is missing.'
    );
    record('Validation: follower required', true, missingFollowerCheck.detail);

    await requestJson(
      args.baseUrl,
      `/brands/${brandCode}/reporting-periods/${periodId}/competitors/${competitorId}/monitoring`,
      {
        method: 'POST',
        body: {
          status: 'no_activity',
          followerCount: 1200,
          highlightNote: 'No posts found after checking all channels this month.'
        }
      }
    );

    const detailAfterMissingNoActivityEvidence = await requestJson<ReportingDetailResponse>(
      args.baseUrl,
      `/brands/${brandCode}/reporting-periods/${periodId}`
    );
    const missingNoActivityEvidenceCheck = findCompetitorCheck(
      detailAfterMissingNoActivityEvidence
    );
    assertCondition(
      missingNoActivityEvidenceCheck && !missingNoActivityEvidenceCheck.passed,
      'Competitor readiness should fail when no_activity evidence screenshot is missing.'
    );
    record(
      'Validation: no_activity evidence required',
      true,
      missingNoActivityEvidenceCheck.detail
    );

    await requestJson(
      args.baseUrl,
      `/brands/${brandCode}/reporting-periods/${periodId}/competitors/${competitorId}/monitoring`,
      {
        method: 'POST',
        body: {
          status: 'no_activity',
          followerCount: 1200,
          highlightNote: 'No posts found after checking all channels this month.',
          noActivityEvidenceImageUrl: 'https://example.com/no-activity-evidence.png'
        }
      }
    );

    const detailAfterNoActivity = await requestJson<ReportingDetailResponse>(
      args.baseUrl,
      `/brands/${brandCode}/reporting-periods/${periodId}`
    );
    const noActivityCheck = findCompetitorCheck(detailAfterNoActivity);
    assertCondition(
      noActivityCheck && noActivityCheck.passed,
      'Competitor readiness should pass after complete no_activity payload.'
    );
    record('Readiness pass: no_activity', true, noActivityCheck.detail);

    await requestJson(
      args.baseUrl,
      `/brands/${brandCode}/reporting-periods/${periodId}/competitors/${competitorId}/monitoring`,
      {
        method: 'POST',
        body: {
          status: 'has_posts',
          followerCount: 1800,
          monthlyPostCount: 3,
          highlightNote: 'Monthly highlight summary for monitored posts.',
          posts: [
            {
              displayOrder: 1,
              screenshotUrl: 'https://example.com/post-1.png',
              postUrl: 'https://facebook.com/example/posts/1',
              note: 'Top engagement post'
            }
          ]
        }
      }
    );

    const overviewAfterPosts = await requestJson<CompetitorOverviewResponse>(
      args.baseUrl,
      `/brands/${brandCode}/reporting-periods/${periodId}/competitors`
    );
    const monitoredItem =
      overviewAfterPosts.items.find((item) => item.competitor.id === competitorId) ??
      null;
    assertCondition(monitoredItem, 'Monitored competitor missing after has_posts save.');
    assertCondition(
      monitoredItem.monitoring.status === 'has_posts' &&
        monitoredItem.monitoring.isComplete,
      'has_posts payload should mark monitoring complete.'
    );
    record('Readiness pass: has_posts', true, 'Monitoring complete in has_posts mode');
  } catch (error) {
    record(
      'Execution',
      false,
      error instanceof Error ? error.message : 'Unknown E2E failure.'
    );
  } finally {
    if (!args.keepData && brandCode) {
      if (periodId && periodCreatedByTest) {
        try {
          await requestJson(args.baseUrl, `/reporting-periods/${periodId}`, {
            method: 'DELETE'
          });
        } catch (error) {
          cleanupWarnings.push(
            `Failed to delete test period ${periodId}: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`
          );
        }
      }

      for (const [year, competitorIds] of originalAssignments.entries()) {
        try {
          await requestJson(
            args.baseUrl,
            `/brands/${brandCode}/competitor-setup/${year}/assignments`,
            {
              method: 'POST',
              body: {
                competitorIds
              }
            }
          );
        } catch (error) {
          cleanupWarnings.push(
            `Failed to restore assignments for year ${year}: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`
          );
        }
      }

      if (competitorId && originalCompetitorStatus) {
        try {
          await requestJson(
            args.baseUrl,
            `/brands/${brandCode}/competitor-setup/catalog/${competitorId}`,
            {
              method: 'PATCH',
              body: {
                status: competitorCreated ? 'inactive' : originalCompetitorStatus
              }
            }
          );
        } catch (error) {
          cleanupWarnings.push(
            `Failed to restore competitor status ${competitorId}: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`
          );
        }
      }
    }

    const elapsedMs = Date.now() - startedAt;
    const passedCount = steps.filter((step) => step.ok).length;
    const failedCount = steps.length - passedCount;
    const overallOk = failedCount === 0;

    console.log(
      JSON.stringify(
        {
          baseUrl: args.baseUrl,
          brandCode,
          requestedSetupYear,
          requestedCopyYear,
          setupYear,
          copyYear,
          keepData: args.keepData,
          elapsedMs,
          overallOk,
          passedCount,
          failedCount,
          steps,
          cleanupWarnings
        },
        null,
        2
      )
    );

    if (!overallOk) {
      process.exitCode = 1;
    }
  }
}

void main();
