'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { ModalShell } from '@/components/ui/modal-shell';

import { reopenForEditingAction } from './actions';

type ReopenReportButtonProps = {
  brandId: string;
  periodId: string;
  year: number;
  versionId: string;
  triggerLabel?: string;
  triggerVariant?: 'default' | 'outline' | 'ghost';
  triggerClassName?: string;
  redirectTo?: 'reports' | 'import' | 'review';
};

function ReopenReportSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending} size="sm" type="submit" variant="default">
      {pending ? 'Sending request...' : 'Confirm request'}
    </Button>
  );
}

export function ReopenReportButton({
  brandId,
  periodId,
  year,
  versionId,
  triggerLabel = 'Request edit access',
  triggerVariant = 'outline',
  triggerClassName,
  redirectTo = 'reports'
}: ReopenReportButtonProps) {
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
          description="This will reopen the submitted report and move workflow status back to in-progress."
          onClose={() => setOpen(false)}
          showCloseButton={false}
          title="Request edit access for this report?"
          widthClassName="max-w-lg"
        >
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              The submitted version stays in history, and users with create/edit permission can continue editing immediately after reopen.
            </p>

            <form action={reopenForEditingAction} className="flex flex-wrap gap-2">
              <input name="brandId" type="hidden" value={brandId} />
              <input name="periodId" type="hidden" value={periodId} />
              <input name="versionId" type="hidden" value={versionId} />
              <input name="year" type="hidden" value={year} />
              <input name="redirectTo" type="hidden" value={redirectTo} />

              <Button
                onClick={() => setOpen(false)}
                size="sm"
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <ReopenReportSubmitButton />
            </form>
          </div>
        </ModalShell>
      ) : null}
    </>
  );
}
