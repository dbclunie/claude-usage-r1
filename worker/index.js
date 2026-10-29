/**
 * Claude Usage Relay — Cloudflare Worker (v3.1.0)
 *
 * Routes:
 *   GET  /health       — version check, no auth
 *   POST /push?key=    — extension pushes usage data here
 *   GET  /usage?key=   — R1 reads latest pushed data here
 *
 * KV free-tier budget: 100K reads/day, 1,000 WRITES/day.
 * The extension pushes every ~1 min (1,440+/day), so we must NOT write
 * on every push. Write only when the value changed or the last write is
 * older than WRITE_HEARTBEAT_MS. Worst case ~288 heartbeat writes/day
 * plus actual changes — well under 1,000.
 */

const VERSION = '3.1.0';
const KV_KEY  = 'lastUsage';
const WRITE_HEARTBEAT_MS = 5 * 60 * 1000;

// Best-effort in-isolate fallback if a KV op fails (e.g. daily cap hit).
let memCache = null;

export default {
  async fetch(request, env) {
    const url    = new URL(request.url);
    const path   = url.pathname;
    const secret = env.PROXY_SHARED_SECRET;

    const corsHeaders = {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Proxy-Key',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    if (path === '/health' && request.method === 'GET') {
      return json({ ok: true, version: VERSION, store: 'cloudflare-kv' });
    }

    const provided = url.searchParams.get('key') || request.headers.get('X-Proxy-Key');
    if (!secret || provided !== secret) {
      return json({ error: 'unauthorized' }, 401);
    }

    // ── POST /push ───────────────────────────────────────────────
    if (path === '/push' && request.method === 'POST') {
      let body;
      try { body = await request.json(); }
      catch { return json({ error: 'invalid JSON body' }, 400); }

      const { session, weekly } = body || {};
      if (!isValidWindow(session) || !isValidWindow(weekly)) {
        return json({
          error: 'invalid payload',
          expected: {
            session: { usedPercent: 'number 0-100', resetsAt: 'ISO string or null' },
            weekly:  { usedPercent: 'number 0-100', resetsAt: 'ISO string or null' }
          }
        }, 400);
      }

      const nowIso = new Date().toISOString();
      const next = { session, weekly, pushedAt: nowIso };
      const prev = await readStored(env);

      if (prev && !hasChanged(prev, next) &&
          Date.now() - new Date(prev.pushedAt).getTime() < WRITE_HEARTBEAT_MS) {
        // Nothing new and heartbeat not due — skip the KV write (saves quota).
        return json({ ok: true, wrote: false, stored: prev });
      }

      memCache = next;
      try {
        await env.USAGE_KV.put(KV_KEY, JSON.stringify(next));
        return json({ ok: true, wrote: true, stored: next });
      } catch (err) {
        // Likely daily write cap. Still serve from memory best-effort.
        return json({ ok: true, wrote: false, warning: 'KV write failed: ' + err.message, stored: next });
      }
    }

    // ── GET /usage ───────────────────────────────────────────────
    if (path === '/usage' && request.method === 'GET') {
      const lastUsage = await readStored(env);
      if (!lastUsage) {
        return json({
          error: 'no data pushed yet',
          detail: 'Open claude.ai with the Chrome extension installed and active.'
        }, 404);
      }
      const ageMs = Date.now() - new Date(lastUsage.pushedAt).getTime();
      return json({ ...lastUsage, ageSeconds: Math.round(ageMs / 1000), workerVersion: VERSION });
    }

    return json({ error: 'not found' }, 404);
  }
};

async function readStored(env) {
  let kv = null;
  try {
    const raw = await env.USAGE_KV.get(KV_KEY);
    if (raw) kv = JSON.parse(raw);
  } catch (e) { /* fall through to memCache */ }
  if (memCache && (!kv || memCache.pushedAt > kv.pushedAt)) return memCache;
  return kv;
}

// resetsAt's sub-second digits differ on every fetch, so compare to the minute.
function hasChanged(a, b) {
  const minute = s => (s || '').slice(0, 16);
  return a.session.usedPercent !== b.session.usedPercent ||
         a.weekly.usedPercent  !== b.weekly.usedPercent  ||
         minute(a.session.resetsAt) !== minute(b.session.resetsAt) ||
         minute(a.weekly.resetsAt)  !== minute(b.weekly.resetsAt);
}

function isValidWindow(w) {
  return (
    w &&
    typeof w === 'object' &&
    typeof w.usedPercent === 'number' &&
    w.usedPercent >= 0 &&
    w.usedPercent <= 100
  );
}
