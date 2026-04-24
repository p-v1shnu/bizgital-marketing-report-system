'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { isRedirectError } from 'next/dist/client/components/redirect-error';

import { backendFetch, getBackendApiBaseUrl } from '@/lib/reporting-api';

function redirectToTopContent(
  brandId: string,
  periodId: string,
  params: Record<string, string>
) {
  const searchParams = new URLSearchParams(params);
  redirect(`/app/${brandId}/reports/${periodId}/top-content?${searchParams.toString()}`);
}

export async function saveTopContentCardAction(formData: FormData) {
  const brandId = String(formData.get('brandId') ?? '');
  const periodId = String(formData.get('periodId') ?? '');
  const cardId = String(formData.get('cardId') ?? '');

  const response = await backendFetch(
    `${getBackendApiBaseUrl()}/brands/${brandId}/reporting-periods/${periodId}/top-content/${cardId}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        screenshotUrl: String(formData.get('screenshotUrl') ?? '').trim() || null
      }),
      cache: 'no-store'
    }
  );

  if (!response.ok) {
    let message = 'Failed to save top content card.';

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

    redirectToTopContent(brandId, periodId, { error: message });
  }

  revalidatePath(`/app/${brandId}/reports/${periodId}`);
  revalidatePath(`/app/${brandId}/reports/${periodId}/top-content`);
  revalidatePath(`/app/${brandId}/reports/${periodId}/review`);
  redirectToTopContent(brandId, periodId, {
    message: 'Top content screenshot updated.'
  });
}

export async function regenerateTopContentAction(formData: FormData) {
  const brandId = String(formData.get('brandId') ?? '');
  const periodId = String(formData.get('periodId') ?? '');

  try {
    const payload = (await backendFetch(
      `${getBackendApiBaseUrl()}/brands/${brandId}/reporting-periods/${periodId}/top-content/regenerate`,
      {
        method: 'POST',
        cache: 'no-store'
      }
    ).then(async (response) => {
      if (!response.ok) {
        let message = 'Failed to regenerate top content.';

        try {
          const errorPayload = (await response.json()) as { message?: string | string[] };
          if (Array.isArray(errorPayload.message)) {
            message = errorPayload.message.join(', ');
          } else if (errorPayload.message) {
            message = errorPayload.message;
          }
        } catch {
          message = response.statusText || message;
        }

        throw new Error(message);
      }

      return response.json();
    })) as {
      generation: {
        currentSlotCount: number;
      };
    };

    revalidatePath(`/app/${brandId}/reports/${periodId}`);
    revalidatePath(`/app/${brandId}/reports/${periodId}/top-content`);
    revalidatePath(`/app/${brandId}/reports/${periodId}/review`);
    redirectToTopContent(brandId, periodId, {
      message: `Regenerated top content for ${payload.generation.currentSlotCount} required slots.`
    });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    redirectToTopContent(brandId, periodId, {
      error:
        error instanceof Error ? error.message : 'Failed to regenerate top content.'
    });
  }
}
