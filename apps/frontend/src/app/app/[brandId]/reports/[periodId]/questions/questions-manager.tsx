'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  ImagePlus,
  LoaderCircle,
  Save,
  ShieldAlert,
  Trash2
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ImageUploadField } from '@/components/ui/image-upload-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useDebouncedRefresh } from '@/hooks/use-debounced-refresh';
import type { QuestionOverviewResponse } from '@/lib/reporting-api';
import { saveQuestionEntry, saveQuestionHighlights } from '@/lib/reporting-api';

type Props = {
  brandId: string;
  periodId: string;
  monthLabel: string;
  initialOverview: QuestionOverviewResponse;
  isReadOnly: boolean;
};

type DraftEntry = {
  mode: 'has_questions' | 'no_questions';
  questionCount: string;
};

type DraftHighlights = {
  note: string;
  screenshots: string[];
};

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

type SaveMeta = {
  dirty: boolean;
  saveState: SaveState;
  saveError: string | null;
  savedAt: number | null;
};

const AUTOSAVE_MS = 1000;
const MAX_HIGHLIGHT_SHOTS = 10;

function ensureAtLeastOneScreenshotSlot(values: string[]) {
  return values.length > 0 ? values : [''];
}

function toDraft(item: QuestionOverviewResponse['items'][number]): DraftEntry {
  const defaultMode = item.entry.mode;
  const defaultQuestionCount =
    defaultMode === 'no_questions'
      ? '0'
      : item.entry.questionCount > 0
        ? String(item.entry.questionCount)
        : '';

  return {
    mode: defaultMode,
    questionCount: defaultQuestionCount
  };
}

function toHighlightDraft(
  highlights: QuestionOverviewResponse['highlights']
): DraftHighlights {
  return {
    note: highlights.note ?? '',
    screenshots: ensureAtLeastOneScreenshotSlot(
      highlights.screenshots.map((entry) => entry.screenshotUrl)
    )
  };
}

