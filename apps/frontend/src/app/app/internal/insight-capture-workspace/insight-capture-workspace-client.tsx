'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, CheckCircle2, ExternalLink, LoaderCircle, Sparkles, StopCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type CaptureQueueItem = {
  postUrl: string;
  pageId: string;
  pageName: string;
  rowNumber: number;
};

type CaptureQueuePayload = {
  brandLabel: string;
  reportMonthKey: string;
  createdAt: string;
  totalSourceRows: number;
  totalEligibleRows: number;
  items: CaptureQueueItem[];
};

type LiveProgress = {
  status?: 'running' | 'completed' | 'failed';
  message?: string;
  percent?: number;
  totalPosts?: number;
  currentPost?: number;
};

type CaptureResolution = 'auto_hq' | 'hires2_5x' | 'hires3x';
type ExecutionMode = 'sequential' | 'parallel5';
type FileSystemPermissionMode = 'read' | 'readwrite';

type PickedDirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission?: (descriptor?: { mode?: FileSystemPermissionMode }) => Promise<PermissionState>;
  requestPermission?: (
    descriptor?: { mode?: FileSystemPermissionMode }
  ) => Promise<PermissionState>;
};

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: {
    id?: string;
    mode?: FileSystemPermissionMode;
    startIn?: 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos';
  }) => Promise<PickedDirectoryHandle>;
};

type CapturePostStatus = 'pending' | 'running' | 'success' | 'failed' | 'stopped';

type CapturePostRun = {
  item: CaptureQueueItem;
  status: CapturePostStatus;
  message: string;
  savedPath?: string;
  steps?: string[];
};

type CaptureBridgeResponse = {
  ok?: boolean;
  error?: string;
  data?: {
    success?: boolean;
    screenshotFile?: string;
    screenshotDataUrl?: string;
    steps?: string[];
    error?: string;
    errorCode?: 'LOGIN_REQUIRED' | 'CHECKPOINT_REQUIRED' | 'CAPTURE_FAILED';
  };
};

const UI_BRIDGE_SOURCE = 'bizgital-insight-ui';
const EXTENSION_BRIDGE_SOURCE = 'bizgital-insight-extension';
const CHROME_WEB_STORE_URL =
  'https://chromewebstore.google.com/detail/bizgital-insight-capture/olpbdaennmbicjfbmabmmpnmfcfapcli';
const FOLDER_DB_NAME = 'bizgital-insight-capture-folder-db';
const FOLDER_STORE_NAME = 'kv';
const FOLDER_HANDLE_KEY = 'selected-output-folder-handle';
const RESOLUTION_STORAGE_KEY = 'bizgital-insight-capture:resolution:v1';
const EXECUTION_MODE_STORAGE_KEY = 'bizgital-insight-capture:execution-mode:v2';

function slugify(value: string) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'brand';
}

