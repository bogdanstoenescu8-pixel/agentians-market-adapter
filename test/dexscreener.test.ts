import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMarketAdapter } from "../src/index";

function loadFixture<T = unknown>(name: string): T {
  const raw = readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8").replace(/^﻿/, "");
  return JSON.parse(raw) as T;
}

const tokensFixture = loadFixture("dexscreener-tokens.json");
const boostsFixture = loadFixture("dexscreener-boosts.json");

function jsonOk(data: unknown): Response {
  return { ok: true, status: 200, json: async () => data } as unknown as Response;
}

/** Stub global fetch, routing by URL substring. Returns the vi mock. */
function routeFetch(handler: (url: string) => unknown) {
  const mock = vi.fn(async (input: unknown) => jsonOk(handler(String(input))));
  vi.stubGlobal("fetch", mock);
  return mock;
}

function trendingRoutes(url: string): unknown {
  if (url.includes("/token-boosts/top")) return boostsFixture;
  if (url.includes("/token-boosts/latest")) return [];
  if (url.includes("/token-profiles/latest")) return [];
  if (url.includes("/latest/dex/tokens/")) return tokensFixture;
  return { pairs: [] };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("dexscreener adapter", () => {
  it("returns tokens sorted by volume24h desc and respects the limit", async () => {
    const mock = routeFetch(trendingRoutes);
    const adapter = createMarketAdapter({ provider: "dexscreener", cacheTtlMs: 0 });

    const tokens = await adapter.getTrendingTokens(5);

    expect(adapter.name).toBe("dexscreener");
    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens.length).toBeLessThanOrEqual(5);
    for (const t of tokens) {
      expect(t.priceUsd).toBeGreaterThan(0);
      expect(Number.isFinite(t.volume24h)).toBe(true);
      expect(t.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
    const vols = tokens.map((t) => t.volume24h);
    expect(vols).toEqual([...vols].sort((a, b) => b - a));
    expect(mock).toHaveBeenCalled();
  });

  it("drops non-solana and non-positive-price rows, deduping by mint (keeping higher liquidity)", async () => {
    const MINT = "MINTAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const inline = {
      pairs: [
        { chainId: "solana", baseToken: { address: MINT, symbol: "AAA", name: "Alpha" }, priceUsd: "1.5", volume: { h24: 100 }, liquidity: { usd: 1000 }, priceChange: { h24: 5 } },
        { chainId: "solana", baseToken: { address: MINT, symbol: "AAA", name: "Alpha" }, priceUsd: "1.5", volume: { h24: 100 }, liquidity: { usd: 9000 }, priceChange: { h24: 5 } },
        { chainId: "ethereum", baseToken: { address: "0xabc", symbol: "ETHX", name: "EthX" }, priceUsd: "2.0", volume: { h24: 999999 }, liquidity: { usd: 50000 }, priceChange: { h24: 1 } },
        { chainId: "solana", baseToken: { address: "ZEROMINT", symbol: "ZERO", name: "Zero" }, priceUsd: "0", volume: { h24: 5 }, liquidity: { usd: 5 }, priceChange: { h24: 0 } },
      ],
    };
    routeFetch((url) => {
      if (url.includes("/token-boosts/top")) return [{ chainId: "solana", tokenAddress: MINT }];
      if (url.includes("/latest/dex/tokens/")) return inline;
      return { pairs: [] };
    });
    const adapter = createMarketAdapter({ provider: "dexscreener", cacheTtlMs: 0 });

    const tokens = await adapter.getTrendingTokens(10);

    expect(tokens).toHaveLength(1);
    expect(tokens[0]!.mint).toBe(MINT);
    expect(tokens[0]!.liquidityUsd).toBe(9000);
    expect(tokens.some((t) => t.symbol === "ETHX")).toBe(false);
    expect(tokens.some((t) => t.symbol === "ZERO")).toBe(false);
  });

  it("soft-fails to [] when the network rejects (never throws)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    const adapter = createMarketAdapter({ provider: "dexscreener", cacheTtlMs: 0 });

    await expect(adapter.getTrendingTokens(10)).resolves.toEqual([]);
  });

  it("caches within TTL: the second call issues no extra network requests", async () => {
    const mock = routeFetch(trendingRoutes);
    const adapter = createMarketAdapter({ provider: "dexscreener", cacheTtlMs: 60_000 });

    await adapter.getTrendingTokens(10);
    const afterFirst = mock.mock.calls.length;
    expect(afterFirst).toBeGreaterThan(0);

    await adapter.getTrendingTokens(10);
    expect(mock.mock.calls.length).toBe(afterFirst); // no additional fetches
  });

  it("getToken returns the matching token, or null when not found", async () => {
    const MINT = "MINTBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
    routeFetch((url) => {
      if (url.includes(`/latest/dex/tokens/${MINT}`)) {
        return {
          pairs: [
            { chainId: "solana", baseToken: { address: MINT, symbol: "BBB", name: "Beta" }, priceUsd: "3.25", volume: { h24: 10 }, liquidity: { usd: 20 }, priceChange: { h24: -2 } },
          ],
        };
      }
      return { pairs: [] };
    });
    const adapter = createMarketAdapter({ provider: "dexscreener", cacheTtlMs: 0 });

    const found = await adapter.getToken(MINT);
    expect(found?.symbol).toBe("BBB");
    expect(found?.priceUsd).toBe(3.25);

    const missing = await adapter.getToken("DOESNOTEXISTMINT");
    expect(missing).toBeNull();
  });
});
