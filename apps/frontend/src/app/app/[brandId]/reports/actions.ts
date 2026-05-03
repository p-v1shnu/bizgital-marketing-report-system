'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { isRedirectError } from 'next/dist/client/components/redirect-error';

import { getAuthContext, getMembershipReportAccess } from '@/lib/auth';
import {
  backendFetch,
  getCompetitorOverview,
  getBackendApiBaseUrl,
  getQuestionOverview,
  getTopContentOverview,
  prepareReportingYearSetup,
  postReportingAction,
  saveCompetitorMonitoring,
  saveQuestionEntry,
  saveTopContentCard
} from '@/lib/reporting-api';

function redirectToImport(
  brandId: string,
  periodId: string,
  params: Record<string, string>
) {
  const searchParams = new URLSearchParams(params);
  redirect(`/app/${brandId}/reports/${periodId}/import?${searchParams.toString()}`);
}

function redirectToReports(
  brandId: string,
  year: string,
  params: Record<string, string>
) {
  const searchParams = new URLSearchParams({ year, ...params });
  redirect(`/app/${brandId}/reports?${searchParams.toString()}`);
}

function redirectToReview(
  brandId: string,
  periodId: string,
  params: Record<string, string>
) {
  const searchParams = new URLSearchParams(params);
  redirect(`/app/${brandId}/reports/${periodId}/review?${searchParams.toString()}`);
}

type ActionRedirectTarget = 'reports' | 'import' | 'review';

function resolveActionRedirectTarget(raw: string): ActionRedirectTarget {
  if (raw === 'import' || raw === 'review') {
    return raw;
  }

  return 'reports';
}

function redirectAfterPeriodAction(options: {
  brandId: string;
  year: string;
  periodId: string;
  target: ActionRedirectTarget;
  params: Record<string, string>;
}) {
  const { brandId, year, periodId, target, params } = options;

  if (!periodId || target === 'reports') {
    redirectToReports(brandId, year, params);
  }

  if (target === 'review') {
    redirectToReview(brandId, periodId, params);
  }

  redirectToImport(brandId, periodId, params);
}

function revalidateBrandRealtimeSurfaces(brandId: string, periodId?: string) {
  revalidatePath(`/app/${brandId}/reports`);
  revalidatePath(`/app/brands/${brandId}`);
  revalidatePath(`/app/${brandId}/dashboard`);

  if (periodId) {
    revalidatePath(`/app/${brandId}/reports/${periodId}`);
    revalidatePath(`/app/${brandId}/reports/${periodId}/import`);
    revalidatePath(`/app/${brandId}/reports/${periodId}/metrics`);
    revalidatePath(`/app/${brandId}/reports/${periodId}/top-content`);
    revalidatePath(`/app/${brandId}/reports/${periodId}/review`);
  }
}

async function getActionActorPayload() {
  const auth = await getAuthContext();
  return {
    actorName: auth.user?.displayName ?? null,
    actorEmail: auth.user?.email ?? null
  };
}

async function assertReportCapability(
  brandId: string,
  capability: 'create' | 'approve'
) {
  const auth = await getAuthContext();
  const membership =
    auth.user?.memberships.find(item => item.brandCode === brandId) ?? null;
  const access = getMembershipReportAccess(membership);

  if (capability === 'create' && !access.canCreateReports) {
    throw new Error('Permission denied: this account cannot create/edit reports for this brand.');
  }

  if (capability === 'approve' && !access.canApproveReports) {
    throw new Error('Permission denied: this account cannot approve reports for this brand.');
  }
}

async function resyncAutosaveSections(brandId: string, periodId: string) {
  const [competitorOverview, questionOverview, topContentOverview] = await Promise.all([
    getCompetitorOverview(brandId, periodId),
    getQuestionOverview(brandId, periodId),
    getTopContentOverview(brandId, periodId)
  ]);

  await Promise.all(
    competitorOverview.items.map(item =>
      saveCompetitorMonitoring(brandId, periodId, item.competitor.id, {
        status: item.monitoring.status ?? null,
        followerCount: item.monitoring.followerCount,
        monthlyPostCount: item.monitoring.monthlyPostCount,
        highlightNote: item.monitoring.highlightNote,
        noActivityEvidenceImageUrl: item.monitoring.noActivityEvidenceImageUrl,
        posts: item.monitoring.posts
          .slice()
          .sort((left, right) => left.displayOrder - right.displayOrder)
          .map((post, index) => ({
            displayOrder: index + 1,
            screenshotUrl: post.screenshotUrl,
            postUrl: post.postUrl
          }))
      })
    )
  );

  await Promise.all(
    questionOverview.items.map(item =>
      saveQuestionEntry(brandId, periodId, item.activation.id, {
        mode: item.entry.mode,
        questionCount: item.entry.questionCount,
        note: item.entry.note,
        screenshots: item.entry.screenshots
          .slice()
          .sort((left, right) => left.displayOrder - right.displayOrder)
          .map(screenshot => screenshot.screenshotUrl)
      })
    )
  );

  await Promise.all(
    topContentOverview.cards.map(card =>
      saveTopContentCard(brandId, periodId, card.id, {
        screenshotUrl: card.screenshotUrl
      })
    )
  );
}

