'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  backendFetch,
  getBackendApiBaseUrl
} from '@/lib/reporting-api';

function redirectToImport(
  brandId: string,
  periodId: string,
  params: Record<string, string>
) {
  const searchParams = new URLSearchParams(params);
  redirect(`/app/${brandId}/reports/${periodId}/import?${searchParams.toString()}`);
}

async function autoMapLatestImportJob(brandId: string, periodId: string) {
  const response = await backendFetch(
    `${getBackendApiBaseUrl()}/brands/${brandId}/reporting-periods/${periodId}/mapping/auto`,
    {
      method: 'POST',
      cache: 'no-store'
    }
  );

  if (!response.ok) {
    return {
      status: 'failed' as const
    };
  }

  return (await response.json()) as {
    status:
      | 'mapped'
      | 'requires_admin_mapping'
      | 'no_matches'
      | 'missing_import';
    mappedCount: number;
    missingRequiredTargets: string[];
  };
}

export async function uploadImportJobAction(formData: FormData) {
  const brandId = String(formData.get('brandId') ?? '');
  const periodId = String(formData.get('periodId') ?? '');
  const fileEntry = formData.get('file');

  if (!(fileEntry instanceof File) || fileEntry.size === 0) {
    redirectToImport(brandId, periodId, {
      error: 'Select a CSV, XLS, or XLSX file before uploading.'
    });
  }

  const file = fileEntry as File;
  const uploadFormData = new FormData();
  uploadFormData.set('file', file, file.name);

  const response = await backendFetch(
    `${getBackendApiBaseUrl()}/brands/${brandId}/reporting-periods/${periodId}/import-jobs`,
    {
      method: 'POST',
      body: uploadFormData,
      cache: 'no-store'
    }
  );

  if (!response.ok) {
    let message = 'Failed to upload import file.';

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

    redirectToImport(brandId, periodId, {
      error: message
    });
  }

  const autoMapping = await autoMapLatestImportJob(brandId, periodId);

  revalidatePath(`/app/${brandId}/reports/${periodId}`);
  revalidatePath(`/app/${brandId}/reports/${periodId}/import`);
  revalidatePath(`/app/${brandId}/reports/${periodId}/mapping`);
  revalidatePath(`/app/${brandId}/reports/${periodId}/metrics`);
  revalidatePath(`/app/${brandId}/reports/${periodId}/top-content`);
  revalidatePath(`/app/${brandId}/reports/${periodId}/review`);

  if (autoMapping.status === 'mapped') {
    redirectToImport(brandId, periodId, {
      message: `File uploaded. ${autoMapping.mappedCount} columns were matched automatically and the working table is ready below.`
    });
  }

  if (autoMapping.status === 'requires_admin_mapping') {
    redirectToImport(brandId, periodId, {
      message:
        'File uploaded. Some required columns need mapping-rule updates before this month is complete.',
      mappingFallback: 'true'
    });
  }

  if (autoMapping.status === 'no_matches') {
    redirectToImport(brandId, periodId, {
      message:
        'File uploaded. Auto-match could not map required columns yet. Please update import mapping rules.',
      mappingFallback: 'true'
    });
  }

  if (autoMapping.status === 'failed') {
    redirectToImport(brandId, periodId, {
      error:
        'File uploaded but auto-map failed. Please review import mapping settings.',
      mappingFallback: 'true'
    });
  }

  redirectToImport(brandId, periodId, {
    message: 'File uploaded. Continue in the working table below.',
    ...(autoMapping.status === 'missing_import' ? { mappingFallback: 'true' } : {})
  });
}
