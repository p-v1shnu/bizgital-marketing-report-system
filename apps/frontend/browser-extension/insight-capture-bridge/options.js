const LOCAL_APP_ORIGIN_FALLBACK = 'http://localhost:3200';

const appOriginInput = document.getElementById('appOriginInput');
const saveBtn = document.getElementById('saveBtn');
const resetBtn = document.getElementById('resetBtn');
const statusLine = document.getElementById('statusLine');

function normalizeAppOrigin(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }
  const parsed = new URL(raw);
  return parsed.origin;
}

function resolveDefaultAppOrigin() {
  const manifest = chrome.runtime.getManifest();
  try {
    const manifestOrigin = normalizeAppOrigin(manifest?.homepage_url || '');
    if (manifestOrigin) {
      return manifestOrigin;
    }
  } catch {
    // Ignore invalid manifest homepage_url.
  }
  return LOCAL_APP_ORIGIN_FALLBACK;
}

function showStatus(message, kind = 'muted') {
  statusLine.textContent = message;
  statusLine.className = kind;
}

async function loadAppOrigin() {
  const defaultOrigin = resolveDefaultAppOrigin();
  try {
    const stored = await chrome.storage.local.get('appOrigin');
    const storedOrigin = stored?.appOrigin;
    if (!storedOrigin) {
      appOriginInput.value = defaultOrigin;
      showStatus(`Using default: ${defaultOrigin}`, 'muted');
      return;
    }

    try {
      appOriginInput.value = normalizeAppOrigin(storedOrigin);
    } catch {
      appOriginInput.value = defaultOrigin;
    }
    showStatus('Loaded saved origin.', 'muted');
  } catch (error) {
    appOriginInput.value = defaultOrigin;
    const message = error instanceof Error ? error.message : 'Failed to load app origin.';
    showStatus(message, 'error');
  }
}

async function saveAppOrigin(nextOrigin) {
  let normalized;
  try {
    normalized = normalizeAppOrigin(nextOrigin) || resolveDefaultAppOrigin();
  } catch {
    return { ok: false, error: 'Please enter a valid URL origin.' };
  }

  try {
    await chrome.storage.local.set({ appOrigin: normalized });
    return { ok: true, origin: normalized };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to save app origin.'
    };
  }
}

saveBtn.addEventListener('click', async () => {
  saveBtn.disabled = true;
  try {
    const result = await saveAppOrigin(appOriginInput.value);
    if (!result.ok) {
      showStatus(result.error || 'Failed to save app origin.', 'error');
      return;
    }
    appOriginInput.value = result.origin;
    showStatus(`Saved: ${result.origin}`, 'ok');
  } finally {
    saveBtn.disabled = false;
  }
});

resetBtn.addEventListener('click', async () => {
  const defaultOrigin = resolveDefaultAppOrigin();
  appOriginInput.value = defaultOrigin;
  const result = await saveAppOrigin(defaultOrigin);
  if (!result.ok) {
    showStatus(result.error || 'Failed to reset app origin.', 'error');
    return;
  }
  showStatus(`Reset to default: ${defaultOrigin}`, 'ok');
});

void loadAppOrigin();