async function tryRefreshDerivedSnapshots(brandId: string, periodId: string) {
  try {
    await postReportingAction(`/brands/${brandId}/reporting-periods/${periodId}/metrics/regenerate`);
  } catch {
    return false;
  }

  try {
    await postReportingAction(`/brands/${brandId}/reporting-periods/${periodId}/top-content/regenerate`);
  } catch {
    // Top content can stay manual if metric regen succeeded but ranking data is not ready yet.
  }

  return true;
}

function toCreateOrResumeDraftErrorMessage(raw: string) {
  const normalized = raw.toLowerCase();

  if (normalized.includes('still submitted and waiting for a decision')) {
    return 'Submitted - awaiting decision. Editing is locked until reviewer decision.';
  }

  if (
    normalized.includes('create a new draft from an approved or rejected version') ||
    normalized.includes('use the revise flow')
  ) {
    return 'This month is locked. Use Create revision to continue editing.';
  }

  if (normalized.includes('already has an active draft')) {
    return 'An active draft already exists for this month. Open the report and continue editing.';
  }

  return raw || 'Failed to prepare draft.';
}

export async function createPeriodAction(formData: FormData) {
  const brandId = String(formData.get('brandId') ?? '');
  const year = String(formData.get('year') ?? '');
  const month = Number(formData.get('month') ?? '');
  const replaceDeletedRaw = String(formData.get('replaceDeleted') ?? 'false');
  const replaceDeleted = replaceDeletedRaw === 'true' || replaceDeletedRaw === '1';

  try {
    await assertReportCapability(brandId, 'create');
    const actor = await getActionActorPayload();
    const period = (await postReportingAction(`/brands/${brandId}/reporting-periods`, {
      year: Number(year),
      month,
      replaceDeleted,
      ...actor
    })) as { id: string };
    await postReportingAction(`/reporting-periods/${period.id}/drafts`, actor);
    revalidateBrandRealtimeSurfaces(brandId, period.id);
    redirectToImport(brandId, period.id, {
      message: `Started ${month.toString().padStart(2, '0')}/${year}. Upload the first source file to continue.`
    });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    redirectToReports(brandId, year, {
      error: error instanceof Error ? error.message : 'Failed to create period.'
    });
  }
}

export async function prepareYearSetupAction(formData: FormData) {
  const brandId = String(formData.get('brandId') ?? '');
  const targetYear = Number(formData.get('targetYear') ?? '');
  const sourceYearValue = String(formData.get('sourceYear') ?? '').trim();
  const parsedSourceYear = sourceYearValue ? Number(sourceYearValue) : NaN;
  const sourceYear = Number.isFinite(parsedSourceYear) ? parsedSourceYear : undefined;
  const redirectYear = Number.isFinite(targetYear) ? String(targetYear) : String(new Date().getUTCFullYear());

  try {
    await assertReportCapability(brandId, 'create');
    const result = await prepareReportingYearSetup({
      brandId,
      targetYear,
      sourceYear
    });
    revalidateBrandRealtimeSurfaces(brandId);

    if (result.setup.canCreateReport) {
      redirectToReports(brandId, redirectYear, {
        message: `Year setup for ${result.targetYear} is ready. You can create reports now.`
      });
    }

    const blockedSummary = result.setup.checks
      .filter((check) => check.required && !check.passed)
      .map((check) => check.label)
      .join(', ');
    redirectToReports(brandId, redirectYear, {
      error: blockedSummary
        ? `Year setup for ${result.targetYear} is still incomplete: ${blockedSummary}.`
        : result.setup.summary
    });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    redirectToReports(brandId, redirectYear, {
      error: error instanceof Error ? error.message : 'Failed to prepare year setup.'
    });
  }
}

