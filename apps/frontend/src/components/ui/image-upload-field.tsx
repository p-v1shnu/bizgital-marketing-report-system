'use client';

import {
  type ChangeEvent,
  type ClipboardEvent as ReactClipboardEvent,
  useRef,
  useState
} from 'react';
import { ImagePlus, LoaderCircle, Trash2, ZoomIn } from 'lucide-react';

import { deleteMediaObject } from '@/lib/reporting-api';
import { toProtectedMediaUrl } from '@/lib/media-url';
import { cn } from '@/lib/utils';
import { getAppImageClipboardFile } from '@/lib/app-image-clipboard';

import { Button } from './button';
import { ModalShell } from './modal-shell';

type Props = {
  previewAlt: string;
  placeholderLabel: string;
  scope?: string;
  variant?: 'default' | 'logo';
  previewAspectRatio?: '16/9' | '4/3' | '4/5' | '1/1';
  previewFit?: 'cover' | 'contain';
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  name?: string;
  disabled?: boolean;
  hideControlsWhenDisabled?: boolean;
  className?: string;
  'data-testid'?: string;
};

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const STANDARD_IMAGE_MIME = 'image/webp';
const STANDARD_LONG_EDGE = 1920;
const STANDARD_TARGET_MAX_BYTES = 700 * 1024;
const STANDARD_WEBP_QUALITY_PRIMARY = 0.85;
const STANDARD_WEBP_QUALITY_FALLBACK = 0.78;

function extensionFromMimeType(mimeType: string) {
  const normalized = mimeType.trim().toLowerCase();

  if (normalized === 'image/jpeg' || normalized === 'image/jpg') {
    return 'jpg';
  }
  if (normalized === 'image/png') {
    return 'png';
  }
  if (normalized === 'image/webp') {
    return 'webp';
  }
  if (normalized === 'image/gif') {
    return 'gif';
  }
  if (normalized === 'image/bmp') {
    return 'bmp';
  }
  if (normalized === 'image/avif') {
    return 'avif';
  }

  return 'png';
}

function buildClipboardImageFile(blob: Blob, baseName = 'clipboard-image') {
  const mimeType = blob.type.startsWith('image/') ? blob.type : 'image/png';
  const extension = extensionFromMimeType(mimeType);

  return new File([blob], `${baseName}-${Date.now()}.${extension}`, {
    type: mimeType,
    lastModified: Date.now()
  });
}

function toImageFileFromDataUrl(dataUrl: string, baseName = 'clipboard-image') {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);

  if (!match) {
    return null;
  }

  const [, mimeType, base64Payload] = match;
  let binaryString = '';

  try {
    binaryString = atob(base64Payload);
  } catch {
    return null;
  }

  const bytes = new Uint8Array(binaryString.length);
  for (let index = 0; index < binaryString.length; index += 1) {
    bytes[index] = binaryString.charCodeAt(index);
  }

  const blob = new Blob([bytes], { type: mimeType });
  return buildClipboardImageFile(blob, baseName);
}

function extractImageDataUrlFromHtml(html: string) {
  const match = html.match(/<img[^>]+src=["'](data:image\/[^"']+)["']/i);
  const dataUrl = match?.[1]?.trim() ?? '';

  return dataUrl.startsWith('data:image/') ? dataUrl : null;
}

function extractImageSrcFromHtml(html: string) {
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  const src = match?.[1]?.trim() ?? '';
  return src.length > 0 ? src : null;
}

function looksLikeImageUrl(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return false;
  }

  if (normalized.startsWith('blob:') || normalized.startsWith('data:image/')) {
    return true;
  }

  if (/\.(png|jpe?g|webp|gif|bmp|avif|svg)(\?.*)?$/i.test(normalized)) {
    return true;
  }

  if (normalized.includes('/api/media/proxy') || normalized.includes('/uploads/')) {
    return true;
  }

  return false;
}

