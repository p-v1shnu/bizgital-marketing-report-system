const postUrlInput = document.getElementById('postUrl');
const pageIdInput = document.getElementById('pageId');
const pageNameInput = document.getElementById('pageName');
const captureBtn = document.getElementById('captureBtn');
const resultBox = document.getElementById('resultBox');

captureBtn.addEventListener('click', async () => {
  captureBtn.disabled = true;
  resultBox.textContent = 'Capturing...';

  try {
    const response = await chrome.runtime.sendMessage({
      source: 'bizgital-insight-ui',
      type: 'BIZGITAL_INSIGHT_CAPTURE_REQUEST',
      payload: {
        postUrl: postUrlInput.value.trim(),
        pageId: pageIdInput.value.trim(),
        pageName: pageNameInput.value.trim()
      }
    });

    resultBox.textContent = JSON.stringify(response, null, 2);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Capture failed.';
    resultBox.textContent = message;
  } finally {
    captureBtn.disabled = false;
  }
});
