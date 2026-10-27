# Fordnet — Zcash network intelligence + public REST API

ZECATHON · Core & Tooling track. Live: **https://fordnet.vercel.app**

> ⚠️ **Data is currently MOCKED.** No Zcash node was reachable when this was built (no credentials were provided and no public, keyless Zcash JSON-RPC endpoint responded). Fordnet then uses a deterministic `MockRpcClient` that implements the same `ZcashRpc` interface as the live client. The UI shows a **MOCKED DATA** banner and every API response sets `meta.mocked: true`. Set `ZCASH_RPC_URL` (+ user/pass) and the same code serves real chain data.

Fordnet reports only public protocol data. Shielded amounts and parties are not inferred.

## Features
- **Dashboard** `/`: sync pill (green = last block < 2 min old, amber = lagging, red = node unreachable → last snapshot with timestamp), headline cards (height, hashrate, last block age, txs in last block), recent blocks, pool-value chart (7D/30D/All, exact tooltips, series toggles, "view as table", source + last updated), privacy note, collapsible raw JSON.
- **Search**: persistent header search (`/` focuses it on desktop; `/search` autofocuses on mobile). Detects height, 64-hex (tries block then tx, ordered by a leading-zeros hint), t1/t3 addresses; explains shielded/unified addresses and malformed input.
- **Detail pages**: `/block/[id]`, `/tx/[txid]` (shielded parts shown as counts only), `/address/[taddr]` (transparent balance + recent txs; shielded activity not visible).
- **Developers** `/developers`: quick start, one-click API key (shown once; only SHA-256 hash stored), endpoint reference, copyable curl.
- Mobile-first (verified no horizontal scroll at 380px), dark-first with light theme, single accent `#3EE08F`, mono for hashes/numbers, visible focus rings, skip link, `prefers-reduced-motion`, skeletons sized to content (no layout shift), copy-to-clipboard with toasts.

