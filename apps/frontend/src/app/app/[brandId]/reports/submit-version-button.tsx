'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { ModalShell } from '@/components/ui/modal-shell';

import { submitVersionAction } from './actions';

type SubmitVersionButtonProps = {
  brandId: string;
  periodId: string;
  year: number;
  versionId: string;
  triggerLabel?: string;
  triggerVariant?: 'default' | 'outline' | 'ghost';
  triggerClassName?: string;
};

function SubmitVersionConfirmButton() {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending} size="sm" type="submit" variant="default">
      {pending ? 'Submitting...' : 'Confirm submit'}
    </Button>
  );
}

export function SubmitVersionButton({
  brandId,
  periodId,
  year,
  versionId,
  triggerLabel = 'Submit',
  triggerVariant = 'outline',
  triggerClassName
}: SubmitVersionButtonProps) {
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
          description="This will send the current draft to reviewer decision and lock editing until a reviewer requests changes."
          onClose={() => setOpen(false)}
          showCloseButton={false}
          title="Submit this report for review?"
          widthClassName="max-w-lg"
        >
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Before submit, the system re-syncs autosave data and final checks for this month.
            </p>

            <form action={submitVersionAction} className="flex flex-wrap gap-2">
              <input name="brandId" type="hidden" value={brandId} />
              <input name="periodId" type="hidden" value={periodId} />
              <input name="versionId" type="hidden" value={versionId} />
              <input name="year" type="hidden" value={year} />

              <Button onClick={() => setOpen(false)} size="sm" type="button" variant="outline">
                Cancel
              </Button>
              <SubmitVersionConfirmButton />
            </form>
          </div>
        </ModalShell>
      ) : null}
    </>
  );
}
