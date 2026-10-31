# Changelog

Version numbers apply independently to the components in this repo:
- **Creation** = `index.html` and `index-v<version>.html` (the R1 device app) — version shown in `<title>`, the on-screen tag, `APP_VERSION`, and the in-app What's New list.
- **Worker** = `worker/` (Cloudflare Worker relay) — `VERSION` in `worker/index.js`, echoed by `/health` and `/usage`.
- **Extension** = `extension/` (Chrome extension) — `extension/manifest.json`.
- **Relay (proxy/)** = the retired Render/Express relay. Removed from the repo (still in git history); kept below for the record.

Bump the relevant version on every change to that component.

## Creation

### v1.4.6
- sync status line now 12px bold, same size as Last updated; error detail on its own smaller line

### v1.4.5
- on-screen sync status line: sync OK <time> or the actual error
- service worker no longer used on the R1 (unregisters and clears caches) - PWA caching stays for phones/browsers
- Service worker is skipped on the R1 (detected via `window.creationStorage` / user agent); any existing registration and its caches are cleared on load. Phones/browsers keep the PWA service worker.

### v1.4.4
- fix: live data stuck on first fetch - service worker was caching relay responses (only bypassed onrender.com, not workers.dev)
- relay requests now bypass the cache and carry a unique URL
- Root cause: `sw.js` bypassed its cache only for `onrender.com`. After the relay moved to `workers.dev`, `/usage` responses were served cache-first, so the R1 kept showing the first fetched data. `sw.js` now handles same-origin GETs only; everything else goes straight to the network.

### v1.4.3
- relay migrated from Render to Cloudflare Worker — always-on, no cold starts, persistent KV storage

### v1.4.2
- R1 mascot icon added before CLAUDE USAGE title in the header
- Mascot is embedded as a base64 PNG (no extra request). The card icon on the R1 home screen comes from `iconUrl` in the install QR payload.

### v1.4.1
- metric-sub text (% left + resets in...) bumped to 12px bold to match Last updated — easier to read from a distance

### v1.4.0
- theme system added — 9 presets: Dark, Light, Volcanic Desert (Red), Desert Orange, Plains Yellow, Forest Green, Blues Ocean (Blue), Midnight Tundra (Indigo), Twilight Alpine (Violet)
- all colors refactored to CSS custom properties
- theme picker in Settings > Theme, scroll to browse, PTT to select, hold to go back
- selected theme persists across sessions
- Themes: Dark, Light, Volcanic Desert (red), Desert Orange, Plains Yellow, Forest Green, Blues Ocean (blue), Midnight Tundra (indigo), Twilight Alpine (violet).

