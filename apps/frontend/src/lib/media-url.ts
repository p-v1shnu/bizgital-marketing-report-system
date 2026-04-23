const MEDIA_PROXY_PATH = '/api/media/proxy';

function normalizeMediaUrl(value: string | null | undefined) {
  const normalized = String(value ?? '').trim();
  return normalized.length > 0 ? normalized : null;
}

function isAlreadyProtectedProxy(url: string) {
  return (
    url.startsWith(`${MEDIA_PROXY_PATH}?`) ||
    url.startsWith(`${MEDIA_PROXY_PATH}/`)
  );
}

function isNativeBrowserUrl(url: string) {
  return (
    url.startsWith('data:') ||
    url.startsWith('blob:')
  );
}

function isLikelyManagedUploadUrl(url: string) {
  if (url.startsWith('/uploads/')) {
    return true;
  }

  try {
    const parsed = new URL(url);
    return parsed.pathname.includes('/uploads/');
  } catch {
    return false;
  }
}

export function toProtectedMediaUrl(value: string | null | undefined) {
  const normalized = normalizeMediaUrl(value);

  if (!normalized) {
    return null;
  }

  if (isAlreadyProtectedProxy(normalized) || isNativeBrowserUrl(normalized)) {
    return normalized;
  }

  if (!isLikelyManagedUploadUrl(normalized)) {
    return normalized;
  }

  return `${MEDIA_PROXY_PATH}?src=${encodeURIComponent(normalized)}`;
}
