# Fordnet — Zcash network intelligence + public REST API

ZECATHON · Core & Tooling track. Live: **https://fordnet.vercel.app** · Source: **https://github.com/onlysniper447-stack/fordnet**

> ℹ️ **Live mainnet data** via `ZCASH_RPC_URL`. Without it, Fordnet falls back to MOCKED mode: No Zcash node was reachable when this was built (no credentials were provided and no public, keyless Zcash JSON-RPC endpoint responded). Fordnet then uses a deterministic `MockRpcClient` that implements the same `ZcashRpc` interface as the live client. The UI shows a **MOCKED DATA** banner and every API response sets `meta.mocked: true`. Set `ZCASH_RPC_URL` (+ user/pass) and the same code serves real chain data.

Fordnet reports only public protocol data. Shielded amounts and parties are not inferred.

## Features
- **Navigation**: top-left menu (accessible slide-in drawer: focus trap, Esc to close, focus return, active route) grouping Tools, Analytics, API and Products.
- **Analytics** `/analytics`: network status and pool history on one page. Pool chart defaults to **Per pool** small multiples (each pool on its own y-axis, with current value and change over range), with a **Stacked** view and an accessible table.
- **HTTP semantics**: malformed block/tx/address ids return **400** (middleware rewrite to a friendly page); well-formed but unknown ids return **404**.
- **Homepage** `/`: what Fordnet does, the problems it addresses, a live network strip and a live API response from the same service, architecture, privacy commitment and roadmap (labelled planned). No invented numbers.
- **Dashboard** `/dashboard`: sync pill (green = last block < 5 min old, amber = lagging, amber/red = provider rate-limited, provider errors or unreachable → stored data with timestamp), headline cards (height, hashrate, last block age, txs in last block), recent blocks, pool-value chart (7D/30D/All, exact tooltips, series toggles, "view as table", source + last updated), privacy note, collapsible raw JSON.
- **Search**: persistent header search (`/` focuses it on desktop; `/search` autofocuses on mobile). Detects height, 64-hex (tries block then tx, ordered by a leading-zeros hint), t1/t3 addresses; explains shielded/unified addresses and malformed input.
- **Detail pages**: `/block/[id]`, `/tx/[txid]` (shielded parts shown as counts only), `/address/[taddr]` (transparent balance + recent txs; shielded activity not visible).
- **Developers** `/developers`: quick start, one-click API key (shown once; only SHA-256 hash stored), endpoint reference, copyable curl.
- Mobile-first (verified no horizontal scroll at 380px), dark-first with light theme, single accent `#3EE08F`, mono for hashes/numbers, visible focus rings, skip link, `prefers-reduced-motion`, skeletons sized to content (no layout shift), copy-to-clipboard with toasts.

## Setup
Requires Node 24 and pnpm, plus a Postgres `DATABASE_URL` (Neon). Note: Vercel marks the Neon integration vars as Sensitive, so `vercel env pull` returns them redacted; copy the connection string from the Neon console into `.env.local`.
```bash
cp .env.example .env.local     # fill ZCASH_RPC_* or leave empty for MOCKED mode
pnpm install
pnpm db:push                   # optional: create/evolve tables with drizzle-kit (also auto-created at runtime)
pnpm ingest:once               # seed DB (last 100 blocks + up to 30 days of pool snapshots)
pnpm dev                       # http://localhost:3000
pnpm ingest                    # long-running worker: ingests every 5 min
pnpm test                      # vitest: input detector + rate limiter
pnpm build
```

### Environment variables (server-side only)
| Var | Purpose |
|---|---|
| `ZCASH_RPC_URL` | zcashd/Zebra JSON-RPC URL. Empty → MOCKED client |
| `ZCASH_RPC_URL_FALLBACK` | Optional second JSON-RPC URL, used automatically when the primary times out or returns 429/503 |
| `ZCASH_RPC_TIMEOUT_MS` | Per-call timeout (default 8000) |
| `ZCASH_RPC_USER`, `ZCASH_RPC_PASS` | Basic-auth credentials |
| `ZCASH_MOCK` | `1` forces mock even with a URL |
| `DATABASE_URL` | Neon Postgres connection string (required) |
| `FORDNET_DATABASE_URL` / `FORDNET_DATABASE_URL_UNPOOLED` | Preferred Neon connection (store `fordnet-db-2`, connected with env prefix `FORDNET_`); falls back to `DATABASE_URL` |
| `DATABASE_URL_UNPOOLED` | Direct connection used by drizzle-kit |
| `KEY_SIGNING_SECRET` | HMAC secret embedded in API keys (lets any serverless instance verify a key) |
| `CRON_SECRET` | Bearer token Vercel Cron sends to `/api/cron/ingest` |

