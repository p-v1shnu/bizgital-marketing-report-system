'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { ModalShell } from '@/components/ui/modal-shell';

import { approveVersionAction } from './actions';

type ApproveVersionButtonProps = {
  brandId: string;
  year: number;
  versionId: string;
  triggerLabel?: string;
  triggerVariant?: 'default' | 'outline' | 'ghost';
  triggerClassName?: string;
};

function ApproveVersionConfirmButton() {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending} size="sm" type="submit" variant="default">
      {pending ? 'Approving...' : 'Confirm approve'}
    </Button>
  );
}

export function ApproveVersionButton({
  brandId,
  year,
  versionId,
  triggerLabel = 'Approve',
  triggerVariant = 'outline',
  triggerClassName
}: ApproveVersionButtonProps) {
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
          description="This will publish the submitted version as approved."
          onClose={() => setOpen(false)}
          showCloseButton={false}
          title="Approve this report?"
          widthClassName="max-w-lg"
        >
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              After approval, this version becomes the official approved month snapshot.
            </p>

            <form action={approveVersionAction} className="flex flex-wrap gap-2">
              <input name="brandId" type="hidden" value={brandId} />
              <input name="year" type="hidden" value={year} />
              <input name="versionId" type="hidden" value={versionId} />

              <Button onClick={() => setOpen(false)} size="sm" type="button" variant="outline">
                Cancel
              </Button>
              <ApproveVersionConfirmButton />
            </form>
          </div>
        </ModalShell>
      ) : null}
    </>
  );
}
