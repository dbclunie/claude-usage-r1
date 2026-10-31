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
  const { lastPushStatus, lastBgFetch } = await chrome.storage.local.get(['lastPushStatus', 'lastBgFetch']);
  statusDiv.style.whiteSpace = 'pre-wrap';
  if (!lastPushStatus) {
    statusDiv.className = 'unknown';
    statusDiv.textContent = 'No push yet. It runs every minute while Chrome is open.';
    return;
  }

  const when = new Date(lastPushStatus.at).toLocaleTimeString();
  const via = lastPushStatus.source === 'background' ? 'background fetch' : lastPushStatus.source === 'tab' ? 'open claude.ai tab' : 'unknown source';
  const lines = [];
  if (lastPushStatus.ok) {
    lines.push(`Last push OK at ${when} (via ${via}) \u2014 session ${lastPushStatus.usage.session.usedPercent}%, weekly ${lastPushStatus.usage.weekly.usedPercent}%`);
  } else {
    lines.push(`Last push FAILED at ${when} (via ${via}) \u2014 ${lastPushStatus.error || 'status ' + lastPushStatus.status}`);
  }
  if (lastPushStatus.warning) lines.push(`Worker could not save it: ${lastPushStatus.warning}`);
  if (lastBgFetch && !lastBgFetch.ok) {
    lines.push(`Background fetch failed (${lastBgFetch.error}). Using an open claude.ai tab instead.`);
  }
  statusDiv.className = (lastPushStatus.ok && !lastPushStatus.warning) ? 'ok' : 'error';
  statusDiv.textContent = lines.join('\n');
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
