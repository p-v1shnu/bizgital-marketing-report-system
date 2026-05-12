const UI_SOURCE = 'bizgital-insight-ui';
const pendingDownloadFilenameQueue = [];
const AUTOMATION_WINDOW_BOUNDS = {
  width: 960,
  height: 980,
  left: 0,
  top: 24
};
const automationSessionByWorker = new Map();
const activeWorkerLocks = new Set();
const windowGroupWindowIdByKey = new Map();
const windowGroupCreatePromiseByKey = new Map();
const MAX_RUNTIME_LOG_ITEMS = 40;
let persistTimer = null;
const PERSIST_DEBOUNCE_MS = 250;
const DEFAULT_RUNTIME_CAPTURE_STATE = {
  completedCount: 0,
  successCount: 0,
  failureCount: 0,
  lastEvent: 'Idle',
  lastProgressByWorker: {},
  lastProgress: null,
  recentRuns: [],
  lastUpdatedAt: new Date().toISOString()
};
const runtimeCaptureState = {
  ...DEFAULT_RUNTIME_CAPTURE_STATE
};
const runtimeProgressByWorker = new Map();

function sanitizeRuntimeCaptureState(candidate) {
  const source = candidate && typeof candidate === 'object' ? candidate : {};
  const sanitizedProgressByWorker =
    source.lastProgressByWorker && typeof source.lastProgressByWorker === 'object'
      ? source.lastProgressByWorker
      : {};
  const sanitizedRecentRuns = Array.isArray(source.recentRuns) ? source.recentRuns : [];
  return {
    completedCount: Number.isFinite(source.completedCount)
      ? Math.max(0, Number(source.completedCount))
      : 0,
    successCount: Number.isFinite(source.successCount)
      ? Math.max(0, Number(source.successCount))
      : 0,
    failureCount: Number.isFinite(source.failureCount)
      ? Math.max(0, Number(source.failureCount))
      : 0,
    lastEvent:
      typeof source.lastEvent === 'string' && source.lastEvent.trim().length > 0
        ? source.lastEvent
        : 'Idle',
    lastProgressByWorker: sanitizedProgressByWorker,
    lastProgress: null,
    recentRuns: sanitizedRecentRuns.slice(0, MAX_RUNTIME_LOG_ITEMS),
    lastUpdatedAt:
      typeof source.lastUpdatedAt === 'string' && source.lastUpdatedAt
        ? source.lastUpdatedAt
        : new Date().toISOString()
  };
}

function hydrateRuntimeProgressMap(lastProgressByWorker) {
  runtimeProgressByWorker.clear();
  for (const [workerKey, progress] of Object.entries(lastProgressByWorker || {})) {
    if (!workerKey) {
      continue;
    }
    if (!progress || typeof progress !== 'object') {
      continue;
    }
    runtimeProgressByWorker.set(workerKey, {
      ...progress,
      workerKey
    });
  }
}

function snapshotRuntimeProgressMap() {
  return Object.fromEntries(runtimeProgressByWorker.entries());
}

function selectTopProgress(progressByWorkerMap) {
  const entries = Array.from((progressByWorkerMap || new Map()).entries()).map(
    ([workerKey, progress]) => {
    const percent = Number.isFinite(progress?.percent) ? Number(progress.percent) : 0;
    const updatedAt =
      typeof progress?.updatedAt === 'string' ? progress.updatedAt : new Date(0).toISOString();
    return {
      workerKey,
      ...progress,
      percent,
      updatedAt
      };
    }
  );

  if (entries.length === 0) {
    return null;
  }

  entries.sort((left, right) => {
    if (right.percent !== left.percent) {
      return right.percent - left.percent;
    }
    const leftTime = Date.parse(left.updatedAt || '');
    const rightTime = Date.parse(right.updatedAt || '');
    return rightTime - leftTime;
  });

  return entries[0];
}

function persistRuntimeState() {
  if (persistTimer) {
    return;
  }
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void chrome.storage.session
      .set({ runtimeCaptureState })
      .catch(() => undefined);
  }, PERSIST_DEBOUNCE_MS);
}

function flushRuntimeStateNow() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  void chrome.storage.session
    .set({ runtimeCaptureState })
    .catch(() => undefined);
}

function applyRuntimeStatePatch(patch = {}) {
  Object.assign(runtimeCaptureState, patch);
  if (Object.prototype.hasOwnProperty.call(patch, 'lastProgressByWorker')) {
    hydrateRuntimeProgressMap(patch.lastProgressByWorker);
  }
  runtimeCaptureState.lastProgressByWorker = snapshotRuntimeProgressMap();
  runtimeCaptureState.lastProgress = selectTopProgress(runtimeProgressByWorker);
  runtimeCaptureState.lastUpdatedAt = new Date().toISOString();
}

function buildRuntimeStatusSnapshot() {
  return {
    ready: true,
    version: chrome.runtime.getManifest().version,
    activeCount: activeWorkerLocks.size,
    completedCount: runtimeCaptureState.completedCount,
    successCount: runtimeCaptureState.successCount,
    failureCount: runtimeCaptureState.failureCount,
    lastEvent: runtimeCaptureState.lastEvent,
    lastProgressByWorker: { ...(runtimeCaptureState.lastProgressByWorker || {}) },
    lastProgress: runtimeCaptureState.lastProgress,
    recentRuns: [...runtimeCaptureState.recentRuns],
    lastUpdatedAt: runtimeCaptureState.lastUpdatedAt
  };
}

function updateRuntimeState(patch = {}) {
  applyRuntimeStatePatch(patch);
  persistRuntimeState();
}

function clearRuntimeLogs() {
  runtimeProgressByWorker.clear();
  updateRuntimeState({
    completedCount: 0,
    successCount: 0,
    failureCount: 0,
    recentRuns: [],
    lastEvent: activeWorkerLocks.size > 0 ? 'Capture is still running.' : 'Logs cleared.'
  });
  flushRuntimeStateNow();
}

function recordRuntimeOutcome({ workerKey, requestId, result, startedAt }) {
  const durationMs = Math.max(0, Date.now() - startedAt);
  const success = Boolean(result?.success);
  const message = success
    ? result?.screenshotFile || 'Capture completed.'
    : result?.error || result?.message || 'Capture failed.';

  const previousProgress = runtimeProgressByWorker.get(workerKey);
  runtimeProgressByWorker.set(workerKey, {
    workerKey,
    status: success ? 'completed' : 'failed',
    message,
    percent: success ? 100 : Number(previousProgress?.percent || 0),
    requestId: requestId || null,
    updatedAt: new Date().toISOString()
  });

  let nextSuccessCount = runtimeCaptureState.successCount;
  let nextFailureCount = runtimeCaptureState.failureCount;
  if (success) {
    nextSuccessCount += 1;
  } else {
    nextFailureCount += 1;
  }

  const nextRecentRuns = [...runtimeCaptureState.recentRuns];
  nextRecentRuns.unshift({
    workerKey,
    requestId: requestId || null,
    success,
    message,
    errorCode: result?.errorCode || null,
    durationMs,
    finishedAt: new Date().toISOString()
  });

  if (nextRecentRuns.length > MAX_RUNTIME_LOG_ITEMS) {
    nextRecentRuns.length = MAX_RUNTIME_LOG_ITEMS;
  }

  updateRuntimeState({
    completedCount: runtimeCaptureState.completedCount + 1,
    successCount: nextSuccessCount,
    failureCount: nextFailureCount,
    lastProgressByWorker: snapshotRuntimeProgressMap(),
    recentRuns: nextRecentRuns,
    lastEvent: success
      ? `Capture completed (${workerKey}).`
      : `Capture failed (${workerKey}).`
  });

  runtimeProgressByWorker.delete(workerKey);
  updateRuntimeState({
    lastProgressByWorker: snapshotRuntimeProgressMap()
  });
  flushRuntimeStateNow();
}

let runtimeStateHydrationPromise = null;

function ensureRuntimeStateHydrated() {
  if (!runtimeStateHydrationPromise) {
    runtimeStateHydrationPromise = chrome.storage.session
      .get('runtimeCaptureState')
      .then((storedRuntimeCaptureState) => {
        if (storedRuntimeCaptureState?.runtimeCaptureState) {
          applyRuntimeStatePatch(
            sanitizeRuntimeCaptureState(storedRuntimeCaptureState.runtimeCaptureState)
          );
        }
      })
      .catch(() => undefined);
  }
  return runtimeStateHydrationPromise;
}

void ensureRuntimeStateHydrated();

function normalizeWorkerKey(value) {
  const raw = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return raw || 'default';
}

function normalizeWindowGroupKey(value) {
  const raw = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return raw || null;
}

function getWorkerSession(workerKey) {
  if (!automationSessionByWorker.has(workerKey)) {
    automationSessionByWorker.set(workerKey, {
      windowId: null,
      tabId: null,
      windowGroupKey: null
    });
  }
  return automationSessionByWorker.get(workerKey);
}

function resetAutomationSessionState(workerKey) {
  if (!workerKey) {
    automationSessionByWorker.clear();
    return;
  }
  automationSessionByWorker.delete(workerKey);
}

chrome.tabs.onRemoved.addListener((tabId) => {
  for (const [workerKey, session] of automationSessionByWorker.entries()) {
    if (session.tabId === tabId) {
      resetAutomationSessionState(workerKey);
    }
  }
});

