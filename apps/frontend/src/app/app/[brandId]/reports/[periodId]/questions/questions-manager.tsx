'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  CircleHelp,
  ImagePlus,
  LoaderCircle,
  Save,
  ShieldAlert,
  Trash2,
  X
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ImageUploadField } from '@/components/ui/image-upload-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useDebouncedRefresh } from '@/hooks/use-debounced-refresh';
import type { QuestionOverviewResponse } from '@/lib/reporting-api';
import { saveQuestionEntry, saveQuestionHighlights } from '@/lib/reporting-api';
import { ReportSectionHeader } from '../report-section-header';

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
  relatedProductBreakdown: Array<{
    relatedProductOptionId: string;
    questionCount: string;
  }>;
};

type DraftHighlights = {
  note: string;
  noteOptional: boolean;
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
const MIN_HIGHLIGHT_SHOTS = 1;
const MAX_NOTE_LENGTH = 280;
const NO_QUESTIONS_HIGHLIGHT_NOTE = 'No questions this month.';

function ensureAtLeastOneScreenshotSlot(values: string[]) {
  return values.length >= MIN_HIGHLIGHT_SHOTS ? values : [''];
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
    questionCount: defaultQuestionCount,
    relatedProductBreakdown: (item.entry.relatedProductBreakdown ?? []).map(entry => ({
      relatedProductOptionId: entry.relatedProductOptionId,
      questionCount: String(entry.questionCount)
    }))
  };
}

