import { sortByVolumeDesc, toMarketToken, type RawToken } from "../normalize";
import type { MarketToken } from "../types";
import type { Provider } from "../index";

// Birdeye public API (keyed). Requires an API key passed to the factory or set
// via BIRDEYE_API_KEY. Solana is selected with the `x-chain` header.
const BASE = "https://public-api.birdeye.so";

interface BirdeyeListToken {
  address?: string;
  symbol?: string;
  name?: string;
  price?: number;
  v24hUSD?: number;
  liquidity?: number;
  v24hChangePercent?: number;
}

interface BirdeyeTokenListResponse {
  data?: { tokens?: BirdeyeListToken[] };
}

interface BirdeyeOverviewResponse {
  data?: {
    address?: string;
    symbol?: string;
    name?: string;
    price?: number;
    liquidity?: number;
    v24hUSD?: number;
    priceChange24hPercent?: number;
  };
}

async function getJson<T>(url: string, apiKey: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: {
        accept: "application/json",
        "x-chain": "solana",
        "X-API-KEY": apiKey,
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function listTokenToRaw(t: BirdeyeListToken): RawToken {
  return {
    mint: t.address ?? null,
    symbol: t.symbol ?? null,
    name: t.name ?? null,
    priceUsd: t.price ?? null,
    volume24h: t.v24hUSD ?? null,
    liquidityUsd: t.liquidity ?? null,
    change24h: t.v24hChangePercent ?? null,
  };
}

export function createBirdeyeProvider(apiKey: string | undefined): Provider {
  let warned = false;
  const requireKey = (): string | null => {
    if (apiKey && apiKey.trim()) return apiKey.trim();
    if (!warned) {
      warned = true;
      console.warn("[market:birdeye] no API key (set BIRDEYE_API_KEY); returning empty results.");
    }
    return null;
  };

  return {
    name: "birdeye",

    async getTrending(limit: number): Promise<MarketToken[]> {
      const key = requireKey();
      if (!key) return [];
      const url = `${BASE}/defi/tokenlist?sort_by=v24hUSD&sort_type=desc&offset=0&limit=${Math.max(1, limit)}`;
      const res = await getJson<BirdeyeTokenListResponse>(url, key);
      const list = res?.data?.tokens;
      if (!Array.isArray(list)) return [];
      const tokens: MarketToken[] = [];
      for (const t of list) {
        const token = toMarketToken(listTokenToRaw(t));
        if (token) tokens.push(token);
      }
      return sortByVolumeDesc(tokens).slice(0, limit);
    },

    async getToken(mint: string): Promise<MarketToken | null> {
      if (!mint) return null;
      const key = requireKey();
      if (!key) return null;
      const url = `${BASE}/defi/token_overview?address=${encodeURIComponent(mint)}`;
      const res = await getJson<BirdeyeOverviewResponse>(url, key);
      const d = res?.data;
      if (!d) return null;
      return toMarketToken({
        mint: d.address ?? mint,
        symbol: d.symbol ?? null,
        name: d.name ?? null,
        priceUsd: d.price ?? null,
        volume24h: d.v24hUSD ?? null,
        liquidityUsd: d.liquidity ?? null,
        change24h: d.priceChange24hPercent ?? null,
      });
    },
  };
}
