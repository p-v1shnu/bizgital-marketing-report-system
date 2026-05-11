'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, CircleHelp, Plus, Search, Trash2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { QuestionSetupResponse } from '@/lib/reporting-api';

type Props = {
  brandId: string;
  initialSetup: QuestionSetupResponse;
};

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api';
const DESCRIPTION_PREVIEW_LENGTH = 90;

function getDescriptionPreview(description: string) {
  const normalized = description.replace(/\s+/g, ' ').trim();
  if (normalized.length <= DESCRIPTION_PREVIEW_LENGTH) {
    return {
      isTruncated: false,
      text: normalized
    };
  }

  return {
    isTruncated: true,
    text: `${normalized.slice(0, DESCRIPTION_PREVIEW_LENGTH).trimEnd()}...`
  };
}

function QuestionDescriptionPreview({
  description,
  isOpen,
  onClose,
  onToggle,
  title
}: {
  description: string | null;
  isOpen: boolean;
  onClose: () => void;
  onToggle: () => void;
  title: string;
}) {
  if (!description?.trim()) {
    return null;
  }

  const preview = getDescriptionPreview(description);

  return (
    <div className="relative mt-1 max-w-xl text-sm text-muted-foreground">
      <span className="break-words [overflow-wrap:anywhere]">{preview.text}</span>
      {preview.isTruncated ? (
        <>
          <button
            aria-label={`Show full description for ${title}`}
            className="ml-2 inline-flex size-6 align-middle items-center justify-center rounded-full border border-border/60 bg-background/70 text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
            onClick={onToggle}
            type="button"
          >
            <CircleHelp className="size-3.5" />
          </button>
          {isOpen ? (
            <div
              className="absolute left-0 top-full z-40 mt-2 max-h-[min(360px,calc(100vh-160px))] w-[min(380px,calc(100vw-48px))] overflow-y-auto rounded-2xl border border-border/70 bg-popover p-4 text-popover-foreground shadow-xl"
              role="dialog"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Description
                  </div>
                  <div className="mt-1 text-sm font-semibold text-foreground">{title}</div>
                </div>
                <button
                  aria-label="Close description"
                  className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition hover:text-foreground"
                  onClick={onClose}
                  type="button"
                >
                  <X className="size-4" />
                </button>
              </div>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">
                {description}
              </p>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
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

export function QuestionSetupManager({ brandId, initialSetup }: Props) {
  const [setup, setSetup] = useState(initialSetup);
  const [query, setQuery] = useState('');
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [openDescriptionId, setOpenDescriptionId] = useState<string | null>(null);

  const assignmentQuestionIds = useMemo(
    () => setup.assignments.map(item => item.question.id),
    [setup.assignments]
  );

  const filteredAvailable = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return setup.availableCatalog.filter(item => {
      if (!keyword) {
        return true;
      }
      return (
        item.text.toLowerCase().includes(keyword) ||
        (item.description ?? '').toLowerCase().includes(keyword)
      );
    });
  }, [query, setup.availableCatalog]);

  async function saveAssignments(questionIds: string[], successMessage: string) {
    setPendingKey('assignments');
    setStatusError(null);
    setStatusMessage(null);

    try {
      const response = await fetch(
        `${apiBase}/brands/${brandId}/question-setup/assignments`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            questionIds
          })
        }
      );
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setStatusError(parseErrorMessage(payload, 'Failed to save assignments.'));
        return;
      }

      setSetup(payload as QuestionSetupResponse);
      setStatusMessage(successMessage);
    } catch {
      setStatusError('Failed to save assignments.');
    } finally {
      setPendingKey(null);
    }
  }

  async function addAssignment(questionId: string, questionText: string) {
    if (assignmentQuestionIds.includes(questionId)) {
      return;
    }

    await saveAssignments(
      [...assignmentQuestionIds, questionId],
      `Assigned "${questionText}" to this brand.`
    );
  }

  async function removeAssignment(questionId: string, questionText: string) {
    if (!assignmentQuestionIds.includes(questionId)) {
      return;
    }

    await saveAssignments(
      assignmentQuestionIds.filter(id => id !== questionId),
      `Removed "${questionText}" from this brand.`
    );
  }

  async function moveAssignment(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= assignmentQuestionIds.length) {
      return;
    }

    const reordered = [...assignmentQuestionIds];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(nextIndex, 0, moved);

    await saveAssignments(reordered, 'Assignment order updated.');
  }

  return (
    <div className="space-y-4">
      {statusMessage ? (
        <div className="rounded-[18px] border border-emerald-500/25 bg-emerald-500/8 px-3 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          {statusMessage}
        </div>
      ) : null}
      {statusError ? (
        <div className="rounded-[18px] border border-rose-500/25 bg-rose-500/8 px-3 py-3 text-sm text-rose-700 dark:text-rose-300">
          {statusError}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Assigned categories</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-[16px] border border-border/60 bg-background/50 px-3 py-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">
              {setup.summary.assignedCount} assigned
            </div>
            {setup.assignments.length === 0 ? (
              <div className="rounded-[16px] border border-border/60 bg-background/50 px-3 py-4 text-sm text-muted-foreground">
                No assigned categories yet.
              </div>
            ) : (
              setup.assignments.map((item, index) => (
                <div
                  className={`relative flex items-start gap-2 rounded-2xl border border-border/60 bg-background/55 px-3 py-3 ${
                    openDescriptionId === item.question.id ? 'z-30' : 'z-0'
                  }`}
                  key={item.id}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">
                      {item.question.text}
                    </div>
                    <QuestionDescriptionPreview
                      description={item.question.description}
                      isOpen={openDescriptionId === item.question.id}
                      onClose={() => setOpenDescriptionId(null)}
                      onToggle={() =>
                        setOpenDescriptionId(current =>
                          current === item.question.id ? null : item.question.id
                        )
                      }
                      title={item.question.text}
                    />
                    {!item.canRemove && item.removeBlockedReason ? (
                      <div className="mt-1 text-xs text-amber-600 dark:text-amber-300">
                        {item.removeBlockedReason}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      disabled={pendingKey === 'assignments' || index === 0}
                      onClick={() => void moveAssignment(index, -1)}
                      size="icon"
                      type="button"
                      variant="outline"
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      disabled={
                        pendingKey === 'assignments' || index === setup.assignments.length - 1
                      }
                      onClick={() => void moveAssignment(index, 1)}
                      size="icon"
                      type="button"
                      variant="outline"
                    >
                      <ArrowDown />
                    </Button>
                    <Button
                      disabled={pendingKey === 'assignments' || !item.canRemove}
                      onClick={() => void removeAssignment(item.question.id, item.question.text)}
                      size="sm"
                      type="button"
                      variant="outline"
                      title={item.removeBlockedReason ?? undefined}
                    >
                      <Trash2 />
                      Remove
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Available categories</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="question-setup-search-input">
                Search categories
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  id="question-setup-search-input"
                  onChange={event => setQuery(event.currentTarget.value)}
                  placeholder="Search category"
                  value={query}
                />
              </div>
            </div>
            {filteredAvailable.length === 0 ? (
              <div className="rounded-[16px] border border-border/60 bg-background/50 px-3 py-4 text-sm text-muted-foreground">
                No active unassigned category in this filter.
              </div>
            ) : (
              filteredAvailable.map(item => (
                <div
                  className={`relative flex items-center gap-2 rounded-2xl border border-border/60 bg-background/55 px-3 py-3 ${
                    openDescriptionId === item.id ? 'z-30' : 'z-0'
                  }`}
                  key={item.id}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">{item.text}</div>
                    <QuestionDescriptionPreview
                      description={item.description}
                      isOpen={openDescriptionId === item.id}
                      onClose={() => setOpenDescriptionId(null)}
                      onToggle={() =>
                        setOpenDescriptionId(current => (current === item.id ? null : item.id))
                      }
                      title={item.text}
                    />
                    <div className="text-xs text-muted-foreground">
                      {item.usage.assignedBrandCount} brand(s) using
                    </div>
                  </div>
                  <Button
                    disabled={pendingKey === 'assignments'}
                    onClick={() => void addAssignment(item.id, item.text)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <Plus />
                    Assign
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

