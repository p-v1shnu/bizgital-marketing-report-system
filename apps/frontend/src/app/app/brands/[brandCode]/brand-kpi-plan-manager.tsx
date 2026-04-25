'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ModalShell } from '@/components/ui/modal-shell';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { BrandKpiPlanResponse, KpiCatalogItem } from '@/lib/reporting-api';
import { REPORTING_YEAR_LOOKAHEAD } from '@/lib/year-options';

type Props = {
  brandCode: string;
  catalog: KpiCatalogItem[];
  initialYear: number;
  plan: BrandKpiPlanResponse;
  showYearPicker?: boolean;
  onPlanChanged?: (plan: BrandKpiPlanResponse) => void;
};

type Draft = {
  planItemId: string | null;
  kpiCatalogId: string;
  targetValue: string;
  note: string;
  sortOrder: string;
};

type PlanItem = BrandKpiPlanResponse['items'][number];

function createEmptyDraft(): Draft {
  return {
    planItemId: null,
    kpiCatalogId: '',
    targetValue: '',
    note: '',
    sortOrder: '1'
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

function formatNumber(value: number | null) {
  if (value === null) {
    return 'No target';
  }

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: value % 1 === 0 ? 0 : 2
  }).format(value);
}

function sortItems(items: PlanItem[]) {
  return [...items].sort((left, right) => left.sortOrder - right.sortOrder);
}