chrome.windows.onRemoved.addListener((windowId) => {
  for (const [workerKey, session] of automationSessionByWorker.entries()) {
    if (session.windowId === windowId) {
      resetAutomationSessionState(workerKey);
    }
  }
  for (const [groupKey, groupWindowId] of windowGroupWindowIdByKey.entries()) {
    if (groupWindowId === windowId) {
      windowGroupWindowIdByKey.delete(groupKey);
      windowGroupCreatePromiseByKey.delete(groupKey);
    }
  }
});

async function getOrCreateSharedWindowId(postUrl, windowGroupKey) {
  const existingWindowId = windowGroupWindowIdByKey.get(windowGroupKey);
  if (typeof existingWindowId === 'number') {
    const existingWindow = await chrome.windows.get(existingWindowId).catch(() => null);
    if (existingWindow?.id !== undefined) {
      await ensureAutomationWindowBounds(existingWindow.id);
      return existingWindow.id;
    }
    windowGroupWindowIdByKey.delete(windowGroupKey);
  }

  if (windowGroupCreatePromiseByKey.has(windowGroupKey)) {
    return await windowGroupCreatePromiseByKey.get(windowGroupKey);
  }

  const createPromise = (async () => {
    const createdWindow = await chrome.windows.create({
      url: postUrl,
      type: 'normal',
      focused: false,
      ...AUTOMATION_WINDOW_BOUNDS
    });
    if (createdWindow.id === undefined) {
      throw new Error('Failed to open shared automation window.');
    }
    await ensureAutomationWindowBounds(createdWindow.id);
    windowGroupWindowIdByKey.set(windowGroupKey, createdWindow.id);
    return createdWindow.id;
  })();

  windowGroupCreatePromiseByKey.set(windowGroupKey, createPromise);

  try {
    return await createPromise;
  } finally {
    windowGroupCreatePromiseByKey.delete(windowGroupKey);
  }
}

async function resolveAutomationWindowTarget(postUrl, steps, workerKey, windowGroupKey) {
  const session = getWorkerSession(workerKey);
  session.windowGroupKey = windowGroupKey || null;
  if (session.tabId !== null) {
    const tab = await chrome.tabs.get(session.tabId).catch(() => null);
    if (tab?.id && typeof tab.windowId === 'number') {
      await ensureAutomationWindowBounds(tab.windowId);
      session.windowId = tab.windowId;
      return {
        tabId: tab.id,
        windowId: tab.windowId,
        reused: true
      };
    }
    resetAutomationSessionState(workerKey);
  }

  if (windowGroupKey) {
    const sharedWindowId = await getOrCreateSharedWindowId(postUrl, windowGroupKey);
    await ensureAutomationWindowBounds(sharedWindowId);
    const createdTab = await chrome.tabs.create({
      windowId: sharedWindowId,
      url: postUrl,
      active: false
    });
    if (!createdTab?.id) {
      throw new Error('Failed to open automation tab in shared window.');
    }

    const nextSession = getWorkerSession(workerKey);
    nextSession.windowId = sharedWindowId;
    nextSession.tabId = createdTab.id;
    nextSession.windowGroupKey = windowGroupKey;
    steps.push(`Opened automation tab in shared window (${windowGroupKey}/${workerKey}).`);
    return {
      tabId: createdTab.id,
      windowId: sharedWindowId,
      reused: false
    };
  }

  if (session.windowId !== null) {
    const windowInfo = await chrome.windows
      .get(session.windowId, { populate: true })
      .catch(() => null);
    if (windowInfo?.id && Array.isArray(windowInfo.tabs) && windowInfo.tabs.length > 0) {
      const candidateTab = windowInfo.tabs.find((tab) => typeof tab.id === 'number') || null;
      if (candidateTab?.id) {
        await ensureAutomationWindowBounds(windowInfo.id);
        session.windowId = windowInfo.id;
        session.tabId = candidateTab.id;
        return {
          tabId: candidateTab.id,
          windowId: windowInfo.id,
          reused: true
        };
      }
    }
    resetAutomationSessionState(workerKey);
  }

  const createdWindow = await chrome.windows.create({
    url: postUrl,
    type: 'normal',
    focused: false,
    ...AUTOMATION_WINDOW_BOUNDS
  });
  const createdTabId = createdWindow.tabs?.[0]?.id;
  if (!createdTabId || createdWindow.id === undefined) {
    throw new Error('Failed to open automation browser window.');
  }
  await ensureAutomationWindowBounds(createdWindow.id);

  const nextSession = getWorkerSession(workerKey);
  nextSession.windowId = createdWindow.id;
  nextSession.tabId = createdTabId;
  steps.push(`Opened automation window in background (${workerKey}).`);
  return {
    tabId: createdTabId,
    windowId: createdWindow.id,
    reused: false
  };
}

async function ensureAutomationWindowBounds(windowId) {
  if (typeof windowId !== 'number') {
    return;
  }

  await chrome.windows
    .update(windowId, {
      state: 'normal',
      focused: false,
      ...AUTOMATION_WINDOW_BOUNDS
    })
    .catch(async () => {
      await chrome.windows
        .update(windowId, {
          focused: false,
          ...AUTOMATION_WINDOW_BOUNDS
        })
        .catch(() => undefined);
    });
}

chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
  try {
    const ownedByThisExtension =
      String(downloadItem.byExtensionId || '') === String(chrome.runtime.id || '');
    if (!ownedByThisExtension || pendingDownloadFilenameQueue.length === 0) {
      suggest();
      return;
    }

    const nextFilename = pendingDownloadFilenameQueue.shift();
    if (!nextFilename) {
      suggest();
      return;
    }

    suggest({
      filename: nextFilename,
      conflictAction: 'uniquify'
    });
  } catch {
    suggest();
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void (async () => {
    try {
      await ensureRuntimeStateHydrated();

      if (!message || message.source !== UI_SOURCE) {
        sendResponse({ ok: false, error: 'Unsupported message.' });
        return;
      }

      if (message.type === 'BIZGITAL_INSIGHT_PING') {
        sendResponse({
          ok: true,
          data: {
            ready: true,
            version: chrome.runtime.getManifest().version
          }
        });
        return;
      }

      if (message.type === 'BIZGITAL_INSIGHT_RUNTIME_STATUS') {
        sendResponse({
          ok: true,
          data: buildRuntimeStatusSnapshot()
        });
        return;
      }

      if (message.type === 'BIZGITAL_INSIGHT_CLEAR_RUNTIME_LOG') {
        clearRuntimeLogs();
        sendResponse({
          ok: true,
          data: buildRuntimeStatusSnapshot()
        });
        return;
      }

      if (message.type === 'BIZGITAL_INSIGHT_CAPTURE_REQUEST') {
        const capturePayload = message.payload ?? {};
        const workerKey = normalizeWorkerKey(capturePayload.workerKey);
        const startedAt = Date.now();
        updateRuntimeState({
          lastEvent: `Capture requested (${workerKey}).`
        });

        let result;
        try {
          result = await runCapture(capturePayload, {
            uiTabId: _sender?.tab?.id,
            uiWindowId: _sender?.tab?.windowId,
            requestId: message.requestId
          });
        } catch (error) {
          const messageText =
            error instanceof Error && error.message ? error.message : 'Unexpected extension error.';
          const failedResult = {
            success: false,
            errorCode: 'CAPTURE_FAILED',
            error: messageText
          };
          recordRuntimeOutcome({
            workerKey,
            requestId: message.requestId,
            result: failedResult,
            startedAt
          });
          throw error;
        }

        recordRuntimeOutcome({
          workerKey,
          requestId: message.requestId,
          result,
          startedAt
        });
        sendResponse({ ok: true, data: result });
        return;
      }

      sendResponse({ ok: false, error: 'Unknown request type.' });
    } catch (error) {
      const messageText =
        error instanceof Error && error.message ? error.message : 'Unexpected extension error.';
      sendResponse({ ok: false, error: messageText });
    }
  })();

  return true;
});

function createProgressEmitter(uiTabId, requestId, totalPosts, currentPost, workerKey) {
  return (status, message, percent) => {
    runtimeProgressByWorker.set(workerKey, {
      workerKey,
      status,
      message,
      percent: Number.isFinite(percent) ? Number(percent) : 0,
      totalPosts,
      currentPost,
      requestId: requestId || null,
      updatedAt: new Date().toISOString()
    });

    updateRuntimeState({
      lastEvent: message || runtimeCaptureState.lastEvent,
      lastProgressByWorker: snapshotRuntimeProgressMap()
    });
    if (!uiTabId) {
      return;
    }
    void chrome.tabs
      .sendMessage(uiTabId, {
        source: UI_SOURCE,
        type: 'BIZGITAL_INSIGHT_PROGRESS',
        requestId,
        payload: {
          status,
          message,
          percent,
          totalPosts,
          currentPost
        }
      })
      .catch(() => undefined);
  };
}

