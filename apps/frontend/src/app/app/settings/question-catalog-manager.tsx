'use client';

import { useMemo, useState } from 'react';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmActionModal } from '@/components/ui/confirm-action-modal';
import { Input } from '@/components/ui/input';
import { ModalShell } from '@/components/ui/modal-shell';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  createQuestionCatalogItem,
  deleteQuestionCatalogItem,
  updateQuestionCatalogItem,
  type QuestionCatalogResponse
} from '@/lib/reporting-api';

type Props = {
  initialCatalog: QuestionCatalogResponse;
};

type Draft = {
  text: string;
  description: string;
  status: 'active' | 'inactive';
};

function createEmptyDraft(): Draft {
  return {
    text: '',
    description: '',
    status: 'active'
  };
}

export function QuestionCatalogManager({ initialCatalog }: Props) {
  const [catalog, setCatalog] = useState(initialCatalog);
  const [query, setQuery] = useState('');
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [draft, setDraft] = useState<Draft>(createEmptyDraft);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<{
    id: string;
    canDelete: boolean;
    removeBlockedReason: string | null;
  } | null>(null);

  const filteredCatalog = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return catalog.items.filter(item => {
      if (!keyword) {
        return true;
      }
      return (
        item.text.toLowerCase().includes(keyword) ||
        (item.description ?? '').toLowerCase().includes(keyword)
      );
    });
  }, [query, catalog.items]);

  function openCreateModal() {
    setModalMode('create');
    setEditTarget(null);
    setDeleteConfirmOpen(false);
    setDraft(createEmptyDraft());
    setStatusError(null);
  }

  function openEditModal(item: QuestionCatalogResponse['items'][number]) {
    setModalMode('edit');
    setEditTarget({
      id: item.id,
      canDelete: item.canDelete,
      removeBlockedReason: item.removeBlockedReason
    });
    setDeleteConfirmOpen(false);
    setDraft({
      text: item.text,
      description: item.description ?? '',
      status: item.status
    });
    setStatusError(null);
  }

  function closeModal() {
    setModalMode(null);
    setEditTarget(null);
    setDeleteConfirmOpen(false);
    setPendingKey(null);
  }

  async function createCatalogItem() {
    const questionText = draft.text.trim();

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
        description: draft.description.trim() || null,
        status: draft.status
      })) as QuestionCatalogResponse;

      setCatalog(payload);
      setStatusMessage(`Created category "${questionText}".`);
      closeModal();
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

    const questionText = draft.text.trim();
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
        description: draft.description.trim() || null,
        status: draft.status
      })) as QuestionCatalogResponse;

      setCatalog(payload);
      setStatusMessage(`Updated "${questionText}".`);
      closeModal();
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
      setStatusMessage(`Deleted "${draft.text}".`);
      closeModal();
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : 'Failed to delete category.');
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <div className="space-y-4">
      {statusMessage && !modalMode ? (
        <div className="rounded-[18px] border border-emerald-500/25 bg-emerald-500/8 px-3 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          {statusMessage}
        </div>
      ) : null}
      {statusError && !modalMode ? (
        <div className="rounded-[18px] border border-rose-500/25 bg-rose-500/8 px-3 py-3 text-sm text-rose-700 dark:text-rose-300">
          {statusError}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-foreground">Question catalog</div>
          <div className="text-sm text-muted-foreground">
            Manage reusable question prompts and usage guidance from this table.
          </div>
        </div>
        <Button
          disabled={pendingKey !== null}
          onClick={openCreateModal}
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
              className="grid gap-3 rounded-2xl border border-border/60 bg-background/55 px-3 py-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center"
              key={item.id}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-foreground">{item.text}</div>
                {item.description ? (
                  <div
                    className="mt-1 truncate text-sm text-muted-foreground"
                    title={item.description}
                  >
                    {item.description}
                  </div>
                ) : null}
                <div className="text-xs text-muted-foreground">
                  {item.usage.assignedBrandCount} brand(s) using
                </div>
              </div>
              <Badge variant="outline">{item.status.toUpperCase()}</Badge>
              <Button
                onClick={() => openEditModal(item)}
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

      {modalMode ? (
        <ModalShell
          error={statusError}
          message={statusMessage}
          onClose={closeModal}
          showCloseButton={false}
          title={modalMode === 'create' ? 'Add question category' : 'Edit question category'}
        >
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  Category name
                </label>
                <Input
                  onChange={event => {
                    const nextText = event.currentTarget.value;
                    setDraft(current => ({ ...current, text: nextText }));
                  }}
                  placeholder="Enter question category"
                  value={draft.text}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  Status
                </label>
                <Select
                  onChange={event => {
                    const nextStatus = event.currentTarget.value as 'active' | 'inactive';
                    setDraft(current => ({ ...current, status: nextStatus }));
                  }}
                  value={draft.status}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  Description (optional)
                </label>
                <Textarea
                  onChange={event => {
                    const nextDescription = event.currentTarget.value;
                    setDraft(current => ({ ...current, description: nextDescription }));
                  }}
                  placeholder="Describe when this question should be selected"
                  value={draft.description}
                />
              </div>
            </div>
            {modalMode === 'edit' && editTarget && !editTarget.canDelete ? (
              <div className="rounded-[14px] border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                {editTarget.removeBlockedReason ?? 'This category is locked by approved report usage.'}
              </div>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                onClick={closeModal}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              {modalMode === 'edit' && editTarget ? (
                <Button
                  disabled={pendingKey === `edit-${editTarget.id}` || pendingKey === `delete-${editTarget.id}` || !editTarget.canDelete}
                  onClick={() => setDeleteConfirmOpen(true)}
                  type="button"
                  variant="outline"
                >
                  <Trash2 />
                  Delete
                </Button>
              ) : null}
              <Button
                disabled={
                  pendingKey === 'create' ||
                  (!!editTarget && (pendingKey === `edit-${editTarget.id}` || pendingKey === `delete-${editTarget.id}`))
                }
                onClick={() =>
                  modalMode === 'create'
                    ? void createCatalogItem()
                    : void saveCatalogEdit()
                }
                type="button"
              >
                {modalMode === 'create' ? 'Add category' : 'Save changes'}
              </Button>
            </div>
          </div>
        </ModalShell>
      ) : null}

      <ConfirmActionModal
        cancelLabel="Cancel"
        confirmLabel="Delete category"
        description={`Delete "${draft.text || 'this category'}" permanently? This cannot be undone.`}
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={() => {
          void deleteCatalogItem();
        }}
        open={deleteConfirmOpen && !!editTarget}
        pending={!!editTarget && pendingKey === `delete-${editTarget.id}`}
        title={`Delete "${draft.text || 'category'}"?`}
      />
    </div>
  );
}
