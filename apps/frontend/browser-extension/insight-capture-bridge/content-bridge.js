const UI_SOURCE = 'bizgital-insight-ui';
const EXT_SOURCE = 'bizgital-insight-extension';

function postBridgeError(requestId, message) {
  window.postMessage(
    {
      source: EXT_SOURCE,
      type: 'BIZGITAL_INSIGHT_EXTENSION_ERROR',
      requestId,
      payload: {
        message
      }
    },
    '*'
  );
}

window.addEventListener('message', (event) => {
  if (event.source !== window) {
    return;
  }

  const data = event.data;
  if (!data || data.source !== UI_SOURCE || typeof data.type !== 'string') {
    return;
  }

  const requestId = String(data.requestId || '');
  if (!requestId) {
    return;
  }

  if (!chrome?.runtime?.id) {
    postBridgeError(
      requestId,
      'Extension context invalidated. Please refresh this page once after reloading the extension.'
    );
    return;
  }

  try {
    chrome.runtime.sendMessage(
      {
        source: UI_SOURCE,
        type: data.type,
        requestId,
        payload: data.payload ?? null
      },
      (response) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          const lower = String(runtimeError.message || '').toLowerCase();
          const friendly = lower.includes('extension context invalidated')
            ? 'Extension was reloaded. Please refresh this page, then try again.'
            : runtimeError.message;
          postBridgeError(requestId, friendly);
          return;
        }

        window.postMessage(
          {
            source: EXT_SOURCE,
            type: 'BIZGITAL_INSIGHT_EXTENSION_RESPONSE',
            requestId,
            payload: response ?? { ok: false, error: 'No response from extension service worker.' }
          },
          '*'
        );
      }
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Extension context invalidated. Please refresh this page and try again.';
    postBridgeError(requestId, message);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.source !== UI_SOURCE) {
    return false;
  }

  if (message.type !== 'BIZGITAL_INSIGHT_PROGRESS') {
    return false;
  }

  window.postMessage(
    {
      source: EXT_SOURCE,
      type: 'BIZGITAL_INSIGHT_EXTENSION_PROGRESS',
      requestId: String(message.requestId || ''),
      payload: message.payload ?? null
    },
    '*'
  );

  sendResponse({ ok: true });
  return false;
});