async function runCapture(payload, runtimeContext = {}) {
  const workerKey = normalizeWorkerKey(payload.workerKey);
  const windowGroupKey = normalizeWindowGroupKey(payload.windowGroupKey);
  if (activeWorkerLocks.has(workerKey)) {
    return {
      success: false,
      errorCode: 'CAPTURE_FAILED',
      error: `Worker ${workerKey} is already running. Please wait for current capture to finish.`,
      steps: [`Rejected because worker ${workerKey} is already running.`]
    };
  }
  activeWorkerLocks.add(workerKey);
  runtimeProgressByWorker.set(workerKey, {
    workerKey,
    status: 'starting',
    message: `Worker ${workerKey} started.`,
    percent: 0,
    requestId: runtimeContext.requestId || null,
    updatedAt: new Date().toISOString()
  });
  updateRuntimeState({
    lastEvent: `Worker ${workerKey} started.`,
    lastProgressByWorker: snapshotRuntimeProgressMap()
  });

  try {
    const steps = [];
    const postUrl = normalizeFacebookPostUrl(payload.postUrl);
    const postToken = extractPostToken(postUrl);
    const pageId = normalizePageId(payload.pageId);
    const pageName = normalizePageName(payload.pageName);
    const captureResolution = normalizeCaptureResolution(payload.captureResolution);
    const executionMode = normalizeExecutionMode(payload.executionMode);
    const foregroundStabilityMode = shouldUseForegroundCaptureMode(
      captureResolution,
      executionMode,
      payload.clientDeviceMemoryGb
    );
    const returnDataUrl = Boolean(payload.returnDataUrl);
    const totalPosts = Math.max(1, Number(payload.totalPosts || 1));
    const currentPost = Math.max(1, Number(payload.currentPost || 1));
    const emitProgress = createProgressEmitter(
      runtimeContext.uiTabId,
      runtimeContext.requestId,
      totalPosts,
      currentPost,
      workerKey
    );
    await emitProgress('running', `Preparing automation window (${workerKey})...`, 5);
    const automationTarget = await resolveAutomationWindowTarget(
      postUrl,
      steps,
      workerKey,
      windowGroupKey
    );
    const tabId = automationTarget.tabId;
    const windowId = automationTarget.windowId;
    if (automationTarget.reused) {
      steps.push(`Reusing existing automation window/tab (${workerKey}).`);
    }
    if (foregroundStabilityMode) {
      await ensureAutomationTabForeground(windowId, tabId, steps);
      await emitProgress('running', 'Foreground stability mode enabled for low-spec reliability.', 10);
    }

    await chrome.tabs.update(tabId, { url: postUrl, active: foregroundStabilityMode });
    await waitForTabComplete(tabId);
    await delay(automationTarget.reused ? 900 : 1400);
    steps.push(`Opened post URL in automation window (${workerKey}): ${postUrl}`);
    await emitProgress('running', 'Post opened. Checking login and context...', 15);

    const accessState = await executeInTab(tabId, detectFacebookAccessStateInPage);
    if (accessState?.checkpointRequired) {
      return {
        success: false,
        errorCode: 'CHECKPOINT_REQUIRED',
        error:
          'Facebook security checkpoint detected. Complete verification in this Facebook tab, then run Capture again.',
        steps
      };
    }
    if (accessState?.loginRequired) {
      return {
        success: false,
        errorCode: 'LOGIN_REQUIRED',
        error: 'Facebook login is required. Sign in on this Facebook tab, then run Capture again.',
        steps
      };
    }
    await emitProgress('running', 'Context check done. Preparing page identity...', 25);

    const targetReady = await executeInTab(tabId, isTargetPostContextInPage, [postToken]);
    if (!targetReady?.matched) {
      return {
        success: false,
        errorCode: 'CAPTURE_FAILED',
        error: 'Opened tab is not on the exact target post yet. Please open the target post and retry.',
        steps
      };
    }

    const identityState = await executeInTab(tabId, inspectPostingIdentityInPage, [pageName]);
    if (identityState?.hasCommentAsSignal) {
      steps.push(
        `Posting identity detected: ${identityState.isPageContext ? 'page' : 'personal'} (${identityState.commentAsLabel || 'unknown'})`
      );
    } else {
      steps.push('Posting identity signal not found yet (no "comment as" label detected).');
    }

    if (pageId && !identityState?.isPageContext) {
    steps.push(
      `Personal context detected. Switching directly via page profile (${pageId}) to avoid intermediate post context.`
    );

      const fallbackSwitch = await attemptFallbackPageSwitchViaProfile(
        tabId,
        windowId,
        postUrl,
        pageId,
        pageName,
        steps,
        foregroundStabilityMode
      );
    await emitProgress('running', 'Switching to target page profile...', 45);
    if (fallbackSwitch?.checkpointRequired) {
      return {
        success: false,
        errorCode: 'CHECKPOINT_REQUIRED',
        error:
          'Facebook security checkpoint detected. Complete verification in this Facebook tab, then run Capture again.',
        steps
      };
    }
    if (fallbackSwitch?.loginRequired) {
      return {
        success: false,
        errorCode: 'LOGIN_REQUIRED',
        error: 'Facebook login is required. Sign in on this Facebook tab, then run Capture again.',
        steps
      };
    }

      const identityAfterFallback = await executeInTab(tabId, inspectPostingIdentityInPage, [pageName]);
    steps.push(
      `Identity after direct switch: ${
        identityAfterFallback?.isPageContext ? 'page' : 'personal/unknown'
      } (${identityAfterFallback?.commentAsLabel || 'unknown'})`
    );

      if (identityAfterFallback?.hasCommentAsSignal && !identityAfterFallback?.isPageContext) {
      return {
        success: false,
        errorCode: 'CAPTURE_FAILED',
        error:
          'Page switch appears incomplete (still personal profile context). Please switch into the target page manually once, then retry.',
        steps
      };
    }
      await emitProgress('running', 'Page switch complete. Returning to post...', 60);
    } else if (pageId) {
      steps.push('Page context already active. Skip auto-switch.');
      await emitProgress('running', 'Page context already active. Opening insights...', 60);
    }

    await emitProgress('running', 'Looking for Insights button...', 72);
    const insightClickResult = await executeInTab(tabId, clickInsightsActionInPage, [postToken]);
    if (!insightClickResult?.clicked) {
    const retryState = await executeInTab(tabId, detectFacebookAccessStateInPage);
    if (retryState?.checkpointRequired) {
      return {
        success: false,
        errorCode: 'CHECKPOINT_REQUIRED',
        error:
          'Facebook security checkpoint detected. Complete verification in this Facebook tab, then run Capture again.',
        steps
      };
    }
    if (retryState?.loginRequired) {
      return {
        success: false,
        errorCode: 'LOGIN_REQUIRED',
        error: 'Facebook login is required. Sign in on this Facebook tab, then run Capture again.',
        steps
      };
    }

      return {
      success: false,
      errorCode: 'CAPTURE_FAILED',
      error: 'Could not find an Insights action on the target post URL.',
      steps: [
        ...steps,
        `Insight scan details: ${insightClickResult?.detail || 'no detail'}`
      ]
      };
    }

    if (insightClickResult?.matchedTarget) {
      steps.push('Insights action clicked on target post.');
    } else {
      steps.push('Insights action clicked (fallback match, target marker not found).');
    }
    await delay(1400);

    await emitProgress('running', 'Insights opened. Waiting for charts to render...', 84);
    let renderWait = await waitForInsightsRenderReady(tabId, 22000, {
      stablePassesRequired: foregroundStabilityMode ? 2 : 1
    });
    steps.push(`Insights render status: ${renderWait.status}`);
    if (!renderWait.ready) {
      if (foregroundStabilityMode) {
        steps.push('Render not fully ready. Retrying with focused tab and extended wait.');
        await ensureAutomationTabForeground(windowId, tabId, steps);
      }
      await delay(1800);
      renderWait = await waitForInsightsRenderReady(tabId, 18000, {
        stablePassesRequired: 2
      });
      steps.push(`Insights render retry status: ${renderWait.status}`);
      if (!renderWait.ready) {
        return {
          success: false,
          errorCode: 'CAPTURE_FAILED',
          error:
            'Insights panel did not finish rendering in time on this device. Keep the Facebook window visible, then retry.',
          steps
        };
      }
    }

    if (foregroundStabilityMode) {
      await ensureAutomationTabForeground(windowId, tabId, steps);
    }

    const dataUrl = await captureInsightsSingleShot(
      tabId,
      windowId,
      steps,
      captureResolution,
      {
        clientDeviceMemoryGb: payload.clientDeviceMemoryGb
      }
    );
    await emitProgress('running', 'Saving screenshot file...', 95);

    const filename = buildDownloadFilename(pageName || 'post');
    if (returnDataUrl) {
      steps.push('Returned screenshot payload to system UI for local save.');
      await emitProgress('completed', 'Capture completed.', 100);
      return {
        success: true,
        screenshotFile: filename,
        screenshotDataUrl: dataUrl,
        steps
      };
    }

    pendingDownloadFilenameQueue.push(filename);
    const downloadId = await chrome.downloads.download({
      url: dataUrl,
      filename,
      saveAs: false
    });
    const actualSavedPath = await waitForDownloadSavedFilename(downloadId, 5000);
    const normalizedActual = normalizeDownloadedPathForUi(actualSavedPath, filename);
    steps.push(`Saved screenshot: ${normalizedActual}`);
    await emitProgress('completed', 'Capture completed.', 100);

    return {
      success: true,
      screenshotFile: normalizedActual,
      downloadId,
      steps
    };
  } finally {
    activeWorkerLocks.delete(workerKey);
    updateRuntimeState();
  }
}