### v1.3.5
- scroll hint text brightness matched to copyright (#555 → #999)

### v1.3.4
- copyright notice now shown on main screen below the scroll hint, matching Settings screen

### v1.3.3
- copyright text in Settings footer brightened (#444 → #999)

### v1.3.2
- changelog back button is now a real tappable row (was just hint text)

### v1.3.1
- version number now tappable — opens this What’s New screen
- scroll wheel scrolls the changelog, PTT goes back to usage

### v1.3.0 (published as `index-v1.3.0.html`)
- **Copyright notice** added: HTML comment block at top of source
  (matching Review Radar format — proprietary/confidential, all rights
  reserved) and in-app display in the Settings screen footer.
- **PWA support**: `manifest.json`, `sw.js`, and `icons/` added.
  - App shell cached for offline use (the display works without a
    network; relay calls are deliberately never cached since live data
    is the whole point).
  - Manifest: `display: standalone`, dark background/theme color
    matching the app's `#0d0d0d` background, orange `#FF6A00` accent.
  - Icons: 192px, 512px (any), 512px (maskable) — orange ring on dark
    background, two dots suggesting the session/weekly dual-metric.
  - Service worker registered in `init()`, failure is non-fatal (app
    works identically without it).
  - PWA manifest link + Apple meta tags added to `<head>`.

### v1.2.3 (published as `index-v1.2.3.html`)
- `.metric-sub` color: `#777` → `#FBBF24` (amber). The "X% left" and
  "resets in Yh Zm / Yd" lines below each bar were too dim to read on
  the black background.

### v1.2.2 (this release also published as `index-v1.2.2.html`)
- `AUTO_REFRESH_MS`: 5 min → 90 sec. Combined with the extension's
  tightened 1-min push interval (see Extension v1.1.0 below),
  worst-case staleness between a real usage change and the R1
  reflecting it drops from ~8-10 min to ~2.5 min.
- Old `index-v1.2.1.html` removed per the versioned-filename pattern —
  only the current release's versioned copy is kept going forward, to
  avoid the repo accumulating every historical version indefinitely.

### v1.2.1 (this release also published as `index-v1.2.1.html`)
- **Root cause found for repeated "still shows old version" reports**:
  GitHub Pages' CDN (Fastly) can cache by filename and ignore query
  strings, so the `?v=...` cache-busting approach used for the last
  several releases was not reliably forcing a fresh fetch — the R1 (or
  an intermediate cache) may have kept serving pre-v1.2.1 content
  regardless of the query param. Fix: publish version-named file
  copies (`index-v<version>.html`) going forward and point the R1's
  install QR at the versioned file, not `index.html` — see README
  "Updating the Creation after the first install".
- Added `Cache-Control`/`Pragma`/`Expires` no-cache meta tags to
  `<head>` as defense in depth (not fully reliable alone, since
  browsers/WebViews can ignore meta tags in favor of server headers —
  the versioned-filename approach is the actual fix).
- Moved "Last updated" line to sit directly below the Session/Weekly
  boxes (was previously below the footer scroll-hint, at the very
  bottom).
- Increased size/weight to 12px bold (was 7px) and base color to
  `#ccc` (was `#666`) for legibility, matching the boldness of the
  metric numbers without literally matching their 20px size — at 20px
  the full "Last updated: Today H:MM AM" string doesn't fit the 240px
  screen width (measured 240px needed vs 216px available with
  padding); 12px was the largest confirmed to fit comfortably.
- **Flipped the color logic** from the original v1.2.0 build: amber
  now means *fresh* (pushed within the last 15 min), not stale —
  `.stale` class renamed to `.fresh`, condition inverted
  (`ageMs <= threshold` instead of `>`). Older-than-15-min now reads
  in the same neutral `#ccc` as everything else rather than a warning
  color, since the intent was to highlight recency, not flag staleness.

### v1.2.0
- New "Last updated: <date> <time>" line below the footer hint, showing
  when the extension actually last pushed data to the relay (`pushedAt`
  from the `/usage` response) — distinct from the header clock, which
  only shows when the R1 last rendered, not when the underlying data
  was refreshed.
- Date shown as "Today"/"Yesterday"/"Mon D" as appropriate; time in the
  same 12h AM/PM format as the header.
- Turns amber past 15 minutes since the last push (well beyond the
  extension's ~4 min normal cadence) as a visible staleness warning.
  Shows "Last updated: never" (also amber) if no push has landed yet.
- `getUsageData()` and `syncUsage()` now carry `pushedAt` through from
  the relay response into persisted state, only overwriting on a real
  value so a transient fetch error doesn't wipe the last known
  timestamp.

### v1.1.2
- Time and version tag in the header are now brighter (`#ccc`/`#999`
  instead of `#666`/`#444`) for legibility against the black background.
- Time now displays 12-hour with AM/PM (e.g. `5:22 AM`) instead of
  24-hour (`05:22`), via a new `formatTime12h()` helper.

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

> **Retired.** Replaced by the Cloudflare Worker when the Creation moved to it in v1.4.3. The `proxy/` folder and `render.yaml` were removed from the repo.

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

## Worker (worker/)

### v3.1.0
- Fix: KV writes were happening on every push (~1,440+/day) vs. the free-tier
  cap of 1,000 writes/day (Cloudflare emailed a 90% warning). Now writes only
  when usedPercent/resetsAt (to the minute) change, or every 5 min as a
  heartbeat. Added in-memory fallback if a KV op fails.
- Note: `resetsAt` sub-second digits differ per fetch, so change detection
  compares to the minute only.

### v3.0.0
- Initial Cloudflare Worker + KV relay, replacing the Render relay.

## Extension (extension/)

### v1.2.0
- **No claude.ai tab required.** The background service worker now fetches usage
  directly from claude.ai every minute using the browser's logged-in session
  (`/api/organizations` -> `/api/organizations/{id}/usage`), then pushes to the Worker.
  Org id is cached in `chrome.storage.local`; a stale id (403/404) is re-fetched once.
- **Fallback:** if the background request fails (Cloudflare challenge, logged out, API shape
  change) it asks any open claude.ai tab (`content.js`) as before. Nothing is done to evade a
  challenge.
- Popup now shows which path was used ("via background fetch" / "via open claude.ai tab"),
  why the background fetch failed, and a warning if the Worker could not save the value
  (Worker answers ok even when its KV write fails, e.g. daily cap).
- Runs on browser start and on extension reload, not only on the alarm.
- Still requires Chrome running and the Mac awake (nothing runs during sleep).
- Background requests are untested against Cloudflare at release time; verify via the popup.

### v1.1.0
- `ALARM_PERIOD_MINUTES`: 4 → 1. Chrome's practical floor for a
  repeating alarm is 0.5-1 minute depending on packed/unpacked state;
  1 minute is the safe, portable choice. Paired with the Creation's
  tightened 90-sec poll (v1.2.2), worst-case end-to-end staleness is
  now ~2.5 min instead of ~8-10 min.
- No change to push-on-tab-load/refresh behavior — still pushes
  immediately in addition to the alarm cadence.

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
