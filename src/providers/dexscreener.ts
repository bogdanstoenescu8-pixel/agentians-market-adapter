import {
  dedupeByMintKeepBest,
  sortByVolumeDesc,
  toMarketToken,
  type RawToken,
} from "../normalize";
import type { MarketToken } from "../types";
import type { Provider } from "../index";

const BASE = "https://api.dexscreener.com";

/** Shape of a DexScreener pair (only the fields we consume). */
interface DexPair {
  chainId?: string;
  baseToken?: { address?: string; name?: string; symbol?: string };
  priceUsd?: string;
  volume?: { h24?: number };
  liquidity?: { usd?: number };
  priceChange?: { h24?: number };
}

interface DexTokensResponse {
  pairs?: DexPair[];
}

interface BoostRow {
  chainId?: string;
  tokenAddress?: string;
}

/** GET JSON, swallowing all network/parse errors (returns null). Never throws. */
async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function pairToRaw(p: DexPair): RawToken {
  return {
    mint: p.baseToken?.address ?? null,
    symbol: p.baseToken?.symbol ?? null,
    name: p.baseToken?.name ?? null,
    priceUsd: p.priceUsd ?? null,
    volume24h: p.volume?.h24 ?? null,
    liquidityUsd: p.liquidity?.usd ?? null,
    change24h: p.priceChange?.h24 ?? null,
  };
}

/** Keep only solana pairs, normalize, and keep the best pair per base token. */
function pairsToTokens(pairs: DexPair[]): MarketToken[] {
  const tokens: MarketToken[] = [];
  for (const p of pairs) {
    if (p?.chainId !== "solana") continue;
    const token = toMarketToken(pairToRaw(p));
    if (token) tokens.push(token);
  }
  return dedupeByMintKeepBest(tokens);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Gather trending Solana mints from DexScreener's discovery endpoints
 * (boosted + newly profiled tokens). These give a much larger, more "trending"
 * pool than the 30-row text search, which we use only as a fallback.
 */
async function collectCandidateMints(): Promise<string[]> {
  const endpoints = [
    `${BASE}/token-boosts/top/v1`,
    `${BASE}/token-boosts/latest/v1`,
    `${BASE}/token-profiles/latest/v1`,
  ];
  const lists = await Promise.all(endpoints.map((u) => getJson<BoostRow[]>(u)));
  const mints = new Set<string>();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const row of list) {
      if (row?.chainId === "solana" && typeof row.tokenAddress === "string" && row.tokenAddress) {
        mints.add(row.tokenAddress);
      }
    }
  }
  return [...mints];
}

export function createDexScreenerProvider(): Provider {
  return {
    name: "dexscreener",

    async getTrending(limit: number): Promise<MarketToken[]> {
      const mints = await collectCandidateMints();

      const pairs: DexPair[] = [];
      if (mints.length > 0) {
        // /latest/dex/tokens/{mints} accepts a comma-separated list (cap ~30).
        const batches = chunk(mints, 30);
        const responses = await Promise.all(
          batches.map((b) => getJson<DexTokensResponse>(`${BASE}/latest/dex/tokens/${b.join(",")}`)),
        );
        for (const r of responses) {
          if (r?.pairs) pairs.push(...r.pairs);
        }
      }

      // Fallback: text search if the discovery endpoints returned nothing usable.
      if (pairs.length === 0) {
        const search = await getJson<DexTokensResponse>(`${BASE}/latest/dex/search?q=solana`);
        if (search?.pairs) pairs.push(...search.pairs);
      }

      return sortByVolumeDesc(pairsToTokens(pairs)).slice(0, limit);
    },

    async getToken(mint: string): Promise<MarketToken | null> {
      if (!mint) return null;
      const res = await getJson<DexTokensResponse>(`${BASE}/latest/dex/tokens/${encodeURIComponent(mint)}`);
      const tokens = pairsToTokens(res?.pairs ?? []);
      if (tokens.length === 0) return null;
      const match = tokens.find((t) => t.mint === mint);
      return match ?? tokens[0] ?? null;
    },
  };
}