async function fetchImageFileFromUrl(url: string, baseName = 'clipboard-url') {
  const target = url.trim();
  if (!target) {
    return null;
  }

  const response = await fetch(target, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(`Failed to read copied image source (HTTP ${response.status}).`);
  }

  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) {
    throw new Error('Copied content is not an image source.');
  }

  return buildClipboardImageFile(blob, baseName);
}

function readClipboardHtml(event: ReactClipboardEvent<HTMLDivElement>) {
  const directHtml = event.clipboardData?.getData('text/html')?.trim();
  if (directHtml) {
    return Promise.resolve(directHtml);
  }

  const items = event.clipboardData?.items ?? [];
  const htmlItem = Array.from(items).find(
    (item) => item.kind === 'string' && item.type === 'text/html'
  );

  if (!htmlItem) {
    return Promise.resolve(null);
  }

  return new Promise<string | null>((resolve) => {
    htmlItem.getAsString((value) => {
      const normalized = value?.trim() ?? '';
      resolve(normalized.length > 0 ? normalized : null);
    });
  });
}

function readClipboardText(event: ReactClipboardEvent<HTMLDivElement>) {
  const directText = event.clipboardData?.getData('text/plain')?.trim();
  return directText && directText.length > 0 ? directText : null;
}

function readClipboardUriList(event: ReactClipboardEvent<HTMLDivElement>) {
  const value = event.clipboardData?.getData('text/uri-list')?.trim();
  if (!value) {
    return null;
  }

  const first = value
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith('#'));

  return first ?? null;
}

function withWebpExtension(filename: string) {
  const normalized = filename.trim();
  if (!normalized) {
    return `upload-${Date.now()}.webp`;
  }

  return normalized.replace(/\.[a-zA-Z0-9]+$/, '') + '.webp';
}

function canvasToWebpBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      blob => {
        if (!blob) {
          reject(new Error('Browser cannot encode WebP image.'));
          return;
        }

        resolve(blob);
      },
      STANDARD_IMAGE_MIME,
      quality
    );
  });
}

function loadImageElement(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Image file cannot be read.'));
    };
    image.src = objectUrl;
  });
}

function resolveScaledDimensions(width: number, height: number) {
  const longEdge = Math.max(width, height);

  if (longEdge <= STANDARD_LONG_EDGE) {
    return { width, height };
  }

  const scale = STANDARD_LONG_EDGE / longEdge;

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

async function optimizeImageForUpload(file: File) {
  const image = await loadImageElement(file);
  const naturalWidth = image.naturalWidth;
  const naturalHeight = image.naturalHeight;

  if (naturalWidth <= 0 || naturalHeight <= 0) {
    throw new Error('Image dimensions are invalid.');
  }

  const { width: targetWidth, height: targetHeight } = resolveScaledDimensions(
    naturalWidth,
    naturalHeight
  );
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Failed to process image for upload.');
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, targetWidth, targetHeight);

  const primaryBlob = await canvasToWebpBlob(canvas, STANDARD_WEBP_QUALITY_PRIMARY);
  let outputBlob = primaryBlob;

  if (primaryBlob.size > STANDARD_TARGET_MAX_BYTES) {
    const fallbackBlob = await canvasToWebpBlob(canvas, STANDARD_WEBP_QUALITY_FALLBACK);
    if (fallbackBlob.size < primaryBlob.size) {
      outputBlob = fallbackBlob;
    }
  }

  return new File([outputBlob], withWebpExtension(file.name), {
    type: STANDARD_IMAGE_MIME,
    lastModified: Date.now()
  });
}

async function readUploadProxyErrorMessage(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as { message?: string | string[]; error?: string };
    if (Array.isArray(payload.message)) {
      return payload.message.join(', ');
    }
    if (typeof payload.message === 'string' && payload.message.trim().length > 0) {
      return payload.message;
    }
    if (typeof payload.error === 'string' && payload.error.trim().length > 0) {
      return payload.error;
    }
  } catch {
    // Fall through to the text-body fallback below.
  }

  try {
    const text = (await response.text()).trim();
    if (text.length > 0) {
      return text;
    }
  } catch {
    // Ignore parse errors and use fallback below.
  }

  return fallback;
}