export async function createOrResumeDraftAction(formData: FormData) {
  const brandId = String(formData.get('brandId') ?? '');
  const periodId = String(formData.get('periodId') ?? '');

  try {
    await assertReportCapability(brandId, 'create');
    const actor = await getActionActorPayload();
    await postReportingAction(`/reporting-periods/${periodId}/drafts`, actor);
    revalidateBrandRealtimeSurfaces(brandId, periodId);
    redirectToImport(brandId, periodId, {
      message: 'Draft is ready. Upload the source file to continue.'
    });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    const rawMessage = error instanceof Error ? error.message : 'Failed to prepare draft.';
    redirectToImport(brandId, periodId, {
      error: toCreateOrResumeDraftErrorMessage(rawMessage)
    });
  }
}

export async function submitVersionAction(formData: FormData) {
  const brandId = String(formData.get('brandId') ?? '');
  const periodId = String(formData.get('periodId') ?? '');
  const year = String(formData.get('year') ?? '');
  const versionId = String(formData.get('versionId') ?? '');

  try {
    await assertReportCapability(brandId, 'create');
    const actor = await getActionActorPayload();
    if (periodId) {
      await resyncAutosaveSections(brandId, periodId);
    }

    await postReportingAction(`/report-versions/${versionId}/submit`, actor);
    revalidateBrandRealtimeSurfaces(brandId, periodId);
    redirectToReports(brandId, year, {
      message: 'Draft submitted for approval.'
    });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    redirectToReports(brandId, year, {
      error: error instanceof Error ? error.message : 'Failed to submit version.'
    });
  }
}

export async function approveVersionAction(formData: FormData) {
  const brandId = String(formData.get('brandId') ?? '');
  const year = String(formData.get('year') ?? '');
  const versionId = String(formData.get('versionId') ?? '');

  try {
    await assertReportCapability(brandId, 'approve');
    const actor = await getActionActorPayload();
    await postReportingAction(`/report-versions/${versionId}/approve`, actor);
    revalidateBrandRealtimeSurfaces(brandId);
    redirectToReports(brandId, year, {
      message: 'Version approved and published as current approved.'
    });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    redirectToReports(brandId, year, {
      error: error instanceof Error ? error.message : 'Failed to approve version.'
    });
  }
}

export async function reviseVersionAction(formData: FormData) {
  const brandId = String(formData.get('brandId') ?? '');
  const year = String(formData.get('year') ?? '');
  const periodId = String(formData.get('periodId') ?? '');
  const versionId = String(formData.get('versionId') ?? '');
  const reason = String(formData.get('reason') ?? '').trim();

  if (!reason) {
    redirectToReports(brandId, year, {
      error: 'Please enter at least 1 character for revision reason.'
    });
  }

  try {
    await assertReportCapability(brandId, 'create');
    const actor = await getActionActorPayload();
    await postReportingAction(`/report-versions/${versionId}/revise`, {
      reason,
      ...actor
    });
    const autoRefreshCompleted =
      periodId ? await tryRefreshDerivedSnapshots(brandId, periodId) : false;
    revalidateBrandRealtimeSurfaces(brandId, periodId);
    redirectToReports(brandId, year, {
      message: autoRefreshCompleted
        ? 'New draft revision created. KPI snapshot was refreshed automatically.'
        : 'New draft revision created.'
    });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    redirectToReports(brandId, year, {
      error: error instanceof Error ? error.message : 'Failed to create revision.'
    });
  }
}

export async function reopenForEditingAction(formData: FormData) {
  const brandId = String(formData.get('brandId') ?? '');
  const year = String(formData.get('year') ?? '');
  const periodId = String(formData.get('periodId') ?? '');
  const versionId = String(formData.get('versionId') ?? '');
  const reason = String(formData.get('reason') ?? '').trim();
  const redirectTarget = resolveActionRedirectTarget(
    String(formData.get('redirectTo') ?? 'reports')
  );

  if (!reason) {
    redirectAfterPeriodAction({
      brandId,
      year,
      periodId,
      target: redirectTarget,
      params: {
        error: 'Please enter at least 1 character for the request note.'
      }
    });
    return;
  }

  try {
    await assertReportCapability(brandId, 'create');
    const actor = await getActionActorPayload();
    await postReportingAction(`/report-versions/${versionId}/reopen`, {
      reason,
      ...actor
    });
    const autoRefreshCompleted =
      periodId ? await tryRefreshDerivedSnapshots(brandId, periodId) : false;
    revalidateBrandRealtimeSurfaces(brandId, periodId);

    redirectAfterPeriodAction({
      brandId,
      year,
      periodId,
      target: redirectTarget,
      params: {
        message: autoRefreshCompleted
          ? 'Report moved back to in-progress. Editing is now unlocked. KPI snapshot was refreshed automatically.'
          : 'Report moved back to in-progress. Editing is now unlocked.'
      }
    });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    redirectAfterPeriodAction({
      brandId,
      year,
      periodId,
      target: redirectTarget,
      params: {
        error: error instanceof Error ? error.message : 'Failed to reopen report for editing.'
      }
    });
  }
}