async function attemptFallbackPageSwitchViaProfile(
  tabId,
  windowId,
  postUrl,
  pageId,
  pageName,
  steps,
  foregroundStabilityMode = false
) {
  const profileUrl = `https://www.facebook.com/profile.php?id=${encodeURIComponent(pageId)}`;
  steps.push(`Trying direct switch via page profile ${profileUrl}`);

  if (foregroundStabilityMode) {
    await ensureAutomationTabForeground(windowId, tabId, steps);
  }
  await chrome.tabs.update(tabId, { url: profileUrl, active: foregroundStabilityMode });
  await waitForTabComplete(tabId);
  await delay(2200);

  const accessState = await executeInTab(tabId, detectFacebookAccessStateInPage);
  if (accessState?.checkpointRequired) {
    return { checkpointRequired: true };
  }
  if (accessState?.loginRequired) {
    return { loginRequired: true };
  }

  const directSwitchNow = await executeInTab(tabId, clickDirectSwitchNowInPage);
  let switchResult = directSwitchNow;
  if (directSwitchNow?.clicked) {
    steps.push(`Direct switch action clicked: ${directSwitchNow.detail || 'switch now'}`);
  } else {
    switchResult = await executeInTab(tabId, clickSwitchActionInPage, [pageId, pageName]);
  }

  if (switchResult?.clicked) {
    if (!directSwitchNow?.clicked) {
      steps.push('Fallback switch action clicked from page profile.');
    }
    await waitForPageSwitchContext(tabId, pageName, steps, 14000);
  } else {
    steps.push('Fallback switch action not found on page profile.');
  }

  await chrome.tabs.update(tabId, { url: postUrl, active: foregroundStabilityMode });
  await waitForTabComplete(tabId);
  await delay(1500);
  steps.push('Returned to target post URL after fallback switch attempt.');

  return { switched: Boolean(switchResult?.clicked) };
}

function clickDirectSwitchNowInPage() {
  const nodes = Array.from(
    document.querySelectorAll('button, a, [role="button"], span[role="button"], div[role="button"]')
  );

  const getText = (node) =>
    [
      node.textContent || '',
      node.getAttribute?.('aria-label') || '',
      node.getAttribute?.('title') || ''
    ]
      .join(' ')
      .trim()
      .toLowerCase();

  for (const node of nodes) {
    const text = getText(node);
    const isDirectSwitch = text === 'switch now' || text.includes('switch now');
    if (!isDirectSwitch) {
      continue;
    }
    node.scrollIntoView({ block: 'center', behavior: 'instant' });
    if (node instanceof HTMLAnchorElement) {
      node.target = '_self';
      node.rel = '';
    }
    node.click();
    return { clicked: true, detail: text || 'switch now' };
  }

  return { clicked: false };
}

async function waitForPageSwitchContext(tabId, pageName, steps, timeoutMs = 12000) {
  const start = Date.now();
  let clickedConfirm = false;

  while (Date.now() - start < timeoutMs) {
    const confirmResult = await executeInTab(tabId, clickSwitchConfirmationInPage, [pageName]);
    if (confirmResult?.clicked) {
      if (!clickedConfirm) {
        steps.push(`Clicked switch confirmation: ${confirmResult.detail || 'switch button'}`);
      }
      clickedConfirm = true;
      await delay(1200);
    }

    const identityState = await executeInTab(tabId, inspectPostingIdentityInPage, [pageName]);
    if (identityState?.hasCommentAsSignal && identityState?.isPageContext) {
      steps.push(`Page context confirmed (${identityState.commentAsLabel || 'comment as page'}).`);
      return true;
    }

    await delay(700);
  }

  steps.push('Timed out while waiting for page context confirmation.');
  return false;
}

function normalizeCaptureResolution(raw) {
  const value = String(raw || '').trim().toLowerCase();
  if (value === 'auto_hq' || value === 'autohq' || value === 'auto') {
    return 'auto_hq';
  }
  if (value === 'hires2x') {
    return 'hires2x';
  }
  if (value === 'hires2_5x' || value === 'hires2.5x') {
    return 'hires2_5x';
  }
  if (value === 'hires3x' || value === 'hires3.0x') {
    return 'hires3x';
  }
  return 'standard';
}

function normalizeExecutionMode(raw) {
  const value = String(raw || '').trim().toLowerCase();
  if (value === 'sequential' || value === 'stable') {
    return 'sequential';
  }
  if (value === 'parallel5' || value === 'turbo') {
    return 'parallel5';
  }
  return 'unknown';
}

function shouldUseForegroundCaptureMode(captureResolution, executionMode, clientDeviceMemoryGb) {
  const memory = Number(clientDeviceMemoryGb);
  const isLowMemory = Number.isFinite(memory) && memory > 0 && memory <= 8;
  return (
    captureResolution === 'auto_hq' &&
    (executionMode === 'sequential' || isLowMemory)
  );
}

async function ensureAutomationTabForeground(windowId, tabId, steps) {
  await chrome.windows
    .update(windowId, {
      state: 'normal',
      focused: true,
      ...AUTOMATION_WINDOW_BOUNDS
    })
    .catch(() => undefined);
  await chrome.tabs.update(tabId, { active: true }).catch(() => undefined);
  await delay(280);
  steps.push('Foreground stability mode: focused automation window and active tab.');
}

async function waitForInsightsRenderReady(tabId, timeoutMs = 20000, options = {}) {
  const start = Date.now();
  let lastStatus = 'waiting';
  const stablePassesRequired = Math.max(1, Number(options.stablePassesRequired || 1));
  let stablePassCount = 0;

  while (Date.now() - start < timeoutMs) {
    const state = await executeInTab(tabId, inspectInsightsRenderStateInPage);
    if (state?.ready) {
      stablePassCount += 1;
      if (stablePassCount >= stablePassesRequired) {
        return {
          ready: true,
          status: state.status || 'ready'
        };
      }
    } else {
      stablePassCount = 0;
    }

    lastStatus = state?.status || lastStatus;
    await delay(700);
  }

  return {
    ready: false,
    status: `${lastStatus} (timeout fallback)`
  };
}

async function captureInsightsSingleShot(
  tabId,
  windowId,
  steps,
  captureResolution,
  captureOptions = {}
) {
  if (captureResolution === 'auto_hq') {
    return await captureInsightsWithAutoQuality(tabId, windowId, steps, captureOptions);
  }

  await chrome.tabs
    .setZoomSettings(tabId, {
      mode: 'automatic',
      scope: 'per-tab'
    })
    .catch(() => undefined);

  const layoutType = await executeInTab(tabId, detectInsightsLayoutTypeInPage);
  const isVideoLayout = layoutType?.type === 'video';
  const zoomCandidates = isVideoLayout
    ? [0.55, 0.5, 0.46, 0.42]
    : [0.6, 0.56, 0.52];

  let selectedZoom = zoomCandidates[0];
  let lastCoverageStatus = 'unknown';
  for (const zoom of zoomCandidates) {
    const appliedZoom = await applyZoomWithVerification(tabId, zoom);
    await delay(600);
    const alignState = await executeInTab(tabId, alignInsightsViewportForSingleShotInPage);
    await delay(500);
    const fitState = await executeInTab(tabId, inspectInsightsViewportCoverageInPage, [isVideoLayout]);
    selectedZoom = appliedZoom;
    lastCoverageStatus = fitState?.status || 'unknown';
    steps.push(
      `Zoom target ${zoom}x / applied ${appliedZoom}x (${isVideoLayout ? 'video' : 'standard'} layout) -> ${
        fitState?.status || 'coverage unknown'
      }`
    );
    if (fitState?.ok) {
      break;
    }

    // If required lower section still not visible, nudge down slightly and stop trying more zooms.
    if (fitState?.needsScroll) {
      const alignRetry = await executeInTab(tabId, alignInsightsViewportForSingleShotInPage);
      steps.push(`Viewport re-align: ${alignRetry?.status || 'unknown'}`);
      break;
    }
  }
  steps.push(
    `Applied adaptive zoom ${selectedZoom}x (${isVideoLayout ? 'video' : 'standard'} layout, ${lastCoverageStatus}).`
  );

  const captureViewportState = await executeInTab(tabId, prepareInsightsCaptureViewportInPage);
  const clipWidthOverride =
    Number.isFinite(Number(captureViewportState?.recommendedClipWidth))
      ? Number(captureViewportState.recommendedClipWidth)
      : null;
  const clipHeightOverride =
    Number.isFinite(Number(captureViewportState?.recommendedClipHeight))
      ? Number(captureViewportState.recommendedClipHeight)
      : null;
  if (clipWidthOverride) {
    steps.push(`Using content-aware capture width: ${Math.round(clipWidthOverride)}px.`);
  }
  if (clipHeightOverride) {
    steps.push(`Using content-aware capture height: ${Math.round(clipHeightOverride)}px.`);
  }

  let dataUrl;
  try {
    if (captureResolution === 'standard') {
      dataUrl = await captureHiResWithDebugger(tabId, windowId, 1, steps, {
        width: clipWidthOverride,
        height: clipHeightOverride
      });
      steps.push('Captured in standard resolution using debugger capture (scale 1x).');
    } else {
      const scale =
        captureResolution === 'hires3x'
          ? 3
          : captureResolution === 'hires2_5x'
            ? 2.5
            : 2;
      dataUrl = await captureHiResWithDebugger(tabId, windowId, scale, steps, {
        width: clipWidthOverride,
        height: clipHeightOverride
      });
    }
    const trimmedDataUrl = await trimDataUrlRightBottomBackground(dataUrl);
    if (trimmedDataUrl !== dataUrl) {
      dataUrl = trimmedDataUrl;
      steps.push('Trimmed right/bottom background area from captured image.');
    }
  } finally {
    await executeInTab(tabId, cleanupInsightsCaptureViewportInPage).catch(() => undefined);
  }

  await applyZoomWithVerification(tabId, 1).catch(() => undefined);
  await delay(200);

  const dimensions = await measureDataUrlDimensions(dataUrl);
  steps.push(`Output image size: ${dimensions.width} x ${dimensions.height}`);

  steps.push('Saved single-shot insights screenshot (no image stitching).');
  return dataUrl;
}

