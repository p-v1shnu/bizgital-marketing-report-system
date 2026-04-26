'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { ConfirmActionModal } from '@/components/ui/confirm-action-modal';
import { Input } from '@/components/ui/input';
import { ModalShell } from '@/components/ui/modal-shell';
import type {
  ComputedFormulaPreviewResponse,
  ComputedFormulaResponse,
  MetaColumnCatalogResponse
} from '@/lib/reporting-api';

type FormulaDraft = {
  columnLabel: string;
  expression: string;
  isActive: boolean;
};

type FormulaManagerProps = {
  formulas: ComputedFormulaResponse[];
  metaColumns: MetaColumnCatalogResponse['columns'];
};

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

function previewLabel(preview: ComputedFormulaPreviewResponse | null, hasMetaColumns: boolean) {
  if (!hasMetaColumns) {
    return 'Preview pending CSV schema setup';
  }

  if (!preview) {
    return 'No preview yet';
  }

  if (!preview.isValid) {
    return 'Invalid expression';
  }

  return `Preview result: ${preview.result ?? '-'}`;
}

function createEmptyDraft(): FormulaDraft {
  return {
    columnLabel: '',
    expression: '',
    isActive: false
  };
}

export function FormulaManager({ formulas, metaColumns }: FormulaManagerProps) {
  const router = useRouter();
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api';
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editingFormulaId, setEditingFormulaId] = useState<string | null>(null);
  const [draft, setDraft] = useState<FormulaDraft>(createEmptyDraft);
  const [draftPreview, setDraftPreview] = useState<ComputedFormulaPreviewResponse | null>(null);
  const [previewById, setPreviewById] = useState<
    Record<string, ComputedFormulaPreviewResponse | null>
  >(() => Object.fromEntries(formulas.map(item => [item.id, item.preview])));
  const [deleteTargetFormula, setDeleteTargetFormula] = useState<ComputedFormulaResponse | null>(null);
  const fieldPickerColumns = useMemo(
    () => metaColumns.map(column => column.label),
    [metaColumns]
  );
  const hasMetaColumns = fieldPickerColumns.length > 0;

  const isModalOpen = modalMode !== null;
  const currentEditingFormula = editingFormulaId
    ? formulas.find(formula => formula.id === editingFormulaId) ?? null
    : null;

  function openCreateModal() {
    setModalMode('create');
    setEditingFormulaId(null);
    setDraft(createEmptyDraft());
    setDraftPreview(null);
    setStatusError(null);
  }

  function openEditModal(formula: ComputedFormulaResponse) {
    setModalMode('edit');
    setEditingFormulaId(formula.id);
    setDraft({
      columnLabel: formula.columnLabel,
      expression: formula.expression,
      isActive: formula.isActive
    });
    setDraftPreview(previewById[formula.id] ?? formula.preview);
    setStatusError(null);
  }

  function closeModal() {
    setModalMode(null);
    setEditingFormulaId(null);
    setDraft(createEmptyDraft());
    setDraftPreview(null);
    setPendingKey(null);
  }

  function appendToken(columnLabel: string) {
    const token = `{{${columnLabel}}}`;
    setDraft(current => ({
      ...current,
      expression: `${current.expression}${current.expression ? ' ' : ''}${token}`
    }));
  }

  async function runPreview(expression: string) {
    setPendingKey('preview');
    setStatusError(null);
    setStatusMessage(null);

    try {
      const response = await fetch(`${apiBase}/config/computed-formulas/preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ expression })
      });
      const payload = (await response.json()) as ComputedFormulaPreviewResponse | { message?: unknown };

      if (!response.ok) {
        setStatusError(parseErrorMessage(payload, 'Failed to preview formula.'));
        return;
      }

      setDraftPreview(payload as ComputedFormulaPreviewResponse);
      setStatusMessage('Preview generated.');
    } catch {
      setStatusError('Failed to preview formula.');
    } finally {
      setPendingKey(null);
    }
  }

  async function saveDraft() {
    if (!modalMode) {
      return;
    }

    setPendingKey('save');
    setStatusError(null);
    setStatusMessage(null);

    try {
      if (modalMode === 'create') {
        const createPayload = {
          columnLabel: draft.columnLabel,
          expression: draft.expression,
          isActive: draft.isActive
        };
        const response = await fetch(`${apiBase}/config/computed-formulas`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(createPayload)
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          setStatusError(parseErrorMessage(payload, 'Failed to create formula.'));
          return;
        }

        setStatusMessage(`Formula "${draft.columnLabel}" created.`);
      } else if (editingFormulaId) {
        const updatePayload = {
          columnLabel: draft.columnLabel,
          expression: draft.expression
        };
        const response = await fetch(`${apiBase}/config/computed-formulas/${editingFormulaId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(updatePayload)
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          setStatusError(parseErrorMessage(payload, 'Failed to update formula.'));
          return;
        }

        setStatusMessage(`Formula "${draft.columnLabel}" updated.`);
      }

      closeModal();
      router.refresh();
    } catch {
      setStatusError(
        modalMode === 'create' ? 'Failed to create formula.' : 'Failed to update formula.'
      );
    } finally {
      setPendingKey(null);
    }
  }

  async function previewFormula(formulaId: string, expression: string) {
    setPendingKey(`preview:${formulaId}`);
    setStatusError(null);
    setStatusMessage(null);

    try {
      const response = await fetch(`${apiBase}/config/computed-formulas/preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ expression })
      });
      const payload = (await response.json()) as ComputedFormulaPreviewResponse | { message?: unknown };

      if (!response.ok) {
        setStatusError(parseErrorMessage(payload, 'Failed to preview formula.'));
        return;
      }

      setPreviewById(current => ({
        ...current,
        [formulaId]: payload as ComputedFormulaPreviewResponse
      }));
      setStatusMessage('Preview generated.');
    } catch {
      setStatusError('Failed to preview formula.');
    } finally {
      setPendingKey(null);
    }
  }

  async function toggleFormulaActive(formula: ComputedFormulaResponse) {
    if (!formula.activeGuard.canToggle) {
      setStatusError(formula.activeGuard.reason ?? 'This formula cannot be deactivated.');
      setStatusMessage(null);
      return;
    }

    const nextActive = !formula.isActive;
    setPendingKey(`toggle:${formula.id}`);
    setStatusError(null);
    setStatusMessage(null);

    try {
      const response = await fetch(`${apiBase}/config/computed-formulas/${formula.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          isActive: nextActive
        })
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setStatusError(parseErrorMessage(payload, 'Failed to update formula active state.'));
        return;
      }

      const finalActive =
        payload &&
        typeof payload === 'object' &&
        'isActive' in payload &&
        typeof (payload as { isActive?: unknown }).isActive === 'boolean'
          ? (payload as { isActive: boolean }).isActive
          : nextActive;

      setStatusMessage(
        finalActive
          ? `Formula "${formula.columnLabel}" activated.`
          : `Formula "${formula.columnLabel}" deactivated.`
      );
      router.refresh();
    } catch {
      setStatusError('Failed to update formula active state.');
    } finally {
      setPendingKey(null);
    }
  }

  async function deleteFormula(formula: ComputedFormulaResponse) {
    if (!formula.deleteGuard.canDelete) {
      setStatusError(formula.deleteGuard.reason ?? 'This formula cannot be deleted.');
      return;
    }

    setPendingKey(`delete:${formula.id}`);
    setStatusError(null);
    setStatusMessage(null);

    try {
      const response = await fetch(`${apiBase}/config/computed-formulas/${formula.id}`, {
        method: 'DELETE'
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setStatusError(parseErrorMessage(payload, 'Failed to delete formula.'));
        return;
      }

      setDeleteTargetFormula(null);
      setStatusMessage(`Formula "${formula.columnLabel}" deleted.`);
      router.refresh();
    } catch {
      setStatusError('Failed to delete formula.');
    } finally {
      setPendingKey(null);
    }
  }

  function requestDeleteFormula(formula: ComputedFormulaResponse) {
    if (!formula.deleteGuard.canDelete) {
      setStatusError(formula.deleteGuard.reason ?? 'This formula cannot be deleted.');
      return;
    }

    setDeleteTargetFormula(formula);
    setStatusError(null);
    setStatusMessage(null);
  }

  return (
    <div className="space-y-4">
      {!hasMetaColumns ? (
        <div className="rounded-2xl border border-sky-500/25 bg-sky-500/8 px-4 py-3 text-sm text-sky-700 dark:text-sky-300">
          Formula preview will be available after CSV schema is prepared from Data Setup.
        </div>
      ) : null}
      {statusError && !isModalOpen ? (
        <div className="rounded-2xl border border-rose-500/25 bg-rose-500/8 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
          {statusError}
        </div>
      ) : null}
      {statusMessage && !isModalOpen ? (
        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/8 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          {statusMessage}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-[22px] border border-border/60 bg-background/60">
        <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
          <div>
            <div className="text-lg font-semibold text-foreground">Formula manager</div>
            <div className="text-sm text-muted-foreground">
              Manage formulas from this table and Actions column.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={openCreateModal} size="sm" type="button">
              Add formula
            </Button>
          </div>
        </div>

        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-border/60 bg-background/70 text-xs uppercase tracking-[0.15em] text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Expression</th>
              <th className="px-4 py-3 font-medium">Preview</th>
              <th className="px-4 py-3 font-medium">Active</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {formulas.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-muted-foreground" colSpan={5}>
                  No formulas yet.
                </td>
              </tr>
            ) : (
              formulas.map(formula => {
                const preview = previewById[formula.id] ?? formula.preview;
                const hasPreviewError = hasMetaColumns && !preview.isValid;

                return (
                  <tr className="border-b border-border/50 last:border-b-0" key={formula.id}>
                    <td className="px-4 py-3 font-medium text-foreground">{formula.columnLabel}</td>
                    <td className="max-w-[420px] px-4 py-3 text-muted-foreground">
                      <div className="truncate">{formula.expression}</div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <div>{previewLabel(preview, hasMetaColumns)}</div>
                      {hasPreviewError ? (
                        <div className="mt-1 text-xs text-rose-700 dark:text-rose-300">
                          {preview.issues[0]?.message ?? 'Invalid expression'}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        aria-label={formula.isActive ? 'Set inactive' : 'Set active'}
                        className={`h-7 w-14 rounded-full border transition ${
                          formula.isActive
                            ? 'border-emerald-600/20 bg-emerald-500/40'
                            : 'border-border bg-muted'
                        }`}
                        disabled={!formula.activeGuard.canToggle || pendingKey === `toggle:${formula.id}`}
                        onClick={() => toggleFormulaActive(formula)}
                        type="button"
                      >
                        <span
                          className={`mx-1 block h-5 w-5 rounded-full bg-background transition-transform ${
                            formula.isActive ? 'translate-x-6' : 'translate-x-0'
                          }`}
                        />
                      </button>
                      {!formula.activeGuard.canToggle ? (
                        <div className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                          {formula.activeGuard.reason ?? 'This formula cannot be deactivated.'}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            disabled={!hasMetaColumns || pendingKey === `preview:${formula.id}`}
                            onClick={() => previewFormula(formula.id, formula.expression)}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            Preview
                          </Button>
                          <Button onClick={() => openEditModal(formula)} size="sm" type="button" variant="outline">
                            Edit
                          </Button>
                          <Button
                            disabled={!formula.deleteGuard.canDelete || pendingKey === `delete:${formula.id}`}
                            onClick={() => requestDeleteFormula(formula)}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            Delete
                          </Button>
                        </div>
                        {!formula.deleteGuard.canDelete ? (
                          <div className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                            {formula.deleteGuard.reason ?? 'This formula cannot be deleted.'}
                          </div>
                        ) : null}
                      </>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen ? (
        <ModalShell
          description="Use {{Column Name}} in expressions."
          error={statusError}
          message={statusMessage}
          onClose={closeModal}
          title={modalMode === 'create' ? 'Create formula' : 'Edit formula'}
          widthClassName="max-w-4xl"
        >
            <div
              className={
                modalMode === 'create'
                  ? 'grid gap-3 md:grid-cols-[220px_minmax(0,1fr)_120px]'
                  : 'grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]'
              }
            >
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="formula-column-label-input">
                  Column name
                </label>
                <Input
                  id="formula-column-label-input"
                  onChange={event => {
                    const value = event.currentTarget.value;
                    setDraft(current => ({ ...current, columnLabel: value }));
                  }}
                  placeholder="Column name"
                  value={draft.columnLabel}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="formula-expression-input">
                  Formula expression
                </label>
                <Input
                  id="formula-expression-input"
                  onChange={event => {
                    const value = event.currentTarget.value;
                    setDraft(current => ({ ...current, expression: value }));
                  }}
                  placeholder="{{Views}} / {{Viewers}}"
                  value={draft.expression}
                />
              </div>
              {modalMode === 'create' ? (
                <label className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 text-sm">
                  <input
                    checked={draft.isActive}
                    onChange={event => {
                      const checked = event.currentTarget.checked;
                      setDraft(current => ({ ...current, isActive: checked }));
                    }}
                    type="checkbox"
                  />
                  Active
                </label>
              ) : null}
            </div>

            <div className="mt-4 space-y-2">
              <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                Field picker
              </div>
              {hasMetaColumns ? (
                <div className="flex max-h-36 flex-wrap gap-2 overflow-y-auto pr-1">
                  {fieldPickerColumns.map(column => (
                    <Button
                      key={`${modalMode}-${column}`}
                      onClick={() => appendToken(column)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {column}
                    </Button>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border/60 px-3 py-3 text-sm text-muted-foreground">
                  No CSV headers available yet. Upload a CSV in Data Setup to unlock field picker.
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                disabled={!hasMetaColumns || pendingKey === 'preview'}
                onClick={() => runPreview(draft.expression)}
                type="button"
                variant="outline"
              >
                Preview
              </Button>
              <Button disabled={pendingKey === 'save'} onClick={saveDraft} type="button">
                {modalMode === 'create' ? 'Save formula' : 'Save changes'}
              </Button>
            </div>

            <div className="mt-3 text-sm text-muted-foreground">{previewLabel(draftPreview, hasMetaColumns)}</div>
            {hasMetaColumns && draftPreview && !draftPreview.isValid ? (
              <div className="mt-2 space-y-1 text-sm text-rose-700 dark:text-rose-300">
                {draftPreview.issues.map((issue, index) => (
                  <div key={`draft-issue-${index}`}>{issue.message}</div>
                ))}
              </div>
            ) : null}

            {modalMode === 'edit' && currentEditingFormula && !currentEditingFormula.deleteGuard.canDelete ? (
              <div className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/8 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                {currentEditingFormula.deleteGuard.reason}
              </div>
            ) : null}
        </ModalShell>
      ) : null}

      <ConfirmActionModal
        cancelLabel="Keep formula"
        confirmLabel="Delete formula"
        description={
          deleteTargetFormula
            ? `This will permanently delete "${deleteTargetFormula.columnLabel}". This action cannot be undone.`
            : ''
        }
        onCancel={() => setDeleteTargetFormula(null)}
        onConfirm={() => {
          if (deleteTargetFormula) {
            void deleteFormula(deleteTargetFormula);
          }
        }}
        open={!!deleteTargetFormula}
        pending={
          !!deleteTargetFormula && pendingKey === `delete:${deleteTargetFormula.id}`
        }
        title={
          deleteTargetFormula
            ? `Delete "${deleteTargetFormula.columnLabel}"?`
            : 'Delete formula?'
        }
      />
    </div>
  );
}

