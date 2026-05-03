'use client';

import { useId, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { ModalShell } from '@/components/ui/modal-shell';

import { requestChangesAction } from './actions';

type RequestChangesButtonProps = {
  brandId: string;
  periodId: string;
  year: number;
  versionId: string;
  triggerVariant?: 'default' | 'outline' | 'ghost';
  triggerLabel?: string;
  triggerClassName?: string;
  redirectTo?: 'reports' | 'import' | 'review';
};

function RequestChangesSubmitButtonWithValidation({
  canSubmit
}: {
  canSubmit: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending || !canSubmit} size="sm" type="submit" variant="default">
      {pending ? 'Requesting...' : 'Confirm request changes'}
    </Button>
  );
}

export function RequestChangesButton({
  brandId,
  periodId,
  year,
  versionId,
  triggerVariant = 'outline',
  triggerLabel = 'Request changes',
  triggerClassName,
  redirectTo = 'reports'
}: RequestChangesButtonProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const reasonFieldId = useId();
  const trimmedReason = reason.trim();

  return (
    <>
      <Button
        className={triggerClassName}
        onClick={() => {
          setReason('');
          setOpen(true);
        }}
        size="sm"
        type="button"
        variant={triggerVariant}
      >
        {triggerLabel}
      </Button>

      {open ? (
        <ModalShell
          closeOnBackdropClick
          description="This will return the report to users with create/edit permission for immediate editing."
          onClose={() => {
            setOpen(false);
            setReason('');
          }}
          showCloseButton={false}
          title="Request changes on this report?"
          widthClassName="max-w-lg"
        >
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              The current submission will leave awaiting-decision mode and move back to in-progress.
            </p>

            <form action={requestChangesAction} className="space-y-3">
              <input name="brandId" type="hidden" value={brandId} />
              <input name="periodId" type="hidden" value={periodId} />
              <input name="versionId" type="hidden" value={versionId} />
              <input name="year" type="hidden" value={year} />
              <input name="redirectTo" type="hidden" value={redirectTo} />
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor={reasonFieldId}>
                  What should be fixed? (required)
                </label>
                <textarea
                  className="min-h-24 w-full rounded-2xl border border-input bg-background/70 px-4 py-3 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
                  id={reasonFieldId}
                  minLength={1}
                  name="reason"
                  onChange={event => setReason(event.currentTarget.value)}
                  placeholder="Describe what needs to be corrected."
                  required
                  value={reason}
                />
                <p className="text-xs text-muted-foreground">
                  Minimum 1 character.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => {
                    setOpen(false);
                    setReason('');
                  }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Cancel
                </Button>
                <RequestChangesSubmitButtonWithValidation canSubmit={trimmedReason.length > 0} />
              </div>
            </form>
          </div>
        </ModalShell>
      ) : null}
    </>
  );
}