export async function requestChangesAction(formData: FormData) {
  const brandId = String(formData.get('brandId') ?? '');
  const year = String(formData.get('year') ?? '');
  const periodId = String(formData.get('periodId') ?? '');
  const versionId = String(formData.get('versionId') ?? '');
  const reason = String(formData.get('reason') ?? '').trim();
  const redirectTarget = resolveActionRedirectTarget(
    String(formData.get('redirectTo') ?? 'reports')
  );

  if (!reason) {
    redirectAfterPeriodAction({
      brandId,
      year,
      periodId,
      target: redirectTarget,
      params: {
        error: 'Please enter at least 1 character for the request note.'
      }
    });
  }

  try {
    await assertReportCapability(brandId, 'approve');
    const actor = await getActionActorPayload();
    await postReportingAction(`/report-versions/${versionId}/reopen`, {
      reason,
      ...actor
    });
    const autoRefreshCompleted =
      periodId ? await tryRefreshDerivedSnapshots(brandId, periodId) : false;
    revalidateBrandRealtimeSurfaces(brandId, periodId);

    redirectAfterPeriodAction({
      brandId,
      year,
      periodId,
      target: redirectTarget,
      params: {
        message: autoRefreshCompleted
          ? 'Changes requested. Report is reopened for users with create/edit permission and KPI snapshot was refreshed automatically.'
          : 'Changes requested. Report is reopened for users with create/edit permission.'
      }
    });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    redirectAfterPeriodAction({
      brandId,
      year,
      periodId,
      target: redirectTarget,
      params: {
        error: error instanceof Error ? error.message : 'Failed to request changes.'
      }
    });
  }
}

export async function deleteReportingPeriodAction(formData: FormData) {
  const brandId = String(formData.get('brandId') ?? '');
  const year = String(formData.get('year') ?? '');
  const periodId = String(formData.get('periodId') ?? '');

  try {
    await assertReportCapability(brandId, 'create');
    const actor = await getActionActorPayload();
    const response = await backendFetch(
      `${getBackendApiBaseUrl()}/reporting-periods/${periodId}`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(actor),
        cache: 'no-store'
      }
    );

    if (!response.ok) {
      let message = 'Failed to move report to recycle bin.';

      try {
        const payload = (await response.json()) as { message?: string | string[] };
        if (Array.isArray(payload.message)) {
          message = payload.message.join(', ');
        } else if (payload.message) {
          message = payload.message;
        }
      } catch {
        message = response.statusText || message;
      }

      throw new Error(message);
    }

    revalidateBrandRealtimeSurfaces(brandId);
    redirectToReports(brandId, year, {
      message: 'Report moved to Recycle Bin. It will be permanently deleted in 7 days.'
    });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    redirectToReports(brandId, year, {
      error:
        error instanceof Error
          ? error.message
          : 'Failed to move report to recycle bin.'
    });
  }
}

export async function restoreReportingPeriodAction(formData: FormData) {
  const brandId = String(formData.get('brandId') ?? '');
  const year = String(formData.get('year') ?? '');
  const periodId = String(formData.get('periodId') ?? '');

  try {
    await assertReportCapability(brandId, 'create');
    const actor = await getActionActorPayload();
    const response = await backendFetch(
      `${getBackendApiBaseUrl()}/reporting-periods/${periodId}/restore`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(actor),
        cache: 'no-store'
      }
    );

    if (!response.ok) {
      let message = 'Failed to restore report.';

      try {
        const payload = (await response.json()) as { message?: string | string[] };
        if (Array.isArray(payload.message)) {
          message = payload.message.join(', ');
        } else if (payload.message) {
          message = payload.message;
        }
      } catch {
        message = response.statusText || message;
      }

      throw new Error(message);
    }

    revalidateBrandRealtimeSurfaces(brandId, periodId);
    redirectToReports(brandId, year, {
      message: 'Report restored from Recycle Bin.'
    });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    redirectToReports(brandId, year, {
      error: error instanceof Error ? error.message : 'Failed to restore report.'
    });
  }
}
