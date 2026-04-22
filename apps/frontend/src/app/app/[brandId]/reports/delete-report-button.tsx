'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { ModalShell } from '@/components/ui/modal-shell';

import { deleteReportingPeriodAction } from './actions';

type DeleteReportButtonProps = {
  brandId: string;
  periodId: string;
  periodLabel: string;
  year: number;
  triggerLabel?: string;
  triggerVariant?: 'default' | 'outline' | 'ghost';
  triggerClassName?: string;
};

function DeleteReportSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending} size="sm" type="submit" variant="default">
      {pending ? 'Moving...' : 'Move to recycle bin'}
    </Button>
  );
}

export function DeleteReportButton({
  brandId,
  periodId,
  periodLabel,
  year,
  triggerLabel = 'Delete',
  triggerVariant = 'ghost',
  triggerClassName
}: DeleteReportButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        className={triggerClassName}
        onClick={() => setOpen(true)}
        size="sm"
        type="button"
        variant={triggerVariant}
      >
        {triggerLabel}
      </Button>

      {open ? (
        <ModalShell
          closeOnBackdropClick
          description="This report will move to Recycle Bin and can be restored within 7 days."
          onClose={() => setOpen(false)}
          showCloseButton={false}
          title={`Move ${periodLabel} to Recycle Bin?`}
          widthClassName="max-w-lg"
        >
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              After 7 days, this report will be permanently deleted with its related uploaded media
              files.
            </p>

            <form action={deleteReportingPeriodAction} className="flex flex-wrap gap-2">
              <input name="brandId" type="hidden" value={brandId} />
              <input name="periodId" type="hidden" value={periodId} />
              <input name="year" type="hidden" value={year} />

              <Button
                onClick={() => setOpen(false)}
                size="sm"
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <DeleteReportSubmitButton />
            </form>
          </div>
        </ModalShell>
      ) : null}
    </>
  );
}