Node notes: address pages need zcashd `-insightexplorer` (`getaddressbalance`/`getaddressdeltas`), arbitrary tx lookups need `-txindex`. If a node doesn't report something, Fordnet stores `null` and shows "not reported".

## Architecture
```
 ┌───────────────────────────┐  JSON-RPC: 8s timeout; 503 → one retry after 750ms;
 │ Zcash node (GetBlock      │  429 → never retried, throws RpcRateLimited
 │ shared Zebra) — or MockRpc│◄──────────────────────────────────────────────┐
 └─────────────┬─────────────┘                                               │
               │ only ingest + cache misses talk to the node                 │
               ▼                                                             │
 ┌──────────────────────────────────────┐   ┌────────────────────────────────┴─┐
 │ Ingest (src/lib/ingest.ts)           │   │ Service (src/lib/service.ts)     │
 │ triggers: /api/cron/ingest, pnpm     │   │ status: DB snapshot (15s memo),  │
 │   ingest, after() on page/API reads  │   │   no per-request RPC             │
 │ 1. skip if lastIngestAt < 60s or in  │   │ details: read-through rpc_cache  │
 │    provider backoff (rpcHealth)      │   │   tx 10m · block 10m · addr 60s, │
 │ 2. Postgres lease row (55s, one      │   │   stale copy served on failure   │
 │    instance at a time)               │   └──────┬──────────────┬────────────┘
 │ 3. essentials first, then blocks /   │          │              │
 │    pool backfill within time budget  │          ▼              ▼
 └──────────────┬───────────────────────┘   ┌─────────────┐ ┌──────────────────┐
                ▼                           │ Pages: / ,  │ │ /api/v1/*: key,  │
 ┌──────────────────────────────────────┐   │ /dashboard, │ │ 200/day, zod,    │
 │ Neon Postgres (Drizzle, neon-http)   │◄──│ /analytics, │ │ 30s cache,       │
 │ blocks · status_snapshots ·          │   │ details     │ │ {data,meta,error}│
 │ pool_snapshots · rpc_cache · api_keys│◄──┴─────────────┘ └──────────────────┘
 │ (hash) · rate_limits · meta (lease,  │
 │ lastIngestAt, rpcHealth)             │
 └──────────────────────────────────────┘
```
Routes: `/` is the homepage (what Fordnet is, live strip); the dashboard is at `/dashboard`; `/analytics` holds the pool chart.

### Low database compute (Neon free tier)
- Ingest runs at most once per 5 minutes (`INGEST_INTERVAL_MS`), under a 120s Postgres lease. Between ingests the status pill uses a cheap live tip check (`getblockcount`, plus one `getblock` v1 only when the tip moved), memoised 60s per instance, so "Synced" reflects the chain now.
- Stored data counts as fresh for 10 minutes (red needs > 20 minutes without success while attempts fail), so 5-minute spacing never turns the pill amber by itself.
- Per-instance memory caches keep reads off Postgres: status snapshot 60s, freshness check 60s, recent blocks 60s, pool history 5 min.
- Small cache rows: `rpc_cache` stores compact summaries only (tx pages cache the rendered summary, address pages cache just each tx height) and skips values over 128 kB. Caching raw `getrawtransaction` JSON filled 481 MB in minutes because large consolidation txs are up to ~11 MB each.
- Fewer writes: one status snapshot per ingest (kept 1 day), today's pool row rewritten at most every 6h (one row per UTC day), blocks pruned to the last 100, `rpc_cache` rows older than 1 day pruned. Idle periods let Neon compute auto-suspend.

### Ingest, lease and backoff
- Reads never wait for the node: `ensureFresh()` schedules `ingestIfDue()` with Next.js `after()`, so the response is sent first.
- `ingestIfDue` runs only when `lastIngestAt` is over 5 min old and no provider backoff is active. It then takes a single-flight lease (an upsert on the `meta` row `ingestLease`, which succeeds only if the previous lease expired, 120s), so only one instance ingests at a time across all serverless instances.
- Order: `getblockchaininfo`, `getnetworksolps`, tip block → status snapshot + `lastIngestAt` + today's pool snapshot. Then, best effort within a time budget (20s on request, 50s for `?full=1` cron, 120s for `pnpm ingest`): new blocks (≤30 per run on Vercel) and pool backfill (≤10 days per run). A slow or failed block fetch is skipped, not fatal.
- Calls use an 8s timeout (`ZCASH_RPC_TIMEOUT_MS`) with one retry (none on 429). If `getblockchaininfo` fails, ingest confirms reachability with the light `getblockcount` + `getbestblockhash` and keeps going; the tip block is fetched with its own retry (verbosity 2, then 1).
- Optional `ZCASH_RPC_URL_FALLBACK`: a second endpoint tried automatically when the primary times out or returns 429/503.
- Failures are recorded in `meta.rpcHealth` with a reason and a retry time: `rate_limited` (HTTP 429, back off 30s), `provider_error` (HTTP 503, 20s), `unreachable` (timeouts/network, 20s). A success clears it.

