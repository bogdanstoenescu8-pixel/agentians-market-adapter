import { TtlCache } from "./cache";
import { createBirdeyeProvider } from "./providers/birdeye";
import { createDexScreenerProvider } from "./providers/dexscreener";
import { createPumpFunProvider } from "./providers/pumpfun";
import type { MarketAdapter, MarketToken } from "./types";

export type { MarketToken, MarketAdapter } from "./types";
export { colorFromSymbol } from "./color";

export type ProviderName = "dexscreener" | "pumpfun" | "birdeye";

/**
 * Internal provider contract. Each provider fetches + normalizes raw source
 * data; the adapter returned by {@link createMarketAdapter} wraps a provider
 * with TTL caching and the soft-fail guarantees (never throws; returns
 * `[]` / `null` on any error).
 */
export interface Provider {
  readonly name: string;
  getTrending(limit: number): Promise<MarketToken[]>;
  getToken(mint: string): Promise<MarketToken | null>;
}

export interface CreateMarketAdapterOptions {
  /** default from env MARKET_PROVIDER, else "dexscreener" */
  provider?: ProviderName;
  /** default from env MARKET_CACHE_TTL_MS, else 30000 */
  cacheTtlMs?: number;
  /** for keyed providers (birdeye); falls back to BIRDEYE_API_KEY */
  apiKey?: string;
}

const DEFAULT_LIMIT = 30;
const DEFAULT_TTL_MS = 30_000;

function resolveProvider(name: ProviderName, apiKey: string | undefined): Provider {
  switch (name) {
    case "pumpfun":
      return createPumpFunProvider();
    case "birdeye":
      return createBirdeyeProvider(apiKey ?? process.env.BIRDEYE_API_KEY);
    case "dexscreener":
    default:
      return createDexScreenerProvider();
  }
}

/**
 * Create a market-data adapter.
 *
 * The returned adapter is defensive by contract: `getTrendingTokens` and
 * `getToken` never throw for network/rate-limit/parse failures — they log and
 * return `[]` / `null` so the host app can fall back to seed data.
 */
export function createMarketAdapter(opts: CreateMarketAdapterOptions = {}): MarketAdapter {
  const providerName: ProviderName =
    opts.provider ?? (process.env.MARKET_PROVIDER as ProviderName | undefined) ?? "dexscreener";

  const ttlRaw = opts.cacheTtlMs ?? Number(process.env.MARKET_CACHE_TTL_MS ?? DEFAULT_TTL_MS);
  const cacheTtlMs = Number.isFinite(ttlRaw) && ttlRaw >= 0 ? ttlRaw : DEFAULT_TTL_MS;

  const provider = resolveProvider(providerName, opts.apiKey);
  const trendingCache = new TtlCache<MarketToken[]>(cacheTtlMs);
  const tokenCache = new TtlCache<MarketToken | null>(cacheTtlMs);

  return {
    name: provider.name,

    async getTrendingTokens(limit: number = DEFAULT_LIMIT): Promise<MarketToken[]> {
      const key = `trending:${limit}`;
      const cached = trendingCache.get(key);
      if (cached) return cached;
      try {
        const tokens = await provider.getTrending(limit);
        const safe = Array.isArray(tokens) ? tokens.slice(0, limit) : [];
        trendingCache.set(key, safe);
        return safe;
      } catch (err) {
        logSoftError(provider.name, "getTrendingTokens", err);
        return [];
      }
    },

    async getToken(mint: string): Promise<MarketToken | null> {
      if (!mint) return null;
      const key = `token:${mint}`;
      const cached = tokenCache.get(key);
      if (cached !== undefined) return cached;
      try {
        const token = await provider.getToken(mint);
        tokenCache.set(key, token);
        return token;
      } catch (err) {
        logSoftError(provider.name, "getToken", err);
        return null;
      }
    },
  };
}

function logSoftError(provider: string, op: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  console.warn(`[market:${provider}] ${op} failed (soft): ${msg}`);
}
