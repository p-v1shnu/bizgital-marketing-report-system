import { NextResponse } from 'next/server';

import { getBackendApiBaseUrl } from '@/lib/reporting-api';

type MediaPresignUploadResponse = {
  method?: string;
  uploadUrl: string;
  publicUrl: string;
  headers?: Record<string, string>;
};

const MAX_FILE_SIZE = 10 * 1024 * 1024;

function normalizeScope(value: FormDataEntryValue | null) {
  if (typeof value !== 'string') {
    return 'general';
  }

  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized.length > 0 ? normalized : 'general';
}

async function readErrorMessage(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as { message?: string | string[]; error?: string };
    if (Array.isArray(payload.message)) {
      return payload.message.join(', ');
    }
    if (typeof payload.message === 'string' && payload.message.trim().length > 0) {
      return payload.message;
    }
    if (typeof payload.error === 'string' && payload.error.trim().length > 0) {
      return payload.error;
    }
  } catch {
    // Fall back to plain-text response handling below.
  }

  try {
    const text = (await response.text()).trim();
    if (text.length > 0) {
      return text;
    }
  } catch {
    // Ignore parse errors and use fallback below.
  }

  return fallback;
}

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Image file is required.' }, { status: 400 });
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Only image files are supported.' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'Image size must be at most 10 MB.' }, { status: 400 });
    }

    const scope = normalizeScope(formData.get('scope'));
    const presignResponse = await fetch(`${getBackendApiBaseUrl()}/media/presign-upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: request.headers.get('cookie') ?? ''
      },
      body: JSON.stringify({
        scope,
        filename: file.name,
        mimeType: file.type,
        sizeBytes: file.size
      }),
      cache: 'no-store'
    });

    if (!presignResponse.ok) {
      const message = await readErrorMessage(presignResponse, 'Failed to prepare media upload.');
      return NextResponse.json({ error: message }, { status: presignResponse.status });
    }

    const presigned = (await presignResponse.json()) as MediaPresignUploadResponse;
    const uploadHeaders = new Headers();

    Object.entries(presigned.headers ?? {}).forEach(([key, value]) => {
      uploadHeaders.set(key, value);
    });

    if (!uploadHeaders.has('Content-Type')) {
      uploadHeaders.set('Content-Type', file.type);
    }

    const uploadResponse = await fetch(presigned.uploadUrl, {
      method: presigned.method ?? 'PUT',
      headers: uploadHeaders,
      body: Buffer.from(await file.arrayBuffer()),
      cache: 'no-store'
    });

    if (!uploadResponse.ok) {
      const message = await readErrorMessage(
        uploadResponse,
        `Failed to upload image to storage (HTTP ${uploadResponse.status}).`
      );
      return NextResponse.json({ error: message }, { status: 502 });
    }

    return NextResponse.json({ publicUrl: presigned.publicUrl });
  } catch {
    return NextResponse.json({ error: 'Failed to upload image.' }, { status: 500 });
  }
}
