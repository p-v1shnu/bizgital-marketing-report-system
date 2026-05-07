const UI_SOURCE = 'bizgital-insight-ui';
const LOCAL_APP_ORIGIN_FALLBACK = 'http://localhost:3200';
const FAST_POLL_MS = 2000;
const SLOW_POLL_MS = 8000;
const RECENT_EVENT_WINDOW_MS = 10_000;

const bridgeStatusEl = document.getElementById('bridgeStatus');
const versionEl = document.getElementById('version');
const activeWorkersEl = document.getElementById('activeWorkers');
const lastEventEl = document.getElementById('lastEvent');
const completedCountEl = document.getElementById('completedCount');
const successCountEl = document.getElementById('successCount');
const failedCountEl = document.getElementById('failedCount');
const progressTextEl = document.getElementById('progressText');
const logsEl = document.getElementById('logs');

const refreshBtn = document.getElementById('refreshBtn');
const clearBtn = document.getElementById('clearBtn');
const openWorkspaceBtn = document.getElementById('openWorkspaceBtn');
const openImportBtn = document.getElementById('openImportBtn');
const settingsBtn = document.getElementById('settingsBtn');

let appOrigin = LOCAL_APP_ORIGIN_FALLBACK;
let pollTimer = null;
let refreshInFlight = false;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeAppOrigin(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }

  try {
    const parsed = new URL(raw);
    return parsed.origin;
  } catch {
    return '';
  }
}

function resolveDefaultAppOrigin() {
  const manifest = chrome.runtime.getManifest();
  const manifestOrigin = normalizeAppOrigin(manifest?.homepage_url || '');
  if (manifestOrigin) {
    return manifestOrigin;
  }
  return LOCAL_APP_ORIGIN_FALLBACK;
}

function buildAppUrl(pathname) {
  const normalizedPath = String(pathname || '/').startsWith('/')
    ? String(pathname || '/')
    : `/${String(pathname || '')}`;
  return `${appOrigin}${normalizedPath}`;
}

async function loadAppOrigin() {
  const stored = await chrome.storage.local.get('appOrigin').catch(() => ({}));
  const storedOrigin = normalizeAppOrigin(stored?.appOrigin);
  appOrigin = storedOrigin || resolveDefaultAppOrigin();
}

async function saveAppOrigin(nextOrigin) {
  appOrigin = normalizeAppOrigin(nextOrigin) || resolveDefaultAppOrigin();
  await chrome.storage.local.set({ appOrigin });
}

function toLocalText(isoString) {
  if (!isoString) {
    return '-';
  }
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return date.toLocaleString();
}

function createLogNode(entry) {
  const wrapper = document.createElement('div');
  wrapper.className = 'log';

  const top = document.createElement('div');
  top.className = 'log-top';

  const worker = document.createElement('span');
  worker.className = 'muted';
  worker.textContent = entry.workerKey || 'worker';

  const status = document.createElement('span');
  status.className = `pill ${entry.success ? 'success' : 'failed'}`;
  status.textContent = entry.success ? 'SUCCESS' : 'FAILED';

  top.appendChild(worker);
  top.appendChild(status);

  if (!entry.success && entry.errorCode) {
    const code = document.createElement('span');
    code.className = 'muted';
    code.textContent = `[${entry.errorCode}]`;
    top.appendChild(code);
  }

  const detail = document.createElement('div');
  detail.className = 'muted';
  detail.textContent = entry.message || '-';

  const time = document.createElement('div');
  time.className = 'muted';
  const durationText =
    typeof entry.durationMs === 'number' && entry.durationMs >= 0
      ? ` (${Math.round(entry.durationMs / 100) / 10}s)`
      : '';
  time.textContent = `${toLocalText(entry.finishedAt)}${durationText}`;

  wrapper.appendChild(top);
  wrapper.appendChild(detail);
  wrapper.appendChild(time);
  return wrapper;
}

function renderLogs(logs) {
  logsEl.innerHTML = '';
  const entries = Array.isArray(logs) ? logs : [];
  if (entries.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No recent runs yet.';
    logsEl.appendChild(empty);
    return;
  }

  for (const entry of entries.slice(0, 20)) {
    logsEl.appendChild(createLogNode(entry));
  }
}

function setBridgeState(ready) {
  bridgeStatusEl.classList.remove('status-ok', 'status-warn');
  bridgeStatusEl.classList.add(ready ? 'status-ok' : 'status-warn');
  bridgeStatusEl.textContent = ready ? 'Connected' : 'Not ready';
}

