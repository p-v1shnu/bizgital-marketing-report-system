'use client';

import { useState } from 'react';
import { Check, ClipboardCopy, Loader2 } from 'lucide-react';
import { toBlob } from 'html-to-image';

import { Button } from '@/components/ui/button';
import { setAppImageClipboardBlob } from '@/lib/app-image-clipboard';

import { useDashboardGlobalKpiControls } from './dashboard-global-kpi-controls';

type DashboardChartCopyButtonProps = {
  targetId: string;
};

type CopyState = 'idle' | 'copying' | 'copied' | 'error';

let latestCopyRequestId = 0;

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read blob as data URL.'));
    reader.onload = () => {
      const value = typeof reader.result === 'string' ? reader.result : '';
      if (!value.startsWith('data:image/')) {
        reject(new Error('Blob result is not an image data URL.'));
        return;
      }
      resolve(value);
    };
    reader.readAsDataURL(blob);
  });
}

async function imageElementToDataUrl(image: HTMLImageElement) {
  if (!image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
    return null;
  }

  try {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');

    if (!context) {
      return null;
    }

    context.drawImage(image, 0, 0, image.naturalWidth, image.naturalHeight);
    const dataUrl = canvas.toDataURL('image/png');
    return dataUrl.startsWith('data:image/') ? dataUrl : null;
  } catch {
    return null;
  }
}

async function imageUrlToDataUrl(imageUrl: string) {
  const source = imageUrl.trim();
  if (!source || source.startsWith('data:image/')) {
    return null;
  }

  try {
    const response = await fetch(source, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store'
    });
    if (!response.ok) {
      return null;
    }
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) {
      return null;
    }
    return await blobToDataUrl(blob);
  } catch {
    return null;
  }
}

async function inlineImageSourcesInClone(source: HTMLElement, clone: HTMLElement) {
  const sourceImages = Array.from(source.querySelectorAll('img'));
  const cloneImages = Array.from(clone.querySelectorAll('img'));
  const pairCount = Math.min(sourceImages.length, cloneImages.length);

  await Promise.all(
    Array.from({ length: pairCount }).map(async (_, index) => {
      const sourceImage = sourceImages[index];
      const cloneImage = cloneImages[index];
      const directDataUrl = await imageElementToDataUrl(sourceImage);
      const fallbackDataUrl =
        directDataUrl ??
        (await imageUrlToDataUrl(sourceImage.currentSrc || sourceImage.src || ''));
      if (!fallbackDataUrl) {
        return;
      }

      cloneImage.setAttribute('src', fallbackDataUrl);
      cloneImage.removeAttribute('srcset');
      cloneImage.removeAttribute('sizes');
      cloneImage.setAttribute('loading', 'eager');
    })
  );
}

async function renderTargetToBlob(target: HTMLElement) {
  const targetRect = target.getBoundingClientRect();
  const clone = target.cloneNode(true) as HTMLElement;
  clone.style.width = `${Math.max(1, Math.round(targetRect.width))}px`;
  clone.style.height = `${Math.max(1, Math.round(targetRect.height))}px`;
  clone.style.maxWidth = 'none';

  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-100000px';
  host.style.top = '0';
  host.style.opacity = '0';
  host.style.pointerEvents = 'none';
  host.style.zIndex = '-1';
  host.appendChild(clone);
  document.body.appendChild(host);

  try {
    await inlineImageSourcesInClone(target, clone);
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));

    const blob = await toBlob(clone, {
      cacheBust: true,
      includeQueryParams: true,
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
    return blob;
  } finally {
    host.remove();
  }
}

export function DashboardChartCopyButton({ targetId }: DashboardChartCopyButtonProps) {
  const { presentationMode } = useDashboardGlobalKpiControls();
  const [copyState, setCopyState] = useState<CopyState>('idle');

  if (!presentationMode) {
    return null;
  }

  const handleCopy = async () => {
    const requestId = ++latestCopyRequestId;

    const target = document.getElementById(targetId);
    if (!target) {
      setCopyState('error');
      return;
    }

    try {
      setCopyState('copying');
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
        throw new Error('Clipboard PNG write is not supported in this browser.');
      }

      const blob = await renderTargetToBlob(target);
      setAppImageClipboardBlob(blob, targetId);

      // If user clicked another copy button after this one, stop here.
      if (requestId !== latestCopyRequestId) {
        return;
      }

      await navigator.clipboard.write([
        new ClipboardItem({
          'image/png': Promise.resolve(blob)
        })
      ]);

      if (requestId !== latestCopyRequestId) {
        return;
      }

      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 1600);
    } catch {
      if (requestId !== latestCopyRequestId) {
        return;
      }
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
