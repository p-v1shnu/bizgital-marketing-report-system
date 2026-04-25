'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { ConfirmActionModal } from '@/components/ui/confirm-action-modal';
import { Input } from '@/components/ui/input';
import { ModalShell } from '@/components/ui/modal-shell';
import { Select } from '@/components/ui/select';
import type {
  CompanyFormatFieldKey,
  GlobalCompanyFormatOptionsResponse
} from '@/lib/reporting-api';

type CompanyOption = GlobalCompanyFormatOptionsResponse['fields'][number]['options'][number];

type Props = {
  brandCode?: string;
  fieldKey: CompanyFormatFieldKey;
  fieldLabel: string;
  options: CompanyOption[];
  scope: 'global' | 'brand';
};

type Draft = {
  label: string;
  status: 'active' | 'deprecated';
  desiredPosition: string;
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

function sortOptions(options: CompanyOption[]) {
  return [...options].sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }

    return left.label.localeCompare(right.label);
  });
}

export function CompanyFormatOptionsManager({
  brandCode,
  fieldKey,
  fieldLabel,
  options,
  scope
}: Props) {
  const router = useRouter();
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api';
  const orderedOptions = useMemo(() => sortOptions(options), [options]);
  const activeOptions = orderedOptions.filter(option => option.status === 'active');
  const inactiveOptions = orderedOptions.filter(option => option.status === 'deprecated');

  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editingOptionId, setEditingOptionId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({
    label: '',
    status: 'active',
    desiredPosition: 'end'
  });
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const endpointBase =
    scope === 'global'
      ? `${apiBase}/config/internal-options`
      : `${apiBase}/brands/${brandCode}/internal-options`;
  const canDeleteOption = true;
  const editingOption =
    editingOptionId ? orderedOptions.find(option => option.id === editingOptionId) ?? null : null;

  function openCreateModal() {
    setModalMode('create');
    setEditingOptionId(null);
    setDraft({
      label: '',
      status: 'active',
      desiredPosition: 'end'
    });
    setStatusError(null);
  }

  function openEditModal(option: CompanyOption) {
    const activeIndex = activeOptions.findIndex(item => item.id === option.id);

    setModalMode('edit');
    setEditingOptionId(option.id);
    setDraft({
      label: option.label,
      status: option.status,
      desiredPosition:
        option.status === 'active' && activeIndex >= 0 ? String(activeIndex + 1) : 'end'
    });
    setStatusError(null);
  }

  function closeModal() {
    setModalMode(null);
    setEditingOptionId(null);
    setPendingKey(null);
    setDeleteConfirmOpen(false);
  }

  async function updateOrder(optionId: string, nextStatus: Draft['status'], desiredPosition: string) {
    if (nextStatus !== 'active') {
      return;
    }

    const remainingActiveIds = activeOptions
      .filter(option => option.id !== optionId)
      .map(option => option.id);
    const requestedPosition =
      desiredPosition === 'end'
        ? remainingActiveIds.length + 1
        : Math.max(1, Math.min(Number(desiredPosition) || 1, remainingActiveIds.length + 1));

    remainingActiveIds.splice(requestedPosition - 1, 0, optionId);

    const response = await fetch(`${endpointBase}/reorder`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fieldKey,
        optionIds: remainingActiveIds
      })
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(parseErrorMessage(payload, 'Failed to update option order.'));
    }
  }

  async function saveOption() {
    if (!modalMode) {
      return;
    }

    setPendingKey('save');
    setStatusError(null);
    setStatusMessage(null);

    try {
      const commonPayload = {
        label: draft.label.trim(),
        status: draft.status
      };
      let optionId = editingOptionId;

      if (!commonPayload.label) {
        setStatusError('Option label is required.');
        return;
      }

      if (modalMode === 'create') {
        const response = await fetch(endpointBase, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            fieldKey,
            label: commonPayload.label
          })
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          setStatusError(parseErrorMessage(payload, 'Failed to create option.'));
          return;
        }

        optionId =
          payload && typeof payload === 'object' && 'option' in payload
            ? String((payload as { option?: { id?: string } }).option?.id ?? '')
            : '';

        if (draft.status === 'deprecated' && optionId) {
          await fetch(`${endpointBase}/${optionId}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              status: 'deprecated'
            })
          });
        }
      } else if (editingOptionId) {
        const response = await fetch(`${endpointBase}/${editingOptionId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(commonPayload)
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          setStatusError(parseErrorMessage(payload, 'Failed to update option.'));
          return;
        }
      }

      if (optionId) {
        await updateOrder(optionId, draft.status, draft.desiredPosition);
      }

      setStatusMessage(
        modalMode === 'create'
          ? `Added "${commonPayload.label}".`
          : `Updated "${commonPayload.label}".`
      );
      closeModal();
      router.refresh();
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : 'Failed to save option.');
    } finally {
      setPendingKey(null);
    }
  }

  async function deleteOption() {
    if (!editingOptionId || modalMode !== 'edit' || !canDeleteOption) {
      return;
    }

    setPendingKey('delete');
    setStatusError(null);
    setStatusMessage(null);

    try {
      const response = await fetch(`${endpointBase}/${editingOptionId}`, {
        method: 'DELETE'
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setStatusError(parseErrorMessage(payload, 'Failed to delete option.'));
        return;
      }

      const deletedLabel = editingOption?.label || 'option';
      setDeleteConfirmOpen(false);
      closeModal();
      setStatusMessage(`Deleted "${deletedLabel}".`);
      router.refresh();
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : 'Failed to delete option.');
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <div className="space-y-3 rounded-[24px] border border-border/60 bg-background/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-base font-semibold text-foreground">{fieldLabel}</div>
          <div className="text-sm text-muted-foreground">
            Manage options from the Actions buttons.
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={openCreateModal} size="sm" type="button">
            Add option
          </Button>
        </div>
      </div>

      {statusError && !modalMode ? (
        <div className="rounded-2xl border border-rose-500/25 bg-rose-500/8 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
          {statusError}
        </div>
      ) : null}
      {statusMessage && !modalMode ? (
        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/8 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          {statusMessage}
        </div>
      ) : null}

      <div className="space-y-2">
        {activeOptions.length === 0 ? (
          <div className="rounded-[18px] border border-dashed border-border/60 px-3 py-3 text-sm text-muted-foreground">
            No active options yet.
          </div>
        ) : (
          activeOptions.map((option, index) => (
            <div
              className="flex flex-wrap items-center gap-2 rounded-[18px] border border-border/60 bg-background/70 px-3 py-2"
              key={option.id}
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-foreground">{option.label}</div>
                <div className="text-xs text-muted-foreground">Position {index + 1}</div>
              </div>
              <Button onClick={() => openEditModal(option)} size="sm" type="button" variant="outline">
                Edit
              </Button>
            </div>
          ))
        )}
      </div>

      {inactiveOptions.length > 0 ? (
        <div className="border-t border-border/60 pt-3">
          <div className="mb-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
            Inactive options
          </div>
          <div className="space-y-2">
            {inactiveOptions.map(option => (
              <div
                className="flex flex-wrap items-center gap-2 rounded-[18px] border border-border/60 bg-background/70 px-3 py-2"
                key={option.id}
              >
                <div className="min-w-0 flex-1 text-sm text-muted-foreground">{option.label}</div>
                <Button onClick={() => openEditModal(option)} size="sm" type="button" variant="outline">
                  Edit
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {modalMode ? (
        <ModalShell
          description="All changes are saved from this popup so the list stays read-only."
          error={statusError}
          message={statusMessage}
          onClose={closeModal}
          title={modalMode === 'create' ? `Add ${fieldLabel} option` : `Edit ${fieldLabel} option`}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="company-format-label-input">
                {fieldLabel} label
              </label>
              <Input
                id="company-format-label-input"
                onChange={event => {
                  const value = event.currentTarget.value;
                  setDraft(current => ({ ...current, label: value }));
                }}
                placeholder={`${fieldLabel} label`}
                value={draft.label}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="company-format-status-input">
                Status
              </label>
              <Select
                id="company-format-status-input"
                onChange={event => {
                  const value = event.currentTarget.value as Draft['status'];
                  setDraft(current => ({
                    ...current,
                    status: value
                  }));
                }}
                value={draft.status}
              >
                <option value="active">Active</option>
                <option value="deprecated">Inactive</option>
              </Select>
            </div>
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-foreground">
                Active position
              </label>
              <Select
                disabled={draft.status !== 'active'}
                onChange={event => {
                  const value = event.currentTarget.value;
                  setDraft(current => ({
                    ...current,
                    desiredPosition: value
                  }));
                }}
                value={draft.desiredPosition}
              >
                <option value="end">Place at end</option>
                {Array.from({ length: activeOptions.length + (editingOption?.status === 'active' ? 0 : 1) }).map(
                  (_, index) => (
                    <option key={index + 1} value={String(index + 1)}>
                      Position {index + 1}
                    </option>
                  )
                )}
              </Select>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              disabled={pendingKey === 'save' || pendingKey === 'delete'}
              onClick={saveOption}
              type="button"
            >
              {modalMode === 'create' ? 'Add option' : 'Save changes'}
            </Button>
            {modalMode === 'edit' && canDeleteOption ? (
              <Button
                disabled={pendingKey === 'save' || pendingKey === 'delete'}
                onClick={() => {
                  setDeleteConfirmOpen(true);
                }}
                type="button"
                variant="outline"
              >
                Delete option
              </Button>
            ) : null}
          </div>
          {modalMode === 'edit' && canDeleteOption ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Delete is allowed only when this option is not used in any approved report.
            </p>
          ) : null}
        </ModalShell>
      ) : null}

      <ConfirmActionModal
        cancelLabel="Cancel"
        confirmLabel="Delete option"
        description="Delete this option permanently? Deletion is blocked if this option is used in any approved report."
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={() => {
          void deleteOption();
        }}
        open={deleteConfirmOpen && modalMode === 'edit' && !!editingOptionId}
        pending={pendingKey === 'delete'}
        title={`Delete "${editingOption?.label ?? 'option'}"?`}
      />
    </div>
  );
}

