const UI_SOURCE = 'bizgital-insight-ui';

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

let pollTimer = null;

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

function renderStatus(statusResponse) {
  if (!statusResponse?.ok || !statusResponse?.data) {
    setBridgeState(false);
    lastEventEl.textContent = statusResponse?.error || 'Failed to load runtime status.';
    return;
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
    progressTextEl.textContent = `${progress.message}${typeof progress.percent === 'number' ? ` (${progress.percent}%)` : ''}`;
  } else {
    progressTextEl.textContent = 'Idle';
  }

  renderLogs(data.recentRuns || []);
}

async function refreshStatus() {
  refreshBtn.disabled = true;
  try {
    const status = await sendBridgeMessage('BIZGITAL_INSIGHT_RUNTIME_STATUS');
    renderStatus(status);
  } catch (error) {
    setBridgeState(false);
    const message = error instanceof Error ? error.message : 'Failed to reach extension runtime.';
    lastEventEl.textContent = message;
  } finally {
    refreshBtn.disabled = false;
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
  } finally {
    clearBtn.disabled = false;
  }
});

openWorkspaceBtn.addEventListener('click', async () => {
  await chrome.tabs.create({
    url: 'http://localhost:3200/app/internal/insight-capture-workspace',
    active: true
  });
});

openImportBtn.addEventListener('click', async () => {
  await chrome.tabs.create({
    url: 'http://localhost:3200/app/internal/reports',
    active: true
  });
});

void refreshStatus();
pollTimer = window.setInterval(() => {
  void refreshStatus();
}, 2000);

window.addEventListener('beforeunload', () => {
  if (pollTimer) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
});
