# Claude Usage Monitor — Rabbit R1 Creation

A native Rabbit R1 Creation that shows your Claude.ai **5-hour session** and
**weekly** usage limits at a glance — a Chrome extension reads the numbers
from inside your logged-in browser tab and relays them to your R1, so you
never have to tab over or click the extension icon manually.

Built to the real R1 constraints: 240×282px portrait screen, scroll-wheel +
PTT-button navigation, `creationStorage` for on-device persistence. No
frameworks, no build step for the Creation itself — plain HTML/CSS/JS, same
pattern as the community R1 creations.

## How it works

```
┌──────────────┐   reads via   ┌───────────┐
│ Chrome ext.  │──────────────►│ claude.ai │   (real browser session,
│ (content.js) │◄──────────────│  usage    │    passes Cloudflare fine)
└──────┬───────┘   usage JSON  └───────────┘
       │ POST /push
       ▼
┌──────────────┐
│  Your relay  │   (small Express server, no build step)
│ (server.js)  │
└──────┬───────┘
       │ GET /usage
       ▼
┌──────────────┐
│  R1 device   │   (polls every ~5 min, shows session + weekly %)
│ (index.html) │
└──────────────┘
```

### Why this shape, not a simpler server-side fetch

The first version of this had the relay itself fetch claude.ai's usage
endpoint directly, server-side. **That doesn't work**: claude.ai's internal
usage API sits behind Cloudflare bot protection that challenges requests
not coming from an already-authenticated real browser session. A
datacenter server making a cold outbound request — no matter how
browser-like its headers look, and regardless of whether the session key
itself is valid — gets served a Cloudflare JavaScript challenge page
instead of real data. This isn't a bug to fix with better headers; it's
what Cloudflare's protection is specifically designed to do.

The fix is to read the data from **inside a real, already-trusted browser
session** instead: a small Chrome extension's content script runs on the
`claude.ai` page itself, inherits that page's trusted session, and its
`fetch()` calls go through exactly the way the page's own Settings → Usage
panel's calls do — because that's literally the same code path. The
extension then pushes the result to your relay, which just holds the last
value for the R1 to read. The relay never talks to claude.ai and never
holds a session key.

## ⚠️ Important caveats — read before relying on this

- **Unofficial endpoints.** `claude.ai/api/organizations/*/usage` is an
  internal endpoint of the claude.ai web app, not part of the public,
  documented Claude API. Confirmed live and working as of 2026-08-24 via
  direct inspection, but it can change shape or break without notice.
