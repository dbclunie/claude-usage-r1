/**
 * Background service worker.
 * - Wakes on a periodic alarm, asks any open claude.ai tab to
 *   re-fetch usage (content.js), and pushes the result to your
 *   relay server.
 * - Also pushes immediately whenever content.js reports fresh data
 *   (e.g., because you had the usage panel open).
 */

const ALARM_NAME = 'usage-refresh';
const ALARM_PERIOD_MINUTES = 1; // Chrome's practical floor for repeating alarms is ~0.5-1 min

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_PERIOD_MINUTES });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  askOpenClaudeTabsToRefresh();
});

async function askOpenClaudeTabsToRefresh() {
  const tabs = await chrome.tabs.query({ url: 'https://claude.ai/*' });
  for (const tab of tabs) {
    if (tab.id != null) {
      chrome.tabs.sendMessage(tab.id, { type: 'REQUEST_USAGE_REFRESH' }).catch(() => {
        // Tab may not have the content script loaded yet (e.g., mid-navigation) — ignore.
      });
    }
  }
  if (tabs.length === 0) {
    console.log('[claude-usage-relay] No open claude.ai tab — skipping this cycle. Open claude.ai to resume pushing.');
  }
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type === 'USAGE_FETCHED') {
    pushToRelay(msg.usage);
  } else if (msg?.type === 'USAGE_FETCH_ERROR') {
    console.warn('[claude-usage-relay] fetch error from content script:', msg.error);
  }
});

async function pushToRelay(usage) {
  const settings = await chrome.storage.sync.get(['relayUrl', 'sharedSecret']);
  const { relayUrl, sharedSecret } = settings;

  if (!relayUrl || !sharedSecret) {
    console.warn('[claude-usage-relay] Relay URL / secret not configured yet — open the extension popup to set them.');
    return;
  }

  try {
    const resp = await fetch(`${relayUrl.replace(/\/$/, '')}/push?key=${encodeURIComponent(sharedSecret)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(usage)
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error('[claude-usage-relay] push failed:', resp.status, text);
      await chrome.storage.local.set({ lastPushStatus: { ok: false, status: resp.status, at: new Date().toISOString() } });
      return;
    }

    console.log('[claude-usage-relay] pushed:', usage);
    await chrome.storage.local.set({ lastPushStatus: { ok: true, at: new Date().toISOString(), usage } });
  } catch (err) {
    console.error('[claude-usage-relay] push error:', err.message);
    await chrome.storage.local.set({ lastPushStatus: { ok: false, error: err.message, at: new Date().toISOString() } });
  }
}