### Status freshness and states
One pure function (`deriveState` in `src/lib/state.ts`, unit-tested in `tests/state.test.ts`) decides the state for `/`, `/dashboard`, `/analytics` and `/api/v1/network/status`. It is driven by **data age**, never by a single failed attempt:

| Data age (last successful ingest) | Provider failing now? | `state` | Pill |
|---|---|---|---|
| < 10 min (or live tip check) | any | `synced` (last block < 5 min, headers ≤ 2 ahead) or `lagging` | green / amber |
| 10–20 min | any | `delayed` | amber "Delayed — provider slow" + data time |
| > 20 min | no recorded failure | `delayed` | amber |
| > 20 min | yes | `unreachable` | red |

`degraded` is `null` while data is < 10 min old, otherwise `{ reason: rate_limited | provider_error | unreachable | stale, since, retryAt }`. A hiccup while data is still fresh is only exposed as `providerNote` in the raw JSON.

### When the database is unavailable
`src/lib/dbguard.ts` is a circuit breaker around every Postgres call. When Neon refuses (e.g. HTTP 402 "exceeded the quota") or is unreachable, it opens for 60s (15s for transient errors) and Fordnet degrades instead of breaking:
- Status on `/`, `/dashboard`, `/analytics` and `/api/v1/network/status` comes straight from the node (`getblockchaininfo` + tip block, memoised 30s per instance) and carries `storage: "<reason>"`; the dashboard shows "Live from node · storage paused".
- Recent blocks are read from the node (max 10, memoised 60s). Block/tx/address lookups use a per-instance memory cache. Unknown ids are still 404.
- Pool history needs stored snapshots: the chart shows "Pool history temporarily unavailable" and the API returns `503 storage_unavailable`.
- API keys verify by their HMAC tag (the revocation list is unavailable until the DB recovers) and the daily limit is counted per instance. Ingest pauses.
- A detail lookup that fails because the node is unreachable returns an error status (HTTP 500 page; the API returns 503), never a 200.

### Provider quota (HTTP 402)
GetBlock's free plan has a daily compute-unit budget (50,000 CU, topped up daily at 07:30 UTC per GetBlock's docs). When it is used up the endpoint answers `402 Out of CU`. Fordnet then stops calling that URL until the reset (`ZCASH_RPC_QUOTA_RESET_UTC`, default `07:30`), records `degraded.reason = "quota_exhausted"` with `retryAt` = the reset, keeps serving stored data and shows "Data delayed — node provider daily quota used up (resets 07:30 UTC)" (amber, not red). If `ZCASH_RPC_URL_FALLBACK` is set it is used meanwhile. Lookup pages are the main CU cost (an address page is up to 7 calls), so `robots.txt` keeps crawlers off `/address/`, `/tx/`, `/block/` and `/search`, and address pages fetch the 5 most recent transactions.

### GetBlock shared tier notes
The shared endpoint answers single calls in about 1–4s, but rate-limits bursts (40 parallel calls → 14×200, 20×429, 5×503, 1 timeout) and intermittently returns `503 Service temporarily unavailable` after ~10s. No daily quota exhaustion was observed and it sends no `Retry-After`. Fordnet therefore keeps RPC volume to one serial ingest per 5 minutes, a 60s-memoised tip check, plus cache misses. Address fetches are sequential (≤10 txs). A second RPC URL as a fallback would add resilience but is not required.

Key files: `src/lib/rpc.ts` (interface + HTTP + mock clients), `src/lib/mock.ts`, `src/lib/ingest.ts`, `src/lib/service.ts`, `src/lib/detect.ts`, `src/lib/ratelimit.ts`, `src/lib/apikeys.ts`, `src/lib/api.ts`, `src/db/schema.ts`, `src/app/**`.

Pool history: each ingest writes today's snapshot from the tip block's `valuePools`, and backfills up to 30 past UTC days (≤10 new days per scheduled run, to respect shared-tier RPC limits) by reading `valuePools` from one block per day (`tip − d × 1152`), so history is real chain data from the node, not interpolated.

