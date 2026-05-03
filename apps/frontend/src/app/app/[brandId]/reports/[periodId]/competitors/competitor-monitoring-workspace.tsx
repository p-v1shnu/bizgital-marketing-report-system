'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Circle,
  CheckCircle2,
  ExternalLink,
  LoaderCircle,
  MinusCircle,
  PlusCircle,
  Save
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ImageUploadField } from '@/components/ui/image-upload-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useDebouncedRefresh } from '@/hooks/use-debounced-refresh';
import type {
  CompetitorMonitoringStatus,
  CompetitorOverviewResponse
} from '@/lib/reporting-api';
import { ReportSectionHeader } from '../report-section-header';

type Props = {
  brandId: string;
  periodId: string;
  monthLabel: string;
  initialOverview: CompetitorOverviewResponse;
  isReadOnly: boolean;
};

type DraftPost = {
  id: string;
  screenshotUrl: string;
  postUrl: string;
};

type Draft = {
  status: CompetitorMonitoringStatus | '';
  followerCount: string;
  monthlyPostCount: string;
  highlightNote: string;
  noActivityEvidenceImageUrl: string;
  posts: DraftPost[];
};

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

type Row = {
  assignment: CompetitorOverviewResponse['items'][number]['assignment'];
  competitor: CompetitorOverviewResponse['items'][number]['competitor'];
  draft: Draft;
  saveState: SaveState;
  saveError: string | null;
  dirty: boolean;
  savedAt: number | null;
};

type Completion = {
  hasFollower: boolean;
  hasStatus: boolean;
  hasEvidence: boolean;
  isComplete: boolean;
};

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api';
const MAX_POSTS = 5;
const MIN_POSTS = 1;
const AUTOSAVE_MS = 1000;

function buildEmptyPost(id: string): DraftPost {
  return {
    id,
    screenshotUrl: '',
    postUrl: ''
  };
}

function buildDefaultPosts(seed: string) {
  return Array.from({ length: MIN_POSTS }, (_, index) =>
    buildEmptyPost(`${seed}-post-${index + 1}`)
  );
}

function resetPostDrafts(posts: DraftPost[], seed: string) {
  if (posts.length === 0) {
    return buildDefaultPosts(seed);
  }

  return posts.map((post, index) => ({
    id: post.id || `${seed}-post-${index + 1}`,
    screenshotUrl: '',
    postUrl: ''
  }));
}

function hasPostModeDraftContent(draft: Draft) {
  return (
    draft.monthlyPostCount.trim().length > 0 ||
    draft.highlightNote.trim().length > 0 ||
    draft.posts.some(
      (post) => post.screenshotUrl.trim().length > 0 || post.postUrl.trim().length > 0
    )
  );
}

function hasNoPostModeDraftContent(draft: Draft) {
  return (
    draft.highlightNote.trim().length > 0 ||
    draft.noActivityEvidenceImageUrl.trim().length > 0
  );
}

