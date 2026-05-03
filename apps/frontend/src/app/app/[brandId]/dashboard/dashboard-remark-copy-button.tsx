'use client';

import { useState } from 'react';
import { Check, ClipboardCopy, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { useDashboardGlobalKpiControls } from './dashboard-global-kpi-controls';

type DashboardRemarkCopyButtonProps = {
  text: string;
  disabled?: boolean;
};

type CopyState = 'idle' | 'copying' | 'copied' | 'error';

export function DashboardRemarkCopyButton({
  text,
  disabled = false
}: DashboardRemarkCopyButtonProps) {
  const { presentationMode } = useDashboardGlobalKpiControls();
  const [copyState, setCopyState] = useState<CopyState>('idle');

  if (!presentationMode) {
    return null;
  }

  const handleCopy = async () => {
    if (disabled || text.trim().length === 0) {
      return;
    }

    try {
      setCopyState('copying');
      await navigator.clipboard.writeText(text);
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 1600);
    } catch {
      setCopyState('error');
      window.setTimeout(() => setCopyState('idle'), 2200);
    }
  };

  const label =
    copyState === 'copying'
      ? 'Copying...'
      : copyState === 'copied'
        ? 'Copied'
        : copyState === 'error'
          ? 'Retry copy'
          : 'Copy remark';

  return (
    <Button
      className="h-8 rounded-lg px-2.5 text-xs"
      data-export-hide="true"
      disabled={disabled || text.trim().length === 0}
      onClick={handleCopy}
      size="sm"
      type="button"
      variant="outline"
    >
      {copyState === 'copying' ? (
        <Loader2 className="mr-1.5 size-3.5 animate-spin" />
      ) : copyState === 'copied' ? (
        <Check className="mr-1.5 size-3.5" />
      ) : (
        <ClipboardCopy className="mr-1.5 size-3.5" />
      )}
      {label}
    </Button>
  );
}