async function sendBridgeMessage(type, payload = {}) {
  return await chrome.runtime.sendMessage({
    source: UI_SOURCE,
    type,
    payload
  });
}

async function fetchRuntimeStatusWithRetry() {
  try {
    const first = await sendBridgeMessage('BIZGITAL_INSIGHT_RUNTIME_STATUS');
    if (first?.ok && first?.data) {
      return first;
    }
  } catch {
    // One retry below.
  }

  await delay(500);
  return await sendBridgeMessage('BIZGITAL_INSIGHT_RUNTIME_STATUS');
}

function computeNextPollMs(data) {
  const eventTime = Date.parse(String(data?.lastUpdatedAt || ''));
  const recentEvent =
    Number.isFinite(eventTime) && Date.now() - eventTime <= RECENT_EVENT_WINDOW_MS;
  if (Number(data?.activeCount || 0) > 0 || recentEvent) {
    return FAST_POLL_MS;
  }
  return SLOW_POLL_MS;
}

function scheduleNextPoll(delayMs) {
  if (pollTimer) {
    window.clearTimeout(pollTimer);
    pollTimer = null;
  }
  pollTimer = window.setTimeout(() => {
    void refreshStatus();
  }, delayMs);
}

function renderStatus(statusResponse) {
  if (!statusResponse?.ok || !statusResponse?.data) {
    setBridgeState(false);
    lastEventEl.textContent = statusResponse?.error || 'Failed to load runtime status.';
    progressTextEl.textContent = 'Idle';
    return null;
  }

  const data = statusResponse.data;
  setBridgeState(Boolean(data.ready));
  versionEl.textContent = `v${data.version || '-'}`;
  activeWorkersEl.textContent = String(data.activeCount ?? 0);
  completedCountEl.textContent = String(data.completedCount ?? 0);
  successCountEl.textContent = String(data.successCount ?? 0);
  failedCountEl.textContent = String(data.failureCount ?? 0);
  lastEventEl.textContent = data.lastEvent || '-';

  const progress = data.lastProgress;
  if (progress && progress.message) {
    const workerPrefix =
      typeof progress.workerKey === 'string' && progress.workerKey
        ? `[${progress.workerKey}] `
        : '';
    progressTextEl.textContent = `${workerPrefix}${progress.message}${typeof progress.percent === 'number' ? ` (${progress.percent}%)` : ''}`;
  } else {
    progressTextEl.textContent = 'Idle';
  }

  renderLogs(data.recentRuns || []);
  return data;
}

async function refreshStatus() {
  if (refreshInFlight) {
    return;
  }

  refreshInFlight = true;
  refreshBtn.disabled = true;
  try {
    const status = await fetchRuntimeStatusWithRetry();
    const runtimeData = renderStatus(status);
    const nextPollMs = computeNextPollMs(runtimeData);
    scheduleNextPoll(nextPollMs);
  } catch (error) {
    setBridgeState(false);
    const message = error instanceof Error ? error.message : 'Failed to reach extension runtime.';
    lastEventEl.textContent = message;
    progressTextEl.textContent = 'Idle';
    scheduleNextPoll(SLOW_POLL_MS);
  } finally {
    refreshBtn.disabled = false;
    refreshInFlight = false;
  }
}

refreshBtn.addEventListener('click', () => {
  void refreshStatus();
});

clearBtn.addEventListener('click', async () => {
  clearBtn.disabled = true;
  try {
    await sendBridgeMessage('BIZGITAL_INSIGHT_CLEAR_RUNTIME_LOG');
    await refreshStatus();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to clear runtime logs.';
    lastEventEl.textContent = message;
  } finally {
    clearBtn.disabled = false;
  }
});

openWorkspaceBtn.addEventListener('click', async () => {
  await chrome.tabs.create({
    url: buildAppUrl('/app/internal/insight-capture-workspace'),
    active: true
  });
});

openImportBtn.addEventListener('click', async () => {
  await chrome.tabs.create({
    url: buildAppUrl('/app/internal/reports'),
    active: true
  });
});

settingsBtn.addEventListener('click', async () => {
  const entered = window.prompt(
    'Set app origin for workspace links (example: https://report.bizgital.com)',
    appOrigin
  );
  if (entered === null) {
    return;
  }
  await saveAppOrigin(entered);
  lastEventEl.textContent = `Saved app origin: ${appOrigin}`;
});

void (async () => {
  await loadAppOrigin();
  await refreshStatus();
})();

window.addEventListener('beforeunload', () => {
  if (pollTimer) {
    window.clearTimeout(pollTimer);
    pollTimer = null;
  }
});
