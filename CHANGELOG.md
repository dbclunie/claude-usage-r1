# Changelog

Version numbers apply independently to the two components in this repo:
- **Creation** = `index.html` (the R1 device app) — version shown in its
  `<title>`, the on-screen `versionTag`/`versionFooter`, and `APP_VERSION`
  in the script.
- **Proxy** = `proxy/server.js` — version tracked in `proxy/package.json`
  and echoed by the `/health` endpoint and every `/usage` response
  (`proxyVersion` field).

Bump the relevant version on every change to that component. Both start
at `1.0.0` as of this repo's initial publish.

## Creation

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

## Proxy

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
