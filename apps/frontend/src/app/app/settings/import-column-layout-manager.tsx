'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { MetaColumnCatalogResponse } from '@/lib/reporting-api';

type Props = {
  metaColumns: MetaColumnCatalogResponse['columns'];
  initialSelectedLabels: string[];
};

const defaultVisibleSourceLabelMatchers = [
  /^views$/i,
  /^reach$/i,
  /^viewers$/i,
  /^page followers$/i,
  /^reactions,\s*comments and shares$/i,
  /^total clicks$/i,
  /^3[\s-]*second video views$/i,
  /^15[\s-]*second video views$/i
] as const;

function normalizeLabel(value: string) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
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

function resolveInitialSelection(
  metaColumns: MetaColumnCatalogResponse['columns'],
  initialSelectedLabels: string[]
) {
  const initial = new Set(initialSelectedLabels.map(label => normalizeLabel(label)));
  const fromSavedLayout = metaColumns
    .map(column => column.label)
    .filter(label => initial.has(normalizeLabel(label)));

  if (fromSavedLayout.length > 0) {
    return fromSavedLayout;
  }

  return metaColumns
    .map(column => column.label)
    .filter(label =>
      defaultVisibleSourceLabelMatchers.some(matcher => matcher.test(label))
    );
}

export function ImportColumnLayoutManager({
  metaColumns,
  initialSelectedLabels
}: Props) {
  const router = useRouter();
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3003/api';
  const [selectedLabels, setSelectedLabels] = useState<string[]>(() =>
    resolveInitialSelection(metaColumns, initialSelectedLabels)
  );
  const [query, setQuery] = useState('');
  const [editSelectedLabels, setEditSelectedLabels] = useState<string[]>([]);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const filtered = useMemo(() => {
    const keyword = normalizeLabel(query);
    if (!keyword) {
      return metaColumns;
    }

    return metaColumns.filter(column => normalizeLabel(column.label).includes(keyword));
  }, [metaColumns, query]);
  const selectedNormalized = useMemo(
    () => new Set(editSelectedLabels.map(label => normalizeLabel(label))),
    [editSelectedLabels]
  );
  const selectedPreview = selectedLabels.slice(0, 8);

  function openEditor() {
    setEditSelectedLabels(selectedLabels);
    setQuery('');
    setIsEditOpen(true);
  }

  function closeEditor() {
    setIsEditOpen(false);
    setQuery('');
  }

  function toggleLabel(label: string, enabled: boolean) {
    setEditSelectedLabels(current => {
      if (enabled) {
        if (current.some(item => normalizeLabel(item) === normalizeLabel(label))) {
          return current;
        }

        return [...current, label];
      }

      return current.filter(item => normalizeLabel(item) !== normalizeLabel(label));
    });
  }

  function selectVisibleFiltered() {
    setEditSelectedLabels(current => {
      const set = new Map(current.map(item => [normalizeLabel(item), item]));
      for (const column of filtered) {
        set.set(normalizeLabel(column.label), column.label);
      }

      return Array.from(set.values());
    });
  }

  function clearAll() {
    setEditSelectedLabels([]);
  }

  async function save() {
    setIsSaving(true);
    setStatusError(null);
    setStatusMessage(null);

    try {
      const response = await fetch(`${apiBase}/config/import-table-layout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          visibleSourceColumnLabels: editSelectedLabels
        })
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setStatusError(parseErrorMessage(payload, 'Failed to save source column layout.'));
        return;
      }

      setSelectedLabels(editSelectedLabels);
      setStatusMessage('Import table source-column layout saved.');
      setIsEditOpen(false);
      router.refresh();
    } catch {
      setStatusError('Failed to save source column layout.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-3 rounded-[24px] border border-border/60 bg-background/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-base font-semibold text-foreground">
            Import source columns to display
          </div>
          <div className="text-sm text-muted-foreground">
            Configure default visible source columns from Actions.
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={openEditor} size="sm" type="button">
            Edit columns
          </Button>
        </div>
      </div>

      {statusError ? (
        <div className="rounded-2xl border border-rose-500/25 bg-rose-500/8 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
          {statusError}
        </div>
      ) : null}
      {statusMessage ? (
        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/8 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          {statusMessage}
        </div>
      ) : null}

      <div className="text-xs text-muted-foreground">
        Selected {selectedLabels.length} of {metaColumns.length} columns
      </div>

      {selectedPreview.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {selectedPreview.map(label => (
            <span
              className="rounded-full border border-border/60 bg-background/70 px-3 py-1 text-xs text-foreground"
              key={label}
            >
              {label}
            </span>
          ))}
          {selectedLabels.length > selectedPreview.length ? (
            <span className="rounded-full border border-border/60 bg-background/70 px-3 py-1 text-xs text-muted-foreground">
              +{selectedLabels.length - selectedPreview.length} more
            </span>
          ) : null}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border/60 px-3 py-3 text-sm text-muted-foreground">
          No columns selected.
        </div>
      )}

      {isEditOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 p-4">
          <div className="w-full max-w-4xl rounded-3xl border border-border/70 bg-background p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-foreground">Edit source columns</div>
                <div className="text-sm text-muted-foreground">
                  Select columns shown by default in Import table.
                </div>
              </div>
              <Button onClick={closeEditor} type="button" variant="outline">
                Close
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="w-full max-w-sm space-y-2">
                <label className="text-sm font-medium" htmlFor="column-layout-search-input">
                  Search columns
                </label>
                <Input
                  className="max-w-sm"
                  id="column-layout-search-input"
                  onChange={event => setQuery(event.currentTarget.value)}
                  placeholder="Search Meta columns"
                  value={query}
                />
              </div>
              <Button onClick={selectVisibleFiltered} size="sm" type="button" variant="outline">
                Select filtered
              </Button>
              <Button onClick={clearAll} size="sm" type="button" variant="outline">
                Clear
              </Button>
              <Button disabled={isSaving} onClick={save} size="sm" type="button">
                Save layout
              </Button>
            </div>

            <div className="mt-3 text-xs text-muted-foreground">
              Selected {editSelectedLabels.length} of {metaColumns.length} columns
            </div>

            <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
              {filtered.map(column => {
                const checked = selectedNormalized.has(normalizeLabel(column.label));

                return (
                  <label
                    className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-sm"
                    key={column.label}
                  >
                    <input
                      checked={checked}
                      onChange={event => toggleLabel(column.label, event.currentTarget.checked)}
                      type="checkbox"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-foreground">{column.label}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        Sample: {column.sampleValue ?? '-'}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