- **Requires a browser open somewhere.** The extension only pushes fresh
  data when it can reach an open `claude.ai` tab (any tab, doesn't need to
  be focused/active) — either because you have one open, or because its
  periodic alarm can message an existing one. If no `claude.ai` tab is open
  anywhere, the R1 will show increasingly stale data (visible via the
  relay's `ageSeconds` field) until you open one again.
- **This is a personal convenience tool**, not something to run at scale,
  publish to the Chrome Web Store, or distribute with your relay URL/secret
  baked in for other people to use.

## Repo layout

```
index.html          — the R1 Creation itself (self-contained, no build step)
proxy/
  server.js          — small Express relay: POST /push, GET /usage
  package.json
  render.yaml         — Render Blueprint (deploy config)
extension/
  manifest.json        — Chrome extension (Manifest V3)
  content.js            — runs on claude.ai, reads usage, reports to background
  background.js         — periodic alarm + pushes to relay
  popup.html/popup.js    — settings UI (relay URL, shared secret) + status
  icon128.png
CHANGELOG.md         — version history for all three components
README.md            — this file
```

## Versioning

Each component versions independently — see [`CHANGELOG.md`](./CHANGELOG.md):
- **Creation**: `index.html`'s `<title>`, on-screen version tag, and
  `APP_VERSION` constant.
- **Relay**: `proxy/package.json`, echoed by `/health` and `/usage` as
  `proxyVersion`.
- **Extension**: `extension/manifest.json`.

## Setup

### 1. Deploy the relay

Any Node host works (Render, Railway, Fly.io, a Raspberry Pi on your LAN).
With Render's free tier, using the included `render.yaml` Blueprint:

1. Push this repo to GitHub.
2. On Render: **New → Blueprint** → select this repo. It reads
   `render.yaml` and configures the service automatically (root directory
   `proxy/`, build `npm install`, start `npm start`).
3. Set the one required environment variable:
   - `PROXY_SHARED_SECRET` — any random string you make up. This is the
     only secret in the whole system now — no session key touches the
     server at all.
4. Deploy. Test it:
   ```bash
   curl "https://your-app.onrender.com/health"
   # → {"ok":true,"version":"2.0.0"}

   curl "https://your-app.onrender.com/usage?key=YOUR_SHARED_SECRET"
   # → {"error":"no data pushed yet", ...}  (expected until the extension pushes once)
   ```

**Free-tier note:** Render's free web services spin down after 15 minutes
of no inbound traffic and take up to a minute to wake on the next request.
The extension pushes every ~4 minutes and the R1 polls every ~5, so in
practice the service should stay warm during normal use; a longer gap (R1
off overnight, browser closed) just means the next request is a bit slower
to wake it, not broken.

### 2. Install the Chrome extension

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** → select the `extension/` folder from this repo.
4. Click the extension's icon in your toolbar → enter:
   - **Relay server URL**: `https://your-app.onrender.com`
   - **Shared secret**: the same `PROXY_SHARED_SECRET` you set on Render
   - Click **Save**.
5. Open (or refresh) a `claude.ai` tab. Within a few seconds the popup
   should show "Last push OK" with your real session/weekly percentages.

The extension pushes automatically from then on — every ~4 minutes via its
background alarm, plus immediately whenever a `claude.ai` tab loads or its
usage panel is refreshed. You don't need to click anything day-to-day.

### 3. Point the R1 Creation at your relay

Edit `index.html`, find:

```js
const PROXY_URL = ''; // <-- SET THIS after deploying the relay
```

Set it to your relay's `/usage` endpoint with the shared secret:

```js
const PROXY_URL = 'https://your-app.onrender.com/usage?key=YOUR_SHARED_SECRET';
```

Commit this to your own repo. If you're keeping the repo public, be aware
this bakes your relay URL and secret into a public file's git history —
acceptable for a low-stakes personal shared-secret, but rotate it if that
ever bothers you, or keep the repo private.

### 4. Install on your R1

1. Host `index.html` somewhere static — GitHub Pages works:
   ```bash
   # In the repo's GitHub Settings → Pages, set source to the main branch, root.
   ```
   Your creation will be live at `https://<you>.github.io/<repo>/`.
2. Generate an install QR code. **Important**: the R1's QR installer
   expects a JSON payload, not a bare URL:
   ```json
   {"title":"Claude Usage","url":"https://<you>.github.io/<repo>/","description":"...","iconUrl":"","themeColor":"#FF6A00"}
   ```
   Encode that JSON string (not just the URL) into a QR code — a plain
   URL-only QR will be rejected as "invalid" by the R1.
3. On your R1: open the **camera** → scan → **Install**.

## Using the R1 Creation

- **Scroll wheel** — move focus between Session and Weekly cards
- **Click (PTT button)** — open Settings
- **Long-press on main screen** — force an immediate pull from the relay
- In Settings: **scroll** to pick a row, **hold PTT + scroll** to adjust a
  value manually (useful fallback if the relay has no data yet), **click
  Back** to save and return

Color coding: green under 50%, yellow 50–80%, red 80%+.

## Troubleshooting

- **R1 shows placeholder/stale numbers** → check the extension popup for
  "Last push" status. If it says no push yet, open a `claude.ai` tab. If
  push is failing, confirm the relay URL and shared secret match exactly
  between the extension popup and Render's `PROXY_SHARED_SECRET`.
- **`{"error":"no data pushed yet"}` from `/usage`** → expected until the
  extension's first successful push; open claude.ai with the extension
  installed and active.
- **Relay seems slow to respond** → likely Render's free-tier cold start
  (up to ~60s after 15 min idle). Not an error, just a wake-up delay.

## License

MIT — do whatever you want with this, no warranty. See the caveats above
before depending on it for anything important.
