/**
 * Runs inside claude.ai pages. Because this executes in the page's
 * own context, fetch() calls here use the real browser session that
 * already passed Cloudflare's checks when the page loaded normally
 * — no bot-challenge problem, unlike a server-side fetch.
 *
 * Confirmed live response shape (as of 2026-08-24, via direct
 * inspection of claude.ai's own usage panel network call):
 *
 *   GET https://claude.ai/api/organizations/{orgId}/usage
 *   {
 *     "five_hour": { "utilization": 22, "resets_at": "2026-...", ... },
 *     "seven_day": { "utilization": 2,  "resets_at": "2026-...", ... },
 *     ... (many other fields, ignored here)
 *   }
 *
 * utilization is already 0-100, not a 0-1 fraction.
 */

async function getOrgId() {
  // The org UUID shows up in plenty of API calls the app already
  // makes. Cheapest reliable way to get it without hardcoding: hit
  // the same /api/organizations list endpoint the app itself uses.
  const resp = await fetch('https://claude.ai/api/organizations', {
    credentials: 'include',
    headers: { Accept: 'application/json' }
  });
  if (!resp.ok) throw new Error(`organizations fetch failed: ${resp.status}`);
  const orgs = await resp.json();
  if (!Array.isArray(orgs) || orgs.length === 0) {
    throw new Error('no organizations found for this account');
  }
  return orgs[0].uuid;
}

async function fetchUsage() {
  const orgId = await getOrgId();
  const resp = await fetch(`https://claude.ai/api/organizations/${orgId}/usage`, {
    credentials: 'include',
    headers: { Accept: 'application/json' }
  });
  if (!resp.ok) throw new Error(`usage fetch failed: ${resp.status}`);
  const raw = await resp.json();

  const session = extractWindow(raw.five_hour);
  const weekly = extractWindow(raw.seven_day);

  if (!session || !weekly) {
    throw new Error('usage response missing five_hour/seven_day fields — claude.ai may have changed its API shape');
  }

  return { session, weekly };
}

function extractWindow(w) {
  if (!w || typeof w.utilization !== 'number') return null;
  return {
    usedPercent: Math.round(w.utilization),
    resetsAt: w.resets_at ?? null
  };
}

async function runAndReport() {
  try {
    const usage = await fetchUsage();
    chrome.runtime.sendMessage({ type: 'USAGE_FETCHED', usage });
  } catch (err) {
    chrome.runtime.sendMessage({ type: 'USAGE_FETCH_ERROR', error: err.message });
  }
}

// Fetch once when the content script loads (i.e., whenever you have
// a claude.ai tab open/reloaded), and let the background worker's
// alarm trigger periodic re-fetches by re-injecting/messaging this
// script — see background.js.
runAndReport();

// Also listen for on-demand fetch requests from the background worker
// (used by the periodic alarm, since a content script can go dormant
// on an inactive tab — the alarm asks it to run again).
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'REQUEST_USAGE_REFRESH') {
    runAndReport();
  }
});