function resolveAutoQualityPlan(clientDeviceMemoryGb) {
  const memory = Number(clientDeviceMemoryGb);
  const isLowMemory = Number.isFinite(memory) && memory > 0 && memory <= 8;
  if (isLowMemory) {
    return [
      { resolution: 'hires2_5x', tries: 2, settleDelayMs: 950 },
      { resolution: 'hires2x', tries: 2, settleDelayMs: 950 }
    ];
  }
  return [
    { resolution: 'hires3x', tries: 2, settleDelayMs: 1050 },
    { resolution: 'hires2_5x', tries: 2, settleDelayMs: 900 },
    { resolution: 'hires2x', tries: 1, settleDelayMs: 800 }
  ];
}

function scoreCaptureQuality(metrics) {
  // Lower bright ratio and higher variance generally indicate a cleaner dark-mode insights render.
  return metrics.varianceLuma - metrics.brightRatio * 700;
}

function isCaptureQualityAcceptable(metrics) {
  if (!Number.isFinite(metrics.brightRatio) || !Number.isFinite(metrics.varianceLuma)) {
    return false;
  }
  if (metrics.brightRatio >= 0.34) {
    return false;
  }
  if (metrics.varianceLuma <= 80) {
    return false;
  }
  return true;
}

async function analyzeCaptureQuality(dataUrl) {
  const blob = await fetch(dataUrl).then((response) => response.blob());
  const bitmap = await createImageBitmap(blob);
  const width = Math.max(1, bitmap.width);
  const height = Math.max(1, bitmap.height);
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    return {
      width,
      height,
      brightRatio: 1,
      varianceLuma: 0
    };
  }

  context.drawImage(bitmap, 0, 0);
  const imageData = context.getImageData(0, 0, width, height);
  const pixels = imageData.data;
  let sampleCount = 0;
  let brightCount = 0;
  let lumaSum = 0;
  let lumaSquaredSum = 0;
  const step = 3;

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const offset = (y * width + x) * 4;
      const r = pixels[offset];
      const g = pixels[offset + 1];
      const b = pixels[offset + 2];
      const a = pixels[offset + 3];
      if (a < 20) {
        continue;
      }
      sampleCount += 1;
      if (r > 232 && g > 232 && b > 232) {
        brightCount += 1;
      }
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      lumaSum += luma;
      lumaSquaredSum += luma * luma;
    }
  }

  if (sampleCount === 0) {
    return {
      width,
      height,
      brightRatio: 1,
      varianceLuma: 0
    };
  }

  const meanLuma = lumaSum / sampleCount;
  const varianceLuma = Math.max(0, lumaSquaredSum / sampleCount - meanLuma * meanLuma);
  const brightRatio = brightCount / sampleCount;
  return {
    width,
    height,
    brightRatio,
    varianceLuma
  };
}

async function captureInsightsWithAutoQuality(tabId, windowId, steps, captureOptions = {}) {
  const qualityPlan = resolveAutoQualityPlan(captureOptions.clientDeviceMemoryGb);
  steps.push(
    `Auto HQ enabled (${Number.isFinite(Number(captureOptions.clientDeviceMemoryGb)) ? `device memory ${captureOptions.clientDeviceMemoryGb} GB` : 'device memory unknown'}).`
  );

  let bestCandidate = null;
  for (const entry of qualityPlan) {
    for (let attempt = 1; attempt <= entry.tries; attempt += 1) {
      await delay(entry.settleDelayMs);
      const renderCheck = await waitForInsightsRenderReady(tabId, 9000);
      steps.push(
        `Auto HQ pre-check ${entry.resolution} attempt ${attempt}/${entry.tries}: ${renderCheck.status}`
      );

      let dataUrl;
      let metrics;
      try {
        dataUrl = await captureInsightsSingleShot(
          tabId,
          windowId,
          steps,
          entry.resolution,
          captureOptions
        );
        metrics = await analyzeCaptureQuality(dataUrl);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown capture error';
        steps.push(`Auto HQ ${entry.resolution} attempt ${attempt} failed: ${message}`);
        continue;
      }

      const score = scoreCaptureQuality(metrics);
      const acceptable = isCaptureQualityAcceptable(metrics);
      steps.push(
        `Auto HQ evaluate ${entry.resolution} attempt ${attempt}: bright=${(
          metrics.brightRatio * 100
        ).toFixed(1)}%, variance=${Math.round(metrics.varianceLuma)}, score=${Math.round(score)}${
          acceptable ? ' (accepted)' : ''
        }`
      );

      if (!bestCandidate || score > bestCandidate.score) {
        bestCandidate = {
          dataUrl,
          score,
          resolution: entry.resolution,
          metrics
        };
      }

      if (acceptable) {
        steps.push(`Auto HQ selected ${entry.resolution} (attempt ${attempt}).`);
        return dataUrl;
      }
    }
  }

  if (bestCandidate) {
    steps.push(
      `Auto HQ fallback selected ${bestCandidate.resolution} (best score ${Math.round(bestCandidate.score)}).`
    );
    return bestCandidate.dataUrl;
  }

  throw new Error('Auto HQ could not produce a valid screenshot.');
}

async function applyZoomWithVerification(tabId, targetZoom, maxAttempts = 3) {
  let lastMeasured = 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await chrome.tabs.setZoom(tabId, targetZoom).catch(() => undefined);
    await delay(120);
    const measured = await chrome.tabs.getZoom(tabId).catch(() => null);
    if (typeof measured === 'number' && Number.isFinite(measured)) {
      lastMeasured = measured;
      if (Math.abs(measured - targetZoom) <= 0.01) {
        return measured;
      }
    }
    await delay(120 * attempt);
  }
  return lastMeasured;
}

function detectInsightsLayoutTypeInPage() {
  const text = (document.body?.innerText || '').toLowerCase();
  const videoSignals = [
    'audience retention',
    'average watch time',
    '3-second views',
    '1-minute views',
    'watch time',
    'player 10-second view rate'
  ];
  const matchedSignals = videoSignals.filter((signal) => text.includes(signal));
  if (matchedSignals.length > 0) {
    return {
      type: 'video',
      matchedSignals
    };
  }
  return {
    type: 'standard',
    matchedSignals: []
  };
}

function inspectInsightsViewportCoverageInPage(isVideoLayout) {
  const findByText = (text) => {
    const normalized = String(text || '').toLowerCase();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    let node = walker.nextNode();
    while (node) {
      const content = (node.textContent || '').toLowerCase();
      if (content.includes(normalized)) {
        return node;
      }
      node = walker.nextNode();
    }
    return null;
  };

  const topAnchor = findByText('views over time');
  const bottomAnchor =
    findByText('who viewed your content') ||
    findByText('age and gender') ||
    findByText('top countries');

  if (!topAnchor || !bottomAnchor) {
    return {
      ok: false,
      status: 'anchor-not-found',
      needsScroll: false
    };
  }

  const topRect = topAnchor.getBoundingClientRect();
  const bottomRect = bottomAnchor.getBoundingClientRect();
  const viewportHeight = window.innerHeight || 0;
  const marginTop = 100;
  const marginBottom = isVideoLayout ? 170 : 140;

  const topVisible = topRect.top >= -20 && topRect.top <= marginTop;
  const bottomVisible = bottomRect.top >= marginTop && bottomRect.top <= viewportHeight - marginBottom;

  if (topVisible && bottomVisible) {
    return {
      ok: true,
      status: 'full-coverage-ok',
      needsScroll: false
    };
  }

  if (!bottomVisible && bottomRect.top > viewportHeight - marginBottom) {
    return {
      ok: false,
      status: 'bottom-section-below-viewport',
      needsScroll: true
    };
  }

  return {
    ok: false,
    status: 'partial-coverage',
    needsScroll: false
  };
}