function buildModeSwitchConfirmationMessage(
  draft: Draft,
  nextStatus: CompetitorMonitoringStatus
) {
  if (draft.status === 'has_posts' && nextStatus === 'no_activity' && hasPostModeDraftContent(draft)) {
    return 'Switch to "No posts this month"? This will clear total post count, post screenshots, post URLs, and highlight note.';
  }

  if (
    draft.status === 'no_activity' &&
    nextStatus === 'has_posts' &&
    hasNoPostModeDraftContent(draft)
  ) {
    return 'Switch to "Has posts this month"? This will clear the no-post note and evidence screenshot.';
  }

  return null;
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

function normalize(text: string) {
  const value = text.trim();
  return value.length > 0 ? value : null;
}

function toDraft(item: CompetitorOverviewResponse['items'][number]): Draft {
  const status: CompetitorMonitoringStatus | '' = item.monitoring.status ?? 'has_posts';
  const posts =
    item.monitoring.posts.length > 0
      ? item.monitoring.posts.map((post) => ({
          id: post.id,
          screenshotUrl: post.screenshotUrl,
          postUrl: post.postUrl ?? ''
        }))
      : status === 'has_posts'
        ? buildDefaultPosts(item.competitor.id)
        : [];

  return {
    status,
    followerCount:
      item.monitoring.followerCount === null
        ? ''
        : String(item.monitoring.followerCount),
    monthlyPostCount:
      item.monitoring.monthlyPostCount === null
        ? ''
        : String(item.monitoring.monthlyPostCount),
    highlightNote: item.monitoring.highlightNote ?? '',
    noActivityEvidenceImageUrl: item.monitoring.noActivityEvidenceImageUrl ?? '',
    posts
  };
}

function evaluateWithRequirement(draft: Draft, isRequired: boolean): Completion {
  if (!isRequired) {
    return {
      hasFollower: true,
      hasStatus: true,
      hasEvidence: true,
      isComplete: true
    };
  }

  const follower = draft.followerCount.trim();
  const followerNum = follower ? Number(follower) : NaN;
  const hasFollower =
    follower.length > 0 && Number.isInteger(followerNum) && followerNum >= 0;
  const hasStatus = draft.status === 'has_posts' || draft.status === 'no_activity';
  let hasEvidence = false;

  if (draft.status === 'has_posts') {
    const validCount = draft.posts.filter((post) => post.screenshotUrl.trim()).length;
    const monthlyPost = draft.monthlyPostCount.trim();
    const monthlyPostCount = monthlyPost ? Number(monthlyPost) : NaN;
    const hasMonthlyPostCount =
      monthlyPost.length > 0 &&
      Number.isInteger(monthlyPostCount) &&
      monthlyPostCount >= validCount;
    const hasHighlightNote = draft.highlightNote.trim().length > 0;
    hasEvidence =
      validCount > 0 &&
      validCount <= MAX_POSTS &&
      hasMonthlyPostCount &&
      hasHighlightNote;
  }
  if (draft.status === 'no_activity') {
    hasEvidence =
      draft.highlightNote.trim().length > 0 &&
      draft.noActivityEvidenceImageUrl.trim().length > 0;
  }

  return {
    hasFollower,
    hasStatus,
    hasEvidence,
    isComplete: hasFollower && hasStatus && hasEvidence
  };
}

function serialize(draft: Draft) {
  const follower = draft.followerCount.trim();
  const followerCount = follower ? Number(follower) : null;
  if (follower && (!Number.isInteger(followerCount) || (followerCount ?? -1) < 0)) {
    return { ok: false as const, error: 'Follower count must be whole number.' };
  }

  const monthlyPost = draft.monthlyPostCount.trim();
  const monthlyPostCount = monthlyPost ? Number(monthlyPost) : null;
  if (
    monthlyPost &&
    (!Number.isInteger(monthlyPostCount) || (monthlyPostCount ?? -1) < 0)
  ) {
    return { ok: false as const, error: 'Monthly post count must be whole number.' };
  }

  if (draft.status === 'has_posts') {
    if (draft.posts.length > MAX_POSTS) {
      return { ok: false as const, error: `Maximum ${MAX_POSTS} posts per competitor.` };
    }

    const hasInvalid = draft.posts.some((post) => {
      const hasScreenshot = post.screenshotUrl.trim().length > 0;
      const hasOptional = normalize(post.postUrl);
      return !hasScreenshot && !!hasOptional;
    });
    if (hasInvalid) {
      return {
        ok: false as const,
        error: 'Post URL requires screenshot evidence.'
      };
    }

    if (monthlyPostCount === null) {
      return {
        ok: false as const,
        error: 'Monthly post count is required in has-posts mode.'
      };
    }

    if (!normalize(draft.highlightNote)) {
      return {
        ok: false as const,
        error: 'Highlight note is required in has-posts mode.'
      };
    }

    const highlightedPostCount = draft.posts.filter(
      (post) => post.screenshotUrl.trim().length > 0
    ).length;
    if (highlightedPostCount === 0) {
      return {
        ok: false as const,
        error: 'At least one highlighted post screenshot is required in has-posts mode.'
      };
    }
    if (
      monthlyPostCount !== null &&
      highlightedPostCount > monthlyPostCount
    ) {
      return {
        ok: false as const,
        error: 'Monthly post count cannot be lower than highlighted post screenshots.'
      };
    }

    return {
      ok: true as const,
      payload: {
        status: 'has_posts',
        followerCount,
        monthlyPostCount,
        highlightNote: normalize(draft.highlightNote),
        noActivityEvidenceImageUrl: null,
        posts: draft.posts
          .map((post, index) => ({
            displayOrder: index + 1,
            screenshotUrl: post.screenshotUrl.trim(),
            postUrl: normalize(post.postUrl)
          }))
          .filter((post) => post.screenshotUrl.length > 0)
      }
    };
  }

  if (draft.status === 'no_activity') {
    return {
      ok: true as const,
      payload: {
        status: 'no_activity',
        followerCount,
        monthlyPostCount: null,
        highlightNote: normalize(draft.highlightNote),
        noActivityEvidenceImageUrl: normalize(draft.noActivityEvidenceImageUrl),
        posts: []
      }
    };
  }

  return {
    ok: true as const,
    payload: {
      status: null,
      followerCount,
      monthlyPostCount: null,
      highlightNote: null,
      noActivityEvidenceImageUrl: null,
      posts: []
    }
  };
}

export function CompetitorMonitoringWorkspace({
  brandId,
  periodId,
  monthLabel,
  initialOverview,
  isReadOnly
}: Props) {
  const scheduleRefresh = useDebouncedRefresh(1200);
  const [rows, setRows] = useState<Row[]>(
    initialOverview.items.map((item) => ({
      assignment: item.assignment,
      competitor: item.competitor,
      draft: toDraft(item),
      saveState: 'idle',
      saveError: null,
      dirty: false,
      savedAt: null
    }))
  );
  const [activeId, setActiveId] = useState<string | null>(
    initialOverview.items.find(
      (item) => item.assignment.isRequired && !item.monitoring.isComplete
    )?.competitor.id ??
      initialOverview.items[0]?.competitor.id ??
      null
  );
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const rowsRef = useRef<Row[]>(rows);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    return () => {
      for (const timer of timers.current.values()) clearTimeout(timer);
      timers.current.clear();
    };
  }, []);

  const completions = useMemo(
    () =>
      new Map(
        rows.map((row) => [
          row.competitor.id,
          evaluateWithRequirement(row.draft, row.assignment.isRequired)
        ])
      ),
    [rows]
  );
  const requiredCount = rows.filter((row) => row.assignment.isRequired).length;
  const completeRequiredCount = rows.filter(
    (row) =>
      row.assignment.isRequired && completions.get(row.competitor.id)?.isComplete
  ).length;
  const active = rows.find((row) => row.competitor.id === activeId) ?? null;
  const activeCompletion = active ? completions.get(active.competitor.id) : null;
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

  function updateDraft(id: string, updater: (draft: Draft) => Draft) {
    if (isReadOnly) {
      return;
    }

    setRows((current) =>
      current.map((row) =>
        row.competitor.id === id
          ? { ...row, draft: updater(row.draft), dirty: true, saveState: 'idle', saveError: null }
          : row
      )
    );
    const existing = timers.current.get(id);
    if (existing) clearTimeout(existing);
    timers.current.set(
      id,
      setTimeout(() => {
        void persist(id, 'auto');
      }, AUTOSAVE_MS)
    );
  }

  async function persist(id: string, mode: 'auto' | 'manual') {
    if (isReadOnly) {
      return;
    }

    const existing = timers.current.get(id);
    if (existing) {
      clearTimeout(existing);
      timers.current.delete(id);
    }

    const row = rowsRef.current.find((item) => item.competitor.id === id);
    if (!row) return;

    const parsed = serialize(row.draft);
    if (!parsed.ok) {
      setRows((current) =>
        current.map((item) =>
          item.competitor.id === id
            ? { ...item, saveState: 'error', saveError: parsed.error }
            : item
        )
      );
      return;
    }

    setRows((current) =>
      current.map((item) =>
        item.competitor.id === id
          ? { ...item, saveState: 'saving', saveError: null }
          : item
      )
    );

    try {
      const response = await fetch(
        `${apiBase}/brands/${brandId}/reporting-periods/${periodId}/competitors/${id}/monitoring`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsed.payload)
        }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setRows((current) =>
          current.map((item) =>
            item.competitor.id === id
              ? {
                  ...item,
                  saveState: 'error',
                  saveError: parseMessage(payload, mode === 'auto' ? 'Auto-save failed.' : 'Save failed.')
                }
              : item
          )
        );
        return;
      }
      setRows((current) =>
        current.map((item) =>
          item.competitor.id === id
            ? { ...item, dirty: false, saveState: 'saved', saveError: null, savedAt: Date.now() }
            : item
        )
      );
      scheduleRefresh();
    } catch {
      setRows((current) =>
        current.map((item) =>
          item.competitor.id === id
            ? { ...item, saveState: 'error', saveError: 'Network error while saving.' }
            : item
        )
      );
    }
  }

  async function persistAllRows(mode: 'manual') {
    if (isReadOnly) {
      return;
    }

    for (const row of rowsRef.current) {
      await persist(row.competitor.id, mode);
    }
  }

  function switchActivityMode(
    competitorId: string,
    nextStatus: CompetitorMonitoringStatus
  ) {
    if (isReadOnly) {
      return;
    }

    const currentRow = rowsRef.current.find((row) => row.competitor.id === competitorId);
    if (!currentRow) {
      return;
    }

    if (currentRow.draft.status === nextStatus) {
      return;
    }

    const confirmationMessage = buildModeSwitchConfirmationMessage(
      currentRow.draft,
      nextStatus
    );
    if (confirmationMessage && !window.confirm(confirmationMessage)) {
      return;
    }

    updateDraft(competitorId, (draft) => {
      if (nextStatus === 'has_posts') {
        return {
          ...draft,
          status: 'has_posts',
          monthlyPostCount: '',
          highlightNote: '',
          noActivityEvidenceImageUrl: '',
          posts:
            draft.status === 'no_activity'
              ? resetPostDrafts(draft.posts, competitorId)
              : draft.posts.length > 0
                ? draft.posts
                : buildDefaultPosts(competitorId)
        };
      }

      return {
        ...draft,
        status: 'no_activity',
        monthlyPostCount: '',
        highlightNote: '',
        noActivityEvidenceImageUrl: '',
        posts:
          draft.status === 'has_posts'
            ? resetPostDrafts(draft.posts, competitorId)
            : draft.posts
      };
    });
  }

  return (
    <div className="space-y-6" data-testid="competitor-monitoring-workspace">
      <ReportSectionHeader
        actions={
          <div className="inline-flex items-center gap-3 rounded-2xl border border-border/60 bg-background/90 px-3 py-2">
            <span className="text-xs text-muted-foreground">{globalSaveStatusText}</span>
            {!isReadOnly ? (
              <Button
                disabled={isSavingAnything}
                onClick={() => {
                  void persistAllRows('manual');
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
            <Badge variant="outline">Monthly monitoring</Badge>
            <Badge variant="outline">
              {completeRequiredCount}/{requiredCount} required complete
            </Badge>
            {!isReadOnly ? <Badge variant="outline">Auto-save enabled</Badge> : null}
          </>
        }
        description="Track monthly competitor follower movement, choose activity mode, and attach evidence screenshots so the review team can capture slides quickly."
        title={`Competitor monitoring for ${monthLabel}`}
      />

      {rows.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            No active competitors are assigned for this year.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
          <Card>
            <CardHeader><CardTitle>Checklist</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {rows.map((row) => {
                const completion = completions.get(row.competitor.id)!;
                return (
                  <button
                    key={row.competitor.id}
                    type="button"
                    onClick={() => setActiveId(row.competitor.id)}
                    data-testid={`competitor-checklist-${row.competitor.id}`}
                    className={`w-full rounded-2xl border p-3 text-left ${
                      activeId === row.competitor.id ? 'border-primary/35 bg-primary/8' : 'border-border/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate text-sm font-medium">{row.competitor.name}</div>
                      <Badge variant="outline">
                        {!row.assignment.isRequired
                          ? 'Inactive'
                          : completion.isComplete
                            ? 'Complete'
                            : 'Incomplete'}
                      </Badge>
                    </div>
                    {row.saveState === 'saving' ? <div className="mt-1 text-xs text-muted-foreground">Saving...</div> : null}
                    {row.saveState === 'saved' && row.savedAt ? <div className="mt-1 text-xs text-muted-foreground">Saved {new Date(row.savedAt).toLocaleTimeString()}</div> : null}
                    {row.saveState === 'error' && row.saveError ? <div className="mt-1 text-xs text-rose-600 dark:text-rose-300">{row.saveError}</div> : null}
                  </button>
                );
              })}
            </CardContent>
          </Card>

          {active ? (
            <Card>
              <CardHeader>
                <CardTitle>{active.competitor.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {!active.assignment.isRequired ? (
                  <div className="rounded-2xl border border-amber-500/25 bg-amber-500/8 p-4 text-sm text-amber-700 dark:text-amber-300">
                    This competitor is inactive for this month. Monitoring is optional and does not block submit.
                  </div>
                ) : null}

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Followers ({active.assignment.isRequired ? 'required' : 'optional'})
                  </label>
                  <Input
                    data-testid="follower-input"
                    type="number"
                    min={0}
                    step={1}
                    disabled={isReadOnly || !active.assignment.isRequired}
                    value={active.draft.followerCount}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      updateDraft(active.competitor.id, (draft) => ({
                        ...draft,
                        followerCount: value
                      }));
                    }}
                  />
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">
                    Activity mode ({active.assignment.isRequired ? 'required, choose one' : 'optional'})
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Default mode is <span className="font-medium text-foreground">Has posts this month</span>.
                  </div>
                  {isReadOnly ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div
                        className={`rounded-2xl border px-4 py-3 text-left transition ${
                          active.draft.status === 'has_posts'
                            ? 'border-primary/35 bg-primary/8'
                            : 'border-border/60'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {active.draft.status === 'has_posts' ? (
                              <CheckCircle2 className="size-4 text-primary" />
                            ) : (
                              <Circle className="size-4 text-muted-foreground" />
                            )}
                            <span className="font-medium">Has posts this month</span>
                          </div>
                          {active.draft.status === 'has_posts' ? (
                            <Badge variant="outline">Selected</Badge>
                          ) : null}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Use post list mode (total posts + highlight note required, at least 1 highlight screenshot, max {MAX_POSTS}).
                        </div>
                      </div>
                      <div
                        className={`rounded-2xl border px-4 py-3 text-left transition ${
                          active.draft.status === 'no_activity'
                            ? 'border-primary/35 bg-primary/8'
                            : 'border-border/60'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {active.draft.status === 'no_activity' ? (
                              <CheckCircle2 className="size-4 text-primary" />
                            ) : (
                              <Circle className="size-4 text-muted-foreground" />
                            )}
                            <span className="font-medium">No posts this month</span>
                          </div>
                          {active.draft.status === 'no_activity' ? (
                            <Badge variant="outline">Selected</Badge>
                          ) : null}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Use no-post evidence mode (note + evidence screenshot required).
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Activity mode">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={active.draft.status === 'has_posts'}
                        data-testid="status-has-posts-button"
                        disabled={!active.assignment.isRequired}
                        className={`rounded-2xl border px-4 py-3 text-left transition ${
                          active.draft.status === 'has_posts'
                            ? 'border-primary/35 bg-primary/8'
                            : 'border-border/60'
                        }`}
                        onClick={() => switchActivityMode(active.competitor.id, 'has_posts')}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {active.draft.status === 'has_posts' ? (
                              <CheckCircle2 className="size-4 text-primary" />
                            ) : (
                              <Circle className="size-4 text-muted-foreground" />
                            )}
                            <span className="font-medium">Has posts this month</span>
                          </div>
                          {active.draft.status === 'has_posts' ? (
                            <Badge variant="outline">Selected</Badge>
                          ) : null}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Use post list mode (total posts + highlight note required, at least 1 highlight screenshot, max {MAX_POSTS}).
                        </div>
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={active.draft.status === 'no_activity'}
                        data-testid="status-no-activity-button"
                        disabled={!active.assignment.isRequired}
                        className={`rounded-2xl border px-4 py-3 text-left transition ${
                          active.draft.status === 'no_activity'
                            ? 'border-primary/35 bg-primary/8'
                            : 'border-border/60'
                        }`}
                        onClick={() => switchActivityMode(active.competitor.id, 'no_activity')}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {active.draft.status === 'no_activity' ? (
                              <CheckCircle2 className="size-4 text-primary" />
                            ) : (
                              <Circle className="size-4 text-muted-foreground" />
                            )}
                            <span className="font-medium">No posts this month</span>
                          </div>
                          {active.draft.status === 'no_activity' ? (
                            <Badge variant="outline">Selected</Badge>
                          ) : null}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Use no-post evidence mode (note + evidence screenshot required).
                        </div>
                      </button>
                    </div>
                  )}
                </div>

                {active.draft.status === 'has_posts' ? (
                  <div className="space-y-3 rounded-2xl border border-border/60 p-4">
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">
                        Total posts published this month (required)
                      </label>
                      <Input
                        data-testid="monthly-post-count-input"
                        type="number"
                        min={0}
                        step={1}
                        disabled={isReadOnly || !active.assignment.isRequired}
                        placeholder="Total posts published this month"
                        value={active.draft.monthlyPostCount}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          updateDraft(active.competitor.id, (draft) => ({
                            ...draft,
                            monthlyPostCount: value
                          }));
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium">Posts ({active.draft.posts.length}/{MAX_POSTS})</div>
                      {!isReadOnly ? (
                        <Button type="button" size="sm" variant="outline" disabled={!active.assignment.isRequired || active.draft.posts.length >= MAX_POSTS} onClick={() => updateDraft(active.competitor.id, (draft) => ({ ...draft, posts: [...draft.posts, buildEmptyPost(`new-${Date.now()}`)] }))}>
                          <PlusCircle />
                          Add post
                        </Button>
                      ) : null}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Screenshots below are highlight examples only (at least 1 required, up to {MAX_POSTS}).
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {active.draft.posts.map((post, index) => (
                        <div className="space-y-3 rounded-xl border border-border/60 p-3" key={post.id}>
                          <div className="flex items-center justify-between">
                            <div className="text-xs font-medium text-muted-foreground">Post {index + 1}</div>
                            {!isReadOnly ? (
                              <Button type="button" size="sm" variant="ghost" disabled={!active.assignment.isRequired || active.draft.posts.length <= MIN_POSTS} onClick={() => updateDraft(active.competitor.id, (draft) => {
                                const filtered = draft.posts.filter((candidate) => candidate.id !== post.id);
                                return {
                                  ...draft,
                                  posts: filtered.length > 0 ? filtered : buildDefaultPosts(active.competitor.id)
                                };
                              })}>
                                <MinusCircle />
                                Remove
                              </Button>
                            ) : null}
                          </div>

                          <div className="space-y-2">
                            <ImageUploadField
                              disabled={isReadOnly || !active.assignment.isRequired}
                              hideControlsWhenDisabled={isReadOnly}
                              onChange={(value) => {
                                updateDraft(active.competitor.id, (draft) => ({
                                  ...draft,
                                  posts: draft.posts.map((candidate) =>
                                    candidate.id === post.id
                                      ? { ...candidate, screenshotUrl: value }
                                      : candidate
                                  )
                                }));
                              }}
                              placeholderLabel={`Post ${index + 1} screenshot`}
                              previewAlt={`Post ${index + 1} screenshot preview`}
                              previewAspectRatio="4/5"
                              previewFit="contain"
                              scope="competitors"
                              value={post.screenshotUrl}
                            />
                            <div className="space-y-2">
                              <label className="text-xs font-medium text-muted-foreground">
                                Post URL (optional)
                              </label>
                              <Input
                                disabled={isReadOnly || !active.assignment.isRequired}
                                placeholder="Post URL (optional)"
                                value={post.postUrl}
                                onChange={(event) => {
                                  const value = event.currentTarget.value;
                                  updateDraft(active.competitor.id, (draft) => ({
                                    ...draft,
                                    posts: draft.posts.map((candidate) =>
                                      candidate.id === post.id
                                        ? { ...candidate, postUrl: value }
                                        : candidate
                                    )
                                  }));
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">
                        Highlight note (required)
                      </label>
                      <Textarea
                        disabled={isReadOnly || !active.assignment.isRequired}
                        className="min-h-28 w-full rounded-2xl border border-input bg-background/70 px-4 py-3 text-sm text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
                        placeholder="Write competitor highlight summary for this month (required)."
                        value={active.draft.highlightNote}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          updateDraft(active.competitor.id, (draft) => ({
                            ...draft,
                            highlightNote: value
                          }));
                        }}
                      />
                    </div>
                  </div>
                ) : null}

                {active.draft.status === 'no_activity' ? (
                  <div className="space-y-2 rounded-2xl border border-border/60 p-4">
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">
                        No posts note (required)
                      </label>
                      <Textarea
                        data-testid="no-activity-note-input"
                        disabled={isReadOnly || !active.assignment.isRequired}
                        className="min-h-24 w-full rounded-2xl border border-input bg-background/70 px-4 py-3 text-sm text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
                        placeholder="No posts note (required)"
                        value={active.draft.highlightNote}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          updateDraft(active.competitor.id, (draft) => ({
                            ...draft,
                            highlightNote: value
                          }));
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground">
                        Evidence screenshot (required)
                      </label>
                      <ImageUploadField
                        className="max-w-md"
                        data-testid="no-activity-evidence-input"
                        disabled={isReadOnly || !active.assignment.isRequired}
                        hideControlsWhenDisabled={isReadOnly}
                        onChange={(value) => {
                          updateDraft(active.competitor.id, (draft) => ({
                            ...draft,
                            noActivityEvidenceImageUrl: value
                          }));
                        }}
                        placeholderLabel="No-activity evidence screenshot"
                        previewAlt="No-activity evidence screenshot preview"
                        previewAspectRatio="4/5"
                        previewFit="contain"
                        scope="competitors"
                        value={active.draft.noActivityEvidenceImageUrl}
                      />
                    </div>
                  </div>
                ) : null}

                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="rounded-2xl border border-border/60 p-4 text-sm text-muted-foreground">
                    <div className="font-medium text-foreground">Completion</div>
                    <div className="mt-2 flex items-center justify-between"><span>Followers</span><Badge variant="outline">{activeCompletion?.hasFollower ? 'Yes' : 'No'}</Badge></div>
                    <div className="mt-2 flex items-center justify-between"><span>Activity mode</span><Badge variant="outline">{activeCompletion?.hasStatus ? 'Yes' : 'No'}</Badge></div>
                    <div className="mt-2 flex items-center justify-between"><span>Evidence</span><Badge variant="outline">{activeCompletion?.hasEvidence ? 'Yes' : 'No'}</Badge></div>
                  </div>
                  <div className="rounded-2xl border border-border/60 p-4 text-sm text-muted-foreground">
                    <div className="font-medium text-foreground">Reference links</div>
                    {(['facebookUrl', 'instagramUrl', 'tiktokUrl', 'youtubeUrl'] as const).map((key) => {
                      const href = active.competitor[key];
                      if (!href) return null;
                      return (
                        <a key={key} className="mt-2 flex items-center gap-2 hover:text-foreground" href={href} target="_blank" rel="noreferrer">
                          {key.replace('Url', '')}
                          <ExternalLink className="size-4" />
                        </a>
                      );
                    })}
                  </div>
                </div>

                {requiredCount > 0 && completeRequiredCount < requiredCount ? (
                  <div
                    data-testid="monitoring-readiness-banner"
                    className="rounded-2xl border border-amber-500/25 bg-amber-500/8 p-4 text-sm text-amber-700 dark:text-amber-300"
                  >
                    Complete monitoring for all active assigned competitors before submit.
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}

