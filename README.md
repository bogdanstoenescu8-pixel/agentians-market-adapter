# agentians-market-adapter

Live Solana / pump.fun **market-data adapter**, normalized to a fixed `MarketToken`
shape. Built as a standalone, self-contained block (BLOCK-01) for the
`agentians.family` platform — it replaces fake seed token data with real
on-chain market data.

- **Zero-config default**: works with **no API key** via [DexScreener](https://docs.dexscreener.com/api/reference).
- **Pluggable providers**: `dexscreener` (default) · `pumpfun` (no key, unofficial) · `birdeye` (keyed).
- **Soft-fail by contract**: network / rate-limit / parse errors never throw — they log and return `[]` / `null`, so the host app falls back to seed data.
- **Server-side only**: no React, no DB, no browser APIs. Native `fetch`, **zero runtime dependencies**.

## Install & run

```bash
npm install         # dev deps only (vitest, tsx, typescript, @types/node)
npm test            # unit tests, fully offline (fixtures, no network)
npm run typecheck   # tsc --noEmit
npm run smoke       # LIVE: hits the real API, prints a table (opt-in manual check)
```

Requires **Node 22+** (uses the global `fetch`).

## Usage

```ts
import { createMarketAdapter } from "./src/index";

const adapter = createMarketAdapter(); // provider from env MARKET_PROVIDER, else "dexscreener"

const trending = await adapter.getTrendingTokens(15); // MarketToken[], sorted by volume24h desc
const one = await adapter.getToken("So11111111111111111111111111111111111111112"); // MarketToken | null
```

### Factory options

```ts
createMarketAdapter({
  provider?: "dexscreener" | "pumpfun" | "birdeye", // default env MARKET_PROVIDER, else "dexscreener"
  cacheTtlMs?: number,                              // default env MARKET_CACHE_TTL_MS, else 30000
  apiKey?: string,                                  // keyed providers (birdeye); else env BIRDEYE_API_KEY
});
```

## Environment

| Var | Default | Notes |
|-----|---------|-------|
| `MARKET_PROVIDER` | `dexscreener` | `dexscreener` \| `pumpfun` \| `birdeye` |
| `MARKET_CACHE_TTL_MS` | `30000` | TTL for trending/token lookups |
| `BIRDEYE_API_KEY` | — | required only when `MARKET_PROVIDER=birdeye` |

See [`.env.example`](.env.example). Never commit a real key — `.env` is gitignored.

## The interface (the integration seam)

```ts
export interface MarketToken {
  mint: string;          // Solana mint address (unique id)
  symbol: string;        // e.g. "WIF" (no leading $)
  name: string;          // human name
  imageColor: string;    // hex like "#8b93a1" — derived from symbol if the source has none
  priceUsd: number;      // > 0
  volume24h: number;     // USD, 24h
  liquidityUsd: number;  // USD, current pool liquidity
  change24h: number;     // percent, e.g. -12.5 or 318.0
  updatedAt: string;     // ISO 8601 timestamp of when fetched
}

export interface MarketAdapter {
  readonly name: string;
  getTrendingTokens(limit?: number): Promise<MarketToken[]>;
  getToken(mint: string): Promise<MarketToken | null>;
}
```

Public surface: `createMarketAdapter`, `MarketToken`, `MarketAdapter`, `colorFromSymbol`.

## Providers

| Provider | Key? | Source | Notes |
|----------|------|--------|-------|
| **dexscreener** (default) | no | boosts + token-profiles → `/latest/dex/tokens/{mints}`; `/latest/dex/search` fallback | Filters `chainId === "solana"`, dedupes by mint (keeps highest-liquidity pair), sorts by `volume24h`. |
| **pumpfun** | no | `frontend-api.pump.fun/coins` | Unofficial/unstable. Surfaces new pump mints; `priceUsd ≈ usd_market_cap / 1e9` (fixed supply); volume/liquidity not exposed → `0`. Soft-fails. |
| **birdeye** | yes | `public-api.birdeye.so` (`x-chain: solana`) | Richest data (price/volume/liquidity/change). Returns `[]`/`null` with no key. |

## Sample `npm run smoke` output (live DexScreener)

```
Provider: dexscreener
Fetched 15 trending tokens

┌─────────┬────────────┬────────────────┬─────────────┬───────────┬────────┬───────────┬───────────────┐
│ (index) │ symbol     │ price          │ vol24h      │ liqUsd    │ chg%   │ color     │ mint          │
├─────────┼────────────┼────────────────┼─────────────┼───────────┼────────┼───────────┼───────────────┤
│ 0       │ 'BLUF'     │ '$0.0002218'   │ '5,361,003' │ '46,956'  │ 372    │ '#61d195' │ 'c4Atfq…bLuf' │
│ 1       │ 'NERD'     │ '$0.000004071' │ '4,991,602' │ '5,267'   │ -91.39 │ '#d1617b' │ '5kdbTq…pump' │
│ 2       │ 'NPC'      │ '$0.0002071'   │ '3,297,079' │ '43,653'  │ 348    │ '#bbd161' │ '7GUnr7…pump' │
│ 3       │ 'SI'       │ '$0.0005759'   │ '2,304,288' │ '71,937'  │ 1121   │ '#ae61d1' │ '82ezhR…pump' │
│ 4       │ 'GIGACAT'  │ '$0.0001248'   │ '1,775,324' │ '33,333'  │ 33.51  │ '#61d17d' │ '2jcvq8…pump' │
│ ...     │ ...        │ ...            │ ...         │ ...       │ ...    │ ...       │ ...           │
│ 14      │ 'miao'     │ '$0.0002242'   │ '266,410'   │ '40,938'  │ 380    │ '#6197d1' │ 'HQfciZ…pump' │
└─────────┴────────────┴────────────────┴─────────────┴───────────┴────────┴───────────┴───────────────┘

getToken("c4AtfqMRbC9FuHtVEHDhCm453tytU9E34MXXrp6bLuf"):
  -> BLUF @ $0.0002218 (Bluf)

OK: 15 tokens (>= 10).
```

## INTEGRATION

For the integrator wiring this into the main `agentians.family` app:

- **Runtime deps to install in the main app: NONE.** This block uses the global `fetch` only; every other dependency is a dev-only tool.
- **Files to copy** — everything under [`src/`](src/) (e.g. into `lib/market/`):
  - `src/types.ts` — `MarketToken` + `MarketAdapter`
  - `src/index.ts` — `createMarketAdapter()` + re-exports (`MarketToken`, `MarketAdapter`, `colorFromSymbol`)
  - `src/cache.ts` — TTL cache
  - `src/color.ts` — `colorFromSymbol()`
  - `src/normalize.ts` — provider row → `MarketToken` (validation lives here)
  - `src/providers/dexscreener.ts`
  - `src/providers/pumpfun.ts`
  - `src/providers/birdeye.ts`
- **Seam**: call `createMarketAdapter()` and use `getTrendingTokens()` / `getToken()`. Map `MarketToken → Token` by adding `id = "t_" + mint`. Because the adapter always returns valid `MarketToken[]` or `[]`, keep seed data as the fallback when the result is empty.
- **Env** on Railway: set `MARKET_PROVIDER` (and `BIRDEYE_API_KEY` if using birdeye).

Imports use extensionless relative paths (`./normalize`, `../types`) under
`"moduleResolution": "bundler"`, which is compatible with Next.js. Adjust to
your app's convention if needed.

## Out of scope

No UI, no database, no websockets/streaming (polling only), no trade execution.
Read-only market data for paper trading.