function prepareInsightsCaptureViewportInPage() {
  const STYLE_ID = 'bizgital-insight-capture-hide-scrollbar-style';
  let styleElement = document.getElementById(STYLE_ID);
  if (!styleElement) {
    styleElement = document.createElement('style');
    styleElement.id = STYLE_ID;
    styleElement.textContent = `
      html, body {
        overflow: hidden !important;
      }
      *::-webkit-scrollbar {
        width: 0 !important;
        height: 0 !important;
        background: transparent !important;
      }
    `;
    document.head.appendChild(styleElement);
  }

  const findByText = (text) => {
    const normalized = String(text || '').toLowerCase();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    let node = walker.nextNode();
    while (node) {
      const content = (node.textContent || '').toLowerCase();
      if (content.includes(normalized)) {
        return node;
      }
      node = walker.nextNode();
    }
    return null;
  };

  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;

  const pickBestAncestorRect = (seedNode, validator, maxDepth = 10) => {
    if (!seedNode || !(seedNode instanceof Element)) {
      return null;
    }

    let current = seedNode;
    let bestRect = null;
    let bestArea = 0;
    for (let depth = 0; depth < maxDepth; depth += 1) {
      const rect = current.getBoundingClientRect();
      if (validator(rect)) {
        const area = rect.width * rect.height;
        if (area > bestArea) {
          bestArea = area;
          bestRect = rect;
        }
      }

      if (!current.parentElement) {
        break;
      }
      current = current.parentElement;
    }

    return bestRect;
  };

  const insightsSeeds = [
    findByText('net follows'),
    findByText('interactions'),
    findByText('who viewed your content'),
    findByText('audience retention'),
    findByText('link clicks')
  ].filter(Boolean);

  const insightsRects = [];
  for (const seed of insightsSeeds) {
    const rect = pickBestAncestorRect(
      seed,
      (candidate) =>
        candidate.left > 120 &&
        candidate.top >= 36 &&
        candidate.width >= 420 &&
        candidate.height >= 220 &&
        candidate.right <= viewportWidth - 20 &&
        candidate.bottom <= viewportHeight - 20
    );
    if (rect) {
      insightsRects.push(rect);
    }
  }

  const leftRailSeed = findByText('post insights') || findByText('your profile');
  const leftRailRect = pickBestAncestorRect(
    leftRailSeed,
    (candidate) =>
      candidate.left >= -8 &&
      candidate.left <= 30 &&
      candidate.width >= 220 &&
      candidate.width <= 420 &&
      candidate.height >= 320 &&
      candidate.bottom <= viewportHeight
  );

  const rightCandidates = insightsRects.map((rect) => rect.right);
  if (leftRailRect) {
    rightCandidates.push(leftRailRect.right);
  }
  const bottomCandidates = insightsRects.map((rect) => rect.bottom);
  if (leftRailRect) {
    bottomCandidates.push(leftRailRect.bottom);
  }

  const fallbackWidth = Math.max(1, Math.floor(viewportWidth - 10));
  const rawRight = rightCandidates.length > 0 ? Math.max(...rightCandidates) : fallbackWidth;
  const recommendedClipWidth = Math.max(1, Math.min(fallbackWidth, Math.ceil(rawRight + 10)));
  const fallbackHeight = Math.max(1, Math.floor(viewportHeight - 10));
  const rawBottom = bottomCandidates.length > 0 ? Math.max(...bottomCandidates) : fallbackHeight;
  const recommendedClipHeight = Math.max(1, Math.min(fallbackHeight, Math.ceil(rawBottom + 14)));

  return {
    viewportWidth,
    viewportHeight,
    recommendedClipWidth,
    recommendedClipHeight
  };
}

function cleanupInsightsCaptureViewportInPage() {
  const STYLE_ID = 'bizgital-insight-capture-hide-scrollbar-style';
  const styleElement = document.getElementById(STYLE_ID);
  if (styleElement) {
    styleElement.remove();
  }
  return { cleaned: true };
}

async function captureHiResWithDebugger(
  tabId,
  windowId,
  scale,
  steps,
  clipOverrides = { width: null, height: null }
) {
  const target = { tabId };
  let attached = false;

  try {
    await chrome.debugger.attach(target, '1.3');
    attached = true;
    const layoutMetrics = await chrome.debugger.sendCommand(target, 'Page.getLayoutMetrics');
    const visualViewport = layoutMetrics?.visualViewport;
    const visualViewportWidth = Math.max(1, Math.floor(Number(visualViewport?.clientWidth) || 1920));
    const visualViewportHeight = Math.max(1, Math.floor(Number(visualViewport?.clientHeight) || 1080));
    const clipWidth = Math.max(
      1,
      Math.min(
        visualViewportWidth,
        Math.floor(
          Number.isFinite(Number(clipOverrides?.width))
            ? Number(clipOverrides.width)
            : visualViewportWidth
        )
      )
    );
    const clipHeight = Math.max(
      1,
      Math.min(
        visualViewportHeight,
        Math.floor(
          Number.isFinite(Number(clipOverrides?.height))
            ? Number(clipOverrides.height)
            : visualViewportHeight
        )
      )
    );
    const clipX = Number(visualViewport?.pageX) || 0;
    const clipY = Number(visualViewport?.pageY) || 0;

    const screenshot = await chrome.debugger.sendCommand(target, 'Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
      optimizeForSpeed: false,
      clip: {
        x: clipX,
        y: clipY,
        width: clipWidth,
        height: clipHeight,
        scale
      }
    });
    steps.push(`Captured in hi-res mode (${scale}x clip scale).`);
    return `data:image/png;base64,${screenshot.data}`;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'unknown debugger capture error';
    steps.push(`Hi-res capture failed (${message}).`);
    throw new Error(`Debugger capture failed: ${message}`);
  } finally {
    if (attached) {
      await chrome.debugger.detach(target).catch(() => undefined);
    }
  }
}

async function cropDataUrlToBox(dataUrl, bounds = { width: null, height: null }) {
  const dimensions = await measureDataUrlDimensions(dataUrl);
  const sourceWidth = Math.max(1, dimensions.width);
  const sourceHeight = Math.max(1, dimensions.height);
  const desiredWidth = Math.max(
    1,
    Math.min(sourceWidth, Math.floor(Number(bounds?.width) || sourceWidth))
  );
  const desiredHeight = Math.max(
    1,
    Math.min(sourceHeight, Math.floor(Number(bounds?.height) || sourceHeight))
  );

  if (desiredWidth >= sourceWidth && desiredHeight >= sourceHeight) {
    return dataUrl;
  }

  const blob = await fetch(dataUrl).then((response) => response.blob());
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(desiredWidth, desiredHeight);
  const context = canvas.getContext('2d');
  if (!context) {
    return dataUrl;
  }
  context.drawImage(bitmap, 0, 0, desiredWidth, desiredHeight, 0, 0, desiredWidth, desiredHeight);
  const croppedBlob = await canvas.convertToBlob({ type: 'image/png' });
  const buffer = await croppedBlob.arrayBuffer();
  return `data:image/png;base64,${arrayBufferToBase64(buffer)}`;
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function trimDataUrlRightBottomBackground(dataUrl) {
  const blob = await fetch(dataUrl).then((response) => response.blob());
  const bitmap = await createImageBitmap(blob);
  const sourceWidth = Math.max(1, bitmap.width);
  const sourceHeight = Math.max(1, bitmap.height);

  const canvas = new OffscreenCanvas(sourceWidth, sourceHeight);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    return dataUrl;
  }

  context.drawImage(bitmap, 0, 0);
  const imageData = context.getImageData(0, 0, sourceWidth, sourceHeight);
  const pixels = imageData.data;

  const sampleX = Math.max(0, sourceWidth - 2);
  const sampleY = Math.max(0, sourceHeight - 2);
  const sampleOffset = (sampleY * sourceWidth + sampleX) * 4;
  const bgR = pixels[sampleOffset];
  const bgG = pixels[sampleOffset + 1];
  const bgB = pixels[sampleOffset + 2];
  const bgA = pixels[sampleOffset + 3];

  const isBg = (r, g, b, a) =>
    Math.abs(r - bgR) <= 10 &&
    Math.abs(g - bgG) <= 10 &&
    Math.abs(b - bgB) <= 10 &&
    Math.abs(a - bgA) <= 10;

  const minNonBgPixelsPerColumn = Math.max(3, Math.floor(sourceHeight * 0.004));
  const minNonBgPixelsPerRow = Math.max(3, Math.floor(sourceWidth * 0.004));

  let rightEdge = sourceWidth - 1;
  for (let x = sourceWidth - 1; x >= 0; x -= 1) {
    let nonBgCount = 0;
    for (let y = 0; y < sourceHeight; y += 2) {
      const offset = (y * sourceWidth + x) * 4;
      const r = pixels[offset];
      const g = pixels[offset + 1];
      const b = pixels[offset + 2];
      const a = pixels[offset + 3];
      if (!isBg(r, g, b, a)) {
        nonBgCount += 1;
        if (nonBgCount >= minNonBgPixelsPerColumn) {
          break;
        }
      }
    }
    if (nonBgCount >= minNonBgPixelsPerColumn) {
      rightEdge = x;
      break;
    }
  }

  let bottomEdge = sourceHeight - 1;
  for (let y = sourceHeight - 1; y >= 0; y -= 1) {
    let nonBgCount = 0;
    for (let x = 0; x < sourceWidth; x += 2) {
      const offset = (y * sourceWidth + x) * 4;
      const r = pixels[offset];
      const g = pixels[offset + 1];
      const b = pixels[offset + 2];
      const a = pixels[offset + 3];
      if (!isBg(r, g, b, a)) {
        nonBgCount += 1;
        if (nonBgCount >= minNonBgPixelsPerRow) {
          break;
        }
      }
    }
    if (nonBgCount >= minNonBgPixelsPerRow) {
      bottomEdge = y;
      break;
    }
  }

  const margin = 6;
  const trimmedWidth = Math.max(1, Math.min(sourceWidth, rightEdge + 1 + margin));
  const trimmedHeight = Math.max(1, Math.min(sourceHeight, bottomEdge + 1 + margin));

  if (trimmedWidth >= sourceWidth && trimmedHeight >= sourceHeight) {
    return dataUrl;
  }

  const trimmedCanvas = new OffscreenCanvas(trimmedWidth, trimmedHeight);
  const trimmedContext = trimmedCanvas.getContext('2d');
  if (!trimmedContext) {
    return dataUrl;
  }
  trimmedContext.drawImage(bitmap, 0, 0, trimmedWidth, trimmedHeight, 0, 0, trimmedWidth, trimmedHeight);
  const trimmedBlob = await trimmedCanvas.convertToBlob({ type: 'image/png' });
  const trimmedBuffer = await trimmedBlob.arrayBuffer();
  return `data:image/png;base64,${arrayBufferToBase64(trimmedBuffer)}`;
}

