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
# → {"ok":true,"version":"3.0.0","store":"cloudflare-kv"}

curl "https://claude-usage-relay.<your-subdomain>.workers.dev/usage?key=r1proxy9k2m"
# → {"error":"no data pushed yet",...}  (expected until extension pushes)
```

### 6. Update the extension + R1
- In the extension popup: change Relay URL to your new `workers.dev` URL
- I'll update `PROXY_URL` in `index.html` and push a new QR for the R1

## Future deploys
```bash
cd ~/claude-usage-r1/worker
wrangler deploy
```
That's it — KV data and secrets persist across redeploys.
