/**
 * Live smoke test — hits the real provider API and prints a table.
 *
 * Opt-in / manual: `npm run smoke`. Uses MARKET_PROVIDER (default dexscreener),
 * MARKET_CACHE_TTL_MS and BIRDEYE_API_KEY from the environment. Exits non-zero
 * if fewer than 10 tokens come back, so it doubles as a coarse health check.
 */
import { createMarketAdapter, type ProviderName } from "../src/index";

const MIN_EXPECTED = 10;

function fmtUsd(n: number): string {
  if (n >= 1) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  return `$${n.toPrecision(4)}`;
}

async function main(): Promise<void> {
  const provider = (process.env.MARKET_PROVIDER as ProviderName | undefined) ?? "dexscreener";
  const adapter = createMarketAdapter({ provider });

  console.log(`Provider: ${adapter.name}`);
  const tokens = await adapter.getTrendingTokens(15);
  console.log(`Fetched ${tokens.length} trending tokens\n`);

  console.table(
    tokens.map((t) => ({
      symbol: t.symbol,
      price: fmtUsd(t.priceUsd),
      vol24h: Math.round(t.volume24h).toLocaleString("en-US"),
      liqUsd: Math.round(t.liquidityUsd).toLocaleString("en-US"),
      "chg%": t.change24h,
      color: t.imageColor,
      mint: `${t.mint.slice(0, 6)}…${t.mint.slice(-4)}`,
    })),
  );

  const first = tokens[0];
  if (first) {
    console.log(`\ngetToken("${first.mint}"):`);
    const one = await adapter.getToken(first.mint);
    console.log(one ? `  -> ${one.symbol} @ ${fmtUsd(one.priceUsd)} (${one.name})` : "  -> null");
  }

  if (tokens.length < MIN_EXPECTED) {
    console.error(`\nFAIL: expected >= ${MIN_EXPECTED} tokens, got ${tokens.length}`);
    process.exitCode = 1;
  } else {
    console.log(`\nOK: ${tokens.length} tokens (>= ${MIN_EXPECTED}).`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
