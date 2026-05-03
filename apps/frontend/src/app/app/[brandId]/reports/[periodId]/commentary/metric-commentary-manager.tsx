'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

type MetricCommentaryItem = {
  key: 'views' | 'viewers' | 'engagement' | 'video_views_3s';
  label: string;
  remark: string | null;
  requiresRemark: boolean;
  requirementDetail: string;
  currentValue: number | null;
  previousValue: number | null;
  hasPreviousValue: boolean;
  changePercent: number | null;
};

type Props = {
  brandId: string;
  periodId: string;
  importHref: string;
  isReadOnly: boolean;
  readOnlyReason: string | null;
  isFirstReportingMonth: boolean;
  viewersInputReady: boolean;
  initialItems: MetricCommentaryItem[];
};

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
type MetricKey = MetricCommentaryItem['key'];
type MetricFormValues = Record<MetricKey, { remark: string }>;

const firstMonthDefaultRemark = 'First reporting month, no previous-month comparison.';
const metricKeyOrder: MetricKey[] = ['views', 'viewers', 'engagement', 'video_views_3s'];

function toFormValues(items: MetricCommentaryItem[], isFirstReportingMonth: boolean): MetricFormValues {
  const itemByKey = new Map(items.map((item) => [item.key, item]));
  return Object.fromEntries(
    metricKeyOrder.map((key) => {
      const item = itemByKey.get(key) ?? null;
      let remark = item?.remark ?? '';
      if (
        isFirstReportingMonth &&
        item?.requiresRemark &&
        remark.trim().length === 0
      ) {
        remark = firstMonthDefaultRemark;
      }
      return [key, { remark }];
    })
  ) as MetricFormValues;
}

function areFormValuesEqual(left: MetricFormValues, right: MetricFormValues) {
  return metricKeyOrder.every((key) => left[key].remark.trim() === right[key].remark.trim());
}

function toPayload(values: MetricFormValues) {
  return {
    entries: metricKeyOrder.map((key) => ({
      key,
      remark: values[key].remark.trim() || null
    }))
  };
}

function validate(values: MetricFormValues, items: MetricCommentaryItem[]) {
  const errors: Partial<Record<MetricKey, string | null>> = {};
  const itemByKey = new Map(items.map((item) => [item.key, item]));

  for (const key of metricKeyOrder) {
    const item = itemByKey.get(key);
    if (!item) {
      errors[key] = null;
      continue;
    }

    if (item.requiresRemark && values[key].remark.trim().length === 0) {
      errors[key] = 'Remark is required for this metric.';
      continue;
    }

    errors[key] = null;
  }

  return errors;
}

function formatValue(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return 'N/A';
  }

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: value % 1 === 0 ? 0 : 2
  }).format(value);
}

function formatChange(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return 'N/A';
  }

  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

function formatSignedDelta(currentValue: number | null, previousValue: number | null) {
  if (
    currentValue === null ||
    previousValue === null ||
    Number.isNaN(currentValue) ||
    Number.isNaN(previousValue)
  ) {
    return 'N/A';
  }

  const delta = currentValue - previousValue;
  const sign = delta > 0 ? '+' : '';
  const formatted = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: delta % 1 === 0 ? 0 : 2
  }).format(delta);

  return `${sign}${formatted}`;
}

function MiniCompareChart({
  currentValue,
  previousValue,
  hasPreviousValue
}: {
  currentValue: number | null;
  previousValue: number | null;
  hasPreviousValue: boolean;
}) {
  const safeCurrent = Math.max(0, currentValue ?? 0);
  const safePrevious = Math.max(0, previousValue ?? 0);
  const maxValue = Math.max(safeCurrent, safePrevious, 1);
  const currentHeight = `${Math.max(8, Math.round((safeCurrent / maxValue) * 68))}px`;
  const previousHeight = `${Math.max(8, Math.round((safePrevious / maxValue) * 68))}px`;

  return (
    <div className="rounded-xl border border-border/60 bg-background/70 p-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Previous</div>
          <div className="flex h-[76px] items-end">
            <div
              className={`w-full rounded-md ${
                hasPreviousValue
                  ? 'bg-slate-400/80'
                  : 'border border-dashed border-slate-400/70 bg-transparent'
              }`}
              style={{ height: previousHeight }}
            />
          </div>
          <div className="text-xs text-muted-foreground">
            {hasPreviousValue ? formatValue(previousValue) : 'No previous'}
          </div>
        </div>
        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Current</div>
          <div className="flex h-[76px] items-end">
            <div className="w-full rounded-md bg-emerald-500/85" style={{ height: currentHeight }} />
          </div>
          <div className="text-xs text-foreground">{formatValue(currentValue)}</div>
        </div>
      </div>
    </div>
  );
}

