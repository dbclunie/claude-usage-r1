/**
 * Background service worker (extension v1.2.0).
 *
 * Every minute (and on browser start / extension reload) it:
 *   1. Fetches your usage straight from claude.ai using your browser's own
 *      logged-in cookies — NO claude.ai tab needed.
 *   2. Pushes the result to your relay (Cloudflare Worker).
 *   If step 1 fails (e.g. Cloudflare challenges the background request, or
 *   you're logged out), it falls back to the old method: ask any open
 *   claude.ai tab (content.js) to fetch + report. The popup shows which path
 *   was used and why the other failed.
 *
 * Still required: Chrome running and the Mac awake (nothing runs during sleep).
 */

const ALARM_NAME = 'usage-refresh';
const ALARM_PERIOD_MINUTES = 1; // Chrome's practical floor for repeating alarms is ~0.5-1 min
const API_BASE = 'https://claude.ai/api';

chrome.runtime.onInstalled.addListener(() => { ensureAlarm(); refreshUsage(); });
chrome.runtime.onStartup.addListener(() => { ensureAlarm(); refreshUsage(); });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) refreshUsage();
});

async function ensureAlarm() {
  const existing = await chrome.alarms.get(ALARM_NAME);
  if (!existing) chrome.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_PERIOD_MINUTES });
}

let refreshing = false;

async function refreshUsage() {
  if (refreshing) return; // don't overlap runs
  refreshing = true;
  try {
    try {
      const usage = await fetchUsageDirect();
      await chrome.storage.local.set({ lastBgFetch: { ok: true, at: new Date().toISOString() } });
      await pushToRelay(usage, 'background');
      return;
    } catch (err) {
      console.warn('[claude-usage-relay] background fetch failed:', err.message);
      await chrome.storage.local.set({ lastBgFetch: { ok: false, at: new Date().toISOString(), error: err.message } });
    }
    await askOpenClaudeTabsToRefresh(); // fallback to the tab-based method
  } finally {
    refreshing = false;
  }
}

// ---------- direct fetch from claude.ai (cookies come from the browser) ----------

async function getJson(url) {
  const resp = await fetch(url, { credentials: 'include', headers: { Accept: 'application/json' } });
  if (resp.headers.get('cf-mitigated') === 'challenge') {
    throw new Error('Cloudflare challenge (background request blocked)');
  }
  const ctype = resp.headers.get('content-type') || '';
  if (!ctype.includes('json')) {
    throw new Error(`non-JSON response (HTTP ${resp.status}) — challenge or login page`);
  }
  if (!resp.ok) {
    throw Object.assign(new Error(`HTTP ${resp.status}`), { status: resp.status });
  }
  return resp.json();
}

async function getOrgId(force = false) {
  if (!force) {
    const { orgId } = await chrome.storage.local.get('orgId');
    if (orgId) return orgId;
  }
  const orgs = await getJson(`${API_BASE}/organizations`);
  if (!Array.isArray(orgs) || orgs.length === 0) {
    throw new Error('no organizations returned (logged out?)');
  }
  await chrome.storage.local.set({ orgId: orgs[0].uuid });
  return orgs[0].uuid;
}

async function fetchUsageDirect() {
  let orgId = await getOrgId();
  let raw;
  try {
    raw = await getJson(`${API_BASE}/organizations/${orgId}/usage`);
  } catch (e) {
    if (e.status === 403 || e.status === 404) { // cached org id may be stale
      orgId = await getOrgId(true);
      raw = await getJson(`${API_BASE}/organizations/${orgId}/usage`);
    } else {
      throw e;
    }
  }
  const session = extractWindow(raw.five_hour);
  const weekly = extractWindow(raw.seven_day);
  if (!session || !weekly) {
    throw new Error('usage response missing five_hour/seven_day — API shape may have changed');
  }
  return { session, weekly };
}

function extractWindow(w) {
  if (!w || typeof w.utilization !== 'number') return null;
  return { usedPercent: Math.round(w.utilization), resetsAt: w.resets_at ?? null };
}

// ---------- fallback: ask open claude.ai tabs (content.js) ----------

async function askOpenClaudeTabsToRefresh() {
  const tabs = await chrome.tabs.query({ url: 'https://claude.ai/*' });
  for (const tab of tabs) {
    if (tab.id != null) {
      chrome.tabs.sendMessage(tab.id, { type: 'REQUEST_USAGE_REFRESH' }).catch(() => {
        // Tab may not have the content script loaded yet — ignore.
      });
    }
  }
  if (tabs.length === 0) {
    console.log('[claude-usage-relay] Background fetch failed and no claude.ai tab is open — nothing pushed this cycle.');
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'USAGE_FETCHED') {
    pushToRelay(msg.usage, 'tab');
  } else if (msg?.type === 'USAGE_FETCH_ERROR') {
    console.warn('[claude-usage-relay] fetch error from content script:', msg.error);
  }
});

// ---------- push to the relay ----------

async function pushToRelay(usage, source) {
  const { relayUrl, sharedSecret } = await chrome.storage.sync.get(['relayUrl', 'sharedSecret']);
  if (!relayUrl || !sharedSecret) {
    console.warn('[claude-usage-relay] Relay URL / secret not configured yet — open the extension popup to set them.');
    await chrome.storage.local.set({ lastPushStatus: { ok: false, at: new Date().toISOString(), source, error: 'Relay URL / secret not set' } });
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
      await chrome.storage.local.set({ lastPushStatus: { ok: false, status: resp.status, at: new Date().toISOString(), source } });
      return;
    }

    let body = {};
    try { body = await resp.json(); } catch (e) { /* non-JSON ok response */ }
    // The Worker answers ok:true even if its KV write failed (e.g. daily cap) — surface that.
    await chrome.storage.local.set({
      lastPushStatus: { ok: true, at: new Date().toISOString(), source, usage, warning: body.warning || null }
    });
  } catch (err) {
    console.error('[claude-usage-relay] push error:', err.message);
    await chrome.storage.local.set({ lastPushStatus: { ok: false, error: err.message, at: new Date().toISOString(), source } });
  }
}