## Setup
Requires Node 24 (Vercel's current runtime; `better-sqlite3@12`) and pnpm.
```bash
cp .env.example .env.local     # fill ZCASH_RPC_* or leave empty for MOCKED mode
pnpm install
pnpm ingest:once               # optional: seed DB (last 100 blocks + 90 days of pool snapshots)
pnpm dev                       # http://localhost:3000
pnpm ingest                    # long-running worker: polls RPC every 60s
pnpm test                      # vitest: input detector + rate limiter
pnpm build
```

### Environment variables (server-side only)
| Var | Purpose |
|---|---|
| `ZCASH_RPC_URL` | zcashd/Zebra JSON-RPC URL. Empty → MOCKED client |
| `ZCASH_RPC_USER`, `ZCASH_RPC_PASS` | Basic-auth credentials |
| `ZCASH_MOCK` | `1` forces mock even with a URL |
| `DATABASE_PATH` | SQLite file (default `./data/fordnet.db`; `/tmp/fordnet.db` on Vercel) |
| `KEY_SIGNING_SECRET` | HMAC secret embedded in API keys (lets any serverless instance verify a key) |
| `CRON_SECRET` | Bearer token Vercel Cron sends to `/api/cron/ingest` |

Node notes: address pages need zcashd `-insightexplorer` (`getaddressbalance`/`getaddressdeltas`), arbitrary tx lookups need `-txindex`. If a node doesn't report something, Fordnet stores `null` and shows "not reported".

## Architecture
```
            ┌──────────────────────┐   JSON-RPC (5s timeout, 1 retry)
            │ Zcash node (zcashd / │◄──────────────────────────────┐
            │ Zebra) — or MockRpc  │                               │
            └──────────┬───────────┘                               │
     getblockchaininfo │ getblock(v2) getnetworksolps getmininginfo│
                       ▼                                           │
 ┌───────────────────────────────┐        ┌────────────────────────┴──────┐
 │ Ingest (src/lib/ingest.ts)    │        │ Service layer (src/lib/       │
 │  • pnpm ingest  (every 60s)   │        │ service.ts) live RPC first,   │
 │  • /api/cron/ingest (Vercel)  │        │ falls back to last snapshot   │
 │  • lazy ensureFresh() on read │        └───────┬──────────────┬────────┘
 └──────────────┬────────────────┘                │              │
                ▼                                 ▼              ▼
 ┌──────────────────────────────────┐   ┌───────────────┐ ┌──────────────────────┐
 │ SQLite via Drizzle (src/db)      │◄──│ Next.js pages │ │ /api/v1/* route      │
 │ blocks · status_snapshots ·      │   │ (RSC + Suspense│ │ handlers: x-api-key, │
 │ pool_snapshots · api_keys(hash) ·│   │ skeletons)    │ │ 200/day limit, zod,  │
 │ rate_limits · meta               │◄──┴───────────────┘ │ 30s cache, envelope  │
 └──────────────────────────────────┘◄────────────────────┴──────────────────────┘
```
Key files: `src/lib/rpc.ts` (interface + HTTP + mock clients), `src/lib/mock.ts`, `src/lib/ingest.ts`, `src/lib/service.ts`, `src/lib/detect.ts`, `src/lib/ratelimit.ts`, `src/lib/apikeys.ts`, `src/lib/api.ts`, `src/db/schema.ts`, `src/app/**`.

Pool history: each ingest writes today's snapshot from the tip block's `valuePools`, and backfills up to 90 past UTC days by reading `valuePools` from one block per day (`tip − d × 1152`), so history is real chain data from the node, not interpolated.

## API v1
All responses: `{ "data": …, "meta": { mocked, cached, generatedAt, source }, "error": null | { code, message } }`. Header `x-api-key` required. 200 requests/UTC day per key → `429` + `Retry-After`; `X-RateLimit-*` headers; `Cache-Control: private, max-age=30` + 30s server cache.

| Method & path | Notes |
|---|---|
| `POST /api/keys` | body `{label?}` → key shown once (no auth; 10/day per IP) |
| `GET /api/v1/network/status` | sync state, height, hashrate, difficulty, last block, pools |
| `GET /api/v1/blocks?limit=20` | 1–50 |
| `GET /api/v1/blocks/{heightOrHash}` | block + per-tx public summary |
| `GET /api/v1/tx/{txid}` | public fields; shielded = counts |
| `GET /api/v1/address/{taddr}` | t1/t3 only |
| `GET /api/v1/pools/history?range=7d\|30d\|all` | daily ZEC per pool |

Errors: 400 bad input (clear message), 401 missing/invalid key, 404 not found, 429 rate limited, 503 node unreachable.
```bash
KEY=$(curl -s -XPOST https://fordnet.vercel.app/api/keys -H 'content-type: application/json' -d '{}' | jq -r .data.key)
curl -s -H "x-api-key: $KEY" https://fordnet.vercel.app/api/v1/network/status | jq
curl -s -H "x-api-key: $KEY" "https://fordnet.vercel.app/api/v1/pools/history?range=7d" | jq
```

## Deployment (Vercel)
Deployed with the Vercel CLI (`engines.node = 24.x`). `vercel.json` registers a daily cron on `/api/cron/ingest` (Hobby plan allows daily crons only); in addition every read calls `ensureFresh()` which re-ingests when data is > 60s old, so the site stays current without an always-on worker.

**Known MVP limitation:** on Vercel the SQLite file lives in each function instance's `/tmp`, so it is per-instance and ephemeral. API keys still verify everywhere (HMAC tag), but rate-limit counters and snapshots are per instance. For production: point Drizzle at Neon Postgres (or Turso) and run `pnpm ingest` on an always-on host (Fly/Railway) or a per-minute cron on Vercel Pro.

To go live: `vercel env add ZCASH_RPC_URL production` (+ `ZCASH_RPC_USER`, `ZCASH_RPC_PASS`) pointing at a node reachable from the internet, then redeploy.

## 2-minute demo script
1. **(0:00)** Open https://fordnet.vercel.app on a phone-width window. Point out the MOCKED banner (honesty), the green **Synced** pill, the four headline cards, and the privacy note.
2. **(0:20)** Expand "Raw network status" to show the exact JSON behind the cards. Note "not reported" is used whenever a node omits a field.
3. **(0:35)** Pool chart: switch 7D → 30D → All, hover for exact 8-decimal values, toggle Transparent on, click **View as table**. Show "Source / Last updated" caption.
4. **(0:55)** Press `/` (desktop), paste a block height → block page; copy the hash (toast). Click a txid → tx page: transparent ins/outs plus *counts* of Sapling/Orchard components, "amounts private".
5. **(1:15)** Search a `t1…` address → transparent balance and recent txs, with the "shielded activity is not visible" note. Search `zs1…` → explanation that shielded addresses can't be looked up by design.
6. **(1:30)** `/developers`: generate a key (shown once), copy a curl, run it in a terminal; show `400` for `?limit=99` and the `X-RateLimit-Remaining` header.
7. **(1:50)** Toggle light theme; close with what's next (Neon + always-on worker, webhooks, SDK).

See `SUBMISSION.md` for the submission blurb.
