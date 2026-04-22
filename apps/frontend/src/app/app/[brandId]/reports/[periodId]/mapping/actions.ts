'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireAnyAdmin } from '@/lib/auth';
import { getBackendApiBaseUrl } from '@/lib/reporting-api';

function redirectToMapping(
  brandId: string,
  periodId: string,
  params: Record<string, string>
) {
  const searchParams = new URLSearchParams(params);
  redirect(`/app/${brandId}/reports/${periodId}/mapping?${searchParams.toString()}`);
}

export async function saveMappingsAction(formData: FormData) {
  const brandId = String(formData.get('brandId') ?? '');
  const periodId = String(formData.get('periodId') ?? '');
  await requireAnyAdmin(`/app/${brandId}/reports/${periodId}/import`);
  const profileIds = formData.getAll('profileId').map(String);
  const targetFields = formData.getAll('targetField').map(String);

  const mappings = profileIds.map((profileId, index) => ({
    importColumnProfileId: profileId,
    targetField: targetFields[index] || null
  }));
  const selectedMappings = mappings.filter((mapping) => mapping.targetField);

  if (selectedMappings.length === 0) {
    redirectToMapping(brandId, periodId, {
      error: 'Select at least one target field before saving mappings.'
    });
  }

  const response = await fetch(
    `${getBackendApiBaseUrl()}/brands/${brandId}/reporting-periods/${periodId}/mapping`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ mappings }),
      cache: 'no-store'
    }
  );

  if (!response.ok) {
    let message = 'Failed to save mappings.';

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

    redirectToMapping(brandId, periodId, { error: message });
  }

  const payload = (await response.json()) as {
    savedCount: number;
    materializedRows: number;
  };

  revalidatePath(`/app/${brandId}/reports/${periodId}`);
  revalidatePath(`/app/${brandId}/reports/${periodId}/mapping`);
  revalidatePath(`/app/${brandId}/reports/${periodId}/import`);
  revalidatePath(`/app/${brandId}/reports/${periodId}/metrics`);
  revalidatePath(`/app/${brandId}/reports/${periodId}/top-content`);
  revalidatePath(`/app/${brandId}/reports/${periodId}/review`);
  redirectToMapping(brandId, periodId, {
    message: `Saved ${payload.savedCount} mappings and materialized ${payload.materializedRows} dataset rows for the current draft.`
  });
}