export function BrandKpiPlanManager({
  brandCode,
  catalog,
  initialYear,
  plan,
  showYearPicker = true,
  onPlanChanged
}: Props) {
  const router = useRouter();
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api';
  const currentYear = new Date().getUTCFullYear();

  const [selectedYear, setSelectedYear] = useState(initialYear);
  const [maxVisitedYear, setMaxVisitedYear] = useState(
    Math.max(currentYear, initialYear)
  );
  const [draftItems, setDraftItems] = useState<PlanItem[]>(() => sortItems(plan.items));
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [draft, setDraft] = useState<Draft>(createEmptyDraft);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const selectedCatalogIds = new Set(draftItems.map(item => item.kpi.id));
  const catalogById = useMemo(() => new Map(catalog.map(item => [item.id, item])), [catalog]);
  const maxSelectableYear = Math.max(
    maxVisitedYear,
    currentYear + REPORTING_YEAR_LOOKAHEAD,
    selectedYear + 1
  );
  const yearOptions = useMemo(() => {
    const years: number[] = [];
    for (let year = maxSelectableYear; year >= 2000; year -= 1) {
      years.push(year);
    }
    return years;
  }, [maxSelectableYear]);

  function clearStatus() {
    setStatusError(null);
    setStatusMessage(null);
  }

  function openCreateModal() {
    setModalMode('create');
    setDraft({
      planItemId: null,
      kpiCatalogId: '',
      targetValue: '',
      note: '',
      sortOrder: String(draftItems.length + 1)
    });
    setStatusError(null);
  }

  function openEditModal(item: PlanItem) {
    setModalMode('edit');
    setDraft({
      planItemId: item.id,
      kpiCatalogId: item.kpi.id,
      targetValue: item.targetValue === null ? '' : String(item.targetValue),
      note: item.note ?? '',
      sortOrder: String(item.sortOrder)
    });
    setStatusError(null);
  }

  function closeModal() {
    setModalMode(null);
    setPendingKey(null);
  }

  async function fetchPlanForYear(year: number) {
    const response = await fetch(`${apiBase}/brands/${brandCode}/kpi-plans/${year}`, {
      cache: 'no-store'
    });
    const payload = (await response
      .json()
      .catch(() => null)) as BrandKpiPlanResponse | { message?: string | string[] } | null;

    if (!response.ok) {
      throw new Error(parseErrorMessage(payload, `Failed to load KPI plan for ${year}.`));
    }

    return payload as BrandKpiPlanResponse;
  }

  async function postPlanForYear(year: number, items: PlanItem[]) {
    const response = await fetch(`${apiBase}/brands/${brandCode}/kpi-plans/${year}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        items: items.map((item, index) => ({
          kpiCatalogId: item.kpi.id,
          targetValue: item.targetValue,
          note: item.note,
          sortOrder: index + 1
        }))
      })
    });
    const payload = (await response
      .json()
      .catch(() => null)) as BrandKpiPlanResponse | { message?: string | string[] } | null;

    if (!response.ok) {
      throw new Error(parseErrorMessage(payload, `Failed to save KPI plan for ${year}.`));
    }

    return payload as BrandKpiPlanResponse;
  }

  async function loadYear(year: number) {
    if (year < 2000 || year > 3000) {
      setStatusError('Year must be between 2000 and 3000.');
      return;
    }

    setPendingKey('load-year');
    clearStatus();

    try {
      const loaded = await fetchPlanForYear(year);
      setSelectedYear(loaded.year);
      setMaxVisitedYear(current => Math.max(current, loaded.year));
      setDraftItems(sortItems(loaded.items));
      onPlanChanged?.(loaded);
      router.replace(`/app/brands/${brandCode}?tab=kpi&year=${loaded.year}`);
    } catch (error) {
      setStatusError(
        error instanceof Error ? error.message : `Failed to load KPI plan for ${year}.`
      );
    } finally {
      setPendingKey(null);
    }
  }

  async function persist(items: PlanItem[], successMessage: string) {
    setPendingKey('save');
    clearStatus();

    try {
      const saved = await postPlanForYear(selectedYear, items);
      setDraftItems(sortItems(saved.items));
      onPlanChanged?.(saved);
      setStatusMessage(successMessage);
      closeModal();
      router.refresh();
      return true;
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : 'Failed to save KPI plan.');
      return false;
    } finally {
      setPendingKey(null);
    }
  }

  async function saveDraftItem() {
    if (!draft.kpiCatalogId) {
      setStatusError('Choose a KPI definition first.');
      return;
    }

    const kpi = catalogById.get(draft.kpiCatalogId);

    if (!kpi) {
      setStatusError('Selected KPI definition is unavailable.');
      return;
    }

    const normalizedTarget = draft.targetValue.trim();
    if (normalizedTarget && Number.isNaN(Number(normalizedTarget))) {
      setStatusError('Target value must be numeric.');
      return;
    }

    const baseItem: PlanItem = {
      id: draft.planItemId ?? `draft-${draft.kpiCatalogId}`,
      sortOrder: Number(draft.sortOrder) || draftItems.length + 1,
      targetValue: normalizedTarget ? Number(normalizedTarget) : null,
      note: draft.note.trim() || null,
      kpi: {
        id: kpi.id,
        key: kpi.key,
        label: kpi.label,
        description: kpi.description,
        sourceType: kpi.sourceType,
        canonicalMetricKey: kpi.canonicalMetricKey,
        formulaId: kpi.formulaId,
        formulaLabel: kpi.formulaLabel,
        isActive: kpi.isActive
      }
    };

    const nextItems =
      modalMode === 'edit' && draft.planItemId
        ? draftItems
            .map(item => (item.id === draft.planItemId ? baseItem : item))
            .sort((left, right) => left.sortOrder - right.sortOrder)
        : [...draftItems, baseItem].sort((left, right) => left.sortOrder - right.sortOrder);

    await persist(
      nextItems,
      modalMode === 'create'
        ? `Added "${kpi.label}" to the ${selectedYear} KPI plan.`
        : `Updated "${kpi.label}" in the ${selectedYear} KPI plan.`
    );
  }

  async function removeItem(item: PlanItem) {
    if (item.canRemove === false) {
      setStatusMessage(null);
      setStatusError(item.removeBlockedReason ?? 'This KPI cannot be removed.');
      return;
    }

    const nextItems = draftItems.filter(current => current.id !== item.id);
    await persist(nextItems, `Updated the ${selectedYear} KPI plan.`);
  }

  const availableCatalog = catalog.filter(item => {
    if (item.id === draft.kpiCatalogId) {
      return true;
    }

    return item.isActive && !selectedCatalogIds.has(item.id);
  });

  return (
    <div className="space-y-4">
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

      {showYearPicker ? (
        <div className="rounded-[24px] border border-border/60 bg-background/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-base font-semibold text-foreground">Year setup</div>
            <Badge variant="outline">
              {draftItems.length} KPI in {selectedYear}
            </Badge>
          </div>

          <div className="mt-4 max-w-[220px] space-y-2">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="kpi-plan-year-select">
                Report year
              </label>
              <Select
                disabled={pendingKey !== null}
                id="kpi-plan-year-select"
                onChange={event => void loadYear(Number(event.currentTarget.value))}
                value={String(selectedYear)}
              >
                {yearOptions.map(year => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </div>
      ) : null}

      <div className="rounded-[24px] border border-border/60 bg-background/60 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="text-base font-semibold text-foreground">
              KPI plan for {selectedYear}
            </div>
            <div className="text-sm text-muted-foreground">
              Manage KPI targets from Actions.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={pendingKey !== null} onClick={openCreateModal} size="sm" type="button">
              Add KPI
            </Button>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {draftItems.length === 0 ? (
            <div className="rounded-[18px] border border-dashed border-border/60 px-3 py-3 text-sm text-muted-foreground">
              No KPI items configured for {selectedYear} yet.
            </div>
          ) : (
            draftItems
              .slice()
              .sort((left, right) => left.sortOrder - right.sortOrder)
              .map((item, index) => (
                <div
                  className="flex flex-wrap items-center gap-3 rounded-[18px] border border-border/60 bg-background/70 px-3 py-3"
                  key={item.id}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground">
                      {index + 1}. {item.kpi.label}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {item.kpi.sourceType === 'canonical_metric'
                        ? item.kpi.canonicalMetricKey
                        : item.kpi.formulaLabel ?? 'Formula column'}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      Target: {formatNumber(item.targetValue)}
                    </div>
                    {item.note ? (
                      <div className="mt-1 text-xs text-muted-foreground">{item.note}</div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={pendingKey !== null}
                      onClick={() => openEditModal(item)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Edit
                    </Button>
                    <Button
                      disabled={pendingKey !== null || item.canRemove === false}
                      onClick={() => void removeItem(item)}
                      size="sm"
                      title={item.canRemove === false ? item.removeBlockedReason ?? undefined : undefined}
                      type="button"
                      variant="outline"
                    >
                      Remove
                    </Button>
                  </div>
                  {item.canRemove === false && item.removeBlockedReason ? (
                    <div className="mt-1 w-full text-xs text-amber-700 dark:text-amber-300">
                      {item.removeBlockedReason}
                    </div>
                  ) : null}
                </div>
              ))
          )}
        </div>
      </div>

      {modalMode ? (
        <ModalShell
          description="Add or update one yearly KPI target at a time from this popup."
          onClose={closeModal}
          title={modalMode === 'create' ? `Add KPI to ${selectedYear} plan` : `Edit ${selectedYear} KPI`}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="brand-kpi-definition-select">
                KPI definition
              </label>
              <Select
                disabled={modalMode === 'edit' || pendingKey !== null}
                id="brand-kpi-definition-select"
                onChange={event => {
                  const value = event.currentTarget.value;
                  setDraft(current => ({ ...current, kpiCatalogId: value }));
                }}
                value={draft.kpiCatalogId}
              >
                <option value="">Choose KPI definition</option>
                {availableCatalog.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="brand-kpi-target-value-input">
                Target value
              </label>
              <Input
                id="brand-kpi-target-value-input"
                inputMode="decimal"
                onChange={event => {
                  const value = event.currentTarget.value;
                  setDraft(current => ({ ...current, targetValue: value }));
                }}
                placeholder="Target value"
                value={draft.targetValue}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="brand-kpi-sort-order-input">
                Display order
              </label>
              <Input
                id="brand-kpi-sort-order-input"
                onChange={event => {
                  const value = event.currentTarget.value;
                  setDraft(current => ({ ...current, sortOrder: value }));
                }}
                placeholder="Order"
                value={draft.sortOrder}
              />
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/60 px-4 py-3 text-sm text-muted-foreground">
              Source:{' '}
              {draft.kpiCatalogId
                ? catalogById.get(draft.kpiCatalogId)?.sourceType === 'canonical_metric'
                  ? catalogById.get(draft.kpiCatalogId)?.canonicalMetricKey
                  : catalogById.get(draft.kpiCatalogId)?.formulaLabel ?? 'Formula column'
                : 'Select KPI first'}
            </div>
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium" htmlFor="brand-kpi-note-input">
                Planning note (optional)
              </label>
              <Textarea
                className="min-h-28 w-full rounded-2xl border border-input bg-background/70 px-4 py-3 text-sm text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
                id="brand-kpi-note-input"
                onChange={event => {
                  const value = event.currentTarget.value;
                  setDraft(current => ({ ...current, note: value }));
                }}
                placeholder="Optional planning note"
                value={draft.note}
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              disabled={pendingKey !== null}
              onClick={() => void saveDraftItem()}
              type="button"
            >
              {modalMode === 'create' ? 'Add KPI target' : 'Save changes'}
            </Button>
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}

