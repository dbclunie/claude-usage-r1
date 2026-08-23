# Claude Usage Monitor — Rabbit R1 Creation

A native Rabbit R1 Creation that shows your Claude.ai **5-hour session** and
**weekly** usage limits at a glance, plus a small proxy server that fetches
the numbers on your behalf.

Built to the real R1 constraints: 240×282px portrait screen, scroll-wheel +
PTT-button navigation, `creationStorage` for on-device persistence. No
frameworks, no build step — plain HTML/CSS/JS, same pattern as the
community R1 creations.

## How it works

```
┌─────────────┐      HTTPS       ┌──────────────┐      Cookie auth      ┌───────────┐
│  R1 device  │ ───────────────► │  Your proxy  │ ────────────────────► │ claude.ai │
│ (index.html)│ ◄─────────────── │  (server.js) │ ◄──────────────────── │  (web)    │
└─────────────┘   clean JSON     └──────────────┘    usage JSON         └───────────┘
```

Your `sessionKey` lives **only** on the proxy server (as an environment
variable), never on the R1 device and never in this repo. The R1 fetches a
small, sanitized JSON payload from your proxy every 5 minutes (and on
long-press).

## ⚠️ Important caveats — read before relying on this

- **Unofficial endpoints.** `claude.ai/api/organizations/*/usage` is an
  internal endpoint of the claude.ai web app, not part of the public,
  documented Claude API. It can change shape or break without notice.
- **Session keys expire.** You'll need to refresh `CLAUDE_SESSION_KEY` on
  your proxy periodically (typically every few weeks, or after logging out
  elsewhere).
- **Treat your session key like a password.** It grants full access to your
  Claude.ai account. Only ever put it in the proxy's environment variables
  (or a local `.env` you don't commit) — never in client-side code, never
  in this repo, never in a public deployment without the shared-secret
  option enabled.
- **This is a personal convenience tool**, not something to run at scale or
  distribute with your key baked in.

## Repo layout

```
index.html          — the R1 Creation itself (self-contained, no build step)
proxy/
  server.js         — small Express server, fetches usage server-side
  package.json
CHANGELOG.md         — version history for both components
README.md            — this file
```

## Versioning

The Creation and the proxy are versioned independently:

- **Creation** version lives in `index.html`'s `<title>`, the on-screen
  version tag, and the `APP_VERSION` constant near the top of the
  `<script>` block. Bump it on every change and keep all three in sync.
- **Proxy** version lives in `proxy/package.json` and is echoed back by
  `/health` and every `/usage` response as `proxyVersion`, so you can
  confirm which build the R1 is actually talking to.

See [`CHANGELOG.md`](./CHANGELOG.md) for history.

## 1. Deploy the proxy

Any Node host works (Render, Railway, Fly.io, a Raspberry Pi on your LAN,
etc). Example with Render's free tier:

1. Push this repo to GitHub (see below).
2. On Render: New → Web Service → connect this repo → root directory
   `proxy/`.
3. Build command: `npm install`. Start command: `npm start`.
4. Add environment variables:
   - `CLAUDE_SESSION_KEY` — your session key (see below for how to get it)
   - `PROXY_SHARED_SECRET` — any random string you make up (protects your
     proxy URL from randoms if it leaks)
5. Deploy. Test it:
   ```
   curl "https://your-app.onrender.com/usage?key=YOUR_SHARED_SECRET"
   ```
   If you get `session`/`weekly` objects back, it's working. If you get
   `raw_keys_seen` with no `session`/`weekly`, hit `/debug/raw` (same query
   param) to see the actual field names claude.ai returned, then adjust
   `normalizeUsage()` in `server.js` — the field names aren't officially
   documented and may not match on the first try.

### Getting your session key

1. Log into claude.ai in a desktop browser.
2. Open DevTools → Application (Chrome) or Storage (Firefox) → Cookies →
   `https://claude.ai`.
3. Copy the value of the `sessionKey` cookie (starts with `sk-ant-sid01-`).
4. Paste it as the `CLAUDE_SESSION_KEY` env var on your proxy host. Never
   paste it into the R1 creation or this repo.

## 2. Point the R1 Creation at your proxy

Edit `index.html`, find:

```js
const PROXY_URL = ''; // <-- SET THIS after deploying the proxy
```

Set it to your deployed proxy's `/usage` endpoint, including the shared
secret if you set one:

```js
const PROXY_URL = 'https://your-app.onrender.com/usage?key=YOUR_SHARED_SECRET';
```

Commit that change (to your **own** fork/repo — don't put your real secret
in a public repo's history; use a private repo if you're hardcoding it, or
better, fetch it from a config screen — see "Ideas for improvement" below).

## 3. Install on your R1

1. Host `index.html` somewhere static (GitHub Pages works — see below).
2. Generate a QR code pointing at the hosted URL. The
   [`rabbit-hmi-oss/creations-sdk`](https://github.com/rabbit-hmi-oss/creations-sdk)
   repo's `qr/` tool does this, or any QR generator works — it just needs
   to encode your hosted URL.
3. On your R1: open the **creations** card → **add via QR code** → scan.
4. It installs as a card in your stack.

### Hosting `index.html` on GitHub Pages

```bash
# from the repo root, after pushing to GitHub
git checkout -b gh-pages
git push origin gh-pages
```
Then in the repo's Settings → Pages, set source to the `gh-pages` branch.
Your creation will be live at `https://<you>.github.io/<repo>/index.html`.

## Using the R1 Creation

- **Scroll wheel** — move focus between Session and Weekly cards
- **Click (PTT button)** — open Settings
- **Long-press on main screen** — force an immediate sync with the proxy
- In Settings: **scroll** to pick a row, **hold PTT + scroll** to adjust a
  value manually (useful if the proxy is briefly unavailable), **click
  Back** to save and return

Color coding: green under 50%, yellow 50–80%, red 80%+.

## Ideas for improvement (not implemented)

- Config screen on-device to paste the proxy URL instead of hardcoding it
  (avoids committing your URL/secret to git at all)
- Push notifications at 80%/95% thresholds (would need R1 SDK notification
  support — not used here)
- Per-model (Opus/Sonnet) breakdown if your proxy's `/debug/raw` shows
  those fields are available

## License

MIT — do whatever you want with this, no warranty. See the caveats above
about the unofficial endpoints before depending on it for anything
important.