function parseErrorMessage(payload: unknown, fallback: string) {
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

function isComplete(draft: DraftEntry) {
  if (draft.mode === 'no_questions') {
    return true;
  }

  const count = Number(draft.questionCount);
  return Number.isInteger(count) && count >= 1;
}

function createDefaultSaveMeta(): SaveMeta {
  return {
    dirty: false,
    saveState: 'idle',
    saveError: null,
    savedAt: null
  };
}

function serializeDraft(draft: DraftEntry) {
  if (draft.mode === 'no_questions') {
    return {
      ok: true as const,
      payload: {
        mode: 'no_questions' as const,
        questionCount: 0
      }
    };
  }

  const trimmedCount = draft.questionCount.trim();
  const rawCount = trimmedCount.length === 0 ? 0 : Number(trimmedCount);
  const questionCount = Number.isInteger(rawCount) && rawCount >= 0 ? rawCount : null;

  if (questionCount === null) {
    return {
      ok: false as const,
      error: 'Question count must be a whole number greater than or equal to 0.'
    };
  }

  return {
    ok: true as const,
    payload: {
      mode: 'has_questions' as const,
      questionCount
    }
  };
}

function serializeHighlights(draft: DraftHighlights) {
  const screenshots = draft.screenshots
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  if (screenshots.length > MAX_HIGHLIGHT_SHOTS) {
    return {
      ok: false as const,
      error: `Highlight screenshots must be at most ${MAX_HIGHLIGHT_SHOTS} images.`
    };
  }

  return {
    ok: true as const,
    payload: {
      note: draft.note.trim() || null,
      screenshots
    }
  };
}

export function QuestionsManager({
  brandId,
  periodId,
  monthLabel,
  initialOverview,
  isReadOnly
}: Props) {
  const scheduleRefresh = useDebouncedRefresh(1200);
  const [items, setItems] = useState(initialOverview.items);
  const [draftByActivation, setDraftByActivation] = useState<Record<string, DraftEntry>>(
    Object.fromEntries(initialOverview.items.map((item) => [item.activation.id, toDraft(item)]))
  );
  const [metaByActivation, setMetaByActivation] = useState<Record<string, SaveMeta>>(
    Object.fromEntries(
      initialOverview.items.map((item) => [item.activation.id, createDefaultSaveMeta()])
    )
  );
  const [highlightDraft, setHighlightDraft] = useState<DraftHighlights>(
    toHighlightDraft(initialOverview.highlights)
  );
  const [highlightMeta, setHighlightMeta] = useState<SaveMeta>(createDefaultSaveMeta());

  const entryTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const itemsRef = useRef(items);
  const draftRef = useRef(draftByActivation);
  const highlightsRef = useRef(highlightDraft);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    draftRef.current = draftByActivation;
  }, [draftByActivation]);

  useEffect(() => {
    highlightsRef.current = highlightDraft;
  }, [highlightDraft]);

  useEffect(() => {
    return () => {
      for (const timer of entryTimers.current.values()) {
        clearTimeout(timer);
      }
      entryTimers.current.clear();

      if (highlightTimer.current) {
        clearTimeout(highlightTimer.current);
        highlightTimer.current = null;
      }
    };
  }, []);

  const completedCount = useMemo(
    () =>
      items.filter((item) => {
        const draft = draftByActivation[item.activation.id];
        return draft ? isComplete(draft) : item.entry.isComplete;
      }).length,
    [draftByActivation, items]
  );
  const requiredCount = items.length;
  const readyState = requiredCount > 0 && completedCount === requiredCount;
  const dirtyCount = useMemo(
    () =>
      items.filter(
        (item) => (metaByActivation[item.activation.id] ?? createDefaultSaveMeta()).dirty
      ).length,
    [items, metaByActivation]
  );
  const isAnyEntrySaving = useMemo(
    () =>
      items.some(
        (item) => (metaByActivation[item.activation.id] ?? createDefaultSaveMeta()).saveState === 'saving'
      ),
    [items, metaByActivation]
  );
  const isAnyEntryError = useMemo(
    () =>
      items.some(
        (item) => (metaByActivation[item.activation.id] ?? createDefaultSaveMeta()).saveState === 'error'
      ),
    [items, metaByActivation]
  );
  const orderedActivationIds = useMemo(() => items.map((item) => item.activation.id), [items]);
  const activationIndexById = useMemo(
    () =>
      Object.fromEntries(
        orderedActivationIds.map((activationId, index) => [activationId, index])
      ) as Record<string, number>,
    [orderedActivationIds]
  );
  const latestSavedAt = useMemo(() => {
    const savedTimestamps = [
      ...items
        .map((item) => (metaByActivation[item.activation.id] ?? createDefaultSaveMeta()).savedAt)
        .filter((value): value is number => typeof value === 'number'),
      ...(typeof highlightMeta.savedAt === 'number' ? [highlightMeta.savedAt] : [])
    ];

    if (savedTimestamps.length === 0) {
      return null;
    }

    return Math.max(...savedTimestamps);
  }, [items, metaByActivation, highlightMeta.savedAt]);
  const highlightFilledCount = highlightDraft.screenshots.filter(
    (item) => item.trim().length > 0
  ).length;
  const hasUnsavedChanges = dirtyCount > 0 || highlightMeta.dirty;
  const isSavingAnything = isAnyEntrySaving || highlightMeta.saveState === 'saving';
  const hasSaveError = isAnyEntryError || highlightMeta.saveState === 'error';
  const globalSaveStatusText = hasSaveError
    ? 'Some changes failed to save'
    : isSavingAnything
      ? 'Auto-saving...'
      : hasUnsavedChanges
        ? 'Unsaved changes'
        : latestSavedAt
          ? `Saved at ${new Date(latestSavedAt).toLocaleTimeString()}`
          : 'No changes yet';

  function queueEntryAutosave(activationId: string) {
    const existing = entryTimers.current.get(activationId);

    if (existing) {
      clearTimeout(existing);
    }

    entryTimers.current.set(
      activationId,
      setTimeout(() => {
        void persistEntry(activationId, 'auto');
      }, AUTOSAVE_MS)
    );
  }

  function queueHighlightAutosave() {
    if (highlightTimer.current) {
      clearTimeout(highlightTimer.current);
    }

    highlightTimer.current = setTimeout(() => {
      void persistHighlights('auto');
    }, AUTOSAVE_MS);
  }

  function getBaseDraftFromSource(
    source: Record<string, DraftEntry>,
    activationId: string
  ): DraftEntry | null {
    const sourceItem = itemsRef.current.find((item) => item.activation.id === activationId) ?? null;
    if (!sourceItem) {
      return null;
    }

    return source[activationId] ?? toDraft(sourceItem);
  }

  function updateDraft(
    activationId: string,
    updater: (current: DraftEntry) => DraftEntry
  ) {
    if (isReadOnly) {
      return;
    }

    setDraftByActivation((current) => {
      const baseDraft = getBaseDraftFromSource(current, activationId);
      if (!baseDraft) {
        return current;
      }

      return {
        ...current,
        [activationId]: updater(baseDraft)
      };
    });

    setMetaByActivation((current) => ({
      ...current,
      [activationId]: {
        ...(current[activationId] ?? createDefaultSaveMeta()),
        dirty: true,
        saveState: 'idle',
        saveError: null
      }
    }));

    queueEntryAutosave(activationId);
  }

  function focusCountInputByActivationIndex(index: number) {
    const activationId = orderedActivationIds[index];
    if (!activationId) {
      return;
    }

    const target = countInputRefs.current[activationId];
    target?.focus();
    target?.select();
  }

  async function persistAllEntries(mode: 'manual') {
    if (isReadOnly) {
      return;
    }

    for (const activationId of orderedActivationIds) {
      await persistEntry(activationId, mode);
    }
  }

  async function persistAllSections(mode: 'manual') {
    if (isReadOnly) {
      return;
    }

    await persistAllEntries(mode);
    await persistHighlights(mode);
  }

  function updateHighlights(updater: (current: DraftHighlights) => DraftHighlights) {
    if (isReadOnly) {
      return;
    }

    setHighlightDraft((current) => updater(current));
    setHighlightMeta((current) => ({
      ...current,
      dirty: true,
      saveState: 'idle',
      saveError: null
    }));
    queueHighlightAutosave();
  }

  function addHighlightScreenshot() {
    updateHighlights((current) => {
      if (current.screenshots.length >= MAX_HIGHLIGHT_SHOTS) {
        return current;
      }

      return {
        ...current,
        screenshots: [...current.screenshots, '']
      };
    });
  }

  function removeHighlightScreenshot(index: number) {
    updateHighlights((current) => {
      const nextScreenshots = current.screenshots.filter((_, itemIndex) => itemIndex !== index);

      return {
        ...current,
        screenshots: ensureAtLeastOneScreenshotSlot(nextScreenshots)
      };
    });
  }

  async function persistEntry(activationId: string, mode: 'auto' | 'manual') {
    if (isReadOnly) {
      return;
    }

    const existing = entryTimers.current.get(activationId);

    if (existing) {
      clearTimeout(existing);
      entryTimers.current.delete(activationId);
    }

    const item = itemsRef.current.find((candidate) => candidate.activation.id === activationId) ?? null;
    const draft = draftRef.current[activationId];

    if (!item || !draft) {
      return;
    }

    const parsed = serializeDraft(draft);

    if (!parsed.ok) {
      setMetaByActivation((current) => ({
        ...current,
        [activationId]: {
          ...(current[activationId] ?? createDefaultSaveMeta()),
          saveState: 'error',
          saveError: parsed.error
        }
      }));
      return;
    }

    setMetaByActivation((current) => ({
      ...current,
      [activationId]: {
        ...(current[activationId] ?? createDefaultSaveMeta()),
        saveState: 'saving',
        saveError: null
      }
    }));

    try {
      await saveQuestionEntry(brandId, periodId, activationId, parsed.payload);

      setItems((current) =>
        current.map((candidate) =>
          candidate.activation.id === activationId
            ? {
                ...candidate,
                entry: {
                  ...candidate.entry,
                  mode: parsed.payload.mode,
                  questionCount: parsed.payload.questionCount,
                  isComplete: isComplete(draft)
                }
              }
            : candidate
        )
      );

      setMetaByActivation((current) => ({
        ...current,
        [activationId]: {
          ...(current[activationId] ?? createDefaultSaveMeta()),
          dirty: false,
          saveState: 'saved',
          saveError: null,
          savedAt: Date.now()
        }
      }));
      scheduleRefresh();
    } catch (error) {
      setMetaByActivation((current) => ({
        ...current,
        [activationId]: {
          ...(current[activationId] ?? createDefaultSaveMeta()),
          saveState: 'error',
          saveError:
            error instanceof Error
              ? error.message
              : parseErrorMessage(
                  error,
                  mode === 'auto' ? 'Auto-save failed.' : 'Failed to save category count.'
                )
        }
      }));
    }
  }

  async function persistHighlights(mode: 'auto' | 'manual') {
    if (isReadOnly) {
      return;
    }

    if (highlightTimer.current) {
      clearTimeout(highlightTimer.current);
      highlightTimer.current = null;
    }

    const parsed = serializeHighlights(highlightsRef.current);

    if (!parsed.ok) {
      setHighlightMeta((current) => ({
        ...current,
        saveState: 'error',
        saveError: parsed.error
      }));
      return;
    }

    setHighlightMeta((current) => ({
      ...current,
      saveState: 'saving',
      saveError: null
    }));

    try {
      await saveQuestionHighlights(brandId, periodId, parsed.payload);
      setHighlightMeta((current) => ({
        ...current,
        dirty: false,
        saveState: 'saved',
        saveError: null,
        savedAt: Date.now()
      }));
      scheduleRefresh();
    } catch (error) {
      setHighlightMeta((current) => ({
        ...current,
        saveState: 'error',
        saveError:
          error instanceof Error
            ? error.message
            : parseErrorMessage(
                error,
                mode === 'auto' ? 'Auto-save failed.' : 'Failed to save highlights.'
              )
      }));
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="outline">Monthly insight questions</Badge>
        <Badge variant="outline">
          Categories complete: {completedCount}/{requiredCount}
        </Badge>
        <Badge variant="outline">Highlight screenshots: {highlightFilledCount}</Badge>
        <Badge variant="outline">{isReadOnly ? 'Read-only (reviewer)' : 'Auto-save enabled'}</Badge>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <h1 className="font-serif text-5xl leading-none tracking-[-0.06em]">
            Questions for {monthLabel}
          </h1>
          <p className="max-w-3xl text-base leading-7 text-muted-foreground">
            Step 1 records question count by category for charts. Step 2 captures highlight screenshots and an optional free-form note for presentation slides.
          </p>
        </div>
        <div className="inline-flex items-center gap-3 rounded-2xl border border-border/60 bg-background/90 px-3 py-2">
          <span className="text-xs text-muted-foreground">{globalSaveStatusText}</span>
          {!isReadOnly ? (
            <Button
              disabled={isSavingAnything}
              onClick={() => {
                void persistAllSections('manual');
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

      <Card>
        <CardHeader>
          <CardTitle>Step 1: Category count input</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-background/60">
            <div className="hidden grid-cols-[minmax(240px,1fr)_minmax(360px,1.2fr)_140px_220px] gap-3 border-b border-border/60 bg-background/80 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground md:grid">
              <div>Category</div>
              <div>Monthly mode</div>
              <div>Question count</div>
              <div>Status</div>
            </div>

            {items.length === 0 ? (
              <div className="px-4 py-5 text-sm text-muted-foreground">
                No question categories assigned.
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {items.map((item) => {
                  const activationId = item.activation.id;
                  const draft = draftByActivation[activationId] ?? toDraft(item);
                  const meta = metaByActivation[activationId] ?? createDefaultSaveMeta();
                  const complete = isComplete(draft);
                  const currentIndex = activationIndexById[activationId] ?? -1;

                  return (
                    <div
                      className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(240px,1fr)_minmax(360px,1.2fr)_140px_220px] md:items-center"
                      key={activationId}
                    >
                      <div className="space-y-1">
                        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground md:hidden">
                          Category
                        </div>
                        <div className="text-sm font-medium text-foreground">{item.question.text}</div>
                      </div>

                      <div className="space-y-1">
                        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground md:hidden">
                          Monthly mode
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <button
                            className={`rounded-2xl border px-3 py-2 text-left text-sm transition ${
                              draft.mode === 'has_questions'
                                ? 'border-primary/40 bg-primary/10 text-foreground'
                                : 'border-border/60 bg-background/70 text-muted-foreground'
                            }`}
                            disabled={isReadOnly}
                            onClick={() =>
                              updateDraft(activationId, (current) => ({
                                ...current,
                                mode: 'has_questions',
                                questionCount:
                                  Number(current.questionCount) >= 1 ? current.questionCount : ''
                              }))
                            }
                            type="button"
                          >
                            <span className="inline-flex items-center gap-2">
                              {draft.mode === 'has_questions' ? (
                                <CheckCircle2 className="size-4 text-primary" />
                              ) : (
                                <Circle className="size-4 text-muted-foreground" />
                              )}
                              Has questions
                            </span>
                          </button>
                          <button
                            className={`rounded-2xl border px-3 py-2 text-left text-sm transition ${
                              draft.mode === 'no_questions'
                                ? 'border-primary/40 bg-primary/10 text-foreground'
                                : 'border-border/60 bg-background/70 text-muted-foreground'
                            }`}
                            disabled={isReadOnly}
                            onClick={() =>
                              updateDraft(activationId, (current) => ({
                                ...current,
                                mode: 'no_questions',
                                questionCount: '0'
                              }))
                            }
                            type="button"
                          >
                            <span className="inline-flex items-center gap-2">
                              {draft.mode === 'no_questions' ? (
                                <CheckCircle2 className="size-4 text-primary" />
                              ) : (
                                <Circle className="size-4 text-muted-foreground" />
                              )}
                              No questions
                            </span>
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground md:hidden">
                          Question count
                        </div>
                        <Input
                          disabled={isReadOnly || draft.mode === 'no_questions'}
                          inputMode="numeric"
                          onChange={(event) => {
                            const value = event.currentTarget.value;
                            const sanitizedValue = value.replace(/[^\d]/g, '');

                            updateDraft(activationId, (current) => ({
                              ...current,
                              questionCount: sanitizedValue
                            }));
                          }}
                          onKeyDown={(event) => {
                            if (currentIndex < 0) {
                              return;
                            }

                            if (event.key === 'Enter' || event.key === 'ArrowDown') {
                              event.preventDefault();
                              focusCountInputByActivationIndex(currentIndex + 1);
                            } else if (event.key === 'ArrowUp') {
                              event.preventDefault();
                              focusCountInputByActivationIndex(currentIndex - 1);
                            }
                          }}
                          placeholder={draft.mode === 'no_questions' ? '0' : 'Required'}
                          ref={(element) => {
                            countInputRefs.current[activationId] = element;
                          }}
                          type="text"
                          value={draft.mode === 'no_questions' ? '0' : draft.questionCount}
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground md:hidden">
                          Status
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{complete ? 'Complete' : 'Incomplete'}</Badge>
                        </div>
                        {meta.saveState === 'error' && meta.saveError ? (
                          <div className="text-xs text-rose-600 dark:text-rose-300">{meta.saveError}</div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Tip: In Question count, press Enter or Arrow Down to jump to next row, Arrow Up to go back.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Step 2: Highlight screenshots (not tied to category)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {highlightMeta.saveState === 'error' && highlightMeta.saveError ? (
            <div className="rounded-2xl border border-rose-500/25 bg-rose-500/8 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
              {highlightMeta.saveError}
            </div>
          ) : null}

          <div className="space-y-2">
            <label className="text-sm font-medium">Rich note (optional)</label>
            <Textarea
              className="min-h-36 w-full rounded-2xl border border-input bg-background/70 px-4 py-3 text-sm text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
              disabled={isReadOnly}
              onChange={(event) => {
                const value = event.currentTarget.value;
                updateHighlights((current) => ({
                  ...current,
                  note: value
                }));
              }}
              placeholder="Write bullet points, summary, translation, or leave blank."
              value={highlightDraft.note}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <label className="text-sm font-medium">
                Highlight screenshots ({highlightFilledCount}/{MAX_HIGHLIGHT_SHOTS})
              </label>
              {!isReadOnly ? (
                <Button
                  disabled={highlightDraft.screenshots.length >= MAX_HIGHLIGHT_SHOTS}
                  onClick={addHighlightScreenshot}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <ImagePlus />
                  Add screenshot
                </Button>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {highlightDraft.screenshots.map((screenshot, index) => (
                <div
                  className="space-y-2 rounded-2xl border border-border/60 bg-background/55 p-3"
                  key={`highlight-shot-${index}`}
                >
                  <ImageUploadField
                    disabled={isReadOnly}
                    hideControlsWhenDisabled={isReadOnly}
                    onChange={(value) => {
                      updateHighlights((current) => ({
                        ...current,
                        screenshots: current.screenshots.map((item, itemIndex) =>
                          itemIndex === index ? value : item
                        )
                      }));
                    }}
                    placeholderLabel={`Highlight ${index + 1}`}
                    previewAlt={`Question highlight screenshot ${index + 1}`}
                    previewAspectRatio="16/9"
                    previewFit="contain"
                    scope="questions"
                    value={screenshot}
                  />
                  {!isReadOnly ? (
                    <Button
                      onClick={() => removeHighlightScreenshot(index)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <Trash2 />
                      Remove
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            Highlight screenshots are independent from category counts by design.
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        {!readyState ? (
          <Card className="border-amber-500/25 bg-amber-500/8">
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <ShieldAlert className="text-amber-700 dark:text-amber-300" />
                What still blocks review
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-6 text-amber-700 dark:text-amber-300">
              Complete question count for all assigned categories in {monthLabel}.
            </CardContent>
          </Card>
        ) : (
          <Card className="border-emerald-500/25 bg-emerald-500/8">
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <CheckCircle2 className="text-emerald-700 dark:text-emerald-300" />
                Question section ready
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-6 text-emerald-700 dark:text-emerald-300">
              Every active question category has monthly count input.
            </CardContent>
          </Card>
        )}

        {requiredCount === 0 ? (
          <Card className="border-amber-500/25 bg-amber-500/8">
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <AlertCircle className="text-amber-700 dark:text-amber-300" />
                No question categories assigned
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-6 text-amber-700 dark:text-amber-300">
              Ask a workspace manager to assign question categories for this brand in Brand Administration.
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
