'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, LoaderCircle, Save } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ImageUploadField } from '@/components/ui/image-upload-field';
import { useDebouncedRefresh } from '@/hooks/use-debounced-refresh';
import { saveTopContentCard, type TopContentOverviewResponse } from '@/lib/reporting-api';

type Props = {
  brandId: string;
  periodId: string;
  monthLabel: string;
  mappingHref?: string | null;
  initialOverview: TopContentOverviewResponse;
  isReadOnly: boolean;
};

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

type CardRow = TopContentOverviewResponse['cards'][number] & {
  draftScreenshotUrl: string;
  dirty: boolean;
  saveState: SaveState;
  saveError: string | null;
  savedAt: number | null;
};

const SLOT_ORDER = ['top_views', 'top_engagement', 'top_reach'] as const;
const SLOT_LABEL_FALLBACK: Record<(typeof SLOT_ORDER)[number], string> = {
  top_views: 'Top 3 Views',
  top_engagement: 'Top 3 Engagement',
  top_reach: 'Top 3 Reach'
};

function formatMetricValue(value: number) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: value % 1 === 0 ? 0 : 2
  }).format(value);
}

function parseMessage(payload: unknown, fallback: string) {
  if (
    payload &&
    typeof payload === 'object' &&
    'message' in payload &&
    Array.isArray((payload as { message?: unknown }).message)
  ) {
    return ((payload as { message: string[] }).message).join(', ');
  }

  if (
    payload &&
    typeof payload === 'object' &&
    'message' in payload &&
    typeof (payload as { message?: unknown }).message === 'string'
  ) {
    return (payload as { message: string }).message;
  }

  return fallback;
}

