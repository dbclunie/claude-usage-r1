# Claude Usage Monitor — Rabbit R1 Creation

A Rabbit R1 Creation that shows your Claude.ai **5-hour session** and **weekly** usage
limits at a glance. A Chrome extension fetches the numbers from claude.ai in the background using your
logged-in browser session (no claude.ai tab needed) and sends them to a small Cloudflare Worker;
the R1 polls the Worker.

Built to the real R1 constraints: 240×282px portrait screen, scroll-wheel + PTT-button
navigation, `creationStorage` for on-device persistence. Plain HTML/CSS/JS, no build step.

## What you see on the R1

- **Session (5h)** and **Weekly** cards: big % used, bar (green < 50%, yellow 50–80%, red 80%+),
  "% left" and "resets in …".
- **Last updated** — when the extension last pushed data. Amber when under 15 min old.
- **Sync status** — green `sync OK <time>`, or red `sync FAIL <time>` with the actual error underneath.
- **Version tag** (top-right) — tap/click it to open **What's New** (full version history).
- **Settings** (PTT click): manual Session/Weekly values (fallback), **Theme**, Back.
- **Themes (9):** Dark, Light, Volcanic Desert, Desert Orange, Plains Yellow, Forest Green,
  Blues Ocean, Midnight Tundra, Twilight Alpine. Choice persists across sessions.

| Control | Main screen | Settings / lists |
|---|---|---|
| Scroll wheel | move focus | move / scroll |
| PTT click | open Settings | select / back |
| Long-press | force an immediate sync | on Theme picker: go back; elsewhere: hold + scroll to adjust a value |

## How it works

```
┌────────────────┐  reads usage   ┌───────────┐
│ Chrome ext.    │───────────────►│ claude.ai │  (your logged-in browser —
│ (content.js)   │◄───────────────│  /usage   │   passes Cloudflare's checks)
└───────┬────────┘                └───────────┘
        │ POST /push  (~every 1 min)
        ▼
┌────────────────┐
│ Cloudflare     │  KV store, always-on, free tier
│ Worker         │
└───────┬────────┘
        │ GET /usage  (R1 polls every 90 s)
        ▼
┌────────────────┐
│ R1 Creation    │
│ (index.html)   │
└────────────────┘
```

**Why not fetch claude.ai from a server?** claude.ai's usage endpoint sits behind Cloudflare
bot protection. A server-side request (tested from Render) gets a JavaScript challenge page
(`cf-mitigated: challenge`) instead of data, regardless of headers or a valid session key.
Reading from inside your real, logged-in browser avoids that. v1.2.0 does this from the
extension's background worker; whether Cloudflare accepts that request is verified in the popup, and the
extension falls back to an open claude.ai tab if it doesn't.

### Timing

| Step | Interval |
|---|---|
| Extension → Worker | every 1 min, plus on each claude.ai page load |
| Worker → KV write | only when a value changes, or every 5 min (heartbeat) |
| R1 ← Worker | every 90 s; long-press forces it |

Worst case from a real usage change to the R1 is about 2.5 min (up to ~3.5 min if KV propagation
is slow). "Last updated" can lag up to 5 min when your usage hasn't changed — the numbers aren't stale.

## ⚠️ Caveats — read before relying on this

- **Needs Chrome running and the Mac awake.** No claude.ai tab is required (v1.2.0), but nothing
  runs while the Mac sleeps or Chrome is closed; the R1 keeps showing the last value. Keep the Mac
  awake on power if you want continuous updates (e.g. `caffeinate -s`). If claude.ai blocks the
  background request, the extension falls back to needing an open claude.ai tab.
- **Unofficial endpoint.** `claude.ai/api/organizations/{org}/usage` is internal to the web app,
  not a documented API. It can change or break without notice.
- **Cloudflare KV free tier: 1,000 writes/day** (100K reads/day). The Worker dedupes writes to
  stay under it (v3.1.0). Writing on every push exceeded the cap and triggered Cloudflare's
  "90% of daily limit" email.
- **Shared secret is in the public repo.** `PROXY_URL` in `index.html` contains it. Reads leak
  nothing sensitive, but anyone with it could post fake numbers to your Worker. Fine for a
  personal tool; rotate it (`wrangler secret put PROXY_SHARED_SECRET`) or make the repo private if
  it bothers you.
- **Personal tool.** Don't publish the extension or distribute it with your URL/secret baked in.

## Repo layout

```
index.html, index-v<ver>.html   R1 Creation (the versioned copy is what the R1 installs)
manifest.json, sw.js, icons/    PWA files (phones/browsers; the R1 does not use the service worker)
worker/                          Cloudflare Worker relay (index.js, wrangler.toml, README.md)
extension/                       Chrome extension (Manifest V3)
CHANGELOG.md                     History for Creation, Worker, Extension (+ retired Render relay)
```

