/**
 * Claude Usage Proxy
 * ------------------------------------------------------------
 * Runs server-side (Node). Holds your claude.ai sessionKey in an
 * environment variable — never on the R1 device, never in the
 * browser, never committed to git.
 *
 * Why this exists: claude.ai's usage endpoints require a
 * `sessionKey` cookie and are not designed for cross-origin
 * fetches from a third-party device page. This proxy makes the
 * authenticated request server-side and returns a small, clean
 * JSON payload the R1 Creation can safely fetch over plain HTTPS
 * with no auth secret exposed to the device.
 *
 * Endpoints used (per documented behavior of the claude.ai web
 * app, as referenced by the open-source CodexBar project):
 *   GET https://claude.ai/api/organizations
 *   GET https://claude.ai/api/organizations/{orgId}/usage
 *
 * NOTE: These are undocumented/unofficial endpoints of the
 * claude.ai web app (not the public Claude API). They can change
 * without notice, and using a raw sessionKey this way is against
 * the spirit of "don't script the web session" — treat this as a
 * personal convenience tool, not something to distribute widely,
 * and rotate/revoke the session key if you ever suspect it leaked.
 * ------------------------------------------------------------
 */

const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_KEY = process.env.CLAUDE_SESSION_KEY;
const SHARED_SECRET = process.env.PROXY_SHARED_SECRET; // optional simple auth for your own R1 -> proxy calls

if (!SESSION_KEY) {
  console.error('[FATAL] CLAUDE_SESSION_KEY environment variable is not set.');
  console.error('        Set it before starting the server, e.g.:');
  console.error('        CLAUDE_SESSION_KEY="sk-ant-sid01-..." npm start');
  process.exit(1);
}

app.use(cors()); // R1 creation is hosted on a different origin than this proxy

// Simple optional auth so randos who find your proxy URL can't ride your session key.
// Set PROXY_SHARED_SECRET on the server and pass ?key=... from the R1 creation.
function checkSharedSecret(req, res, next) {
  if (!SHARED_SECRET) return next(); // no secret configured = open (fine for local/dev use only)
  const provided = req.query.key || req.headers['x-proxy-key'];
  if (provided !== SHARED_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

// In-memory cache so we don't hammer claude.ai on every R1 poll
let cache = { data: null, fetchedAt: 0 };
const CACHE_TTL_MS = 60 * 1000; // 60s

async function fetchClaudeUsage() {
  const headers = {
    Cookie: `sessionKey=${SESSION_KEY}`,
    Accept: 'application/json',
    'User-Agent': 'Mozilla/5.0 (compatible; personal-usage-widget/1.0)'
  };

  // 1. Get organization UUID
  const orgsResp = await fetch('https://claude.ai/api/organizations', { headers });
  if (!orgsResp.ok) {
    throw new Error(`organizations request failed: ${orgsResp.status}`);
  }
  const orgs = await orgsResp.json();
  if (!Array.isArray(orgs) || orgs.length === 0) {
    throw new Error('no organizations returned — session key may be invalid or expired');
  }
  const orgId = orgs[0].uuid;

  // 2. Get usage for that org
  const usageResp = await fetch(`https://claude.ai/api/organizations/${orgId}/usage`, { headers });
  if (!usageResp.ok) {
    throw new Error(`usage request failed: ${usageResp.status}`);
  }
  const usage = await usageResp.json();

  return normalizeUsage(usage);
}

/**
 * The exact shape of claude.ai's internal usage response is
 * undocumented and may vary. This normalizer defensively looks
 * for a few plausible field names/shapes and falls back to null
 * fields (rather than guessing) if it can't find them, so the
 * proxy fails loudly instead of quietly showing wrong numbers.
 */
function normalizeUsage(raw) {
  const session = extractWindow(raw, ['five_hour', 'session', 'five_hour_window']);
  const weekly = extractWindow(raw, ['seven_day', 'weekly', 'seven_day_window']);

  return {
    session: session, // { usedPercent, resetsAt } or null
    weekly: weekly,
    raw_keys_seen: Object.keys(raw || {}), // helpful for debugging field names via /debug
  };
}

function extractWindow(raw, candidateKeys) {
  if (!raw) return null;
  for (const key of candidateKeys) {
    const w = raw[key];
    if (w && typeof w === 'object') {
      const usedPercent = toPercent(w.utilization ?? w.used_percent ?? w.percent_used ?? w.usage);
      const resetsAt = w.resets_at ?? w.reset_time ?? w.resetTime ?? null;
      if (usedPercent !== null) {
        return { usedPercent, resetsAt };
      }
    }
  }
  return null;
}

function toPercent(v) {
  if (v === undefined || v === null) return null;
  const n = Number(v);
  if (Number.isNaN(n)) return null;
  // handle both 0-1 fractions and 0-100 percents
  return n <= 1 ? Math.round(n * 100) : Math.round(n);
}

// ---------- Routes ----------

app.get('/health', (req, res) => res.json({ ok: true }));

app.get('/usage', checkSharedSecret, async (req, res) => {
  try {
    const now = Date.now();
    if (cache.data && now - cache.fetchedAt < CACHE_TTL_MS) {
      return res.json({ ...cache.data, cached: true });
    }

    const data = await fetchClaudeUsage();
    cache = { data, fetchedAt: now };
    res.json({ ...data, cached: false });
  } catch (err) {
    console.error('[usage] error:', err.message);
    res.status(502).json({
      error: 'failed to fetch usage from claude.ai',
      detail: err.message
    });
  }
});

// Raw passthrough for debugging field names if /usage comes back with nulls.
// Remove or protect this in production — it exposes more of the raw response.
app.get('/debug/raw', checkSharedSecret, async (req, res) => {
  try {
    const headers = {
      Cookie: `sessionKey=${SESSION_KEY}`,
      Accept: 'application/json'
    };
    const orgsResp = await fetch('https://claude.ai/api/organizations', { headers });
    const orgs = await orgsResp.json();
    const orgId = orgs?.[0]?.uuid;
    const usageResp = await fetch(`https://claude.ai/api/organizations/${orgId}/usage`, { headers });
    const usage = await usageResp.json();
    res.json({ orgId, usage });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Claude usage proxy listening on :${PORT}`);
  console.log(`Try: curl http://localhost:${PORT}/usage${SHARED_SECRET ? '?key=YOUR_SECRET' : ''}`);
});
