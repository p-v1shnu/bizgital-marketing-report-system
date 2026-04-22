'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { getBackendApiBaseUrl } from '@/lib/reporting-api';

function redirectToQuestions(
  brandId: string,
  periodId: string,
  params: Record<string, string>
) {
  const searchParams = new URLSearchParams(params);
  redirect(`/app/${brandId}/reports/${periodId}/questions?${searchParams.toString()}`);
}

export async function saveQuestionEvidenceAction(formData: FormData) {
  const brandId = String(formData.get('brandId') ?? '');
  const periodId = String(formData.get('periodId') ?? '');
  const activationId = String(formData.get('activationId') ?? '');

  const response = await fetch(
    `${getBackendApiBaseUrl()}/brands/${brandId}/reporting-periods/${periodId}/questions/${activationId}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: String(formData.get('title') ?? '').trim() || null,
        responseNote: String(formData.get('responseNote') ?? '').trim() || null,
        postUrl: String(formData.get('postUrl') ?? '').trim() || null
      }),
      cache: 'no-store'
    }
  );

  if (!response.ok) {
    let message = 'Failed to save question evidence.';

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

    redirectToQuestions(brandId, periodId, { error: message });
  }

  revalidatePath(`/app/${brandId}/reports/${periodId}`);
  revalidatePath(`/app/${brandId}/reports/${periodId}/questions`);
  revalidatePath(`/app/${brandId}/reports/${periodId}/review`);
  redirectToQuestions(brandId, periodId, {
    message: 'Question evidence updated.'
  });
}
