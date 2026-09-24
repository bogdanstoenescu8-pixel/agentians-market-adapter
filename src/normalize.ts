import { colorFromSymbol } from "./color";
import type { MarketToken } from "./types";

/**
 * Loose intermediate shape that every provider maps its raw rows into before
 * normalization. Keeping this provider-agnostic means the validation + coercion
 * rules live in one tested place.
 */
export interface RawToken {
  mint?: string | null;
  symbol?: string | null;
  name?: string | null;
  imageColor?: string | null;
  priceUsd?: number | string | null;
  volume24h?: number | string | null;
  liquidityUsd?: number | string | null;
  change24h?: number | string | null;
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** Coerce a number|string|null into a finite number, else `fallback`. */
export function toFiniteNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function cleanSymbol(symbol: string | null | undefined, mint: string): string {
  let s = (symbol ?? "").trim();
  if (s.startsWith("$")) s = s.slice(1).trim();
  if (!s) s = mint.slice(0, 4).toUpperCase();
  return s;
}

/**
 * Normalize a loose provider row into a validated {@link MarketToken}.
 *
 * Returns `null` for unusable rows — no mint, or a non-finite / non-positive
 * price — so callers can simply filter out the nulls. Volume, liquidity and
 * change are coerced to finite numbers (defaulting to 0) rather than dropping
 * the row, since a valid token can legitimately have 0 recorded volume.
 */
export function toMarketToken(raw: RawToken, now: Date = new Date()): MarketToken | null {
  const mint = typeof raw.mint === "string" ? raw.mint.trim() : "";
  if (!mint) return null;

  const priceUsd = toFiniteNumber(raw.priceUsd, NaN);
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) return null;

  const symbol = cleanSymbol(raw.symbol, mint);
  const name = (raw.name ?? "").toString().trim() || symbol;

  const rawColor = typeof raw.imageColor === "string" ? raw.imageColor.trim() : "";
  const imageColor = HEX_RE.test(rawColor) ? rawColor.toLowerCase() : colorFromSymbol(symbol);

  return {
    mint,
    symbol,
    name,
    imageColor,
    priceUsd,
    volume24h: Math.max(0, toFiniteNumber(raw.volume24h, 0)),
    liquidityUsd: Math.max(0, toFiniteNumber(raw.liquidityUsd, 0)),
    change24h: toFiniteNumber(raw.change24h, 0),
    updatedAt: now.toISOString(),
  };
}

/** Normalize many rows, dropping invalid ones and sorting by 24h volume desc. */
export function normalizeMany(rows: RawToken[], now?: Date): MarketToken[] {
  const out: MarketToken[] = [];
  for (const row of rows) {
    const token = toMarketToken(row, now);
    if (token) out.push(token);
  }
  return sortByVolumeDesc(out);
}

/** Return a new array sorted by 24h volume, highest first. */
export function sortByVolumeDesc(tokens: MarketToken[]): MarketToken[] {
  return [...tokens].sort((a, b) => b.volume24h - a.volume24h);
}

/** De-duplicate by mint, keeping the entry with the highest liquidity. */
export function dedupeByMintKeepBest(tokens: MarketToken[]): MarketToken[] {
  const best = new Map<string, MarketToken>();
  for (const token of tokens) {
    const current = best.get(token.mint);
    if (!current || token.liquidityUsd > current.liquidityUsd) {
      best.set(token.mint, token);
    }
  }
  return [...best.values()];
}
