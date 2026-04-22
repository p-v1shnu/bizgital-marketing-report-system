'use client';

import { useMemo, useState } from 'react';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmActionModal } from '@/components/ui/confirm-action-modal';
import { Input } from '@/components/ui/input';
import { ModalShell } from '@/components/ui/modal-shell';
import { Select } from '@/components/ui/select';
import {
  createQuestionCatalogItem,
  deleteQuestionCatalogItem,
  updateQuestionCatalogItem,
  type QuestionCatalogResponse
} from '@/lib/reporting-api';

type Props = {
  initialCatalog: QuestionCatalogResponse;
};

export function QuestionCatalogManager({ initialCatalog }: Props) {
  const [catalog, setCatalog] = useState(initialCatalog);
  const [query, setQuery] = useState('');
  const [createText, setCreateText] = useState('');
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<{
    id: string;
    text: string;
    status: 'active' | 'inactive';
    canDelete: boolean;
    removeBlockedReason: string | null;
  } | null>(null);

  const filteredCatalog = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return catalog.items.filter(item => {
      if (!keyword) {
        return true;
      }
      return item.text.toLowerCase().includes(keyword);
    });
  }, [query, catalog.items]);

  async function createCatalogItem() {
    const questionText = createText.trim();

    if (!questionText) {
      setStatusError('Category name is required.');
      return;
    }

    setPendingKey('create');
    setStatusError(null);
    setStatusMessage(null);

    try {
      const payload = (await createQuestionCatalogItem({
        questionText,
        status: 'active'
      })) as QuestionCatalogResponse;

      setCatalog(payload);
      setCreateText('');
      setStatusMessage(`Created category "${questionText}".`);
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : 'Failed to create category.');
    } finally {
      setPendingKey(null);
    }
  }

  async function saveCatalogEdit() {
    if (!editTarget) {
      return;
    }

    const questionText = editTarget.text.trim();
    if (!questionText) {
      setStatusError('Category name is required.');
      return;
    }

    setPendingKey(`edit-${editTarget.id}`);
    setStatusError(null);
    setStatusMessage(null);

    try {
      const payload = (await updateQuestionCatalogItem(editTarget.id, {
        questionText,
        status: editTarget.status
      })) as QuestionCatalogResponse;

      setCatalog(payload);
      setStatusMessage(`Updated "${questionText}".`);
      setEditTarget(null);
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : 'Failed to update category.');
    } finally {
      setPendingKey(null);
    }
  }

  async function deleteCatalogItem() {
    if (!editTarget) {
      return;
    }

    if (!editTarget.canDelete) {
      setStatusError(editTarget.removeBlockedReason ?? 'This category cannot be deleted.');
      return;
    }

    setPendingKey(`delete-${editTarget.id}`);
    setStatusError(null);
    setStatusMessage(null);

    try {
      const payload = (await deleteQuestionCatalogItem(editTarget.id)) as QuestionCatalogResponse;
      setCatalog(payload);
      setStatusMessage(`Deleted "${editTarget.text}".`);
      setDeleteConfirmOpen(false);
      setEditTarget(null);
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : 'Failed to delete category.');
    } finally {
      setPendingKey(null);
    }
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

      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_180px] md:items-end">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="question-catalog-create-input">
            New global category
          </label>
          <Input
            id="question-catalog-create-input"
            onChange={event => setCreateText(event.currentTarget.value)}
            placeholder="Add global question category"
            value={createText}
          />
        </div>
        <Button
          className="w-full md:w-auto"
          disabled={pendingKey === 'create'}
          onClick={() => void createCatalogItem()}
          type="button"
        >
          <Plus />
          Add category
        </Button>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="question-catalog-search-input">
          Search categories
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            id="question-catalog-search-input"
            onChange={event => setQuery(event.currentTarget.value)}
            placeholder="Search global category"
            value={query}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">
        <div className="rounded-full border border-border/60 px-3 py-1">
          {catalog.summary.totalCount} total
        </div>
        <div className="rounded-full border border-border/60 px-3 py-1">
          {catalog.summary.activeCount} active
        </div>
        <div className="rounded-full border border-border/60 px-3 py-1">
          {catalog.summary.inactiveCount} inactive
        </div>
      </div>

      <div className="space-y-2">
        {filteredCatalog.length === 0 ? (
          <div className="rounded-[16px] border border-border/60 bg-background/50 px-3 py-4 text-sm text-muted-foreground">
            No category found in this filter.
          </div>
        ) : (
          filteredCatalog.map(item => (
            <div
              className="flex items-center gap-2 rounded-2xl border border-border/60 bg-background/55 px-3 py-3"
              key={item.id}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-foreground">{item.text}</div>
                <div className="text-xs text-muted-foreground">
                  {item.usage.assignedBrandCount} brand(s) using
                </div>
              </div>
              <Badge variant="outline">{item.status.toUpperCase()}</Badge>
              <Button
                onClick={() =>
                  {
                    setDeleteConfirmOpen(false);
                    setEditTarget({
                      id: item.id,
                      text: item.text,
                      status: item.status,
                      canDelete: item.canDelete,
                      removeBlockedReason: item.removeBlockedReason
                    });
                  }
                }
                size="sm"
                type="button"
                variant="outline"
              >
                <Pencil />
                Edit
              </Button>
            </div>
          ))
        )}
      </div>

      {editTarget ? (
        <ModalShell
          onClose={() => {
            setDeleteConfirmOpen(false);
            setEditTarget(null);
          }}
          title="Edit question category"
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Category name</label>
              <Input
                onChange={event => {
                  const nextText = event.currentTarget.value;
                  setEditTarget(current =>
                    current
                      ? {
                          ...current,
                          text: nextText
                        }
                      : current
                  );
                }}
                value={editTarget.text}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <Select
                onChange={event => {
                  const nextStatus = event.currentTarget.value as 'active' | 'inactive';
                  setEditTarget(current =>
                    current
                      ? {
                          ...current,
                          status: nextStatus
                        }
                      : current
                  );
                }}
                value={editTarget.status}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </div>
            {!editTarget.canDelete ? (
              <div className="rounded-[14px] border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                {editTarget.removeBlockedReason ?? 'This category is locked by approved report usage.'}
              </div>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                onClick={() => {
                  setDeleteConfirmOpen(false);
                  setEditTarget(null);
                }}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button
                disabled={pendingKey === `edit-${editTarget.id}` || pendingKey === `delete-${editTarget.id}` || !editTarget.canDelete}
                onClick={() => setDeleteConfirmOpen(true)}
                type="button"
                variant="outline"
              >
                <Trash2 />
                Delete
              </Button>
              <Button
                disabled={pendingKey === `edit-${editTarget.id}` || pendingKey === `delete-${editTarget.id}`}
                onClick={() => void saveCatalogEdit()}
                type="button"
              >
                Save
              </Button>
            </div>
          </div>
        </ModalShell>
      ) : null}

      <ConfirmActionModal
        cancelLabel="Cancel"
        confirmLabel="Delete category"
        description={`Delete "${editTarget?.text ?? 'this category'}" permanently? This cannot be undone.`}
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={() => {
          void deleteCatalogItem();
        }}
        open={deleteConfirmOpen && !!editTarget}
        pending={!!editTarget && pendingKey === `delete-${editTarget.id}`}
        title={`Delete "${editTarget?.text ?? 'category'}"?`}
      />
    </div>
  );
}
