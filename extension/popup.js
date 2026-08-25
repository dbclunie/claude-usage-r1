const relayUrlInput = document.getElementById('relayUrl');
const sharedSecretInput = document.getElementById('sharedSecret');
const saveBtn = document.getElementById('saveBtn');
const saveMsg = document.getElementById('saveMsg');
const statusDiv = document.getElementById('status');

async function loadSettings() {
  const { relayUrl, sharedSecret } = await chrome.storage.sync.get(['relayUrl', 'sharedSecret']);
  if (relayUrl) relayUrlInput.value = relayUrl;
  if (sharedSecret) sharedSecretInput.value = sharedSecret;
}

async function loadStatus() {
  const { lastPushStatus } = await chrome.storage.local.get('lastPushStatus');
  if (!lastPushStatus) {
    statusDiv.className = 'unknown';
    statusDiv.textContent = 'No push attempted yet. Open a claude.ai tab to trigger one.';
    return;
  }

  const when = new Date(lastPushStatus.at).toLocaleTimeString();
  if (lastPushStatus.ok) {
    statusDiv.className = 'ok';
    statusDiv.textContent = `Last push OK at ${when} — session ${lastPushStatus.usage.session.usedPercent}%, weekly ${lastPushStatus.usage.weekly.usedPercent}%`;
  } else {
    statusDiv.className = 'error';
    statusDiv.textContent = `Last push FAILED at ${when} — ${lastPushStatus.error || 'status ' + lastPushStatus.status}`;
  }
}

saveBtn.addEventListener('click', async () => {
  const relayUrl = relayUrlInput.value.trim();
  const sharedSecret = sharedSecretInput.value.trim();

  if (!relayUrl || !sharedSecret) {
    saveMsg.textContent = 'Both fields are required.';
    saveMsg.style.color = '#F87171';
    return;
  }

  await chrome.storage.sync.set({ relayUrl, sharedSecret });
  saveMsg.style.color = '#4ADE80';
  saveMsg.textContent = 'Saved.';
  setTimeout(() => { saveMsg.textContent = ''; }, 2000);
});

loadSettings();
loadStatus();
