# Claude Usage Relay — Cloudflare Worker

Replaces the Render/Express relay. Always-on, no cold starts, persistent KV storage, free tier.

## One-time setup (~5 min)

### 1. Install Wrangler
```bash
npm install -g wrangler
wrangler login   # opens browser → log in with your Cloudflare account
```

### 2. Create the KV namespace
```bash
cd ~/claude-usage-r1/worker
wrangler kv namespace create USAGE_KV
wrangler kv namespace create USAGE_KV --preview
```
Each command prints an `id`. Paste both into `wrangler.toml`:
```toml
[[kv_namespaces]]
binding    = "USAGE_KV"
id         = "abc123..."          # from first command
preview_id = "def456..."          # from --preview command
```

### 3. Set the shared secret
```bash
wrangler secret put PROXY_SHARED_SECRET
# prompts you to type the value — use: r1proxy9k2m
```

### 4. Deploy
```bash
wrangler deploy
```
You'll get a URL like `https://claude-usage-relay.<your-subdomain>.workers.dev`

### 5. Test
```bash
curl https://claude-usage-relay.<your-subdomain>.workers.dev/health
# → {"ok":true,"version":"3.1.0","store":"cloudflare-kv"}

curl "https://claude-usage-relay.<your-subdomain>.workers.dev/usage?key=r1proxy9k2m"
# → {"error":"no data pushed yet",...}  (expected until extension pushes)
```

### 6. Update the extension + R1
- In the extension popup: change Relay URL to your new `workers.dev` URL
- In `index.html` set `PROXY_URL = 'https://<worker-url>/usage?key=<SECRET>'`, then reinstall the Creation on the R1 (see the main README)

## Future deploys
```bash
cd ~/claude-usage-r1/worker
wrangler deploy
```
That's it — KV data and secrets persist across redeploys.

## Free-tier budget (KV)
Cloudflare KV free tier: 100,000 reads/day, **1,000 writes/day**.
The extension pushes ~every minute, so v3.0.0 (write on every push) exceeded the
write cap (~1,440+/day). v3.1.0 writes only when the value changes or every 5 min
(~288 heartbeat writes/day max + real changes). If a KV op fails, the Worker
serves the last value from memory best-effort.
Trade-off: the "Last updated" time can lag by up to 5 min when values are unchanged.