export function TopContentManager({
  brandId,
  periodId,
  monthLabel,
  mappingHref,
  initialOverview,
  isReadOnly
}: Props) {
  const scheduleRefresh = useDebouncedRefresh(1200);
  const [rows, setRows] = useState<CardRow[]>(
    initialOverview.cards.map(card => ({
      ...card,
      draftScreenshotUrl: card.screenshotUrl ?? '',
      dirty: false,
      saveState: 'idle',
      saveError: null,
      savedAt: null
    }))
  );

  const saveRequestSequenceRef = useRef<Map<string, number>>(new Map());
  const rowsRef = useRef(rows);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const cardsBySlot = useMemo(
    () =>
      new Map(
        SLOT_ORDER.map(slotKey => [
          slotKey,
          rows
            .filter(card => card.slotKey === slotKey)
            .sort((left, right) => left.rankPosition - right.rankPosition)
        ])
      ),
    [rows]
  );

  const dirtyCount = useMemo(
    () => rows.filter((row) => row.dirty).length,
    [rows]
  );
  const isSavingAnything = useMemo(
    () => rows.some((row) => row.saveState === 'saving'),
    [rows]
  );
  const hasSaveError = useMemo(
    () => rows.some((row) => row.saveState === 'error'),
    [rows]
  );
  const latestSavedAt = useMemo(() => {
    const saved = rows
      .map((row) => row.savedAt)
      .filter((value): value is number => typeof value === 'number');

    if (saved.length === 0) {
      return null;
    }

    return Math.max(...saved);
  }, [rows]);
  const requiredSlotCount = initialOverview.generation.requiredSlotCount;
  const filledScreenshotCount = useMemo(
    () => rows.filter((row) => row.screenshotUrl?.trim()).length,
    [rows]
  );
  const hasUnsavedChanges = dirtyCount > 0;
  const globalSaveStatusText = hasSaveError
    ? 'Some changes failed to save'
    : isSavingAnything
      ? 'Auto-saving...'
      : hasUnsavedChanges
        ? 'Unsaved changes'
        : latestSavedAt
          ? `Saved at ${new Date(latestSavedAt).toLocaleTimeString()}`
          : 'No changes yet';

  function updateScreenshot(cardId: string, value: string) {
    if (isReadOnly) {
      return;
    }

    setRows(current =>
      current.map(row => {
        if (row.id !== cardId) {
          return row;
        }

        if (row.draftScreenshotUrl === value) {
          return row;
        }

        return {
          ...row,
          draftScreenshotUrl: value,
          dirty: true,
          saveState: 'idle',
          saveError: null
        };
      })
    );

    void persist(cardId, 'auto', {
      draftScreenshotUrlOverride: value
    });
  }

  async function persist(
    cardId: string,
    mode: 'auto' | 'manual',
    options?: {
      draftScreenshotUrlOverride?: string;
    }
  ) {
    if (isReadOnly) {
      return;
    }

    const row = rowsRef.current.find(item => item.id === cardId) ?? null;

    if (!row) {
      return;
    }

    const requestSequence =
      (saveRequestSequenceRef.current.get(cardId) ?? 0) + 1;
    saveRequestSequenceRef.current.set(cardId, requestSequence);

    setRows(current =>
      current.map(item =>
        item.id === cardId
          ? {
              ...item,
              saveState: 'saving',
              saveError: null
            }
          : item
      )
    );

    try {
      const screenshotSource =
        options?.draftScreenshotUrlOverride ?? row.draftScreenshotUrl;
      const normalizedScreenshotUrl = screenshotSource.trim() || null;

      await saveTopContentCard(brandId, periodId, cardId, {
        screenshotUrl: normalizedScreenshotUrl
      });

      if (saveRequestSequenceRef.current.get(cardId) !== requestSequence) {
        return;
      }

      setRows(current =>
        current.map(item =>
          item.id === cardId
            ? {
                ...item,
                screenshotUrl: normalizedScreenshotUrl,
                dirty: false,
                saveState: 'saved',
                saveError: null,
                savedAt: Date.now()
              }
            : item
        )
      );
      scheduleRefresh();
    } catch (error) {
      if (saveRequestSequenceRef.current.get(cardId) !== requestSequence) {
        return;
      }

      setRows(current =>
        current.map(item =>
          item.id === cardId
            ? {
                ...item,
                saveState: 'error',
                saveError:
                  error instanceof Error
                    ? error.message
                    : parseMessage(error, mode === 'auto' ? 'Auto-save failed.' : 'Save failed.')
              }
            : item
        )
      );
    }
  }

  async function persistAllCards(mode: 'manual') {
    if (isReadOnly) {
      return;
    }

    for (const row of rowsRef.current) {
      await persist(row.id, mode);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Top content screenshots</Badge>
          <Badge variant="outline">{`Policy: ${initialOverview.dataSourcePolicy.label}`}</Badge>
          <Badge variant="outline">
            {`Coverage: ${filledScreenshotCount}/${requiredSlotCount}`}
          </Badge>
          <Badge variant="outline">{isReadOnly ? 'Read-only (reviewer)' : 'Auto-save enabled'}</Badge>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <h1 className="font-serif text-5xl leading-none tracking-[-0.06em]">
              Top content for {monthLabel}
            </h1>
            <p className="max-w-3xl text-base leading-7 text-muted-foreground">
              System ranks the top 3 posts by Views, Engagement, and Reach from the imported CSV columns. Add screenshot evidence for every slot before submit.
              {` `}
              {initialOverview.dataSourcePolicy.excludeManualRows
                ? 'Manual rows are currently excluded by policy.'
                : 'Manual rows are currently allowed by policy when they have usable values.'}
            </p>
            {mappingHref ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link href={mappingHref}>
                    Go to mapping
                    <ArrowRight />
                  </Link>
                </Button>
                <span className="text-xs text-muted-foreground">
                  Use this when CSV mapping is incomplete and ranking cannot be generated.
                </span>
              </div>
            ) : null}
          </div>
          <div className="inline-flex items-center gap-3 rounded-2xl border border-border/60 bg-background/90 px-3 py-2">
            <span className="text-xs text-muted-foreground">{globalSaveStatusText}</span>
            {!isReadOnly ? (
              <Button
                disabled={isSavingAnything}
                onClick={() => {
                  void persistAllCards('manual');
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                {isSavingAnything ? <LoaderCircle className="animate-spin" /> : <Save />}
                Save all
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-5">
        {SLOT_ORDER.map(slotKey => {
          const cards = cardsBySlot.get(slotKey) ?? [];
          const slotLabel = cards[0]?.slotLabel ?? SLOT_LABEL_FALLBACK[slotKey];

          return (
            <Card key={slotKey}>
              <CardHeader>
                <CardTitle>{slotLabel}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                {cards.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border/60 px-4 py-4 text-sm text-muted-foreground">
                    No ranked posts in this category for current snapshot.
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {cards.map(card => (
                      <div
                        className="flex h-full flex-col gap-4 rounded-2xl border border-border/60 bg-background/60 p-4"
                        key={card.id}
                      >
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">Rank #{card.rankPosition}</Badge>
                            <Badge variant="outline">{card.metricLabel}</Badge>
                          </div>

                          <div className="space-y-1 text-sm text-muted-foreground">
                            <div>Metric value: {formatMetricValue(card.headlineValue)}</div>
                            <div>Dataset row: {card.datasetRow.rowNumber}</div>
                            <div>{card.selectionBasis}</div>
                            {card.postUrl ? (
                              <a
                                className="inline-flex items-center text-primary hover:underline"
                                href={card.postUrl}
                                rel="noreferrer"
                                target="_blank"
                              >
                                Open source post URL
                              </a>
                            ) : (
                              <div className="text-amber-600 dark:text-amber-300">
                                No `Permalink` value in source CSV row.
                              </div>
                            )}
                          </div>
                        </div>

                        <ImageUploadField
                          disabled={isReadOnly}
                          hideControlsWhenDisabled={isReadOnly}
                          onChange={value => {
                            updateScreenshot(card.id, value);
                          }}
                          placeholderLabel="Screenshot placeholder"
                          previewAlt={`${card.slotLabel} rank ${card.rankPosition} screenshot`}
                          previewAspectRatio="4/5"
                          previewFit="contain"
                          scope="top-content"
                          value={card.draftScreenshotUrl}
                        />

                        <div className="space-y-2">
                          <div className="text-xs text-muted-foreground">
                            {isReadOnly
                              ? 'Read-only for reviewer'
                              : card.saveState === 'saving'
                                ? 'Saving...'
                                : card.dirty
                                  ? 'Pending auto-save...'
                                  : 'Auto-save standby'}
                          </div>

                          {card.saveState === 'error' && card.saveError ? (
                            <div className="rounded-2xl border border-rose-500/25 bg-rose-500/8 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
                              {card.saveError}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
