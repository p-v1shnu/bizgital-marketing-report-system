import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';

import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { getBackendApiBaseUrl } from '@/lib/reporting-api';

type MediaPresignReadResponse = {
  readUrl: string;
  objectKey: string;
  expiresInSeconds: number;
};

export const runtime = 'nodejs';

function normalizeSourceParam(value: string | null) {
  const normalized = String(value ?? '').trim();
  return normalized.length > 0 ? normalized : null;
}

function resolvePublicUrlCandidate(rawSource: string, requestUrl: URL) {
  if (/^https?:\/\//i.test(rawSource)) {
    return rawSource;
  }

  if (rawSource.startsWith('/')) {
    return `${requestUrl.origin}${rawSource}`;
  }

  return null;
}

function isLocalUploadPath(rawSource: string) {
  if (rawSource.startsWith('/uploads/')) {
    return true;
  }

  try {
    const parsed = new URL(rawSource);
    return parsed.pathname.startsWith('/uploads/');
  } catch {
    return false;
  }
}

function resolveLocalMediaRoot() {
  const directRoot = resolve(process.cwd(), '.local-media');
  const monorepoRoot = resolve(process.cwd(), 'apps/frontend/.local-media');

  if (existsSync(monorepoRoot)) {
    return monorepoRoot;
  }

  if (existsSync(directRoot)) {
    return directRoot;
  }

  const appFolder = resolve(process.cwd(), 'apps/frontend');
  if (existsSync(appFolder)) {
    return monorepoRoot;
  }

  return directRoot;
}

function resolveLegacyPublicRoot() {
  const directRoot = resolve(process.cwd(), 'public');
  const monorepoRoot = resolve(process.cwd(), 'apps/frontend/public');

  if (existsSync(directRoot)) {
    return directRoot;
  }

  if (existsSync(monorepoRoot)) {
    return monorepoRoot;
  }

  return directRoot;
}

function sanitizeUploadPath(source: string) {
  const parsed = new URL(source, 'http://localhost');
  const pathname = parsed.pathname;

  if (!pathname.startsWith('/uploads/')) {
    return null;
  }

  const decodedPath = pathname
    .split('/')
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .join('/');
  const trimmed = decodedPath.replace(/^\/+/g, '');

  if (!trimmed || trimmed.includes('..') || trimmed.includes('\\')) {
    return null;
  }

  return trimmed;
}

function resolveSafeFilePath(rootPath: string, relativePath: string) {
  const resolvedRoot = resolve(rootPath);
  const candidatePath = resolve(resolvedRoot, relativePath);

  if (
    candidatePath !== resolvedRoot &&
    !candidatePath.startsWith(`${resolvedRoot}\\`) &&
    !candidatePath.startsWith(`${resolvedRoot}/`)
  ) {
    return null;
  }

  return candidatePath;
}

function resolveContentTypeFromPath(filePath: string) {
  const extension = extname(filePath).toLowerCase();

  if (extension === '.webp') {
    return 'image/webp';
  }

  if (extension === '.png') {
    return 'image/png';
  }

  if (extension === '.gif') {
    return 'image/gif';
  }

  if (extension === '.jpg' || extension === '.jpeg') {
    return 'image/jpeg';
  }

  if (extension === '.avif') {
    return 'image/avif';
  }

  return 'application/octet-stream';
}

async function readBackendErrorMessage(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as { message?: string | string[] };
    if (Array.isArray(payload.message)) {
      return payload.message.join(', ');
    }
    if (payload.message) {
      return payload.message;
    }
  } catch {
    // Ignore parse error and use fallback below.
  }

  return fallback;
}

export async function GET(request: Request) {
  const auth = await getAuthContext();

  if (!auth.user) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const requestUrl = new URL(request.url);
  const sourceParam = normalizeSourceParam(requestUrl.searchParams.get('src'));

  if (!sourceParam) {
    return NextResponse.json({ error: 'Media source is required.' }, { status: 400 });
  }

  if (isLocalUploadPath(sourceParam)) {
    const relativeUploadPath = sanitizeUploadPath(sourceParam);
    if (!relativeUploadPath) {
      return NextResponse.json({ error: 'Invalid local media source.' }, { status: 400 });
    }

    const localMediaRoot = resolveLocalMediaRoot();
    const privateFilePath = resolveSafeFilePath(localMediaRoot, relativeUploadPath);
    const legacyPublicRoot = resolveLegacyPublicRoot();
    const legacyFilePath = resolveSafeFilePath(legacyPublicRoot, relativeUploadPath);
    const targetFilePath =
      (privateFilePath && existsSync(privateFilePath) ? privateFilePath : null) ??
      (legacyFilePath && existsSync(legacyFilePath) ? legacyFilePath : null);

    if (!targetFilePath) {
      return NextResponse.json(
        { error: 'Media file was not found.' },
        { status: 404 }
      );
    }

    const fileBuffer = await readFile(targetFilePath);
    const responseHeaders = new Headers();
    responseHeaders.set('Content-Type', resolveContentTypeFromPath(targetFilePath));
    responseHeaders.set('Cache-Control', 'private, no-store');

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: responseHeaders
    });
  }

  const publicUrlCandidate = resolvePublicUrlCandidate(sourceParam, requestUrl);

  if (!publicUrlCandidate) {
    return NextResponse.json({ error: 'Invalid media source.' }, { status: 400 });
  }

  const backendResponse = await fetch(`${getBackendApiBaseUrl()}/media/presign-read`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: request.headers.get('cookie') ?? ''
    },
    body: JSON.stringify({
      publicUrl: publicUrlCandidate
    }),
    cache: 'no-store'
  });

  if (!backendResponse.ok) {
    const message = await readBackendErrorMessage(
      backendResponse,
      'Unable to access media file.'
    );
    return NextResponse.json({ error: message }, { status: backendResponse.status });
  }

  const payload = (await backendResponse.json()) as MediaPresignReadResponse;
  const storageResponse = await fetch(payload.readUrl, { cache: 'no-store' });

  if (!storageResponse.ok) {
    return NextResponse.json(
      { error: 'Media file was not found in storage.' },
      { status: storageResponse.status === 404 ? 404 : 502 }
    );
  }

  const responseHeaders = new Headers();
  const contentType = storageResponse.headers.get('content-type');

  if (contentType) {
    responseHeaders.set('Content-Type', contentType);
  }

  responseHeaders.set('Cache-Control', 'private, no-store');

  return new NextResponse(storageResponse.body, {
    status: 200,
    headers: responseHeaders
  });
}
