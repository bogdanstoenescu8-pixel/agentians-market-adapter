import { sortByVolumeDesc, toMarketToken, type RawToken } from "../normalize";
import type { MarketToken } from "../types";
import type { Provider } from "../index";

// Unofficial pump.fun frontend API. Endpoints + schema are undocumented and
// change without notice, and the host is often behind bot protection, so this
// provider is strictly best-effort: any failure soft-fails to [] / null.
const BASE = "https://frontend-api.pump.fun";

// pump.fun bonding-curve tokens have a fixed total supply of 1,000,000,000.
// We approximate priceUsd = usd_market_cap / TOTAL_SUPPLY. This is intentionally
// coarse; DexScreener/Birdeye are the sources of record for precise pricing.
const PUMP_TOTAL_SUPPLY = 1_000_000_000;

interface PumpCoin {
  mint?: string;
  name?: string;
  symbol?: string;
  usd_market_cap?: number;
  market_cap?: number;
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function coinToRaw(c: PumpCoin): RawToken {
  const priceUsd =
    typeof c.usd_market_cap === "number" && c.usd_market_cap > 0
      ? c.usd_market_cap / PUMP_TOTAL_SUPPLY
      : null;
  return {
    mint: c.mint ?? null,
    symbol: c.symbol ?? null,
    name: c.name ?? null,
    priceUsd,
    // pump.fun's coins feed does not expose reliable 24h volume / pool liquidity.
    volume24h: 0,
    liquidityUsd: 0,
    change24h: 0,
  };
}

export function createPumpFunProvider(): Provider {
  return {
    name: "pumpfun",

    async getTrending(limit: number): Promise<MarketToken[]> {
      const url = `${BASE}/coins?offset=0&limit=${Math.max(1, limit)}&sort=market_cap&order=DESC&includeNsfw=false`;
      const coins = await getJson<PumpCoin[]>(url);
      if (!Array.isArray(coins)) return [];
      const tokens: MarketToken[] = [];
      for (const coin of coins) {
        const token = toMarketToken(coinToRaw(coin));
        if (token) tokens.push(token);
      }
      // No reliable volume, so market-cap order (already applied by the API) is
      // preserved; sortByVolumeDesc is a no-op tiebreak here but keeps the
      // contract ("sorted by volume24h desc") honest.
      return sortByVolumeDesc(tokens).slice(0, limit);
    },

    async getToken(mint: string): Promise<MarketToken | null> {
      if (!mint) return null;
      const coin = await getJson<PumpCoin>(`${BASE}/coins/${encodeURIComponent(mint)}`);
      if (!coin) return null;
      return toMarketToken(coinToRaw(coin));
    },
  };
}
