'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

type ImportMappingFallbackBannerProps = {
  brandId: string;
  periodId: string;
  hasUploadedImportJob: boolean;
  shouldShowInitially: boolean;
  isMappingFallbackRequested: boolean;
  isMappingResolvedRequested: boolean;
  canAutoClearMappingFallback: boolean;
  canAccessPeriodMapping: boolean;
  canAccessImportMappingAdmin: boolean;
  periodMappingHref: string;
  mappingHref: string;
};

function toFallbackStorageKey(brandId: string, periodId: string) {
  return `bizgital-import-mapping-fallback:${brandId}:${periodId}`;
}

export function ImportMappingFallbackBanner({
  brandId,
  periodId,
  hasUploadedImportJob,
  shouldShowInitially,
  isMappingFallbackRequested,
  isMappingResolvedRequested,
  canAutoClearMappingFallback,
  canAccessPeriodMapping,
  canAccessImportMappingAdmin,
  periodMappingHref,
  mappingHref
}: ImportMappingFallbackBannerProps) {
  const storageKey = useMemo(
    () => toFallbackStorageKey(brandId, periodId),
    [brandId, periodId]
  );
  const [isVisible, setIsVisible] = useState(shouldShowInitially);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (!hasUploadedImportJob) {
      window.localStorage.removeItem(storageKey);
      setIsVisible(false);
      return;
    }

    if (isMappingResolvedRequested || canAutoClearMappingFallback) {
      window.localStorage.removeItem(storageKey);
      setIsVisible(false);
      return;
    }

    const persisted = window.localStorage.getItem(storageKey) === 'true';
    const shouldShowNow =
      isMappingFallbackRequested || shouldShowInitially || persisted;

    if (shouldShowNow) {
      window.localStorage.setItem(storageKey, 'true');
      setIsVisible(true);
      return;
    }

    setIsVisible(false);
  }, [
    canAutoClearMappingFallback,
    hasUploadedImportJob,
    isMappingFallbackRequested,
    isMappingResolvedRequested,
    shouldShowInitially,
    storageKey
  ]);

  if (!isVisible) {
    return null;
  }

  return (
    <Card className="border-amber-500/25 bg-amber-500/8">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
        <div className="space-y-1">
          <div className="text-sm font-medium text-foreground">
            Mapping fallback is available for this upload
          </div>
          <p className="text-sm text-muted-foreground">
            Auto-map could not complete every required field. Open month mapping to finalize this file,
            then return to Import.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canAccessPeriodMapping ? (
            <Button asChild size="sm" variant="secondary">
              <Link href={periodMappingHref}>
                Open month mapping
                <ArrowRight />
              </Link>
            </Button>
          ) : null}
          {canAccessImportMappingAdmin ? (
            <Button asChild size="sm" variant="outline">
              <Link href={mappingHref}>
                Open mapping settings
                <ArrowRight />
              </Link>
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
