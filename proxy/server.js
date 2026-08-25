/**
 * Claude Usage Relay
 * ------------------------------------------------------------
 * Runs server-side (Node). Does NOT talk to claude.ai itself —
 * it's a small, dumb relay:
 *
 *   Chrome extension  --POST-->  this server  --GET-->  R1 device
 *   (runs inside your            (in-memory        (polls this
 *    authenticated                 last-value          server every
 *    claude.ai tab)                 cache)              few minutes)
 *
 * Why this shape: claude.ai's internal usage endpoint sits behind
 * Cloudflare bot protection that challenges requests not coming
 * from a real, already-authenticated browser session. A server
 * making its own outbound request (the original design of this
 * file) gets served a Cloudflare JS challenge page and can never
 * get real data, regardless of headers or session key validity.
 *
 * The fix: read the data from INSIDE the browser (via a small
 * Chrome extension content script, which inherits the trusted
 * session and passes Cloudflare fine), then PUSH it here. This
 * server never authenticates to claude.ai and never holds a
 * session key — it only holds whatever usage numbers were last
 * pushed to it, plus a shared secret to keep the push/pull
 * endpoints from being open to the public internet.
 * ------------------------------------------------------------
 */

const express = require('express');
const cors = require('cors');
const { version: PROXY_VERSION } = require('./package.json');

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 3000;
const SHARED_SECRET = process.env.PROXY_SHARED_SECRET;

if (!SHARED_SECRET) {
  console.error('[FATAL] PROXY_SHARED_SECRET environment variable is not set.');
  console.error('        Without it, anyone could push fake usage data or read yours.');
  console.error('        Set it before starting the server.');
  process.exit(1);
}

function checkSharedSecret(req, res, next) {
  const provided = req.query.key || req.headers['x-proxy-key'];
  if (provided !== SHARED_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

// In-memory store of the last data pushed by the extension.
// Ephemeral by design — Render's free tier filesystem is ephemeral
// anyway, and losing this on a redeploy/restart just means the R1
// shows stale data until the extension's next push (every few
// minutes), not a real failure.
let lastUsage = null; // { session: {usedPercent, resetsAt}, weekly: {...}, pushedAt: ISOString }

app.get('/health', (req, res) => res.json({ ok: true, version: PROXY_VERSION }));

// Extension calls this from inside your browser, every N minutes or
// whenever the usage panel is visited/refreshed.
app.post('/push', checkSharedSecret, (req, res) => {
  const { session, weekly } = req.body || {};

  if (!isValidWindow(session) || !isValidWindow(weekly)) {
    return res.status(400).json({
      error: 'invalid payload',
      expected: {
        session: { usedPercent: 'number 0-100', resetsAt: 'ISO string or null' },
        weekly: { usedPercent: 'number 0-100', resetsAt: 'ISO string or null' }
      }
    });
  }

  lastUsage = {
    session,
    weekly,
    pushedAt: new Date().toISOString()
  };

  console.log(`[push] session=${session.usedPercent}% weekly=${weekly.usedPercent}% at ${lastUsage.pushedAt}`);
  res.json({ ok: true, stored: lastUsage });
});

// R1 calls this every few minutes to read the last pushed data.
app.get('/usage', checkSharedSecret, (req, res) => {
  if (!lastUsage) {
    return res.status(404).json({
      error: 'no data pushed yet',
      detail: 'The Chrome extension needs to push at least once. Open claude.ai with the extension installed and active.'
    });
  }

  const ageMs = Date.now() - new Date(lastUsage.pushedAt).getTime();
  res.json({
    ...lastUsage,
    ageSeconds: Math.round(ageMs / 1000),
    proxyVersion: PROXY_VERSION
  });
});

function isValidWindow(w) {
  return (
    w &&
    typeof w === 'object' &&
    typeof w.usedPercent === 'number' &&
    w.usedPercent >= 0 &&
    w.usedPercent <= 100
  );
}

app.listen(PORT, () => {
  console.log(`Claude usage relay listening on :${PORT}`);
  console.log(`Push:  curl -X POST http://localhost:${PORT}/push?key=YOUR_SECRET -H "Content-Type: application/json" -d '{"session":{"usedPercent":22,"resetsAt":null},"weekly":{"usedPercent":2,"resetsAt":null}}'`);
  console.log(`Pull:  curl http://localhost:${PORT}/usage?key=YOUR_SECRET`);
});