## Setup

### 1. Deploy the Worker (~5 min, free)

See [`worker/README.md`](./worker/README.md). Summary:

```bash
brew install node && npm install -g wrangler && wrangler login
cd worker
wrangler kv namespace create USAGE_KV            # paste the id into wrangler.toml
wrangler kv namespace create USAGE_KV --preview  # paste the preview_id
wrangler secret put PROXY_SHARED_SECRET          # any random string
wrangler deploy                                  # prints https://claude-usage-relay.<you>.workers.dev
```

Check `https://<worker-url>/health` → `{"ok":true,"version":"3.1.0",...}`.

### 2. Install the Chrome extension

1. Clone the repo to a **permanent** path and never move it:
   `git clone https://github.com/<you>/<repo>.git ~/claude-usage-r1`
2. `chrome://extensions` → Developer mode → **Load unpacked** → select the `extension` folder itself.
3. Click the extension icon → enter **Relay URL** (`https://<worker-url>`, no path) and the **shared secret** → Save.
4. Make sure you're logged in to claude.ai in that Chrome. Within a minute the popup should show
   "Last push OK ... (via background fetch)". If it says "via open claude.ai tab", the background
   fetch was blocked (reason shown) and you need to keep a claude.ai tab open.

Settings are stored per extension identity: moving the folder or removing/re-adding the extension
**clears them**, so re-enter the URL and secret. Update with `git pull`, then click the reload icon on the extension card.

### 3. Point the Creation at your Worker

In `index.html`:

```js
const PROXY_URL = 'https://<worker-url>/usage?key=<SHARED_SECRET>';
```

### 4. Host and install on the R1

1. Host the repo on GitHub Pages (Settings → Pages → `main` branch, root).
2. Copy `index.html` to `index-v<version>.html` and commit both (see "Updating" below).
3. Generate an install QR from this **JSON payload** — a bare URL is rejected by the R1 as "invalid":
   ```json
   {"title":"Claude Usage","url":"https://<you>.github.io/<repo>/index-v<version>.html","description":"Session and weekly Claude usage monitor","iconUrl":"https://<you>.github.io/<repo>/icons/icon-192.png","themeColor":"#FF6A00"}
   ```
4. On the R1: camera → scan → Install.

### Updating the Creation

The R1 caches the page. Query-string cache-busting (`?v=…`) does **not** work (GitHub Pages' CDN
can ignore query strings). The reliable way:

1. Edit `index.html`, bump `APP_VERSION`, `<title>`, and the in-app `CHANGELOG` list.
2. Copy it to `index-v<new-version>.html`; delete the previous versioned file.
3. Make a QR pointing at the new filename.
4. **Uninstall the old card on the R1 first**, then scan.

## Troubleshooting

Read the R1's **sync status line** first:

| What you see | Meaning / fix |
|---|---|
| green `sync OK`, but "Last updated" is old | Extension isn't pushing: Chrome closed or Mac asleep (nothing runs during sleep). Check the extension popup. |
| popup: "Background fetch failed (Cloudflare challenge ...)" | Background request blocked; it falls back to an open claude.ai tab, so keep one open. |
| popup: "Worker could not save it" | Worker's KV write failed (e.g. daily cap). It resets at 00:00 UTC. |
| red `Failed to fetch` | R1 can't reach the Worker (network, wrong URL). |
| red `timeout (8s)` | Request hanging. |
| red `HTTP 401` | Secret mismatch between `PROXY_URL` and the Worker. |
| red `HTTP 404` | Worker has no data yet — open claude.ai with the extension active. |
| no status line / old version tag | The R1 is running an older install. Uninstall and rescan the latest QR. |

Other known issues:
- **Extension popup is empty after moving the folder** — expected; re-enter URL + secret.
- **Cloudflare "KV operations nearing the daily cap" email** — expected only on Worker < 3.1.0. Confirm `/health` says 3.1.0+.
- **R1 stuck on old data after a relay change** — fixed in Creation 1.4.4/1.4.5 (a service worker was caching relay responses; the R1 no longer uses one).
- **Dropping Chrome entirely:** not possible without a stored session key/credential that fetches claude.ai itself. A Worker would likely hit the same Cloudflare challenge. Anthropic's terms bar using plan OAuth tokens in other tools, so the OAuth usage route is not used.

## Versioning

Components version independently — see [`CHANGELOG.md`](./CHANGELOG.md). Creation: `APP_VERSION` in
`index.html`. Worker: `VERSION` in `worker/index.js`. Extension: `extension/manifest.json`.

## License

Copyright (c) 2026 David Clunie. All rights reserved. This source code is proprietary and
confidential; it may not be reproduced, distributed, or used to create derivative works without
written permission from the copyright holder.
