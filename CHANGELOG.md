# Changelog

Version numbers apply independently to the three components in this repo:
- **Creation** = `index.html` (the R1 device app) — version shown in its
  `<title>`, the on-screen `versionTag`/`versionFooter`, and `APP_VERSION`
  in the script.
- **Relay** (formerly "proxy") = `proxy/server.js` — version tracked in
  `proxy/package.json` and echoed by the `/health` endpoint and every
  `/usage` response (`proxyVersion` field).
- **Extension** = `extension/` (Chrome extension) — version tracked in
  `extension/manifest.json`.

Bump the relevant version on every change to that component.

## Creation

### v1.1.1
- Actually set `PROXY_URL` to the deployed relay + shared secret. Previous
  commits updated the surrounding comments for the new relay
  architecture but left `PROXY_URL` empty, so the R1 was silently
  running on hardcoded placeholder values (45%/32%) the whole time
  despite the relay and extension working correctly end-to-end.

### v1.1.0
- Updated data-source comments and README pointers to reflect the new
  relay architecture (see Relay v2.0.0 below) — no functional change to
  `index.html` itself, since the `/usage` response shape it consumes
  (`session.usedPercent`, `session.resetsAt`, same for `weekly`) stayed
  the same across the relay rewrite.

### v1.0.0 — initial release
- 240×282px display built to the real R1 Creations spec
- Scroll wheel navigates focus between Session/Weekly cards
- PTT click opens Settings; click "Back" saves and returns
- Settings: scroll to select row, hold PTT + scroll to adjust value in
  steps of 5 (manual override / fallback entry)
- Persistence via `window.creationStorage.plain` (base64 JSON), with a
  `localStorage` fallback for browser preview/testing
- Live data via `getUsageData()` fetching a self-hosted proxy, with
  automatic fallback to last-known values on any fetch failure
- Auto-sync every 5 minutes; long-press on main screen forces immediate
  sync
- Color-coded usage bars: green <50%, yellow 50–80%, red 80%+

## Relay (proxy/) — formerly "Proxy"

### v2.0.0 — architecture change: push, not pull
**Breaking change.** The relay no longer fetches claude.ai itself.

Root cause found: claude.ai's internal usage endpoint sits behind
Cloudflare bot protection that challenges any request not coming from
an already-authenticated real browser session. A server-side `fetch()`
— regardless of headers, session key validity, or retries — gets served
a Cloudflare JS challenge page (`cf-mitigated: challenge`, HTML titled
"Just a moment...") instead of real data. This is not fixable by
adjusting request headers; see v1.0.1/v1.0.2 below for the (ultimately
insufficient) attempts.

New shape:
- `POST /push` — called by the new Chrome extension (see `extension/`),
  which reads usage data from *inside* an actual claude.ai browser tab
  (inheriting its trusted, Cloudflare-cleared session) and pushes the
  result here.
- `GET /usage` — unchanged from the R1's perspective: still returns
  `{ session: {usedPercent, resetsAt}, weekly: {...} }`, now also
  including `pushedAt` and `ageSeconds` so staleness is visible.
- No longer holds or needs `CLAUDE_SESSION_KEY` — the relay never talks
  to claude.ai, so there's no session key to hold. Removed `node-fetch`
  dependency accordingly.
- `/debug/raw` removed (no longer meaningful — there's no outbound
  request to debug).
- In-memory last-value store; ephemeral by design, matching Render's
  ephemeral free-tier filesystem. A restart just means stale data until
  the extension's next scheduled push (~4 min).

### v1.0.2
- `/debug/raw` now surfaces the actual response status, headers, and
  body text from claude.ai instead of throwing/hiding it behind a
  generic error — needed because a persistent 403 on
  `/api/organizations` gave no visibility into *why* (bot detection
  page? Cloudflare challenge? auth-specific error message?). Body is
  parsed as JSON when possible, otherwise returned as raw text
  (capped at 1000 chars). Session cookie value is truncated/redacted
  in the echoed request headers.

### v1.0.1
- Send full browser-like request headers (User-Agent, Accept-Language,
  Origin, Referer) to claude.ai, not just the session cookie — the
  cookie-only request was getting a 403 from claude.ai's
  `/api/organizations` endpoint, likely due to bot/script fingerprint
  filtering. Headers are now built once via `buildHeaders()` and shared
  between `/usage` and `/debug/raw` so they can't drift out of sync.
  (In hindsight: this was treating a symptom. The actual cause,
  confirmed in v2.0.0's investigation, was Cloudflare bot detection
  that headers alone can't pass.)

### v1.0.0 — initial release
- Express server exposing `GET /usage` (clean session+weekly JSON),
  `GET /health`, and `GET /debug/raw` (unfiltered upstream response, for
  diagnosing claude.ai's undocumented field names)
- Authenticates to claude.ai via `sessionKey` cookie held in
  `CLAUDE_SESSION_KEY` env var — never exposed to the device
- Optional `PROXY_SHARED_SECRET` gate via `?key=` query param or
  `X-Proxy-Key` header
- 60s in-memory cache to avoid hammering claude.ai on frequent R1 polls
- Defensive `normalizeUsage()` that looks for several plausible field-name
  variants and returns `null` windows (rather than guessing) when it
  can't find them

## Extension (extension/)

### v1.0.0 — initial release
- Manifest V3 Chrome extension, active only on `https://claude.ai/*`
- `content.js`: runs inside claude.ai pages, calls the same
  `/api/organizations` → `/api/organizations/{id}/usage` sequence the
  app's own Settings → Usage panel uses (confirmed via direct network
  inspection), inheriting the page's already-authenticated,
  Cloudflare-cleared session — no bot-challenge issue, unlike a
  server-side request
- `background.js`: periodic alarm (every 4 minutes) asks any open
  claude.ai tab to refresh and push; also pushes immediately whenever
  content.js reports fresh data
- `popup.html`/`popup.js`: settings UI for relay URL + shared secret,
  plus last-push status (success/failure, timestamp, values)
- Confirmed live response fields: `five_hour.utilization` (0-100, not a
  fraction), `five_hour.resets_at` (ISO string); same shape for
  `seven_day`
