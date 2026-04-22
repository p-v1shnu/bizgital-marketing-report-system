'use client';

import { useState } from 'react';
import { Check, ClipboardCopy, Loader2 } from 'lucide-react';
import { toBlob } from 'html-to-image';

import { Button } from '@/components/ui/button';

import { useDashboardGlobalKpiControls } from './dashboard-global-kpi-controls';

type DashboardChartCopyButtonProps = {
  targetId: string;
};

type CopyState = 'idle' | 'copying' | 'copied' | 'error';

export function DashboardChartCopyButton({ targetId }: DashboardChartCopyButtonProps) {
  const { presentationMode } = useDashboardGlobalKpiControls();
  const [copyState, setCopyState] = useState<CopyState>('idle');

  if (!presentationMode) {
    return null;
  }

  const handleCopy = async () => {
    const target = document.getElementById(targetId);
    if (!target) {
      setCopyState('error');
      return;
    }

    try {
      setCopyState('copying');

      const blob = await toBlob(target, {
        cacheBust: true,
        pixelRatio: 2,
        filter: (node) => {
          if (!(node instanceof HTMLElement)) {
            return true;
          }
          return node.dataset.exportHide !== 'true';
        }
      });

      if (!blob) {
        throw new Error('Failed to create PNG blob.');
      }

      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
        throw new Error('Clipboard PNG write is not supported in this browser.');
      }

      await navigator.clipboard.write([
        new ClipboardItem({
          'image/png': blob
        })
      ]);

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
          : 'Copy PNG';

  return (
    <Button
      className="h-8 rounded-lg px-2.5 text-xs"
      data-export-hide="true"
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