async function measureDataUrlDimensions(dataUrl) {
  const blob = await fetch(dataUrl).then((response) => response.blob());
  const bitmap = await createImageBitmap(blob);
  return {
    width: bitmap.width,
    height: bitmap.height
  };
}

function normalizeFacebookPostUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) {
    throw new Error('Post URL is required.');
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Post URL is invalid.');
  }

  if (!/(^|\.)facebook\.com$/i.test(parsed.hostname)) {
    throw new Error('Post URL must point to facebook.com.');
  }

  return parsed.toString();
}

function extractPostToken(postUrl) {
  const parsed = new URL(postUrl);
  const storyFbid = parsed.searchParams.get('story_fbid');
  if (storyFbid && storyFbid.trim().length > 0) {
    return storyFbid.trim().toLowerCase();
  }

  const parts = parsed.pathname.split('/').filter(Boolean);
  const postsIndex = parts.findIndex((part) => part.toLowerCase() === 'posts');
  if (postsIndex >= 0 && parts[postsIndex + 1]) {
    return parts[postsIndex + 1].toLowerCase();
  }

  const permalinkPhp = parts.findIndex((part) => part.toLowerCase() === 'permalink.php');
  if (permalinkPhp >= 0) {
    const fallback = parsed.searchParams.get('fbid') || parsed.searchParams.get('id');
    if (fallback) {
      return fallback.trim().toLowerCase();
    }
  }

  return '';
}

function normalizePageId(raw) {
  const normalized = String(raw || '').replace(/[^0-9]/g, '');
  return normalized.length >= 5 ? normalized : '';
}

function normalizePageName(raw) {
  return String(raw || '').trim();
}

function buildDownloadFilename(pageName) {
  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const slug = String(pageName || 'post')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '') || 'post';

  return `insight-captures/${stamp}-${slug}.png`;
}

function extractBaseFilename(pathValue) {
  const normalized = String(pathValue || '').replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

function normalizeDownloadedPathForUi(actualPath, fallbackRelativePath) {
  const actual = String(actualPath || '').trim();
  if (!actual) {
    return fallbackRelativePath;
  }

  if (/^[a-z]:\\/i.test(actual) || actual.startsWith('/') || actual.startsWith('\\\\')) {
    const base = extractBaseFilename(actual);
    if (base) {
      return base;
    }
    return fallbackRelativePath;
  }

  return actual;
}

async function waitForDownloadSavedFilename(downloadId, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const items = await chrome.downloads.search({ id: downloadId }).catch(() => []);
    const item = items?.[0];
    if (item?.filename) {
      return item.filename;
    }
    await delay(200);
  }
  return '';
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForTabComplete(tabId, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (tab && tab.status === 'complete') {
      return;
    }
    await delay(200);
  }
}

async function executeInTab(tabId, func, args = []) {
  const injected = await chrome.scripting.executeScript({
    target: { tabId },
    func,
    args
  });
  return injected?.[0]?.result;
}

function detectFacebookAccessStateInPage() {
  const text = (document.body?.innerText || '').toLowerCase();
  const loginRequired =
    /log in|login|email or phone|password/.test(text) &&
    !/log out|sign out/.test(text);
  const checkpointRequired =
    /try another device to continue|can't try another device|we can't match the device|auth_platform|lrr_limbo/.test(
      text + ' ' + window.location.href.toLowerCase()
    );

  return {
    loginRequired,
    checkpointRequired
  };
}

function clickSwitchActionInPage(pageId, pageName) {
  const matchers = [
    'switch now',
    'switch to page',
    'switch into',
    'switch',
    'use facebook as',
    'see all profiles'
  ];
  const normalizedPageId = String(pageId || '').trim();
  const normalizedPageName = String(pageName || '').trim().toLowerCase();
  const nodes = Array.from(
    document.querySelectorAll('button, a, div[role="button"], span[role="button"]')
  );

  const getNodeText = (node) =>
    [
      node.textContent || '',
      node.getAttribute?.('aria-label') || '',
      node.getAttribute?.('title') || ''
    ]
      .join(' ')
      .trim()
      .toLowerCase();

  if (normalizedPageId) {
    const idAnchors = Array.from(document.querySelectorAll('a[href]')).filter((anchor) =>
      String(anchor.getAttribute('href') || '').includes(normalizedPageId)
    );
    if (idAnchors.length > 0) {
      for (const anchor of idAnchors) {
        const container = anchor.closest('[role="dialog"], article, [data-pagelet], div');
        if (!container) {
          continue;
        }
        const localNodes = Array.from(
          container.querySelectorAll('button, a, div[role="button"], span[role="button"]')
        );
        for (const localNode of localNodes) {
          const text = getNodeText(localNode);
          if (matchers.some((pattern) => text.includes(pattern))) {
            localNode.scrollIntoView({ block: 'center', behavior: 'instant' });
            if (localNode instanceof HTMLAnchorElement) {
              localNode.target = '_self';
              localNode.rel = '';
            }
            localNode.click();
            return { clicked: true };
          }
        }
      }
    }
  }

  if (normalizedPageName) {
    for (const node of nodes) {
      const text = getNodeText(node);
      if (!text.includes(normalizedPageName)) {
        continue;
      }
      const container = node.closest('[role="dialog"], article, [data-pagelet], div');
      if (!container) {
        continue;
      }
      const localNodes = Array.from(
        container.querySelectorAll('button, a, div[role="button"], span[role="button"]')
      );
      for (const localNode of localNodes) {
        const localText = getNodeText(localNode);
        if (matchers.some((pattern) => localText.includes(pattern))) {
          localNode.scrollIntoView({ block: 'center', behavior: 'instant' });
          if (localNode instanceof HTMLAnchorElement) {
            localNode.target = '_self';
            localNode.rel = '';
          }
          localNode.click();
          return { clicked: true };
        }
      }
    }
  }

  for (const node of nodes) {
    const text = getNodeText(node);
    if (!text) {
      continue;
    }
    const matched = matchers.some((pattern) => text.includes(pattern));
    if (!matched) {
      continue;
    }
    node.scrollIntoView({ block: 'center', behavior: 'instant' });
    if (node instanceof HTMLAnchorElement) {
      node.target = '_self';
      node.rel = '';
    }
    node.click();
    return { clicked: true };
  }

  return { clicked: false };
}

function clickSwitchConfirmationInPage(pageName) {
  const normalizedPageName = String(pageName || '').trim().toLowerCase();
  const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));

  const getText = (node) =>
    [
      node.textContent || '',
      node.getAttribute?.('aria-label') || '',
      node.getAttribute?.('title') || ''
    ]
      .join(' ')
      .trim()
      .toLowerCase();

  for (const dialog of dialogs) {
    const dialogText = getText(dialog);
    const looksLikeSwitchDialog =
      dialogText.includes('switch profiles') ||
      dialogText.includes('switch to') ||
      dialogText.includes('switch into');
    if (!looksLikeSwitchDialog) {
      continue;
    }

    if (normalizedPageName && !dialogText.includes(normalizedPageName)) {
      continue;
    }

    const candidates = Array.from(
      dialog.querySelectorAll('button, [role="button"], a, span[role="button"], div[role="button"]')
    );
    for (const node of candidates) {
      const nodeText = getText(node);
      const isSwitchCta =
        nodeText === 'switch' ||
        nodeText.startsWith('switch ') ||
        nodeText.includes(' switch ');
      if (!isSwitchCta) {
        continue;
      }
      node.scrollIntoView({ block: 'center', behavior: 'instant' });
      if (node instanceof HTMLAnchorElement) {
        node.target = '_self';
        node.rel = '';
      }
      node.click();
      return { clicked: true, detail: nodeText || 'switch' };
    }
  }

  return { clicked: false };
}

function inspectInsightsRenderStateInPage() {
  const bodyText = (document.body?.innerText || '').toLowerCase();
  const hasInsightFrame =
    bodyText.includes('post insights') &&
    (bodyText.includes('views over time') || bodyText.includes('engagement'));
  const hasLeftPreviewData =
    bodyText.includes('published by') || bodyText.includes('comment as');

  const skeletonSelectors = [
    '[aria-busy="true"]',
    '[class*="skeleton" i]',
    '[class*="placeholder" i]',
    '[class*="shimmer" i]'
  ];
  let visibleSkeletonCount = 0;
  for (const selector of skeletonSelectors) {
    const nodes = Array.from(document.querySelectorAll(selector));
    for (const node of nodes) {
      const element = node;
      const rect = element.getBoundingClientRect?.();
      if (!rect) {
        continue;
      }
      if (rect.width > 20 && rect.height > 8) {
        visibleSkeletonCount += 1;
      }
    }
  }

  const ready = hasInsightFrame && hasLeftPreviewData && visibleSkeletonCount < 4;
  const status = ready
    ? 'ready'
    : `waiting (insights=${hasInsightFrame}, leftPreview=${hasLeftPreviewData}, skeleton=${visibleSkeletonCount})`;

  return {
    ready,
    status
  };
}

