'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { ConfirmActionModal } from '@/components/ui/confirm-action-modal';
import { Input } from '@/components/ui/input';
import { ModalShell } from '@/components/ui/modal-shell';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type {
  CanonicalTargetField,
  ComputedFormulaResponse,
  KpiCatalogItem
} from '@/lib/reporting-api';

type Props = {
  formulas: ComputedFormulaResponse[];
  items: KpiCatalogItem[];
  newBrandDefaultKpiCatalogIds: string[];
};

type Draft = {
  label: string;
  description: string;
  sourceType: 'canonical_metric' | 'formula_column';
  canonicalMetricKey: CanonicalTargetField | '';
  formulaId: string;
  isActive: boolean;
};

const canonicalMetricOptions: Array<{
  key: CanonicalTargetField;
  label: string;
}> = [
  { key: 'views', label: 'Views' },
  { key: 'viewers', label: 'Viewers (manual monthly input)' },
  { key: 'page_followers', label: 'Page Followers (manual monthly input)' },
  { key: 'video_views_3s', label: '3-second video views' }
];

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

function createEmptyDraft(): Draft {
  return {
    label: '',
    description: '',
    sourceType: 'canonical_metric',
    canonicalMetricKey: 'views',
    formulaId: '',
    isActive: true
  };
}