async function uploadImageToStorage(file: File, scope: string) {
  const formData = new FormData();
  formData.set('file', file);
  formData.set('scope', scope);

  const uploadResponse = await fetch('/api/media/upload', {
    method: 'POST',
    body: formData,
    cache: 'no-store',
    credentials: 'include'
  });

  if (!uploadResponse.ok) {
    throw new Error(
      await readUploadProxyErrorMessage(
        uploadResponse,
        `Failed to upload image to storage (HTTP ${uploadResponse.status}).`
      )
    );
  }

  const payload = (await uploadResponse.json()) as {
    publicUrl?: string;
  };
  const publicUrl = typeof payload.publicUrl === 'string' ? payload.publicUrl.trim() : '';

  if (!publicUrl) {
    throw new Error('Upload succeeded but media URL is missing.');
  }

  return publicUrl;
}

export function ImageUploadField({
  previewAlt,
  placeholderLabel,
  scope = 'general',
  variant = 'default',
  previewAspectRatio = '4/3',
  previewFit = 'cover',
  value,
  defaultValue = '',
  onChange,
  name,
  disabled,
  hideControlsWhenDisabled = false,
  className,
  'data-testid': dataTestId
}: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pasteTargetRef = useRef<HTMLDivElement | null>(null);
  const sessionUploadedUrlsRef = useRef<Set<string>>(new Set());
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFocusActive, setIsFocusActive] = useState(false);

  const currentValue = value ?? internalValue;
  const shouldShowControls = !(disabled && hideControlsWhenDisabled);
  const previewRatioClassName =
    previewAspectRatio === '16/9'
      ? 'aspect-video'
      : previewAspectRatio === '4/5'
      ? 'aspect-[4/5]'
      : previewAspectRatio === '1/1'
        ? 'aspect-square'
        : 'aspect-[4/3]';
  const previewFrameClassName =
    variant === 'logo'
      ? 'h-36 w-36 rounded-[12px]'
      : `${previewRatioClassName} w-full rounded-[12px]`;
  const previewFitClassName = previewFit === 'contain' ? 'object-contain bg-muted/25' : 'object-cover';
  const currentPreviewSrc = toProtectedMediaUrl(currentValue) ?? currentValue;
  const updateValue = (nextValue: string) => {
    if (value === undefined) {
      setInternalValue(nextValue);
    }
    onChange?.(nextValue);
  };

  async function deleteIfSessionUpload(url: string) {
    const target = url.trim();

    if (!target || !sessionUploadedUrlsRef.current.has(target)) {
      return;
    }

    setDeleting(true);

    try {
      await deleteMediaObject({ publicUrl: target });
      sessionUploadedUrlsRef.current.delete(target);
    } finally {
      setDeleting(false);
    }
  }

  async function replaceValue(nextValue: string, options?: { markAsUploaded?: boolean }) {
    const previousValue = currentValue.trim();
    const normalizedNextValue = nextValue.trim();
    const shouldDeletePrevious =
      previousValue.length > 0 &&
      previousValue !== normalizedNextValue &&
      sessionUploadedUrlsRef.current.has(previousValue);
    let deletionFailed = false;

    if (shouldDeletePrevious) {
      try {
        await deleteIfSessionUpload(previousValue);
      } catch {
        deletionFailed = true;
        setError(
          'Image changed but previous file could not be deleted now. It will be cleaned up automatically later.'
        );
      }
    }

    if (!deletionFailed) {
      setError(null);
    }

    updateValue(nextValue);

    if (options?.markAsUploaded && normalizedNextValue) {
      sessionUploadedUrlsRef.current.add(normalizedNextValue);
    }
  }

  async function uploadImageFile(file: File | null | undefined) {
    if (!file) {
      return;
    }

    setError(null);
    setUploading(true);

    try {
      if (!file.type.startsWith('image/')) {
        throw new Error('Only image files are allowed.');
      }

      if (file.size > MAX_IMAGE_SIZE) {
        throw new Error('Image size must be at most 10 MB.');
      }

      const optimizedFile = await optimizeImageForUpload(file);

      if (optimizedFile.size > MAX_IMAGE_SIZE) {
        throw new Error('Optimized image is still too large. Please use a smaller source image.');
      }

      const absoluteUrl = await uploadImageToStorage(optimizedFile, scope);
      await replaceValue(absoluteUrl, { markAsUploaded: true });
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Failed to upload image.');
    } finally {
      setUploading(false);
    }
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    await uploadImageFile(file);
    event.currentTarget.value = '';
  }

  async function resolveImageFromClipboard(event: ReactClipboardEvent<HTMLDivElement>) {
    // Prefer a very recent in-app copied image to avoid stale browser clipboard image payloads.
    const appClipboardFile = getAppImageClipboardFile({ maxAgeMs: 10_000 });
    if (appClipboardFile) {
      return appClipboardFile;
    }

    const clipboardText = readClipboardText(event);

    const clipboardFiles = Array.from(event.clipboardData?.files ?? []);
    const fileEntry = clipboardFiles.find((file) => file.type.startsWith('image/'));
    if (fileEntry) {
      return fileEntry;
    }

    const clipboardItems = Array.from(event.clipboardData?.items ?? []);
    for (const item of clipboardItems) {
      if (!item.type.startsWith('image/')) {
        continue;
      }

      const file = item.getAsFile();
      if (file) {
        return file;
      }
    }

    const clipboardHtml = await readClipboardHtml(event);
    if (clipboardHtml) {
      const dataUrl = extractImageDataUrlFromHtml(clipboardHtml);
      if (dataUrl) {
        const fileFromHtml = toImageFileFromDataUrl(dataUrl, 'clipboard-html');
        if (fileFromHtml) {
          return fileFromHtml;
        }
      }

      const imageSrc = extractImageSrcFromHtml(clipboardHtml);
      if (imageSrc && !imageSrc.startsWith('data:image/')) {
        try {
          const fileFromHtmlSrc = await fetchImageFileFromUrl(imageSrc, 'clipboard-html-src');
          if (fileFromHtmlSrc) {
            return fileFromHtmlSrc;
          }
        } catch {
          // Keep going: another clipboard representation may still be available.
        }
      }
    }

    const clipboardUri = readClipboardUriList(event);
    if (clipboardUri && looksLikeImageUrl(clipboardUri)) {
      try {
        const fileFromUri = await fetchImageFileFromUrl(clipboardUri, 'clipboard-uri-src');
        if (fileFromUri) {
          return fileFromUri;
        }
      } catch {
        // Keep going: another clipboard representation may still be available.
      }
    }

    if (clipboardText && looksLikeImageUrl(clipboardText)) {
      try {
        const fileFromTextUrl = await fetchImageFileFromUrl(clipboardText, 'clipboard-text-src');
        if (fileFromTextUrl) {
          return fileFromTextUrl;
        }
      } catch {
        // Keep going: another clipboard representation may still be available.
      }
    }

    if (navigator.clipboard?.read) {
      try {
        const clipboardEntries = await navigator.clipboard.read();

        for (const entry of clipboardEntries) {
          const imageType = entry.types.find((type) => type.startsWith('image/'));
          if (!imageType) {
            continue;
          }

          const blob = await entry.getType(imageType);
          return buildClipboardImageFile(blob, 'clipboard-read');
        }
      } catch {
        // Clipboard API may be blocked by browser permission settings; fallback handled by caller.
      }
    }

    return null;
  }

  async function handlePaste(event: ReactClipboardEvent<HTMLDivElement>) {
    if (disabled || uploading || deleting) {
      return;
    }

    event.preventDefault();
    const imageFile = await resolveImageFromClipboard(event);

    if (!imageFile) {
      setError('Clipboard has no image. Copy an image or screenshot first.');
      return;
    }

    await uploadImageFile(imageFile);
  }

  function openFilePicker() {
    if (disabled || uploading || deleting) {
      return;
    }
    fileInputRef.current?.click();
  }

  async function clearImage() {
    try {
      await replaceValue('');
    } catch {
      setError('Failed to clear image.');
    }
  }

  function openPreview() {
    if (!currentValue.trim()) {
      return;
    }
    setPreviewOpen(true);
  }

  return (
    <div className={cn('space-y-2', className)} data-testid={dataTestId}>
      {name ? <input name={name} type="hidden" value={currentValue} /> : null}

      <div
        className={cn(
          'rounded-[12px] border border-border/60 bg-background/70 p-3 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-primary/60 focus:ring-offset-2 focus:ring-offset-background',
          isFocusActive ? 'border-primary/70 bg-primary/5' : undefined,
          variant === 'logo' ? 'w-fit' : undefined
        )}
        onClick={() => pasteTargetRef.current?.focus()}
        onFocus={() => setIsFocusActive(true)}
        onBlur={() => setIsFocusActive(false)}
        onPaste={event => {
          void handlePaste(event);
        }}
        ref={pasteTargetRef}
        role="button"
        tabIndex={disabled ? -1 : 0}
      >
        {currentValue.trim().length > 0 ? (
          <button
            className="block w-full"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              openPreview();
            }}
            type="button"
          >
            <img
              alt={previewAlt}
              className={cn(
                'cursor-zoom-in border border-border/60',
                previewFitClassName,
                previewFrameClassName
              )}
              src={currentPreviewSrc}
            />
          </button>
        ) : (
          <div
            className={cn(
              'flex flex-col items-center justify-center border border-dashed border-border/60 bg-background/70 text-sm text-muted-foreground transition-colors duration-150',
              isFocusActive ? 'border-primary/70 bg-primary/10 text-foreground' : undefined,
              previewFrameClassName
            )}
          >
            <ImagePlus className="mb-2 size-5" />
            {placeholderLabel}
          </div>
        )}
      </div>

      {shouldShowControls ? (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={disabled || uploading || deleting}
            onClick={openFilePicker}
            size="sm"
            type="button"
            variant="outline"
          >
            {uploading || deleting ? <LoaderCircle className="animate-spin" /> : <ImagePlus />}
            {uploading ? 'Uploading...' : deleting ? 'Removing...' : 'Upload image'}
          </Button>
          <input
            accept="image/*"
            className="hidden"
            disabled={disabled || uploading || deleting}
            onChange={handleFileChange}
            ref={fileInputRef}
            type="file"
          />

          {currentValue.trim().length > 0 ? (
            <Button
              onClick={openPreview}
              size="sm"
              type="button"
              variant="outline"
            >
              <ZoomIn />
              Preview
            </Button>
          ) : null}

          {currentValue.trim().length > 0 ? (
            <Button
              disabled={disabled || uploading || deleting}
              onClick={() => {
                void clearImage();
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              <Trash2 />
              Remove
            </Button>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-rose-500/25 bg-rose-500/8 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
          {error}
        </div>
      ) : null}

      {shouldShowControls ? (
        <div className="text-xs text-muted-foreground">
          Click the placeholder, then press Ctrl+V to paste from clipboard.
        </div>
      ) : null}

      {previewOpen && currentValue.trim().length > 0 ? (
        <ModalShell
          closeOnBackdropClick
          description="Click outside the dialog or press Close to return."
          onClose={() => setPreviewOpen(false)}
          title={previewAlt}
          widthClassName="max-w-6xl"
        >
          <div className="overflow-auto rounded-[12px] border border-border/60 bg-muted/20 p-3">
            <img
              alt={previewAlt}
              className="max-h-[78vh] w-full object-contain"
              src={currentPreviewSrc}
            />
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}
