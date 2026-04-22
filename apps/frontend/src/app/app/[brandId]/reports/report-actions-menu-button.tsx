'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';

import { Button } from '@/components/ui/button';

type ReportActionsMenuButtonProps = {
  children: ReactNode;
  className?: string;
};

export function ReportActionsMenuButton({
  children,
  className
}: ReportActionsMenuButtonProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });

  const updateMenuPosition = () => {
    const trigger = containerRef.current;
    if (!trigger || typeof window === 'undefined') {
      return;
    }

    const triggerRect = trigger.getBoundingClientRect();
    const menuWidth = menuRef.current?.offsetWidth ?? 210;
    const menuHeight = menuRef.current?.offsetHeight ?? 160;
    const edgePadding = 8;
    const gutter = 8;

    let left = triggerRect.right - menuWidth;
    left = Math.max(edgePadding, Math.min(left, window.innerWidth - menuWidth - edgePadding));

    let top = triggerRect.bottom + gutter;
    const overflowBottom = top + menuHeight > window.innerHeight - edgePadding;
    if (overflowBottom) {
      const upwardTop = triggerRect.top - gutter - menuHeight;
      top =
        upwardTop >= edgePadding
          ? upwardTop
          : Math.max(edgePadding, window.innerHeight - menuHeight - edgePadding);
    }

    setMenuPosition({ top, left });
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedInsideTrigger =
        containerRef.current && containerRef.current.contains(target);
      const clickedInsideMenu = menuRef.current && menuRef.current.contains(target);
      if (!clickedInsideTrigger && !clickedInsideMenu) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    updateMenuPosition();
    const onViewportChange = () => updateMenuPosition();
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);

    return () => {
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [open]);

  return (
    <div className={`relative ${className ?? ''}`} ref={containerRef}>
      <Button
        aria-expanded={open}
        aria-label="More actions"
        onClick={() => setOpen((current) => !current)}
        size="sm"
        type="button"
        variant="outline"
      >
        <MoreHorizontal className="size-4" />
      </Button>

      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed z-[80] min-w-[210px] space-y-1 rounded-2xl border border-border/60 bg-background/95 p-1 shadow-lg backdrop-blur"
              ref={menuRef}
              style={{
                left: `${menuPosition.left}px`,
                top: `${menuPosition.top}px`
              }}
            >
              {children}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
