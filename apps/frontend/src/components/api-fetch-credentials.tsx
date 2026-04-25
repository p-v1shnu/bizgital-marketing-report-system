'use client';

import { useEffect } from 'react';

function getApiOrigin() {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api';

  try {
    return new URL(apiBase).origin;
  } catch {
    return null;
  }
}

function shouldIncludeCredentials(input: RequestInfo | URL) {
  const apiOrigin = getApiOrigin();

  if (!apiOrigin) {
    return false;
  }

  const rawUrl =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

  try {
    return new URL(rawUrl, window.location.origin).origin === apiOrigin;
  } catch {
    return false;
  }
}

export function ApiFetchCredentials() {
  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    window.fetch = (input, init) => {
      if (!shouldIncludeCredentials(input)) {
        return originalFetch(input, init);
      }

      return originalFetch(input, {
        ...init,
        credentials: init?.credentials ?? 'include'
      });
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return null;
}

