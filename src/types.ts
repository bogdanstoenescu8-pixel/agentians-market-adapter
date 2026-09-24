export interface MarketToken {
  mint: string;          // Solana mint address (unique id)
  symbol: string;        // e.g. "WIF" (no leading $)
  name: string;          // human name
  imageColor: string;    // hex like "#8b93a1" — derive deterministically from symbol if the source has no color
  priceUsd: number;      // > 0
  volume24h: number;     // USD, 24h
  liquidityUsd: number;  // USD, current pool liquidity
  change24h: number;     // percent, e.g. -12.5 or 318.0
  updatedAt: string;     // ISO 8601 timestamp of when fetched
}

export interface MarketAdapter {
  /** provider name, e.g. "dexscreener" */
  readonly name: string;
  /** trending / most-active Solana tokens, normalized + sorted by volume24h desc */
  getTrendingTokens(limit?: number): Promise<MarketToken[]>;
  /** one token by mint, or null if not found */
  getToken(mint: string): Promise<MarketToken | null>;
}