## API v1
All responses: `{ "data": …, "meta": { mocked, cached, generatedAt, source }, "error": null | { code, message } }`. Header `x-api-key` required. 200 requests/UTC day per key → `429` + `Retry-After`; `X-RateLimit-*` headers; `Cache-Control: private, max-age=30` + 30s server cache on success; every error response (400/401/404/429/503) is `no-store`.

| Method & path | Notes |
|---|---|
| `POST /api/keys` | body `{label?}` → key shown once (no auth; 10/day per IP) |
| `GET /api/v1/network/status` | sync state, height, hashrate, difficulty, last block, pools |
| `GET /api/v1/blocks?limit=20` | 1–50 |
| `GET /api/v1/blocks/{heightOrHash}` | block + per-tx public summary |
| `GET /api/v1/tx/{txid}` | public fields; shielded = counts |
| `GET /api/v1/address/{taddr}` | t1/t3 only |
| `GET /api/v1/pools/history?range=7d\|30d\|all` | daily ZEC per pool |

Errors: 400 bad input (clear message), 401 missing/invalid key, 404 not found, 429 rate limited, 503 node unreachable and no stored/cached data.
```bash
KEY=$(curl -s -XPOST https://fordnet.vercel.app/api/keys -H 'content-type: application/json' -d '{}' | jq -r .data.key)
curl -s -H "x-api-key: $KEY" https://fordnet.vercel.app/api/v1/network/status | jq
curl -s -H "x-api-key: $KEY" "https://fordnet.vercel.app/api/v1/pools/history?range=7d" | jq
```

Key revocation (operator only): `POST /api/admin/revoke-keys` with `Authorization: Bearer $CRON_SECRET` and `{"keys"?, "labels"?, "prefixes"?}` deletes the keys and their rate-limit rows and records the hashes in `revoked_keys`, so an HMAC-valid key cannot silently re-register.

## Deployment (Vercel)
Deployed with the Vercel CLI (`engines.node = 24.x`) against a Neon Postgres store attached via the Vercel integration. Blocks, snapshots, API-key hashes and rate-limit counters all live in Postgres, so they are shared by every serverless instance; the daily counter is an atomic `INSERT … ON CONFLICT DO UPDATE SET count = count + 1 RETURNING count`.

Ingest: `vercel.json` registers a daily cron on `/api/cron/ingest` (Hobby allows daily crons only; Vercel sends `Authorization: Bearer $CRON_SECRET`). `GET /api/cron/ingest?full=1` loads the full 100 blocks + 30 pool days. In addition reads schedule `ensureFresh()` via `after()`, which re-ingests (under the Postgres lease) when the shared `lastIngestAt` is > 5 min old, so the site stays current without an always-on worker. For per-minute guarantees run `pnpm ingest` on an always-on host or use a per-minute cron on Vercel Pro.

Status pill: green when the last block is < 5 minutes old (Zcash targets 75s blocks with high variance), amber when lagging or when the provider is rate-limited/erroring (stored data shown with its timestamp), red only when ingest has failed as unreachable.

Live data source: a GetBlock shared Zcash mainnet endpoint (Zebra) set as `ZCASH_RPC_URL`. Zebra lacks `getaddressdeltas`, so address pages list recent txids via `getaddresstxids` with per-tx change "not reported"; transparent input addresses/values are also "not reported".

## 2-minute demo script
1. **(0:00)** Open https://fordnet.vercel.app on a phone-width window. The homepage states the problem in four lines and shows a live strip (height, hashrate, last block, Orchard pool) with source and timestamp. Tap **Open dashboard**: the green **Synced** pill, four headline cards and the privacy note.
2. **(0:20)** Expand "Raw network status" to show the exact JSON behind the cards. Note "not reported" is used whenever a node omits a field.
3. **(0:35)** Pool chart: switch 7D → 30D → All, hover for exact 8-decimal values, toggle Transparent on, click **View as table**. Show "Source / Last updated" caption.
4. **(0:55)** Press `/` (desktop), paste a block height → block page; copy the hash (toast). Click a txid → tx page: transparent ins/outs plus *counts* of Sapling/Orchard components, "amounts private".
5. **(1:15)** Search a `t1…` address → transparent balance and recent txs, with the "shielded activity is not visible" note. Search `zs1…` → explanation that shielded addresses can't be looked up by design.
6. **(1:30)** `/developers`: generate a key (shown once), copy a curl, run it in a terminal; show `400` for `?limit=99` and the `X-RateLimit-Remaining` header.
7. **(1:50)** Toggle light theme; close with what's next (Neon + always-on worker, webhooks, SDK).

See `SUBMISSION.md` for the submission blurb.
