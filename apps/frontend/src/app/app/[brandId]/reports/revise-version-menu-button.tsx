'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { ModalShell } from '@/components/ui/modal-shell';
import { Textarea } from '@/components/ui/textarea';

import { reviseVersionAction } from './actions';

type ReviseVersionMenuButtonProps = {
  brandId: string;
  periodId: string;
  year: number;
  versionId: string;
  periodLabel: string;
  mode?: 'menu' | 'button';
  triggerLabel?: string;
  triggerVariant?: 'default' | 'outline' | 'ghost';
  triggerClassName?: string;
};

function ReviseSubmitButton({ canSubmit }: { canSubmit: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending || !canSubmit} size="sm" type="submit">
      {pending ? 'Creating revision...' : 'Create revision draft'}
    </Button>
  );
}

export function ReviseVersionMenuButton({
  brandId,
  periodId,
  year,
  versionId,
  periodLabel,
  mode = 'menu',
  triggerLabel = 'Create revision draft',
  triggerVariant = 'outline',
  triggerClassName
}: ReviseVersionMenuButtonProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const menuRef = useRef<HTMLDivElement | null>(null);
  const expectedConfirmText = useMemo(() => periodLabel.toUpperCase(), [periodLabel]);
  const canSubmit =
    reason.trim().length > 0 && confirmText.trim().toUpperCase() === expectedConfirmText;

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current && !menuRef.current.contains(target)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [menuOpen]);

  return (
    <>
      {mode === 'menu' ? (
        <div className="relative" ref={menuRef}>
          <Button
            aria-expanded={menuOpen}
            aria-label="More actions"
            onClick={() => setMenuOpen((current) => !current)}
            size="sm"
            type="button"
            variant="outline"
          >
            <MoreHorizontal className="size-4" />
          </Button>

          {menuOpen ? (
            <div className="absolute right-0 top-full z-50 mt-2 min-w-[220px] rounded-2xl border border-border/60 bg-background/95 p-1 shadow-lg backdrop-blur">
              <button
                className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-muted/60"
                onClick={() => {
                  setMenuOpen(false);
                  setReason('');
                  setConfirmText('');
                  setModalOpen(true);
                }}
                type="button"
              >
                Create revision draft
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <Button
          className={triggerClassName}
          onClick={() => {
            setReason('');
            setConfirmText('');
            setModalOpen(true);
          }}
          size="sm"
          type="button"
          variant={triggerVariant}
        >
          {triggerLabel}
        </Button>
      )}

      {modalOpen ? (
        <ModalShell
          closeOnBackdropClick
          description="This creates a new editable draft from the approved version for correction updates."
          onClose={() => {
            setModalOpen(false);
            setReason('');
            setConfirmText('');
          }}
          showCloseButton={false}
          title={`Create revision for ${periodLabel}?`}
          widthClassName="max-w-lg"
        >
          <form action={reviseVersionAction} className="space-y-4">
            <input name="brandId" type="hidden" value={brandId} />
            <input name="periodId" type="hidden" value={periodId} />
            <input name="year" type="hidden" value={year} />
            <input name="versionId" type="hidden" value={versionId} />

            <div className="space-y-2">
              <label
                className="text-sm font-medium"
                htmlFor={`revision-reason-${versionId}`}
              >
                Why do you need this revision? (required)
              </label>
              <Textarea
                id={`revision-reason-${versionId}`}
                minLength={1}
                name="reason"
                onChange={(event) => setReason(event.currentTarget.value)}
                placeholder="Describe what needs to be corrected."
                required
                rows={4}
                value={reason}
              />
            </div>

            <div className="space-y-2">
              <label
                className="text-sm font-medium"
                htmlFor={`revision-confirm-${versionId}`}
              >
                Type <span className="font-semibold">{expectedConfirmText}</span> to confirm
              </label>
              <input
                className="h-11 w-full rounded-2xl border border-input bg-background/70 px-4 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
                id={`revision-confirm-${versionId}`}
                onChange={(event) => setConfirmText(event.currentTarget.value)}
                placeholder={expectedConfirmText}
                type="text"
                value={confirmText}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  setModalOpen(false);
                  setReason('');
                  setConfirmText('');
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <ReviseSubmitButton canSubmit={canSubmit} />
            </div>
          </form>
        </ModalShell>
      ) : null}
    </>
  );
}
