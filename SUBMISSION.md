# Fordnet — ZECATHON submission (Core & Tooling)

**Problem.** Builders and researchers who want basic Zcash network facts — is the chain moving, what's the hashrate, how much ZEC sits in each shielded pool over time — have to run a node, parse RPC output, or scrape explorers with no stable API. There is no small, honest, developer-first API that reports only public protocol data.

**What it does.** Fordnet ingests from a Zcash node (zcashd/Zebra JSON-RPC) at most once per 60s under a Postgres lease, serves status from its database, caches detail lookups, stores the last 100 blocks and one value-pool snapshot per UTC day, and serves them through a mobile-first dashboard (live sync pill, height, hashrate, last block, pool-value chart with 7D/30D/All and an accessible table view) plus block, transaction and transparent-address lookups. A versioned REST API (`/api/v1`, `{data, meta, error}`) with self-serve API keys (shown once, stored as a hash), 200 req/day limits with `Retry-After`, zod-validated inputs and 30s caching makes the same data scriptable in one curl.

**Why Core & Tooling.** It's infrastructure, not an app: a reusable data layer and API that wallets, dashboards, research notebooks and bots can build on. It surfaces node health and pool supply straight from `getblockchaininfo`/`getblock` `valuePools`, shows "not reported" instead of guessing, and is privacy-respecting by construction — shielded components are counted, never de-anonymised.

**What's next.** An always-on ingest worker and a fallback RPC endpoint; Zebra-native RPC parity and lightwalletd as a source; webhooks for new blocks and pool thresholds; per-key usage dashboard; NU upgrade/ZSA tracking; an OpenAPI spec and TypeScript SDK.
