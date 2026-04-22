'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

const FLASH_QUERY_KEYS = ['message', 'error'] as const;

export function ClearFlashQueryParams() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pathname) {
      return;
    }

    const hasFlashParam = FLASH_QUERY_KEYS.some((key) => searchParams.has(key));
    if (!hasFlashParam) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams.toString());
    for (const key of FLASH_QUERY_KEYS) {
      nextParams.delete(key);
    }

    const nextQuery = nextParams.toString();
    const nextHref = nextQuery ? `${pathname}?${nextQuery}` : pathname;

    // Keep current server-rendered flash visible, but clean URL for next refresh.
    window.history.replaceState(window.history.state, '', nextHref);
  }, [pathname, searchParams]);

  return null;
}
