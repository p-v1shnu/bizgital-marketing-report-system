'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { Button } from './button';

type ModalShellProps = {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  widthClassName?: string;
  closeOnBackdropClick?: boolean;
  showCloseButton?: boolean;
};

export function ModalShell({
  title,
  description,
  onClose,
  children,
  widthClassName = 'max-w-3xl',
  closeOnBackdropClick = false,
  showCloseButton = true
}: ModalShellProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!mounted) {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-background/85 p-4"
      onMouseDown={(event) => {
        if (closeOnBackdropClick && event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className={`w-full ${widthClassName} rounded-3xl border border-border/70 bg-background p-5 shadow-2xl`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="text-lg font-semibold text-foreground">{title}</div>
            {description ? (
              <div className="text-sm text-muted-foreground">{description}</div>
            ) : null}
          </div>
          {showCloseButton ? (
            <Button onClick={onClose} type="button" variant="outline">
              Close
            </Button>
          ) : null}
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}
