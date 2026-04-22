'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { isRedirectError } from 'next/dist/client/components/redirect-error';

import { postReportingAction } from '@/lib/reporting-api';

function redirectToMetrics(
  brandId: string,
  periodId: string,
  params: Record<string, string>
) {
  const searchParams = new URLSearchParams(params);
  redirect(`/app/${brandId}/reports/${periodId}/metrics?${searchParams.toString()}`);
}

export async function regenerateMetricsSnapshotAction(formData: FormData) {
  const brandId = String(formData.get('brandId') ?? '');
  const periodId = String(formData.get('periodId') ?? '');

  try {
    const payload = (await postReportingAction(
      `/brands/${brandId}/reporting-periods/${periodId}/metrics/regenerate`
    )) as {
      summary: {
        metricCount: number;
      };
    };

    await postReportingAction(
      `/brands/${brandId}/reporting-periods/${periodId}/top-content/regenerate`
    );

    revalidatePath(`/app/${brandId}/reports/${periodId}`);
    revalidatePath(`/app/${brandId}/reports/${periodId}/metrics`);
    revalidatePath(`/app/${brandId}/reports/${periodId}/top-content`);
    revalidatePath(`/app/${brandId}/reports/${periodId}/review`);

    redirectToMetrics(brandId, periodId, {
      message: `Regenerated current metric snapshot with ${payload.summary.metricCount} metric items and refreshed top content.`
    });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    redirectToMetrics(brandId, periodId, {
      error:
        error instanceof Error
          ? error.message
          : 'Failed to regenerate the metric snapshot.'
    });
  }
}
