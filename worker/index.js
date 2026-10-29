/**
 * Claude Usage Relay — Cloudflare Worker
 * 
 * Replaces the Render/Express relay entirely.
 * - Always-on (no cold starts, no spin-down)
 * - KV storage (persistent — survives restarts/redeploys)
 * - Free tier: 100K req/day, 1K KV writes/day (we use ~1K/day total)
 * 
 * Routes (identical to the old Render relay so nothing changes on
 * the extension or R1 side):
 *   GET  /health       — version check, no auth
 *   POST /push?key=    — extension pushes usage data here
 *   GET  /usage?key=   — R1 reads latest pushed data here
 */

const VERSION = '3.0.0';
const KV_KEY  = 'lastUsage';

export default {
  async fetch(request, env) {
    const url    = new URL(request.url);
    const path   = url.pathname;
    const secret = env.PROXY_SHARED_SECRET;

    // CORS — allow the extension and R1 to reach us from any origin
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

    // ── /health ──────────────────────────────────────────────────
    if (path === '/health' && request.method === 'GET') {
      return json({ ok: true, version: VERSION, store: 'cloudflare-kv' });
    }

    // ── auth check for all other routes ──────────────────────────
    const provided = url.searchParams.get('key') || request.headers.get('X-Proxy-Key');
    if (!secret || provided !== secret) {
      return json({ error: 'unauthorized' }, 401);
    }

    // ── POST /push ────────────────────────────────────────────────
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

      const lastUsage = { session, weekly, pushedAt: new Date().toISOString() };
      await env.USAGE_KV.put(KV_KEY, JSON.stringify(lastUsage));
      return json({ ok: true, stored: lastUsage });
    }

    // ── GET /usage ────────────────────────────────────────────────
    if (path === '/usage' && request.method === 'GET') {
      const raw = await env.USAGE_KV.get(KV_KEY);
      if (!raw) {
        return json({
          error: 'no data pushed yet',
          detail: 'Open claude.ai with the Chrome extension installed and active.'
        }, 404);
      }

      const lastUsage = JSON.parse(raw);
      const ageMs = Date.now() - new Date(lastUsage.pushedAt).getTime();
      return json({ ...lastUsage, ageSeconds: Math.round(ageMs / 1000), workerVersion: VERSION });
    }

    return json({ error: 'not found' }, 404);
  }
};

function isValidWindow(w) {
  return (
    w &&
    typeof w === 'object' &&
    typeof w.usedPercent === 'number' &&
    w.usedPercent >= 0 &&
    w.usedPercent <= 100
  );
}
