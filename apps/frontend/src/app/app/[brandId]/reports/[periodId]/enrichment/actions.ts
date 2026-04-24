'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { backendFetch, getBackendApiBaseUrl } from '@/lib/reporting-api';

function redirectToEnrichment(
  brandId: string,
  periodId: string,
  params: Record<string, string>
) {
  const searchParams = new URLSearchParams(params);
  redirect(`/app/${brandId}/reports/${periodId}/import?${searchParams.toString()}`);
}

function redirectToImport(
  brandId: string,
  periodId: string,
  params: Record<string, string>
) {
  const searchParams = new URLSearchParams(params);
  redirect(`/app/${brandId}/reports/${periodId}/import?${searchParams.toString()}`);
}

export async function saveEnrichmentAction(formData: FormData) {
  const brandId = String(formData.get('brandId') ?? '');
  const periodId = String(formData.get('periodId') ?? '');
  const returnTo = String(formData.get('returnTo') ?? 'enrichment');
  const rows = new Map<number, Record<string, string | null>>();
  const manualHeader = {
    viewers: String(formData.get('manual__header__viewers') ?? '').trim() || null,
    pageFollowers:
      String(formData.get('manual__header__followers') ?? '').trim() || null,
    pageVisit: String(formData.get('manual__header__page_visit') ?? '').trim() || null
  };
  const hasManualHeader =
    !!manualHeader.viewers || !!manualHeader.pageFollowers || !!manualHeader.pageVisit;
  const redirectToPage =
    returnTo === 'import' ? redirectToImport : redirectToEnrichment;

  for (const [key, rawValue] of formData.entries()) {
    if (!key.startsWith('cell__')) {
      continue;
    }

    const [, rawRowNumber, targetField] = key.split('__');
    const rowNumber = Number(rawRowNumber);

    if (!Number.isInteger(rowNumber) || rowNumber < 1 || !targetField) {
      continue;
    }

    const rowValues = rows.get(rowNumber) ?? {};
    rowValues[targetField] = String(rawValue ?? '').trim() || null;
    rows.set(rowNumber, rowValues);
  }

  if (rows.size === 0 && !hasManualHeader) {
    redirectToPage(brandId, periodId, {
      error: 'There are no editable dataset values to save on this page.'
    });
  }

  const response = await backendFetch(
    `${getBackendApiBaseUrl()}/brands/${brandId}/reporting-periods/${periodId}/dataset`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        rows: Array.from(rows.entries()).map(([rowNumber, values]) => ({
          rowNumber,
          values
        })),
        manualHeader
      }),
      cache: 'no-store'
    }
  );

  if (!response.ok) {
    let message = 'Failed to save working-table values.';

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

    redirectToPage(brandId, periodId, { error: message });
  }

  const payload = (await response.json()) as {
    updatedRowCount: number;
    updatedCellCount: number;
  };

  revalidatePath(`/app/${brandId}/reports/${periodId}`);
  revalidatePath(`/app/${brandId}/reports/${periodId}/import`);
  revalidatePath(`/app/${brandId}/reports/${periodId}/metrics`);
  revalidatePath(`/app/${brandId}/reports/${periodId}/top-content`);
  revalidatePath(`/app/${brandId}/reports/${periodId}/review`);
  redirectToPage(brandId, periodId, {
    message: `Saved ${payload.updatedCellCount} working-table values across ${payload.updatedRowCount} dataset rows.`
  });
}