export function MetricCommentaryManager({
  brandId,
  periodId,
  importHref,
  isReadOnly,
  readOnlyReason,
  isFirstReportingMonth,
  viewersInputReady,
  initialItems
}: Props) {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api';
  const [values, setValues] = useState(() => toFormValues(initialItems, isFirstReportingMonth));
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const requestSequenceRef = useRef(0);
  const lastPersistedValuesRef = useRef(toFormValues(initialItems, isFirstReportingMonth));

  useEffect(() => {
    const nextValues = toFormValues(initialItems, isFirstReportingMonth);
    setValues(nextValues);
    setSaveStatus('idle');
    setSaveError(null);
    setSavedAt(null);
    lastPersistedValuesRef.current = nextValues;
    requestSequenceRef.current += 1;
  }, [initialItems, isFirstReportingMonth]);

  const errors = useMemo(() => validate(values, initialItems), [values, initialItems]);
  const hasValidationError = metricKeyOrder.some((key) => !!errors[key]);
  const requiredCount = initialItems.filter((item) => item.requiresRemark).length;
  const completedCount = initialItems.filter(
    (item) => item.requiresRemark && values[item.key].remark.trim().length > 0
  ).length;
  const missingCount = Math.max(0, requiredCount - completedCount);

  async function persist(nextValues: MetricFormValues, mode: 'auto' | 'manual') {
    if (isReadOnly || hasValidationError) {
      return;
    }

    const requestSequence = ++requestSequenceRef.current;
    setSaveStatus('saving');
    setSaveError(null);

    try {
      const response = await fetch(
        `${apiBaseUrl}/brands/${brandId}/reporting-periods/${periodId}/dataset`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            rows: [],
            metricCommentary: toPayload(nextValues)
          })
        }
      );

      if (requestSequence !== requestSequenceRef.current) {
        return;
      }

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { message?: string | string[] }
          | null;
        const message = Array.isArray(payload?.message)
          ? payload.message.join(', ')
          : payload?.message || 'Failed to save commentary.';
        throw new Error(message);
      }

      setSaveStatus('saved');
      setSavedAt(
        new Intl.DateTimeFormat('en-GB', {
          hour: '2-digit',
          minute: '2-digit'
        }).format(new Date())
      );
      setSaveError(null);
      lastPersistedValuesRef.current = nextValues;
      if (mode === 'manual') {
        window.location.reload();
      }
    } catch (error) {
      if (requestSequence !== requestSequenceRef.current) {
        return;
      }
      setSaveStatus('error');
      setSaveError(error instanceof Error ? error.message : 'Failed to save commentary.');
    }
  }

  useEffect(() => {
    if (isReadOnly || hasValidationError) {
      return;
    }

    if (areFormValuesEqual(values, lastPersistedValuesRef.current)) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void persist(values, 'auto');
    }, 700);

    return () => window.clearTimeout(timeout);
  }, [hasValidationError, isReadOnly, values]);

  function updateRemark(key: MetricKey, remark: string) {
    if (isReadOnly) {
      return;
    }

    setValues((current) => ({
      ...current,
      [key]: {
        remark
      }
    }));
  }

  const statusText = (() => {
    if (isReadOnly) {
      return readOnlyReason ?? 'Read-only (locked)';
    }
    if (hasValidationError) {
      return 'Complete required remarks before this step can pass.';
    }
    if (saveStatus === 'saving') {
      return 'Auto-save: saving...';
    }
    if (saveStatus === 'saved') {
      return savedAt ? `Auto-save: saved at ${savedAt}` : 'Auto-save: saved';
    }
    if (saveStatus === 'error') {
      return `Auto-save failed${saveError ? `: ${saveError}` : '.'}`;
    }
    return 'Auto-save is on';
  })();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {completedCount}/{requiredCount} required remarks completed
          {missingCount > 0 ? ` (${missingCount} missing)` : ''}
        </div>
        <div className="flex items-center gap-3">
          <div
            className={`text-xs ${
              saveStatus === 'error'
                ? 'text-rose-500'
                : saveStatus === 'saving'
                  ? 'text-amber-500'
                  : 'text-muted-foreground'
            }`}
          >
            {statusText}
          </div>
          {!isReadOnly ? (
            <Button
              disabled={hasValidationError || saveStatus === 'saving'}
              onClick={() => void persist(values, 'manual')}
              size="sm"
              type="button"
              variant="outline"
            >
              Save now
            </Button>
          ) : null}
        </div>
      </div>

      {!viewersInputReady ? (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/8 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          Please enter Viewers in Import before adding commentary for Total Viewers.
          <div className="mt-3">
            <Button asChild size="sm" variant="secondary">
              <Link href={importHref}>Go to Import</Link>
            </Button>
          </div>
        </div>
      ) : null}

      {isReadOnly ? (
        <div className="rounded-2xl border border-slate-500/25 bg-slate-500/8 px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
          {readOnlyReason ?? 'Read-only (locked): this report cannot be edited in the current mode.'}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {initialItems.map((item) => {
          const isRemarkBlocked = isReadOnly || (item.key === 'viewers' && !viewersInputReady);
          const error = errors[item.key];

          return (
            <div className="space-y-3 rounded-2xl border border-border/60 bg-background/60 p-4" key={item.key}>
              <div className="space-y-1">
                <div className="text-sm font-medium text-foreground">{item.label}</div>
                <div className="text-xs text-muted-foreground">
                  Change:{' '}
                  {item.hasPreviousValue
                    ? `${formatChange(item.changePercent)} (${formatSignedDelta(item.currentValue, item.previousValue)})`
                    : 'N/A'}
                </div>
                <div className="text-xs text-muted-foreground">{item.requirementDetail}</div>
              </div>

              <MiniCompareChart
                currentValue={item.currentValue}
                hasPreviousValue={item.hasPreviousValue}
                previousValue={item.previousValue}
              />

              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  Remark
                </label>
                <Textarea
                  className="min-h-24"
                  disabled={isRemarkBlocked || !item.requiresRemark}
                  onChange={(event) => updateRemark(item.key, event.currentTarget.value)}
                  placeholder={
                    !item.requiresRemark
                      ? 'Remark is optional for this month.'
                      : 'Write reason for this month movement.'
                  }
                  value={values[item.key].remark}
                />
                {error ? <div className="text-xs text-rose-500">{error}</div> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