function inspectPostingIdentityInPage(pageName) {
  const normalizedPageName = String(pageName || '').trim().toLowerCase();
  const text = (document.body?.innerText || '').toLowerCase();

  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const commentAsLine =
    lines.find((line) => line.startsWith('comment as ')) ||
    lines.find((line) => line.includes("you're commenting as"));

  const hasCommentAsSignal = Boolean(commentAsLine);

  if (!hasCommentAsSignal) {
    return {
      hasCommentAsSignal: false,
      isPageContext: false,
      commentAsLabel: ''
    };
  }

  const normalizedCommentAs = String(commentAsLine || '').toLowerCase();
  let isPageContext = false;

  if (normalizedPageName) {
    isPageContext = normalizedCommentAs.includes(normalizedPageName);
  } else {
    // Heuristic fallback when pageName is not supplied.
    isPageContext =
      normalizedCommentAs.includes('page') ||
      normalizedCommentAs.includes('(la)') ||
      normalizedCommentAs.includes('official');
  }

  return {
    hasCommentAsSignal: true,
    isPageContext,
    commentAsLabel: commentAsLine || ''
  };
}

function alignInsightsViewportForSingleShotInPage() {
  window.scrollTo({ top: 0, behavior: 'instant' });

  const findByText = (text) => {
    const normalized = text.toLowerCase();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    let node = walker.nextNode();
    while (node) {
      const content = (node.textContent || '').toLowerCase();
      if (content.includes(normalized)) {
        return node;
      }
      node = walker.nextNode();
    }
    return null;
  };

  const insightsHeader = findByText('post insights');
  if (insightsHeader) {
    insightsHeader.scrollIntoView({ block: 'start', behavior: 'instant' });
    window.scrollBy({ top: -40, behavior: 'instant' });
  } else {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  const whoViewedTitle =
    findByText('who viewed your content') ||
    findByText('age and gender') ||
    findByText('top countries');
  if (whoViewedTitle) {
    const rect = whoViewedTitle.getBoundingClientRect();
    if (rect.top > window.innerHeight - 220) {
      const delta = rect.top - (window.innerHeight - 320);
      window.scrollBy({ top: delta, behavior: 'instant' });
      return { status: 'adjusted-down-to-include-who-viewed' };
    }
    return { status: 'who-viewed-already-visible' };
  }

  return { status: 'aligned-to-top-insights' };
}


function clickInsightsActionInPage(postToken) {
  const matchers = ['see insights and ads', 'see insights', 'view insights', 'insights'];
  const selectCandidates = () =>
    Array.from(
      document.querySelectorAll(
        'button, a, [role="button"], span[role="button"], div[role="button"], a[href*="insight" i]'
      )
    );

  const normalizedToken = String(postToken || '').trim().toLowerCase();

  const findTargetContainers = () => {
    if (!normalizedToken) {
      return [];
    }

    const anchors = Array.from(document.querySelectorAll('a[href]'));
    const matchedAnchors = anchors.filter((anchor) => {
      const href = String(anchor.getAttribute('href') || '').toLowerCase();
      return href.includes(normalizedToken);
    });

    const containers = new Set();
    for (const anchor of matchedAnchors) {
      const container =
        anchor.closest('[role="dialog"]') ||
        anchor.closest('article') ||
        anchor.closest('[data-pagelet]') ||
        anchor.closest('div');
      if (container) {
        containers.add(container);
      }
    }
    return Array.from(containers);
  };

  const findLikelyPostDialogs = () => {
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
    const scored = dialogs
      .map((dialog) => {
        const text = (dialog.textContent || '').toLowerCase();
        let score = 0;
        if (text.includes("'s post")) {
          score += 4;
        }
        if (text.includes('comment as')) {
          score += 2;
        }
        if (text.includes('see more')) {
          score += 1;
        }
        const rect = dialog.getBoundingClientRect();
        if (rect.height > 400 && rect.width > 500) {
          score += 2;
        }
        return { dialog, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);

    return scored.map((entry) => entry.dialog);
  };

  const scrollDialogDown = (dialog) => {
    const scrollCandidates = [
      dialog,
      ...Array.from(dialog.querySelectorAll('div, section'))
    ].filter((element) => element instanceof HTMLElement);

    let moved = false;
    for (const element of scrollCandidates) {
      const node = element;
      if (node.scrollHeight > node.clientHeight + 80) {
        const before = node.scrollTop;
        node.scrollTop = Math.min(node.scrollTop + 900, node.scrollHeight);
        if (node.scrollTop !== before) {
          moved = true;
        }
      }
    }
    return moved;
  };

  const scrollDialogToBottom = (dialog) => {
    const scrollCandidates = [
      dialog,
      ...Array.from(dialog.querySelectorAll('div, section'))
    ].filter((element) => element instanceof HTMLElement);
    let moved = false;
    for (const element of scrollCandidates) {
      const node = element;
      if (node.scrollHeight > node.clientHeight + 80) {
        const before = node.scrollTop;
        node.scrollTop = node.scrollHeight;
        if (node.scrollTop !== before) {
          moved = true;
        }
      }
    }
    return moved;
  };

  let didJumpToBottom = false;

  const clickFromNodes = (nodes, matchedTarget) => {
    for (const node of nodes) {
      const text = (
        [
          node.textContent || '',
          node.getAttribute?.('aria-label') || '',
          node.getAttribute?.('title') || ''
        ]
          .join(' ')
          .trim()
          .toLowerCase()
      );
      if (!text) {
        continue;
      }
      const matched = matchers.some((pattern) => text.includes(pattern));
      if (!matched) {
        continue;
      }
      node.scrollIntoView({ block: 'center', behavior: 'instant' });
      if (node instanceof HTMLElement) {
        node.focus?.();
      }
      if (node instanceof HTMLAnchorElement) {
        node.target = '_self';
        node.rel = '';
      }
      node.click();
      return { clicked: true, matchedTarget };
    }
    return { clicked: false, matchedTarget };
  };

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const likelyDialogs = findLikelyPostDialogs();
    for (const dialog of likelyDialogs) {
      const dialogNodes = Array.from(
        dialog.querySelectorAll(
          'button, a, [role="button"], span[role="button"], div[role="button"], a[href*="insight" i]'
        )
      );
      const dialogResult = clickFromNodes(dialogNodes, true);
      if (dialogResult.clicked) {
        return { ...dialogResult, attempt, detail: 'clicked from likely post dialog' };
      }
    }

    const targetContainers = findTargetContainers();
    if (normalizedToken && targetContainers.length === 0) {
      if (!didJumpToBottom) {
        let jumped = false;
        for (const dialog of likelyDialogs) {
          jumped = scrollDialogToBottom(dialog) || jumped;
        }
        if (!jumped) {
          window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' });
        }
        didJumpToBottom = true;
        continue;
      }

      let dialogScrolled = false;
      for (const dialog of likelyDialogs) {
        dialogScrolled = scrollDialogDown(dialog) || dialogScrolled;
      }
      if (!dialogScrolled) {
        window.scrollBy({ top: 900, behavior: 'instant' });
      }
      continue;
    }
    for (const container of targetContainers) {
      const localNodes = Array.from(
        container.querySelectorAll('button, a, div[role="button"], span[role="button"]')
      );
      const localResult = clickFromNodes(localNodes, true);
      if (localResult.clicked) {
        return { ...localResult, attempt, detail: 'clicked from token-matched container' };
      }
    }

    if (normalizedToken) {
      let dialogScrolled = false;
      for (const dialog of likelyDialogs) {
        dialogScrolled = scrollDialogDown(dialog) || dialogScrolled;
      }
      if (!dialogScrolled) {
        window.scrollBy({ top: 900, behavior: 'instant' });
      }
      continue;
    }

    const nodes = selectCandidates();
    const globalResult = clickFromNodes(nodes, false);
    if (globalResult.clicked) {
      return { ...globalResult, attempt, detail: 'clicked from global fallback' };
    }

    let dialogScrolled = false;
    for (const dialog of likelyDialogs) {
      dialogScrolled = scrollDialogDown(dialog) || dialogScrolled;
    }
    if (!dialogScrolled) {
      window.scrollBy({ top: 900, behavior: 'instant' });
    }
  }

  return { clicked: false, detail: 'no insights node found after modal/global scroll attempts' };
}

function isTargetPostContextInPage(postToken) {
  const normalizedToken = String(postToken || '').trim().toLowerCase();
  if (!normalizedToken) {
    return { matched: true };
  }

  const currentUrl = window.location.href.toLowerCase();
  if (currentUrl.includes(normalizedToken)) {
    return { matched: true };
  }

  const anchors = Array.from(document.querySelectorAll('a[href]'));
  for (const anchor of anchors) {
    const href = String(anchor.getAttribute('href') || '').toLowerCase();
    if (href.includes(normalizedToken)) {
      return { matched: true };
    }
  }

  return { matched: false };
}