function normalizeReportMonthKey(value: string) {
  const raw = String(value || '').trim();
  if (!raw) {
    return 'unknown-month';
  }
  return raw.replace(/[^0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
}

function formatTimestampForFilename(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}-${hour}${minute}${second}`;
}

function buildCaptureFilename(
  brandLabel: string,
  reportMonthKey: string,
  rowNumber: number,
  completedAt: Date
) {
  const brandSlug = slugify(brandLabel);
  const monthSlug = normalizeReportMonthKey(reportMonthKey);
  const row = String(Math.max(1, rowNumber)).padStart(3, '0');
  const stamp = formatTimestampForFilename(completedAt);
  return `${brandSlug}_${monthSlug}_row-${row}_${stamp}.png`;
}

function isValidQueueItem(value: unknown): value is CaptureQueueItem {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<CaptureQueueItem>;
  return (
    typeof candidate.postUrl === 'string' &&
    candidate.postUrl.trim().length > 0 &&
    typeof candidate.pageId === 'string' &&
    typeof candidate.pageName === 'string' &&
    typeof candidate.rowNumber === 'number' &&
    Number.isInteger(candidate.rowNumber) &&
    candidate.rowNumber > 0
  );
}

function isCaptureQueuePayload(value: unknown): value is CaptureQueuePayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<CaptureQueuePayload>;
  return (
    typeof candidate.brandLabel === 'string' &&
    typeof candidate.reportMonthKey === 'string' &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.totalSourceRows === 'number' &&
    typeof candidate.totalEligibleRows === 'number' &&
    Array.isArray(candidate.items) &&
    candidate.items.every(isValidQueueItem)
  );
}

function isDirectoryPickerUserAbort(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as { name?: unknown; message?: unknown };
  const name = typeof candidate.name === 'string' ? candidate.name : '';
  const message = typeof candidate.message === 'string' ? candidate.message.toLowerCase() : '';

  return (
    name === 'AbortError' ||
    message.includes('user aborted a request') ||
    message.includes('the user aborted a request')
  );
}

export function InsightCaptureWorkspaceClient() {
  const searchParams = useSearchParams();
  const queueKey = searchParams.get('queueKey') ?? '';

  const [captureResolution, setCaptureResolution] = useState<CaptureResolution>('auto_hq');
  const [executionMode, setExecutionMode] = useState<ExecutionMode>('parallel5');
  const [deviceMemoryGb, setDeviceMemoryGb] = useState<number | null>(null);
  const [selectedFolderName, setSelectedFolderName] = useState('');
  const [folderPickerSupported, setFolderPickerSupported] = useState<boolean>(true);
  const [extensionReady, setExtensionReady] = useState<boolean | null>(null);

  const [queuePayload, setQueuePayload] = useState<CaptureQueuePayload | null>(null);
  const [queueLoadError, setQueueLoadError] = useState<string | null>(null);
  const [queueRuns, setQueueRuns] = useState<CapturePostRun[]>([]);

  const [isRunning, setIsRunning] = useState(false);
  const [runMessage, setRunMessage] = useState('Idle');
  const [runPercent, setRunPercent] = useState(0);
  const [progressLog, setProgressLog] = useState<string[]>([]);

  const selectedFolderHandleRef = useRef<PickedDirectoryHandle | null>(null);
  const stopRequestedRef = useRef(false);

  const completedCount = useMemo(
    () => queueRuns.filter((run) => run.status === 'success' || run.status === 'failed' || run.status === 'stopped').length,
    [queueRuns]
  );
  const successCount = useMemo(
    () => queueRuns.filter((run) => run.status === 'success').length,
    [queueRuns]
  );
  const failedCount = useMemo(
    () => queueRuns.filter((run) => run.status === 'failed').length,
    [queueRuns]
  );
  const failedIndexes = useMemo(
    () =>
      queueRuns
        .map((run, index) => ({ run, index }))
        .filter(({ run }) => run.status === 'failed')
        .map(({ index }) => index),
    [queueRuns]
  );
  const primaryPageSwitchId = useMemo(() => {
    if (!queuePayload || queuePayload.items.length === 0) {
      return '';
    }
    const unique = Array.from(new Set(queuePayload.items.map((item) => item.pageId).filter(Boolean)));
    return unique[0] ?? '';
  }, [queuePayload]);
  const shouldForceSequentialForQuality = useMemo(() => {
    if (captureResolution !== 'auto_hq') {
      return false;
    }
    if (deviceMemoryGb === null) {
      return false;
    }
    return deviceMemoryGb <= 8;
  }, [captureResolution, deviceMemoryGb]);
  const effectiveExecutionMode: ExecutionMode = shouldForceSequentialForQuality
    ? 'sequential'
    : executionMode;

  function appendProgressLog(message: string) {
    const normalized = String(message || '').trim();
    if (!normalized) {
      return;
    }
    setProgressLog((previous) =>
      previous.length > 0 && previous[previous.length - 1] === normalized
        ? previous
        : [...previous, normalized]
    );
  }

  function createRequestId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  async function openFolderHandleDb() {
    return await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(FOLDER_DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(FOLDER_STORE_NAME)) {
          db.createObjectStore(FOLDER_STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Failed to open folder handle DB.'));
    });
  }

  async function persistFolderHandle(handle: PickedDirectoryHandle) {
    const db = await openFolderHandleDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(FOLDER_STORE_NAME, 'readwrite');
      tx.objectStore(FOLDER_STORE_NAME).put(handle, FOLDER_HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Failed to persist selected output folder.'));
    });
    db.close();
  }

  async function loadPersistedFolderHandle() {
    const db = await openFolderHandleDb();
    const value = await new Promise<PickedDirectoryHandle | null>((resolve, reject) => {
      const tx = db.transaction(FOLDER_STORE_NAME, 'readonly');
      const request = tx.objectStore(FOLDER_STORE_NAME).get(FOLDER_HANDLE_KEY);
      request.onsuccess = () => resolve((request.result as PickedDirectoryHandle) ?? null);
      request.onerror = () => reject(request.error || new Error('Failed to load selected output folder.'));
    });
    db.close();
    return value;
  }

  async function clearPersistedFolderHandle() {
    const db = await openFolderHandleDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(FOLDER_STORE_NAME, 'readwrite');
      tx.objectStore(FOLDER_STORE_NAME).delete(FOLDER_HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Failed to clear selected output folder.'));
    });
    db.close();
  }

  async function sendExtensionBridgeRequest<T>(
    type: 'BIZGITAL_INSIGHT_PING' | 'BIZGITAL_INSIGHT_CAPTURE_REQUEST',
    payload: Record<string, unknown> | null,
    timeoutMs = 10000,
    onProgress?: (value: LiveProgress) => void
  ) {
    return await new Promise<T>((resolve, reject) => {
      const requestId = createRequestId();
      const timeoutHandle = window.setTimeout(() => {
        window.removeEventListener('message', onMessage);
        reject(new Error('Extension did not respond in time.'));
      }, timeoutMs);

      const onMessage = (event: MessageEvent) => {
        if (event.source !== window) {
          return;
        }

        const data = event.data as
          | {
              source?: string;
              type?: string;
              requestId?: string;
              payload?: unknown;
            }
          | undefined;

        if (!data || data.source !== EXTENSION_BRIDGE_SOURCE) {
          return;
        }

        if (data.requestId !== requestId) {
          return;
        }

        if (data.type === 'BIZGITAL_INSIGHT_EXTENSION_PROGRESS') {
          onProgress?.((data.payload || {}) as LiveProgress);
          return;
        }

        window.clearTimeout(timeoutHandle);
        window.removeEventListener('message', onMessage);

        if (data.type === 'BIZGITAL_INSIGHT_EXTENSION_ERROR') {
          const payloadObject = data.payload as { message?: string } | undefined;
          reject(new Error(payloadObject?.message || 'Extension bridge error.'));
          return;
        }

        if (data.type !== 'BIZGITAL_INSIGHT_EXTENSION_RESPONSE') {
          reject(new Error('Unexpected extension bridge response.'));
          return;
        }

        resolve(data.payload as T);
      };

      window.addEventListener('message', onMessage);
      window.postMessage(
        {
          source: UI_BRIDGE_SOURCE,
          type,
          requestId,
          payload
        },
        '*'
      );
    });
  }

  async function checkExtensionReady() {
    try {
      const response = await sendExtensionBridgeRequest<{
        ok?: boolean;
        error?: string;
        data?: { ready?: boolean; version?: string };
      }>('BIZGITAL_INSIGHT_PING', null, 2500);

      setExtensionReady(Boolean(response?.ok && response?.data?.ready));
    } catch {
      setExtensionReady(false);
    }
  }

  async function ensureDirectoryWritePermission(handle: PickedDirectoryHandle) {
    const options = { mode: 'readwrite' } as const;
    if (typeof handle.queryPermission !== 'function') {
      return true;
    }
    const query = await handle.queryPermission(options);
    if (query === 'granted') {
      return true;
    }
    if (typeof handle.requestPermission !== 'function') {
      return false;
    }
    const request = await handle.requestPermission(options);
    return request === 'granted';
  }

  async function chooseOutputFolder() {
    const pickerWindow = window as DirectoryPickerWindow;
    if (typeof window === 'undefined' || typeof pickerWindow.showDirectoryPicker !== 'function') {
      setQueueLoadError('This browser does not support folder picker.');
      return;
    }
    if (!window.isSecureContext) {
      setQueueLoadError('Folder picker requires secure context (https or localhost).');
      return;
    }

    try {
      const handle = await pickerWindow.showDirectoryPicker({
        id: 'insight-capture-output',
        mode: 'readwrite',
        startIn: 'downloads'
      });
      const granted = await ensureDirectoryWritePermission(handle);
      if (!granted) {
        setQueueLoadError('Folder permission was denied. Please allow write access and try again.');
        return;
      }
      selectedFolderHandleRef.current = handle;
      setSelectedFolderName(handle.name);
      await persistFolderHandle(handle);
      setQueueLoadError(null);
    } catch (error) {
      if (isDirectoryPickerUserAbort(error)) {
        // User cancelled picker intentionally; this is not an actionable error.
        setQueueLoadError(null);
        return;
      }
      const message = error instanceof Error ? error.message : 'Could not select output folder.';
      setQueueLoadError(message);
    }
  }

  async function saveCaptureToSelectedFolder(dataUrl: string, filename: string) {
    const folderHandle = selectedFolderHandleRef.current;
    if (!folderHandle) {
      throw new Error('Please select output folder first.');
    }

    const granted = await ensureDirectoryWritePermission(folderHandle);
    if (!granted) {
      throw new Error('Folder write permission is not granted.');
    }

    const targetDir = await folderHandle.getDirectoryHandle('insight-captures', { create: true });
    const fileHandle = await targetDir.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    const blob = await fetch(dataUrl).then((response) => response.blob());
    await writable.write(blob);
    await writable.close();

    const folderLabel = selectedFolderName || folderHandle.name;
    return `${folderLabel}/insight-captures/${filename}`;
  }

  function extractFilenameFromSavedPath(pathValue: string) {
    const normalized = String(pathValue || '').replace(/\\/g, '/').trim();
    if (!normalized) {
      return '';
    }
    const segments = normalized.split('/').filter(Boolean);
    return segments[segments.length - 1] ?? '';
  }

  async function openSavedScreenshot(run: CapturePostRun) {
    if (!run.savedPath) {
      return;
    }

    const handle = selectedFolderHandleRef.current;
    if (!handle) {
      setQueueLoadError('Output folder is not available in this browser session. Please re-select folder.');
      return;
    }

    const filename = extractFilenameFromSavedPath(run.savedPath);
    if (!filename) {
      setQueueLoadError('Could not resolve screenshot filename.');
      return;
    }

    try {
      const imageDir = await handle.getDirectoryHandle('insight-captures', { create: false });
      const fileHandle = await imageDir.getFileHandle(filename, { create: false });
      const file = await fileHandle.getFile();
      const blobUrl = URL.createObjectURL(file);
      window.open(blobUrl, '_blank', 'noopener');
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
      setQueueLoadError(null);
    } catch {
      setQueueLoadError(`Could not open ${filename}. The file may have been moved or deleted.`);
    }
  }

  function openPageSwitchHelper() {
    if (!primaryPageSwitchId) {
      setQueueLoadError('No page ID found in this queue.');
      return;
    }
    const url = `https://www.facebook.com/profile.php?id=${encodeURIComponent(primaryPageSwitchId)}`;
    window.open(url, '_blank', 'noopener');
  }

  function updateRunStatus(index: number, patch: Partial<CapturePostRun>) {
    setQueueRuns((previous) =>
      previous.map((run, runIndex) => (runIndex === index ? { ...run, ...patch } : run))
    );
  }

  async function captureOnePost(
    item: CaptureQueueItem,
    index: number,
    total: number,
    workerKey: string,
    windowGroupKey?: string
  ) {
    const response = await sendExtensionBridgeRequest<CaptureBridgeResponse>(
      'BIZGITAL_INSIGHT_CAPTURE_REQUEST',
      {
        postUrl: item.postUrl,
        pageName: item.pageName,
        pageId: item.pageId,
        workerKey,
        windowGroupKey,
        captureResolution,
        executionMode: effectiveExecutionMode,
        clientDeviceMemoryGb: deviceMemoryGb,
        returnDataUrl: true,
        totalPosts: total,
        currentPost: index + 1
      },
      240000,
      (live) => {
        const percent =
          typeof live.percent === 'number'
            ? Math.max(0, Math.min(100, live.percent))
            : Math.min(95, Math.round(((index + 0.5) / Math.max(1, total)) * 100));
        setRunPercent(percent);
        if (live.message) {
          setRunMessage(live.message);
          appendProgressLog(live.message);
        }
      }
    );

    if (!response?.ok) {
      throw new Error(response?.error || 'Extension capture request failed.');
    }

    const payload = response.data ?? {};
    if (!payload.success) {
      return {
        success: false,
        error:
          payload.error ??
          'Could not capture insights. Complete page switch/login in the Facebook window and retry.',
        steps: payload.steps ?? []
      };
    }

    if (!payload.screenshotDataUrl) {
      throw new Error('Capture payload did not include image data.');
    }

    const filename = buildCaptureFilename(
      item.pageName || queuePayload?.brandLabel || 'brand',
      queuePayload?.reportMonthKey || 'month',
      item.rowNumber,
      new Date()
    );
    const savedPath = await saveCaptureToSelectedFolder(payload.screenshotDataUrl, filename);

    return {
      success: true,
      savedPath,
      steps: payload.steps ?? []
    };
  }

  async function runCaptureByIndexes(indexesToRun: number[], mode: 'full' | 'retry_failed') {
    if (!queuePayload || queuePayload.items.length === 0) {
      setQueueLoadError('No capture queue found for this run.');
      return;
    }

    if (!selectedFolderHandleRef.current) {
      setQueueLoadError('Please select output folder first.');
      return;
    }

    if (extensionReady !== true) {
      setQueueLoadError('Browser extension is not connected. Please re-check extension.');
      return;
    }

    if (indexesToRun.length === 0) {
      setQueueLoadError(mode === 'retry_failed' ? 'No failed posts to retry.' : 'No posts to capture.');
      return;
    }

    const normalizedIndexes = Array.from(
      new Set(indexesToRun.filter((value) => Number.isInteger(value) && value >= 0 && value < queuePayload.items.length))
    ).sort((left, right) => left - right);

    if (normalizedIndexes.length === 0) {
      setQueueLoadError('No valid posts were selected for this run.');
      return;
    }

    stopRequestedRef.current = false;
    setQueueLoadError(null);
    setIsRunning(true);
    setRunPercent(0);
    const startLabel =
      mode === 'retry_failed'
        ? 'Retrying failed posts...'
        : effectiveExecutionMode === 'parallel5'
          ? 'Starting capture run (turbo parallel x5)...'
          : 'Starting capture run...';
    setRunMessage(startLabel);
    setProgressLog([startLabel]);
    setQueueRuns((previous) => {
      if (mode === 'full' || previous.length !== queuePayload.items.length) {
        return queuePayload.items.map((item) => ({
          item,
          status: 'pending' as const,
          message: 'Waiting'
        }));
      }

      return previous.map((run, index) =>
        normalizedIndexes.includes(index)
          ? {
              ...run,
              status: 'pending',
              message: 'Waiting',
              savedPath: undefined,
              steps: undefined
            }
          : run
      );
    });

    const total = normalizedIndexes.length;
    const sequenceByRunIndex = new Map(
      normalizedIndexes.map((runIndex, sequence) => [runIndex, sequence + 1] as const)
    );
    const parallelLimit = effectiveExecutionMode === 'parallel5' ? 5 : 1;
    const workerCount = Math.max(1, Math.min(parallelLimit, total));
    const pendingIndexes = [...normalizedIndexes];
    const turboWindowGroupKey =
      effectiveExecutionMode === 'parallel5'
        ? `turbo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        : undefined;
    const turboPreflightEnabled = effectiveExecutionMode === 'parallel5' && pendingIndexes.length > 0;
    let completed = 0;

    if (effectiveExecutionMode === 'parallel5') {
      appendProgressLog(`Turbo mode enabled: ${workerCount} posts run in parallel (single window, multi-tab).`);
      appendProgressLog(
        'Turbo preflight enabled: first post will auto-check/switch page context before parallel tabs start.'
      );
    } else if (shouldForceSequentialForQuality) {
      appendProgressLog('Auto quality mode detected lower-memory device. Running in Stable x1 for image consistency.');
    }

    if (turboPreflightEnabled) {
      const preflightIndex = pendingIndexes.shift();
      if (preflightIndex !== undefined) {
        const preflightItem = queuePayload.items[preflightIndex];
        const preflightSequence = sequenceByRunIndex.get(preflightIndex) ?? preflightIndex + 1;
        const preflightMessage = `Turbo preflight on row ${preflightItem.rowNumber} (${preflightSequence}/${total})`;
        updateRunStatus(preflightIndex, { status: 'running', message: preflightMessage });
        setRunMessage(preflightMessage);
        appendProgressLog(preflightMessage);

        try {
          const preflightResult = await captureOnePost(
            preflightItem,
            preflightSequence - 1,
            total,
            'worker-1',
            turboWindowGroupKey
          );

          if (!preflightResult.success) {
            updateRunStatus(preflightIndex, {
              status: 'failed',
              message: preflightResult.error,
              steps: preflightResult.steps
            });
            appendProgressLog(`Turbo preflight failed on row ${preflightItem.rowNumber}: ${preflightResult.error}`);
            setRunPercent(Math.max(3, Math.round((1 / Math.max(1, total)) * 100)));
            setRunMessage('Turbo preflight failed. Parallel run was not started.');
            setIsRunning(false);
            return;
          }

          updateRunStatus(preflightIndex, {
            status: 'success',
            message: 'Saved successfully',
            savedPath: preflightResult.savedPath,
            steps: preflightResult.steps
          });
          appendProgressLog(`Turbo preflight passed. Row ${preflightItem.rowNumber} saved: ${preflightResult.savedPath}`);
          completed += 1;
          setRunPercent(Math.max(3, Math.round((completed / Math.max(1, total)) * 100)));
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown capture failure.';
          updateRunStatus(preflightIndex, {
            status: 'failed',
            message
          });
          appendProgressLog(`Turbo preflight failed on row ${preflightItem.rowNumber}: ${message}`);
          setRunPercent(Math.max(3, Math.round((1 / Math.max(1, total)) * 100)));
          setRunMessage('Turbo preflight failed. Parallel run was not started.');
          setIsRunning(false);
          return;
        }
      }
    }

    const runWorker = async (workerSlot: number) => {
      while (pendingIndexes.length > 0) {
        if (stopRequestedRef.current) {
          return;
        }
        const runIndex = pendingIndexes.shift();
        if (runIndex === undefined) {
          return;
        }

        const item = queuePayload.items[runIndex];
        const sequencePosition = sequenceByRunIndex.get(runIndex) ?? runIndex + 1;
        const startMessage = `Capturing row ${item.rowNumber} (${sequencePosition}/${total})`;
        updateRunStatus(runIndex, { status: 'running', message: startMessage });
        setRunMessage(startMessage);
        appendProgressLog(startMessage);

        try {
          const result = await captureOnePost(
            item,
            sequencePosition - 1,
            total,
            `worker-${workerSlot}`,
            turboWindowGroupKey
          );
          if (result.success) {
            updateRunStatus(runIndex, {
              status: 'success',
              message: 'Saved successfully',
              savedPath: result.savedPath,
              steps: result.steps
            });
            appendProgressLog(`Row ${item.rowNumber} saved: ${result.savedPath}`);
          } else {
            updateRunStatus(runIndex, {
              status: 'failed',
              message: result.error,
              steps: result.steps
            });
            appendProgressLog(`Row ${item.rowNumber} failed: ${result.error}`);
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Unknown capture failure.';
          updateRunStatus(runIndex, {
            status: 'failed',
            message
          });
          appendProgressLog(`Row ${item.rowNumber} failed: ${message}`);
        } finally {
          completed += 1;
          setRunPercent(Math.max(3, Math.round((completed / Math.max(1, total)) * 100)));
        }
      }
    };

    try {
      await Promise.all(
        Array.from({ length: workerCount }, (_, index) => runWorker(index + 1))
      );

      if (stopRequestedRef.current) {
        for (const runIndex of pendingIndexes) {
          updateRunStatus(runIndex, {
            status: 'stopped',
            message: 'Stopped by user'
          });
        }
        const stopLabel = mode === 'retry_failed' ? 'Retry stopped by user.' : 'Capture stopped by user.';
        setRunMessage(stopLabel);
        appendProgressLog(stopLabel);
      }
    } finally {
      setIsRunning(false);
      setRunPercent(100);
      const doneLabel = mode === 'retry_failed' ? 'Retry run finished.' : 'Capture run finished.';
      setRunMessage(doneLabel);
      appendProgressLog(doneLabel);
    }
  }

  async function startCaptureRun() {
    if (!queuePayload) {
      setQueueLoadError('No capture queue found for this run.');
      return;
    }
    const indexes = queuePayload.items.map((_, index) => index);
    await runCaptureByIndexes(indexes, 'full');
  }

  async function retryFailedOnly() {
    await runCaptureByIndexes(failedIndexes, 'retry_failed');
  }

  function stopCaptureRun() {
    if (!isRunning) {
      return;
    }
    stopRequestedRef.current = true;
    setRunMessage('Stopping after current post...');
    appendProgressLog('Stopping after current post...');
  }

  useEffect(() => {
    const pickerWindow = window as DirectoryPickerWindow;
    const supported = Boolean(window.isSecureContext && pickerWindow.showDirectoryPicker);
    setFolderPickerSupported(supported);

    if (!supported) {
      selectedFolderHandleRef.current = null;
      setSelectedFolderName('');
      return;
    }

    void (async () => {
      try {
        const restoredHandle = await loadPersistedFolderHandle();
        if (!restoredHandle) {
          return;
        }

        const granted = await ensureDirectoryWritePermission(restoredHandle);
        if (!granted) {
          await clearPersistedFolderHandle();
          selectedFolderHandleRef.current = null;
          setSelectedFolderName('');
          return;
        }

        selectedFolderHandleRef.current = restoredHandle;
        setSelectedFolderName(restoredHandle.name);
      } catch {
        // User can re-select folder from UI.
      }
    })();
  }, []);

  useEffect(() => {
    const savedResolution = window.localStorage.getItem(RESOLUTION_STORAGE_KEY);
    if (savedResolution === 'auto_hq' || savedResolution === 'hires2_5x' || savedResolution === 'hires3x') {
      setCaptureResolution(savedResolution);
    }
    const savedExecutionMode = window.localStorage.getItem(EXECUTION_MODE_STORAGE_KEY);
    if (savedExecutionMode === 'sequential' || savedExecutionMode === 'parallel5') {
      setExecutionMode(savedExecutionMode);
    }
  }, []);

  useEffect(() => {
    const memoryValue = Number((navigator as Navigator & { deviceMemory?: number }).deviceMemory);
    if (Number.isFinite(memoryValue) && memoryValue > 0) {
      setDeviceMemoryGb(memoryValue);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(RESOLUTION_STORAGE_KEY, captureResolution);
  }, [captureResolution]);

  useEffect(() => {
    window.localStorage.setItem(EXECUTION_MODE_STORAGE_KEY, executionMode);
  }, [executionMode]);

  useEffect(() => {
    void checkExtensionReady();
  }, []);

  useEffect(() => {
    if (!queueKey) {
      setQueuePayload(null);
      setQueueRuns([]);
      setQueueLoadError('Queue key is missing. Open this page from Import > Capture Insights button.');
      return;
    }

    const raw = window.localStorage.getItem(queueKey);
    if (!raw) {
      setQueuePayload(null);
      setQueueRuns([]);
      setQueueLoadError('Capture queue was not found. Please go back and launch from Import page again.');
      return;
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!isCaptureQueuePayload(parsed)) {
        throw new Error('Invalid queue payload');
      }
      setQueuePayload(parsed);
      setQueueLoadError(null);
      setQueueRuns(
        parsed.items.map((item) => ({
          item,
          status: 'pending',
          message: 'Waiting'
        }))
      );
      setRunPercent(0);
      setRunMessage('Ready to start capture.');
      setProgressLog([]);
    } catch {
      setQueuePayload(null);
      setQueueRuns([]);
      setQueueLoadError('Capture queue is corrupted. Please relaunch from Import page.');
    }
  }, [queueKey]);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Internal tools</div>
          <h1 className="text-3xl font-semibold tracking-[-0.03em]">Insight capture workspace</h1>
          <p className="text-sm text-muted-foreground">
            Batch capture Facebook post insights from Import queue via browser extension only.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button asChild className="h-8 px-3 text-xs" size="sm" variant="secondary">
            <a href={CHROME_WEB_STORE_URL} rel="noreferrer" target="_blank">
              Install extension
              <ExternalLink className="size-3.5" />
            </a>
          </Button>
          <div className="flex items-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-100">
            <span className="rounded-full border border-sky-400/40 bg-sky-900/40 px-2.5 py-1 font-medium">
              Extension:{' '}
              {extensionReady === null
                ? 'Checking...'
                : extensionReady
                  ? 'Connected'
                  : 'Not connected'}
            </span>
            <Button
              className="h-7 px-3 text-xs"
              onClick={() => void checkExtensionReady()}
              size="sm"
              type="button"
              variant="outline"
            >
              Re-check
            </Button>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            Extension capture setup
          </CardTitle>
          <CardDescription>
            This mode runs in your browser session and saves each screenshot directly to your selected folder.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <label className="text-xs font-medium">Screenshot quality</label>
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              onChange={(event) => setCaptureResolution(event.currentTarget.value as CaptureResolution)}
              value={captureResolution}
            >
              <option value="auto_hq">Auto HQ (recommended, slower)</option>
              <option value="hires2_5x">Hi-Res 2.5x</option>
              <option value="hires3x">Hi-Res 3x</option>
            </select>
            <p className="text-xs text-muted-foreground">
              Auto HQ prioritizes sharpness and stability with extra waits/retries. It may take longer per post.
            </p>
          </div>

          <div className="grid gap-2">
            <label className="text-xs font-medium">Capture execution mode</label>
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              onChange={(event) => setExecutionMode(event.currentTarget.value as ExecutionMode)}
              value={executionMode}
            >
              <option value="sequential">Stable (1 post at a time)</option>
              <option value="parallel5">Turbo (up to 5 posts in parallel)</option>
            </select>
            <p className="text-xs text-muted-foreground">
              Turbo is faster but may fail more often on Facebook. Auto HQ can force Stable x1 on lower-memory devices.
            </p>
          </div>
          {shouldForceSequentialForQuality ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              Auto HQ guardrail active: this device reports{` `}
              {deviceMemoryGb ? `${deviceMemoryGb} GB` : 'low memory'}, so capture runs in Stable x1 for better output consistency.
            </div>
          ) : null}

          <div className="grid gap-2">
            <label className="text-xs font-medium">Save destination</label>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Button
                disabled={!folderPickerSupported || isRunning}
                onClick={() => void chooseOutputFolder()}
                type="button"
                variant="outline"
              >
                Select output folder
              </Button>
              <span className="text-xs text-sky-100/90">
                {selectedFolderName
                  ? `Current folder: ${selectedFolderName}/insight-captures`
                  : 'No folder selected yet'}
              </span>
            </div>
            {!folderPickerSupported ? (
              <p className="text-xs text-amber-100/90">
                This browser/context does not support folder picker.
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Capture queue</CardTitle>
          <CardDescription>
            Queue is generated from SOURCE rows on Import page. Manual rows are excluded automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {queuePayload ? (
            <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
              <div>Brand: <span className="text-foreground">{queuePayload.brandLabel}</span></div>
              <div>Report month: <span className="text-foreground">{queuePayload.reportMonthKey}</span></div>
              <div>Total SOURCE rows: <span className="text-foreground">{queuePayload.totalSourceRows}</span></div>
              <div>Eligible capture rows: <span className="text-foreground">{queuePayload.totalEligibleRows}</span></div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={
                isRunning ||
                !queuePayload ||
                queuePayload.items.length === 0 ||
                extensionReady !== true ||
                !selectedFolderHandleRef.current
              }
              onClick={() => void startCaptureRun()}
              type="button"
            >
              {isRunning ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  Capturing...
                </>
              ) : (
                `Start capture (${queuePayload?.items.length ?? 0} posts, ${
                  effectiveExecutionMode === 'parallel5' ? 'Turbo x5' : 'Stable x1'
                })`
              )}
            </Button>
            <Button
              disabled={!isRunning}
              onClick={stopCaptureRun}
              type="button"
              variant="outline"
            >
              <StopCircle className="size-4" />
              Stop
            </Button>
            <Button
              disabled={isRunning || failedIndexes.length === 0}
              onClick={() => void retryFailedOnly()}
              type="button"
              variant="outline"
            >
              Retry failed only ({failedIndexes.length})
            </Button>
            <Button
              disabled={isRunning || !primaryPageSwitchId}
              onClick={openPageSwitchHelper}
              type="button"
              variant="outline"
            >
              Open page switch helper
            </Button>
          </div>

          {queueLoadError ? (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {queueLoadError}
            </div>
          ) : null}

        </CardContent>
      </Card>

      <Card className="border-sky-500/25 bg-sky-500/8">
        <CardHeader>
          <CardTitle>Capture progress</CardTitle>
          <CardDescription>
            Completed {completedCount} / {queueRuns.length || 0}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="h-2 w-full overflow-hidden rounded-full bg-sky-950/60">
            <div
              className="h-full bg-sky-400 transition-all duration-300"
              style={{ width: `${Math.max(0, Math.min(100, runPercent))}%` }}
            />
          </div>
          <p className="text-sm text-sky-100">{runMessage}</p>
          {progressLog.length > 0 ? (
            <div className="space-y-1">
              <p className="text-xs font-medium text-sky-100/90">Live status</p>
              <ul className="list-disc space-y-1 pl-5 text-xs text-sky-100/80">
                {progressLog.slice(-8).map((line, index) => (
                  <li key={`${index}-${line}`}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {queueRuns.length > 0 ? (
        <Card className={failedCount > 0 ? 'border-rose-500/25 bg-rose-500/8' : 'border-emerald-500/25 bg-emerald-500/8'}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {failedCount > 0 ? (
                <AlertCircle className="size-4 text-rose-600" />
              ) : (
                <CheckCircle2 className="size-4 text-emerald-600" />
              )}
              Run summary
            </CardTitle>
            <CardDescription>
              Success: {successCount} | Failed: {failedCount} | Total: {queueRuns.length}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="max-h-[360px] overflow-auto rounded-xl border border-border/60">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead className="bg-background/80 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Row</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Post URL</th>
                    <th className="px-3 py-2">Saved path / message</th>
                  </tr>
                </thead>
                <tbody>
                  {queueRuns.map((run, index) => (
                    <tr className="border-t border-border/40" key={`${run.item.rowNumber}-${index}`}>
                      <td className="px-3 py-2">{run.item.rowNumber}</td>
                      <td className="px-3 py-2 capitalize">{run.status}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        <a
                          className="underline hover:text-foreground"
                          href={run.item.postUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {run.item.postUrl}
                        </a>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {run.savedPath ? (
                          <button
                            className="text-left underline hover:text-foreground"
                            onClick={() => void openSavedScreenshot(run)}
                            type="button"
                          >
                            {run.savedPath}
                          </button>
                        ) : (
                          run.message
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}
