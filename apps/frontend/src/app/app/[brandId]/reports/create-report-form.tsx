'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ModalShell } from '@/components/ui/modal-shell';
import { monthLabel } from '@/lib/reporting-ui';

import { createPeriodAction, restoreReportingPeriodAction } from './actions';

const selectClassName =
  'flex h-11 w-full rounded-2xl border border-input bg-background/70 px-4 py-2 text-sm text-foreground shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring/60';

type CreateReportFormProps = {
  brandId: string;
  suggestedCreateYear: number;
  suggestedCreateMonth: number;
  recycleBinItems: Array<{
    id: string;
    year: number;
    month: number;
    label: string;
  }>;
  layout?: 'vertical' | 'horizontal';
};

function RestoreReportSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending} size="sm" type="submit" variant="outline">
      {pending ? 'Restoring...' : 'Restore existing report'}
    </Button>
  );
}

export function CreateReportForm({
  brandId,
  suggestedCreateYear,
  suggestedCreateMonth,
  recycleBinItems,
  layout = 'vertical'
}: CreateReportFormProps) {
  const [year, setYear] = useState(suggestedCreateYear);
  const [month, setMonth] = useState(suggestedCreateMonth);
  const [recycleConflict, setRecycleConflict] = useState<{
    id: string;
    year: number;
    month: number;
    label: string;
  } | null>(null);
  const [showCreateEmptyConfirmation, setShowCreateEmptyConfirmation] = useState(false);
  const [replaceDeleted, setReplaceDeleted] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  const allowReplaceSubmitRef = useRef(false);

  useEffect(() => {
    setYear(suggestedCreateYear);
    setMonth(suggestedCreateMonth);
  }, [suggestedCreateYear, suggestedCreateMonth]);

  const normalizedYear =
    Number.isInteger(year) && year >= 2000 && year <= 3000 ? year : suggestedCreateYear;
  const monthOptions = useMemo(
    () => Array.from({ length: 12 }, (_, index) => index + 1),
    []
  );
  const recycleItemByYearMonth = useMemo(
    () => new Map(recycleBinItems.map(item => [`${item.year}-${item.month}`, item])),
    [recycleBinItems]
  );
  const isHorizontal = layout === 'horizontal';

  useEffect(() => {
    if (!recycleConflict) {
      return;
    }

    if (recycleConflict.year !== year || recycleConflict.month !== month) {
      setRecycleConflict(null);
      setShowCreateEmptyConfirmation(false);
    }
  }, [month, recycleConflict, year]);

  function submitCreateEmptyReport() {
    setReplaceDeleted(true);
    setShowCreateEmptyConfirmation(false);
    setRecycleConflict(null);
    allowReplaceSubmitRef.current = true;
    window.setTimeout(() => {
      formRef.current?.requestSubmit();
    }, 0);
  }

  return (
    <>
      <form
        action={createPeriodAction}
        className={isHorizontal ? 'grid gap-3 lg:grid-cols-[140px_220px_max-content]' : 'space-y-4'}
        key={`${suggestedCreateYear}-${suggestedCreateMonth}`}
        onSubmit={event => {
          if (allowReplaceSubmitRef.current) {
            allowReplaceSubmitRef.current = false;
            return;
          }

          const matched = recycleItemByYearMonth.get(`${year}-${month}`);
          if (!matched) {
            setReplaceDeleted(false);
            return;
          }

          event.preventDefault();
          setReplaceDeleted(false);
          setShowCreateEmptyConfirmation(false);
          setRecycleConflict(matched);
        }}
        ref={formRef}
      >
        <input name="brandId" type="hidden" value={brandId} />
        <input name="replaceDeleted" type="hidden" value={replaceDeleted ? 'true' : 'false'} />

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="report-year">
            Year
          </label>
          <Input
            id="report-year"
            min={2020}
            name="year"
            onChange={(event) => setYear(Number(event.currentTarget.value))}
            type="number"
            value={year}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="report-month">
            Month
          </label>
          <select
            className={selectClassName}
            id="report-month"
            name="month"
            onChange={(event) => setMonth(Number(event.currentTarget.value))}
            value={String(month)}
          >
            {monthOptions.map((monthValue) => (
              <option key={monthValue} value={monthValue}>
                {monthLabel(normalizedYear, monthValue)}
              </option>
            ))}
          </select>
        </div>

        <Button
          className={isHorizontal ? 'w-full self-end lg:w-auto lg:min-w-[170px]' : 'w-full'}
          size={isHorizontal ? 'default' : 'sm'}
          type="submit"
          variant="default"
        >
          Create report
        </Button>
      </form>

      {recycleConflict && !showCreateEmptyConfirmation ? (
        <ModalShell
          closeOnBackdropClick
          description={`A report for ${recycleConflict.label} is currently in Recycle Bin.`}
          onClose={() => setRecycleConflict(null)}
          showCloseButton={false}
          title="This month is in Recycle Bin"
          widthClassName="max-w-lg"
        >
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Choose how you want to continue for {recycleConflict.label}.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setRecycleConflict(null)} size="sm" type="button" variant="outline">
                Cancel
              </Button>
              <form action={restoreReportingPeriodAction}>
                <input name="brandId" type="hidden" value={brandId} />
                <input name="periodId" type="hidden" value={recycleConflict.id} />
                <input name="year" type="hidden" value={year} />
                <RestoreReportSubmitButton />
              </form>
              <Button
                onClick={() => setShowCreateEmptyConfirmation(true)}
                size="sm"
                type="button"
                variant="default"
              >
                Create new empty report
              </Button>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {recycleConflict && showCreateEmptyConfirmation ? (
        <ModalShell
          closeOnBackdropClick={false}
          description={`The previous ${recycleConflict.label} report in Recycle Bin will be permanently removed.`}
          onClose={() => setShowCreateEmptyConfirmation(false)}
          showCloseButton={false}
          title="Create a new empty report?"
          widthClassName="max-w-lg"
        >
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This action clears the previous month data (drafts, screenshots, notes, and evidence)
              before creating a fresh report for this month.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => setShowCreateEmptyConfirmation(false)}
                size="sm"
                type="button"
                variant="outline"
              >
                Back
              </Button>
              <Button onClick={submitCreateEmptyReport} size="sm" type="button" variant="default">
                Yes, create empty report
              </Button>
            </div>
          </div>
        </ModalShell>
      ) : null}
    </>
  );
}
