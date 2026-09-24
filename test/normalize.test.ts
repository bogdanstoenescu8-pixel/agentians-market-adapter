import { describe, expect, it } from "vitest";
import { colorFromSymbol } from "../src/color";
import {
  dedupeByMintKeepBest,
  normalizeMany,
  toFiniteNumber,
  toMarketToken,
  type RawToken,
} from "../src/normalize";

describe("toFiniteNumber", () => {
  it("coerces numbers and numeric strings, falls back otherwise", () => {
    expect(toFiniteNumber(12.5)).toBe(12.5);
    expect(toFiniteNumber("0.0003")).toBe(0.0003);
    expect(toFiniteNumber("  42 ")).toBe(42);
    expect(toFiniteNumber(NaN, 7)).toBe(7);
    expect(toFiniteNumber(Infinity, 7)).toBe(7);
    expect(toFiniteNumber("abc", 7)).toBe(7);
    expect(toFiniteNumber(null, 7)).toBe(7);
    expect(toFiniteNumber(undefined, 7)).toBe(7);
    expect(toFiniteNumber("", 7)).toBe(7);
  });
});

describe("toMarketToken", () => {
  const base: RawToken = {
    mint: "MINT123",
    symbol: "wif",
    name: "dogwifhat",
    priceUsd: "2.5",
    volume24h: 1000,
    liquidityUsd: 5000,
    change24h: -12.5,
  };

  it("maps fields correctly and sets an ISO updatedAt", () => {
    const now = new Date("2026-01-02T03:04:05.000Z");
    const t = toMarketToken(base, now);
    expect(t).not.toBeNull();
    expect(t!.mint).toBe("MINT123");
    expect(t!.symbol).toBe("wif");
    expect(t!.name).toBe("dogwifhat");
    expect(t!.priceUsd).toBe(2.5);
    expect(t!.volume24h).toBe(1000);
    expect(t!.liquidityUsd).toBe(5000);
    expect(t!.change24h).toBe(-12.5);
    expect(t!.updatedAt).toBe("2026-01-02T03:04:05.000Z");
  });

  it("drops rows with a missing mint", () => {
    expect(toMarketToken({ ...base, mint: null })).toBeNull();
    expect(toMarketToken({ ...base, mint: "   " })).toBeNull();
  });

  it("drops rows with a non-positive or non-finite price", () => {
    expect(toMarketToken({ ...base, priceUsd: 0 })).toBeNull();
    expect(toMarketToken({ ...base, priceUsd: -1 })).toBeNull();
    expect(toMarketToken({ ...base, priceUsd: "0" })).toBeNull();
    expect(toMarketToken({ ...base, priceUsd: "not-a-number" })).toBeNull();
    expect(toMarketToken({ ...base, priceUsd: null })).toBeNull();
  });

  it("strips a leading $ from the symbol", () => {
    expect(toMarketToken({ ...base, symbol: "$WIF" })!.symbol).toBe("WIF");
  });

  it("falls back to a mint-derived symbol/name when absent", () => {
    const t = toMarketToken({ ...base, symbol: null, name: null })!;
    expect(t.symbol).toBe("MINT"); // first 4 chars of mint, upper-cased
    expect(t.name).toBe("MINT");
  });

  it("derives a deterministic hex color when none is provided", () => {
    const t = toMarketToken({ ...base, imageColor: null })!;
    expect(t.imageColor).toMatch(/^#[0-9a-f]{6}$/);
    expect(t.imageColor).toBe(colorFromSymbol("wif"));
  });

  it("keeps a valid provided hex color (lower-cased)", () => {
    expect(toMarketToken({ ...base, imageColor: "#AB12CD" })!.imageColor).toBe("#ab12cd");
  });

  it("ignores an invalid provided color and derives one instead", () => {
    const t = toMarketToken({ ...base, imageColor: "blue" })!;
    expect(t.imageColor).toBe(colorFromSymbol("wif"));
  });

  it("coerces garbage volume/liquidity/change to safe finite numbers", () => {
    const t = toMarketToken({ ...base, volume24h: "oops", liquidityUsd: NaN, change24h: undefined })!;
    expect(t.volume24h).toBe(0);
    expect(t.liquidityUsd).toBe(0);
    expect(t.change24h).toBe(0);
  });
});

describe("normalizeMany / sort / dedupe", () => {
  it("drops invalid rows and sorts by 24h volume desc", () => {
    const rows: RawToken[] = [
      { mint: "A", symbol: "A", priceUsd: 1, volume24h: 10 },
      { mint: "B", symbol: "B", priceUsd: 1, volume24h: 999 },
      { mint: "C", symbol: "C", priceUsd: 0, volume24h: 500 }, // dropped (price 0)
      { mint: "D", symbol: "D", priceUsd: 1, volume24h: 50 },
    ];
    const out = normalizeMany(rows);
    expect(out.map((t) => t.mint)).toEqual(["B", "D", "A"]);
  });

  it("dedupeByMintKeepBest keeps the highest-liquidity entry", () => {
    const a = toMarketToken({ mint: "X", symbol: "X", priceUsd: 1, liquidityUsd: 100 })!;
    const b = toMarketToken({ mint: "X", symbol: "X", priceUsd: 1, liquidityUsd: 900 })!;
    const out = dedupeByMintKeepBest([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0]!.liquidityUsd).toBe(900);
  });

  it("colorFromSymbol is deterministic, case-insensitive and format-valid", () => {
    expect(colorFromSymbol("WIF")).toBe(colorFromSymbol("WIF"));
    expect(colorFromSymbol("WIF")).toMatch(/^#[0-9a-f]{6}$/);
    expect(colorFromSymbol("wif")).toBe(colorFromSymbol("WIF"));
  });
});