export function KpiCatalogManager({
  formulas,
  items,
  newBrandDefaultKpiCatalogIds
}: Props) {
  const router = useRouter();
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api';
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [defaultModalOpen, setDefaultModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(createEmptyDraft);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [persistedDefaultIds, setPersistedDefaultIds] = useState<string[]>(
    newBrandDefaultKpiCatalogIds
  );
  const [defaultDraftIds, setDefaultDraftIds] = useState<string[]>(
    newBrandDefaultKpiCatalogIds
  );
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [deleteTargetItem, setDeleteTargetItem] = useState<KpiCatalogItem | null>(null);

  const formulasById = useMemo(
    () => new Map(formulas.map(formula => [formula.id, formula])),
    [formulas]
  );
  const editingItem = editingId ? items.find(item => item.id === editingId) ?? null : null;
  const activeCatalogItems = useMemo(() => items.filter(item => item.isActive), [items]);

  useEffect(() => {
    setPersistedDefaultIds(newBrandDefaultKpiCatalogIds);
    setDefaultDraftIds(newBrandDefaultKpiCatalogIds);
  }, [newBrandDefaultKpiCatalogIds]);

  function openCreateModal() {
    setModalMode('create');
    setEditingId(null);
    setDraft(createEmptyDraft());
    setStatusError(null);
  }

  function openEditModal(item: KpiCatalogItem) {
    setModalMode('edit');
    setEditingId(item.id);
    setDraft({
      label: item.label,
      description: item.description ?? '',
      sourceType: item.sourceType,
      canonicalMetricKey: item.canonicalMetricKey ?? 'views',
      formulaId: item.formulaId ?? '',
      isActive: item.isActive
    });
    setStatusError(null);
  }

  function closeModal() {
    setModalMode(null);
    setEditingId(null);
    setPendingKey(null);
  }

  function openDefaultSelectionModal() {
    setDefaultDraftIds(persistedDefaultIds);
    setDefaultModalOpen(true);
    setStatusError(null);
  }

  function closeDefaultSelectionModal() {
    setDefaultModalOpen(false);
    setPendingKey(null);
  }

  async function saveItem() {
    if (!modalMode) {
      return;
    }

    setPendingKey('save');
    setStatusError(null);
    setStatusMessage(null);

    try {
      const basePayload = {
        label: draft.label.trim(),
        description: draft.description.trim() || null,
        sourceType: draft.sourceType,
        canonicalMetricKey:
          draft.sourceType === 'canonical_metric' ? draft.canonicalMetricKey : null,
        formulaId: draft.sourceType === 'formula_column' ? draft.formulaId || null : null
      };
      const payload =
        modalMode === 'create'
          ? {
              ...basePayload,
              isActive: draft.isActive
            }
          : basePayload;

      const response = await fetch(
        modalMode === 'create'
          ? `${apiBase}/config/kpis`
          : `${apiBase}/config/kpis/${editingId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        }
      );
      const result = await response.json().catch(() => null);

      if (!response.ok) {
        setStatusError(parseErrorMessage(result, 'Failed to save KPI catalog item.'));
        return;
      }

      setStatusMessage(
        modalMode === 'create'
          ? `Added KPI "${payload.label}".`
          : `Updated KPI "${payload.label}".`
      );
      closeModal();
      router.refresh();
    } catch {
      setStatusError('Failed to save KPI catalog item.');
    } finally {
      setPendingKey(null);
    }
  }

  async function removeItem(item: KpiCatalogItem) {
    if (item.usage.activePlanCount > 0) {
      setStatusMessage(null);
      setStatusError(
        `Cannot delete KPI "${item.label}" because it is used in ${item.usage.activePlanCount} yearly plan${item.usage.activePlanCount === 1 ? '' : 's'}.`
      );
      return;
    }

    setPendingKey(`delete:${item.id}`);
    setStatusError(null);
    setStatusMessage(null);

    try {
      const response = await fetch(`${apiBase}/config/kpis/${item.id}`, {
        method: 'DELETE'
      });
      const result = await response.json().catch(() => null);

      if (!response.ok) {
        setStatusError(parseErrorMessage(result, 'Failed to delete KPI catalog item.'));
        return;
      }

      setDeleteTargetItem(null);
      setStatusMessage(`Deleted KPI "${item.label}".`);
      router.refresh();
    } catch {
      setStatusError('Failed to delete KPI catalog item.');
    } finally {
      setPendingKey(null);
    }
  }

  function requestDeleteItem(item: KpiCatalogItem) {
    if (item.usage.activePlanCount > 0) {
      setStatusMessage(null);
      setStatusError(
        `Cannot delete KPI "${item.label}" because it is used in ${item.usage.activePlanCount} yearly plan${item.usage.activePlanCount === 1 ? '' : 's'}.`
      );
      return;
    }

    setDeleteTargetItem(item);
    setStatusError(null);
    setStatusMessage(null);
  }

  async function toggleItemActive(item: KpiCatalogItem) {
    const nextActive = !item.isActive;
    setPendingKey(`toggle:${item.id}`);
    setStatusError(null);
    setStatusMessage(null);

    try {
      const response = await fetch(`${apiBase}/config/kpis/${item.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          isActive: nextActive
        })
      });
      const result = await response.json().catch(() => null);

      if (!response.ok) {
        setStatusError(parseErrorMessage(result, 'Failed to update KPI active state.'));
        return;
      }

      setStatusMessage(
        nextActive
          ? `Activated KPI "${item.label}".`
          : `Deactivated KPI "${item.label}".`
      );
      router.refresh();
    } catch {
      setStatusError('Failed to update KPI active state.');
    } finally {
      setPendingKey(null);
    }
  }

  function toggleDefaultSelection(kpiId: string) {
    setDefaultDraftIds(current =>
      current.includes(kpiId)
        ? current.filter(id => id !== kpiId)
        : [...current, kpiId]
    );
  }

  async function saveNewBrandDefaults() {
    setPendingKey('save-defaults');
    setStatusError(null);
    setStatusMessage(null);

    try {
      const response = await fetch(`${apiBase}/config/kpis/defaults`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          kpiCatalogIds: defaultDraftIds
        })
      });
      const result = await response.json().catch(() => null);

      if (!response.ok) {
        setStatusError(parseErrorMessage(result, 'Failed to update default KPI selection.'));
        return;
      }

      const nextIds =
        result &&
        typeof result === 'object' &&
        'kpiCatalogIds' in result &&
        Array.isArray((result as { kpiCatalogIds?: unknown }).kpiCatalogIds)
          ? ((result as { kpiCatalogIds: string[] }).kpiCatalogIds ?? []).filter(Boolean)
          : defaultDraftIds;

      setPersistedDefaultIds(nextIds);
      setDefaultDraftIds(nextIds);
      setStatusMessage('Updated default KPI set for new brands.');
      closeDefaultSelectionModal();
      router.refresh();
    } catch {
      setStatusError('Failed to update default KPI selection.');
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <div className="space-y-3">
      {statusError && !modalMode && !defaultModalOpen ? (
        <div className="rounded-2xl border border-rose-500/25 bg-rose-500/8 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
          {statusError}
        </div>
      ) : null}
      {statusMessage && !modalMode && !defaultModalOpen ? (
        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/8 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          {statusMessage}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-[22px] border border-border/60 bg-background/60">
        <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
          <div>
            <div className="text-lg font-semibold text-foreground">KPI catalog</div>
            <div className="text-sm text-muted-foreground">
              Manage KPI definitions from this table and Actions column.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={openDefaultSelectionModal} size="sm" type="button" variant="outline">
              New Brand Defaults
            </Button>
            <Button onClick={openCreateModal} size="sm" type="button">
              Add KPI
            </Button>
          </div>
        </div>
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-border/60 bg-background/70 text-xs uppercase tracking-[0.15em] text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">KPI</th>
              <th className="px-4 py-3 font-medium">Source</th>
              <th className="px-4 py-3 font-medium">Usage</th>
              <th className="px-4 py-3 font-medium">Active</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-muted-foreground" colSpan={5}>
                  No KPI definitions yet.
                </td>
              </tr>
            ) : (
              items.map(item => (
                <tr className="border-b border-border/50 last:border-b-0" key={item.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{item.label}</div>
                    {persistedDefaultIds.includes(item.id) ? (
                      <div className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">
                        Default for new brands
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {item.sourceType === 'canonical_metric'
                      ? canonicalMetricOptions.find(option => option.key === item.canonicalMetricKey)?.label ??
                        item.canonicalMetricKey
                      : item.formulaLabel ?? 'Formula column'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {item.usage.activePlanCount} yearly plan
                    {item.usage.activePlanCount === 1 ? '' : 's'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      aria-label={item.isActive ? 'Set inactive' : 'Set active'}
                      className={`h-7 w-14 rounded-full border transition ${
                        item.isActive
                          ? 'border-emerald-600/20 bg-emerald-500/40'
                          : 'border-border bg-muted'
                      }`}
                      disabled={pendingKey === `toggle:${item.id}`}
                      onClick={() => toggleItemActive(item)}
                      type="button"
                    >
                      <span
                        className={`mx-1 block h-5 w-5 rounded-full bg-background transition-transform ${
                          item.isActive ? 'translate-x-6' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <>
                      <div className="flex flex-wrap gap-2">
                        <Button onClick={() => openEditModal(item)} size="sm" type="button" variant="outline">
                          Edit
                        </Button>
                        <Button
                          disabled={item.usage.activePlanCount > 0 || pendingKey === `delete:${item.id}`}
                          onClick={() => requestDeleteItem(item)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          Delete
                        </Button>
                      </div>
                      {item.usage.activePlanCount > 0 ? (
                        <div className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                          Used in {item.usage.activePlanCount} yearly plan
                          {item.usage.activePlanCount === 1 ? '' : 's'}.
                        </div>
                      ) : null}
                    </>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modalMode ? (
        <ModalShell
          description="Choose a data source: mapped post metrics or formula column."
          error={statusError}
          message={statusMessage}
          onClose={closeModal}
          title={modalMode === 'create' ? 'Add KPI definition' : 'Edit KPI definition'}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                KPI label
              </label>
              <Input
                onChange={event => {
                  const value = event.currentTarget.value;
                  setDraft(current => ({ ...current, label: value }));
                }}
                placeholder="Enter KPI name"
                value={draft.label}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                Data source
              </label>
              <Select
                onChange={event => {
                  const value = event.currentTarget.value as Draft['sourceType'];
                  setDraft(current => ({
                    ...current,
                    sourceType: value
                  }));
                }}
                value={draft.sourceType}
              >
                <option value="canonical_metric">From canonical metrics (mapped + manual)</option>
                <option value="formula_column">From formula column</option>
              </Select>
            </div>
            {draft.sourceType === 'canonical_metric' ? (
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  Canonical metric
                </label>
                <Select
                  onChange={event => {
                    const value = event.currentTarget.value as CanonicalTargetField;
                    setDraft(current => ({
                      ...current,
                      canonicalMetricKey: value
                    }));
                  }}
                  value={draft.canonicalMetricKey}
                >
                  {canonicalMetricOptions.map(option => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  Formula column
                </label>
                <Select
                  onChange={event => {
                    const value = event.currentTarget.value;
                    setDraft(current => ({ ...current, formulaId: value }));
                  }}
                  value={draft.formulaId}
                >
                  <option value="">Choose formula column</option>
                  {formulas.map(formula => (
                    <option key={formula.id} value={formula.id}>
                      {formula.columnLabel}
                      {formula.isActive ? '' : ' (Inactive)'}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            {modalMode === 'create' ? (
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  Active
                </label>
                <button
                  aria-label={draft.isActive ? 'Set inactive' : 'Set active'}
                  className={`h-7 w-14 rounded-full border transition ${
                    draft.isActive
                      ? 'border-emerald-600/20 bg-emerald-500/40'
                      : 'border-border bg-muted'
                  }`}
                  onClick={() => {
                    setDraft(current => ({
                      ...current,
                      isActive: !current.isActive
                    }));
                  }}
                  type="button"
                >
                  <span
                    className={`mx-1 block h-5 w-5 rounded-full bg-background transition-transform ${
                      draft.isActive ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            ) : null}
            <div className="md:col-span-2">
              <label className="mb-2 block text-xs uppercase tracking-[0.16em] text-muted-foreground">
                Description (optional)
              </label>
              <Textarea
                className="min-h-28 w-full rounded-2xl border border-input bg-background/70 px-4 py-3 text-sm text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
                onChange={event => {
                  const value = event.currentTarget.value;
                  setDraft(current => ({
                    ...current,
                    description: value
                  }));
                }}
                placeholder="Add context for this KPI"
                value={draft.description}
              />
            </div>
          </div>

          {draft.sourceType === 'formula_column' && editingItem?.formulaId ? (
            <div className="mt-3 text-xs text-muted-foreground">
              Current formula: {formulasById.get(editingItem.formulaId)?.columnLabel ?? editingItem.formulaLabel}
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={pendingKey === 'save'} onClick={saveItem} type="button">
              {modalMode === 'create' ? 'Add KPI' : 'Save changes'}
            </Button>
          </div>
        </ModalShell>
      ) : null}

      {defaultModalOpen ? (
        <ModalShell
          description="Selected KPIs are auto-assigned to KPI plan of the current year when a new brand is created."
          error={statusError}
          message={statusMessage}
          onClose={closeDefaultSelectionModal}
          title="Default KPI for New Brands"
          widthClassName="max-w-2xl"
        >
          <div className="space-y-2">
            {activeCatalogItems.length === 0 ? (
              <div className="rounded-xl border border-border/60 bg-background/60 px-3 py-3 text-sm text-muted-foreground">
                No active KPI definitions available.
              </div>
            ) : (
              activeCatalogItems.map(item => {
                const checked = defaultDraftIds.includes(item.id);
                return (
                  <label
                    className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/60 bg-background/60 px-3 py-3"
                    key={`default-kpi-${item.id}`}
                  >
                    <input
                      checked={checked}
                      onChange={() => toggleDefaultSelection(item.id)}
                      type="checkbox"
                    />
                    <div>
                      <div className="font-medium text-foreground">{item.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.sourceType === 'canonical_metric'
                          ? canonicalMetricOptions.find(option => option.key === item.canonicalMetricKey)?.label ??
                            item.canonicalMetricKey
                          : item.formulaLabel ?? 'Formula column'}
                      </div>
                    </div>
                  </label>
                );
              })
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              disabled={pendingKey === 'save-defaults'}
              onClick={saveNewBrandDefaults}
              type="button"
            >
              Save Default Set
            </Button>
          </div>
        </ModalShell>
      ) : null}

      <ConfirmActionModal
        cancelLabel="Keep KPI"
        confirmLabel="Delete KPI"
        description={
          deleteTargetItem
            ? `This will permanently delete "${deleteTargetItem.label}". This action cannot be undone.`
            : ''
        }
        onCancel={() => setDeleteTargetItem(null)}
        onConfirm={() => {
          if (deleteTargetItem) {
            void removeItem(deleteTargetItem);
          }
        }}
        open={!!deleteTargetItem}
        pending={!!deleteTargetItem && pendingKey === `delete:${deleteTargetItem.id}`}
        title={deleteTargetItem ? `Delete "${deleteTargetItem.label}"?` : 'Delete KPI?'}
      />
    </div>
  );
}