function toHighlightDraft(
  highlights: QuestionOverviewResponse['highlights']
): DraftHighlights {
  return {
    note: highlights.note ?? '',
    noteOptional: highlights.noteOptional,
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

function sumRelatedProductBreakdown(draft: DraftEntry) {
  return draft.relatedProductBreakdown.reduce((sum, item) => {
    const count = Number(item.questionCount);
    return Number.isInteger(count) && count > 0 ? sum + count : sum;
  }, 0);
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
        questionCount: 0,
        relatedProductBreakdown: []
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

  const seenProductIds = new Set<string>();
  const relatedProductBreakdown: Array<{
    relatedProductOptionId: string;
    questionCount: number;
  }> = [];
  for (const item of draft.relatedProductBreakdown) {
    if (!item.relatedProductOptionId && !item.questionCount.trim()) {
      continue;
    }

    const count = Number(item.questionCount);
    if (!item.relatedProductOptionId) {
      return {
        ok: false as const,
        error: 'Choose a related product for every breakdown row.'
      };
    }
    if (seenProductIds.has(item.relatedProductOptionId)) {
      return {
        ok: false as const,
        error: 'Related product breakdown cannot contain duplicate products.'
      };
    }
    seenProductIds.add(item.relatedProductOptionId);
    if (!Number.isInteger(count) || count <= 0) {
      return {
        ok: false as const,
        error: 'Related product breakdown counts must be whole numbers greater than 0.'
      };
    }
    relatedProductBreakdown.push({
      relatedProductOptionId: item.relatedProductOptionId,
      questionCount: count
    });
  }
  const breakdownTotal = relatedProductBreakdown.reduce((sum, item) => sum + item.questionCount, 0);
  if (breakdownTotal > questionCount) {
    return {
      ok: false as const,
      error: 'Related product breakdown total cannot exceed the category question count.'
    };
  }

  return {
    ok: true as const,
    payload: {
      mode: 'has_questions' as const,
      questionCount,
      relatedProductBreakdown
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
      note: draft.noteOptional ? null : draft.note.trim() || null,
      noteOptional: draft.noteOptional,
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
  const [openDescriptionActivationId, setOpenDescriptionActivationId] = useState<string | null>(
    null
  );
  const [openProductBreakdownActivationIds, setOpenProductBreakdownActivationIds] = useState<
    Record<string, boolean>
  >({});
  const [relatedProductOptions, setRelatedProductOptions] = useState(
    initialOverview.relatedProductOptions ?? []
  );
  const activeRelatedProductOptions = useMemo(
    () => relatedProductOptions.filter(option => option.status === 'active'),
    [relatedProductOptions]
  );

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
    setRelatedProductOptions(initialOverview.relatedProductOptions ?? []);
  }, [initialOverview.relatedProductOptions]);

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

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpenDescriptionActivationId(null);
      }
    }

    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
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
  const highlightFilledCount = highlightDraft.screenshots.filter(
    (item) => item.trim().length > 0
  ).length;
  const allCategoriesHaveNoQuestions =
    requiredCount > 0 &&
    items.every((item) => {
      const draft = draftByActivation[item.activation.id] ?? toDraft(item);
      return draft.mode === 'no_questions';
    });
  const highlightNoteFilled = highlightDraft.note.trim().length > 0;
  const highlightNoteSatisfied =
    allCategoriesHaveNoQuestions || highlightDraft.noteOptional || highlightNoteFilled;
  const highlightScreenshotsSatisfied =
    allCategoriesHaveNoQuestions || highlightFilledCount >= MIN_HIGHLIGHT_SHOTS;
  const readyState =
    requiredCount > 0 &&
    completedCount === requiredCount &&
    highlightScreenshotsSatisfied &&
    highlightNoteSatisfied;
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
  const isHighlightSectionDisabled = isReadOnly || allCategoriesHaveNoQuestions;
  const isHighlightNoteDisabled = isHighlightSectionDisabled || highlightDraft.noteOptional;
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

  useEffect(() => {
    if (!allCategoriesHaveNoQuestions || isReadOnly) {
      return;
    }

    const current = highlightsRef.current;
    const shouldSetDefaultNote = current.note.trim().length === 0;
    const hasScreenshotsToClear = current.screenshots.some(
      (screenshot) => screenshot.trim().length > 0
    );
    const shouldResetOptional = current.noteOptional;

    if (!shouldSetDefaultNote && !hasScreenshotsToClear && !shouldResetOptional) {
      return;
    }

    const nextDraft = {
      ...current,
      noteOptional: false,
      note: shouldSetDefaultNote ? NO_QUESTIONS_HIGHLIGHT_NOTE : current.note,
      screenshots: []
    };
    setHighlightDraft((draft) => ({
      ...draft,
      ...nextDraft
    }));
    highlightsRef.current = nextDraft;
    setHighlightMeta((meta) => ({
      ...meta,
      dirty: true,
      saveState: 'idle',
      saveError: null
    }));
    queueHighlightAutosave();
  }, [allCategoriesHaveNoQuestions, isReadOnly]);

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

  function clearDefaultNoQuestionsHighlightNote() {
    const current = highlightsRef.current;
    if (current.note.trim() !== NO_QUESTIONS_HIGHLIGHT_NOTE) {
      return;
    }

    setHighlightDraft((draft) => ({
      ...draft,
      note: ''
    }));
    highlightsRef.current = {
      ...current,
      note: ''
    };
    setHighlightMeta((meta) => ({
      ...meta,
      dirty: true,
      saveState: 'idle',
      saveError: null
    }));
    queueHighlightAutosave();
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
      if (current.screenshots.length <= MIN_HIGHLIGHT_SHOTS) {
        return current;
      }

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
                  relatedProductBreakdown:
                    parsed.payload.relatedProductBreakdown?.map((entry, index) => {
                      const option =
                        relatedProductOptions.find(
                          candidateOption => candidateOption.id === entry.relatedProductOptionId
                        ) ?? null;
                      return {
                        id: `draft-${entry.relatedProductOptionId}`,
                        relatedProductOptionId: entry.relatedProductOptionId,
                        valueKey: option?.valueKey ?? '',
                        label: option?.label ?? 'Related product',
                        questionCount: entry.questionCount,
                        displayOrder: index + 1
                      };
                    }) ?? [],
                  otherUnspecifiedCount: Math.max(
                    0,
                    parsed.payload.questionCount - sumRelatedProductBreakdown(draft)
                  ),
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
    <div className="space-y-6">
      <ReportSectionHeader
        actions={
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
        }
        badges={
          <>
            <Badge variant="outline">Monthly insight questions</Badge>
            <Badge variant="outline">
              Categories complete: {completedCount}/{requiredCount}
            </Badge>
            <Badge variant="outline">
              Highlight screenshots: {allCategoriesHaveNoQuestions ? 'not required' : highlightFilledCount}
            </Badge>
            {!isReadOnly ? <Badge variant="outline">Auto-save enabled</Badge> : null}
          </>
        }
        description="Step 1 records question count by category for charts. Step 2 captures highlight screenshots when this month has questions."
        title={`Questions for ${monthLabel}`}
      />

      <Card className={`relative ${openDescriptionActivationId ? 'z-50' : 'z-0'}`}>
        <CardHeader>
          <CardTitle>Step 1: Category count input</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl border border-border/60 bg-background/60">
            <div className="hidden grid-cols-[minmax(240px,1fr)_minmax(240px,0.75fr)_minmax(320px,1fr)_120px] gap-3 border-b border-border/60 bg-background/80 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground md:grid">
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
                  const totalQuestionCount = Number(draft.questionCount);
                  const safeTotalQuestionCount =
                    Number.isInteger(totalQuestionCount) && totalQuestionCount >= 0
                      ? totalQuestionCount
                      : 0;
                  const breakdownTotal = sumRelatedProductBreakdown(draft);
                  const otherUnspecifiedCount = Math.max(
                    0,
                    safeTotalQuestionCount - breakdownTotal
                  );
                  const selectedProductIds = new Set(
                    draft.relatedProductBreakdown
                      .map(entry => entry.relatedProductOptionId)
                      .filter(Boolean)
                  );
                  const hasProductBreakdown = draft.relatedProductBreakdown.length > 0;
                  const isProductBreakdownOpen =
                    draft.mode === 'has_questions' &&
                    (openProductBreakdownActivationIds[activationId] ?? hasProductBreakdown);

                  return (
                    <div
                      className={`relative grid gap-3 px-4 py-4 md:grid-cols-[minmax(240px,1fr)_minmax(240px,0.75fr)_minmax(320px,1fr)_120px] md:items-center ${
                        openDescriptionActivationId === activationId ? 'z-40' : 'z-0'
                      }`}
                      key={activationId}
                    >
                      <div className="space-y-1">
                        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground md:hidden">
                          Category
                        </div>
                        <div className="relative flex min-w-0 items-center gap-2">
                          <div className="min-w-0 text-sm font-medium text-foreground">
                            {item.question.text}
                          </div>
                          {item.question.description ? (
                            <div className="relative shrink-0">
                              <button
                                aria-label={`Show guidance for ${item.question.text}`}
                                className="inline-flex size-7 items-center justify-center rounded-full border border-border/60 bg-background/70 text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
                                onClick={() =>
                                  setOpenDescriptionActivationId((current) =>
                                    current === activationId ? null : activationId
                                  )
                                }
                                type="button"
                              >
                                <CircleHelp className="size-4" />
                              </button>
                              {openDescriptionActivationId === activationId ? (
                                <div
                                  className="absolute left-0 top-full z-30 mt-2 max-h-[min(360px,calc(100vh-160px))] w-[min(360px,calc(100vw-48px))] overflow-y-auto rounded-2xl border border-border/70 bg-popover p-4 text-popover-foreground shadow-xl"
                                  role="dialog"
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                                        When to use
                                      </div>
                                      <div className="mt-1 text-sm font-semibold text-foreground">
                                        {item.question.text}
                                      </div>
                                    </div>
                                    <button
                                      aria-label="Close guidance"
                                      className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition hover:text-foreground"
                                      onClick={() => setOpenDescriptionActivationId(null)}
                                      type="button"
                                    >
                                      <X className="size-4" />
                                    </button>
                                  </div>
                                  <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">
                                    {item.question.description}
                                  </p>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground md:hidden">
                          Monthly mode
                        </div>
                        <div className="grid h-10 grid-cols-2 overflow-hidden rounded-2xl border border-border/60 bg-background/70">
                          <button
                            className={`px-3 text-left text-sm transition ${
                              draft.mode === 'has_questions'
                                ? 'bg-primary/10 text-foreground'
                                : 'text-muted-foreground'
                            }`}
                            disabled={isReadOnly}
                            onClick={() => {
                              clearDefaultNoQuestionsHighlightNote();
                              updateDraft(activationId, (current) => ({
                                ...current,
                                mode: 'has_questions',
                                questionCount:
                                  Number(current.questionCount) >= 1 ? current.questionCount : ''
                              }));
                            }}
                            type="button"
                          >
                            <span className="inline-flex items-center gap-2">
                              {draft.mode === 'has_questions' ? (
                                <CheckCircle2 className="size-4 text-primary" />
                              ) : (
                                <Circle className="size-4 text-muted-foreground" />
                              )}
                              Has
                            </span>
                          </button>
                          <button
                            className={`border-l border-border/60 px-3 text-left text-sm transition ${
                              draft.mode === 'no_questions'
                                ? 'bg-primary/10 text-foreground'
                                : 'text-muted-foreground'
                            }`}
                            disabled={isReadOnly}
                            onClick={() =>
                              updateDraft(activationId, (current) => ({
                                ...current,
                                mode: 'no_questions',
                                questionCount: '0',
                                relatedProductBreakdown: []
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
                              None
                            </span>
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground md:hidden">
                          Question count
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            className="min-w-0 flex-1"
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
                          {draft.mode === 'has_questions' ? (
                            <Button
                              className="shrink-0 whitespace-nowrap"
                              disabled={isReadOnly && !hasProductBreakdown}
                              onClick={() => {
                                if (hasProductBreakdown) {
                                  setOpenProductBreakdownActivationIds((current) => ({
                                    ...current,
                                    [activationId]: !isProductBreakdownOpen
                                  }));
                                  return;
                                }

                                updateDraft(activationId, (current) => ({
                                  ...current,
                                  relatedProductBreakdown: [
                                    ...current.relatedProductBreakdown,
                                    {
                                      relatedProductOptionId: '',
                                      questionCount: ''
                                    }
                                  ]
                                }));
                                setOpenProductBreakdownActivationIds((current) => ({
                                  ...current,
                                  [activationId]: true
                                }));
                              }}
                              size="sm"
                              type="button"
                              variant="outline"
                            >
                              {hasProductBreakdown
                                ? `Products ${breakdownTotal}/${safeTotalQuestionCount}`
                                : 'Add product'}
                            </Button>
                          ) : null}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground md:hidden">
                          Status
                        </div>
                        <div className="flex flex-wrap items-center gap-2 md:justify-start">
                          <Badge variant="outline">{complete ? 'Complete' : 'Incomplete'}</Badge>
                          </div>
                        {meta.saveState === 'error' && meta.saveError ? (
                          <div className="text-xs text-rose-600 dark:text-rose-300">{meta.saveError}</div>
                        ) : null}
                      </div>

                      {isProductBreakdownOpen ? (
                        <div className="space-y-3 rounded-2xl border border-border/60 bg-background/45 p-3 md:col-span-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-medium text-foreground">
                                Related product breakdown
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Assigned {breakdownTotal}/{safeTotalQuestionCount} • Other/Unspecified {otherUnspecifiedCount}
                              </div>
                            </div>
                            {!isReadOnly ? (
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  disabled={breakdownTotal <= 0}
                                  onClick={() =>
                                    updateDraft(activationId, (current) => ({
                                      ...current,
                                      questionCount: String(sumRelatedProductBreakdown(current))
                                    }))
                                  }
                                  size="sm"
                                  type="button"
                                  variant="outline"
                                >
                                  Use total
                                </Button>
                                <Button
                                  disabled={
                                    activeRelatedProductOptions.length === 0 ||
                                    activeRelatedProductOptions.every(option =>
                                      selectedProductIds.has(option.id)
                                    )
                                  }
                                  onClick={() =>
                                    updateDraft(activationId, (current) => ({
                                      ...current,
                                      relatedProductBreakdown: [
                                        ...current.relatedProductBreakdown,
                                        {
                                          relatedProductOptionId: '',
                                          questionCount: ''
                                        }
                                      ]
                                    }))
                                  }
                                  size="sm"
                                  type="button"
                                  variant="outline"
                                >
                                  Add product
                                </Button>
                              </div>
                            ) : null}
                          </div>
                          {draft.relatedProductBreakdown.length === 0 ? (
                            <div className="text-xs text-muted-foreground">
                              No product breakdown added. The full count is treated as Other/Unspecified.
                            </div>
                          ) : (
                            <div className="grid gap-2">
                              {draft.relatedProductBreakdown.map((entry, productIndex) => (
                                <div
                                  className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_120px_auto]"
                                  key={`${activationId}-product-${productIndex}`}
                                >
                                  <Select
                                    disabled={isReadOnly}
                                    onChange={event => {
                                      const nextProductId = event.currentTarget.value;
                                      updateDraft(activationId, (current) => ({
                                        ...current,
                                        relatedProductBreakdown: current.relatedProductBreakdown.map(
                                          (candidate, index) =>
                                            index === productIndex
                                              ? {
                                                  ...candidate,
                                                  relatedProductOptionId: nextProductId
                                                }
                                              : candidate
                                        )
                                      }));
                                    }}
                                    value={entry.relatedProductOptionId}
                                  >
                                    <option value="">Choose product...</option>
                                    {relatedProductOptions.map(option => {
                                      const disabled =
                                        option.status !== 'active'
                                          ? option.id !== entry.relatedProductOptionId
                                          : selectedProductIds.has(option.id) &&
                                            option.id !== entry.relatedProductOptionId;
                                      return (
                                        <option disabled={disabled} key={option.id} value={option.id}>
                                          {option.status === 'active'
                                            ? option.label
                                            : `${option.label} (deprecated)`}
                                        </option>
                                      );
                                    })}
                                  </Select>
                                  <Input
                                    disabled={isReadOnly}
                                    inputMode="numeric"
                                    onChange={event => {
                                      const value = event.currentTarget.value.replace(/[^\d]/g, '');
                                      updateDraft(activationId, (current) => ({
                                        ...current,
                                        relatedProductBreakdown: current.relatedProductBreakdown.map(
                                          (candidate, index) =>
                                            index === productIndex
                                              ? {
                                                  ...candidate,
                                                  questionCount: value
                                                }
                                              : candidate
                                        )
                                      }));
                                    }}
                                    placeholder="Count"
                                    type="text"
                                    value={entry.questionCount}
                                  />
                                  {!isReadOnly ? (
                                    <Button
                                      onClick={() => {
                                        if (draft.relatedProductBreakdown.length <= 1) {
                                          setOpenProductBreakdownActivationIds((current) => ({
                                            ...current,
                                            [activationId]: false
                                          }));
                                        }
                                        updateDraft(activationId, (current) => ({
                                          ...current,
                                          relatedProductBreakdown:
                                            current.relatedProductBreakdown.filter(
                                              (_, index) => index !== productIndex
                                            )
                                        }));
                                      }}
                                      size="sm"
                                      type="button"
                                      variant="outline"
                                    >
                                      <Trash2 className="size-4" />
                                      Remove
                                    </Button>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : null}
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
          {allCategoriesHaveNoQuestions ? (
            <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/8 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
              All categories are marked as no questions this month, so highlight screenshots are not required.
            </div>
          ) : null}

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="text-sm font-medium">
                Rich note {allCategoriesHaveNoQuestions || highlightDraft.noteOptional ? '(optional)' : '(required)'}
              </label>
              {!allCategoriesHaveNoQuestions ? (
                <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    checked={highlightDraft.noteOptional}
                    className="size-4"
                    disabled={isReadOnly}
                    onChange={event => {
                      const nextOptional = event.currentTarget.checked;
                      updateHighlights((current) => ({
                        ...current,
                        noteOptional: nextOptional,
                        note: nextOptional ? '' : current.note
                      }));
                    }}
                    type="checkbox"
                  />
                  Mark note as optional
                </label>
              ) : null}
            </div>
            <Textarea
              className="min-h-36 w-full rounded-2xl border border-input bg-background/70 px-4 py-3 text-sm text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
              disabled={isHighlightNoteDisabled}
              maxLength={MAX_NOTE_LENGTH}
              onChange={(event) => {
                const value = event.currentTarget.value.slice(0, MAX_NOTE_LENGTH);
                updateHighlights((current) => ({
                  ...current,
                  note: value
                }));
              }}
              placeholder={
                allCategoriesHaveNoQuestions
                  ? NO_QUESTIONS_HIGHLIGHT_NOTE
                  : highlightDraft.noteOptional
                    ? 'Rich note is marked optional for this report.'
                  : 'Write bullet points, summary, translation, or leave blank.'
              }
              value={highlightDraft.note}
            />
            <div className="text-xs text-muted-foreground">
              {highlightDraft.note.length}/{MAX_NOTE_LENGTH}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <label className="text-sm font-medium">
                Highlight screenshots ({highlightFilledCount}/{MAX_HIGHLIGHT_SHOTS})
              </label>
              {!isReadOnly ? (
                <Button
                  disabled={
                    isHighlightSectionDisabled ||
                    highlightDraft.screenshots.length >= MAX_HIGHLIGHT_SHOTS
                  }
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

            {!allCategoriesHaveNoQuestions ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {highlightDraft.screenshots.map((screenshot, index) => (
                  <div
                    className="space-y-2 rounded-2xl border border-border/60 bg-background/55 p-3"
                    key={`highlight-shot-${index}`}
                  >
                    <ImageUploadField
                      disabled={isHighlightSectionDisabled}
                      hideControlsWhenDisabled={isHighlightSectionDisabled}
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
                        disabled={highlightDraft.screenshots.length <= MIN_HIGHLIGHT_SHOTS}
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
            ) : null}
          </div>

          <div className="text-xs text-muted-foreground">
            {allCategoriesHaveNoQuestions
              ? 'No-question months can be submitted without highlight screenshots.'
              : 'Highlight screenshots are independent from category counts by design.'}
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
              {completedCount !== requiredCount
                ? `Complete question count for all assigned categories in ${monthLabel}.`
                : !highlightScreenshotsSatisfied
                  ? 'Add at least 1 highlight screenshot.'
                  : !highlightNoteSatisfied
                    ? 'Add a rich note or mark it optional.'
                    : `Complete question monitoring for ${monthLabel}.`}
            </CardContent>
          </Card>
        ) : null}

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
