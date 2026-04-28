'use client';

type AppImageClipboardPayload = {
  blob: Blob;
  copiedAt: number;
  sourceId: string;
  token: string;
};

const APP_IMAGE_CLIPBOARD_KEY = '__bizgitalAppImageClipboard';

type GlobalWithAppImageClipboard = typeof globalThis & {
  [APP_IMAGE_CLIPBOARD_KEY]?: AppImageClipboardPayload;
};

function getGlobalStore() {
  return globalThis as GlobalWithAppImageClipboard;
}

export function setAppImageClipboardBlob(blob: Blob, sourceId: string) {
  if (!(blob instanceof Blob) || !blob.type.startsWith('image/')) {
    return null;
  }

  const token = `bizgital-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const store = getGlobalStore();
  store[APP_IMAGE_CLIPBOARD_KEY] = {
    blob,
    copiedAt: Date.now(),
    sourceId,
    token
  };
  return token;
}

type GetAppImageClipboardFileOptions = {
  maxAgeMs?: number;
  token?: string | null;
};

export function getAppImageClipboardFile(options?: GetAppImageClipboardFileOptions) {
  const maxAgeMs = options?.maxAgeMs ?? 45_000;
  const expectedToken = String(options?.token ?? '').trim();
  const store = getGlobalStore();
  const payload = store[APP_IMAGE_CLIPBOARD_KEY];
  if (!payload) {
    return null;
  }

  const ageMs = Date.now() - payload.copiedAt;
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > maxAgeMs) {
    return null;
  }

  if (expectedToken.length > 0 && payload.token !== expectedToken) {
    return null;
  }

  return new File([payload.blob], `app-copy-${payload.copiedAt}.png`, {
    type: payload.blob.type || 'image/png',
    lastModified: payload.copiedAt
  });
}
