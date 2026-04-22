'use client';

import { Button } from './button';
import { ModalShell } from './modal-shell';

type ConfirmActionModalProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmActionModal({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  pending = false,
  onConfirm,
  onCancel
}: ConfirmActionModalProps) {
  if (!open) {
    return null;
  }

  return (
    <ModalShell
      closeOnBackdropClick={!pending}
      description={description}
      onClose={onCancel}
      showCloseButton={false}
      title={title}
      widthClassName="max-w-lg"
    >
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending} onClick={onCancel} type="button" variant="outline">
          {cancelLabel}
        </Button>
        <Button disabled={pending} onClick={onConfirm} type="button">
          {pending ? 'Processing...' : confirmLabel}
        </Button>
      </div>
    </ModalShell>
  );
}
