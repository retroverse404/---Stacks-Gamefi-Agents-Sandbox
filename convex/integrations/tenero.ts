import { v } from "convex/values";
import { action, internalMutation, query } from "../_generated/server";
import { api, internal } from "../_generated/api";

const SOURCE = "tenero";
const DEFAULT_BASE_URL = "https://www.tenero.io";
const DEFAULT_TICKER_ENDPOINT = "https://api.tenero.io/v1/stacks/tokens";
const DEFAULT_TICKER_MAX_AGE_MS = 5 * 60 * 1000;
const teneroInternal: any = (internal as any)["integrations/tenero"];

type TickerRow = {
  symbol: string;
  price: number;
  change24h: number;
};

const CURATED_TICKER_SYMBOLS = new Set(["STX", "SBTC", "USDCX", "LEO", "WELSH"]);

const FALLBACK_TICKER: TickerRow[] = [
  { symbol: "STX", price: 2.61, change24h: 4.8 },
  { symbol: "sBTC", price: 103420, change24h: 1.2 },
  { symbol: "USDCx", price: 1.0, change24h: 0.0 },
  { symbol: "LEO", price: 0.18, change24h: 6.4 },
  { symbol: "WELSH", price: 0.00042, change24h: -2.1 },
];

function getBaseUrl() {
  const env = (globalThis as any)?.process?.env ?? {};
  return (env.TENERO_BASE_URL as string | undefined) || DEFAULT_BASE_URL;
}

function buildUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  return new URL(path.replace(/^\//, ""), `${getBaseUrl()}/`).toString();
}

function normalizeTickerRow(input: any): TickerRow | null {
  const symbol = typeof input?.symbol === "string"
    ? input.symbol
    : typeof input?.ticker === "string"
      ? input.ticker
      : typeof input?.asset === "string"
        ? input.asset
        : null;
  const priceValue =
    typeof input?.price === "number" ? input.price :
    typeof input?.price === "string" ? Number(input.price) :
    typeof input?.lastPrice === "number" ? input.lastPrice :
    typeof input?.lastPrice === "string" ? Number(input.lastPrice) :
    typeof input?.price_usd === "number" ? input.price_usd :
    typeof input?.price_usd === "string" ? Number(input.price_usd) :
    typeof input?.current_price === "number" ? input.current_price :
    typeof input?.current_price === "string" ? Number(input.current_price) :
    typeof input?.value === "number" ? input.value :
    typeof input?.value === "string" ? Number(input.value) :
    NaN;
  const changeValue =
    typeof input?.change24h === "number" ? input.change24h :
    typeof input?.change24h === "string" ? Number(input.change24h) :
    typeof input?.changePercent24h === "number" ? input.changePercent24h :
    typeof input?.changePercent24h === "string" ? Number(input.changePercent24h) :
    typeof input?.percentChange24h === "number" ? input.percentChange24h :
    typeof input?.percentChange24h === "string" ? Number(input.percentChange24h) :
    typeof input?.price?.price_change_1d_pct === "number" ? input.price.price_change_1d_pct :
    typeof input?.price?.price_change_1d_pct === "string" ? Number(input.price.price_change_1d_pct) :
    0;

  if (!symbol || !Number.isFinite(priceValue)) return null;
  return {
    symbol: symbol.toUpperCase(),
    price: priceValue,
    change24h: Number.isFinite(changeValue) ? changeValue : 0,
  };
}

function parseTickerRows(rawJson?: string | null): TickerRow[] {
  if (!rawJson) return [];
  try {
    const parsed = JSON.parse(rawJson);
    const candidates = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.tokens)
        ? parsed.tokens
        : Array.isArray(parsed?.assets)
          ? parsed.assets
          : Array.isArray(parsed?.data?.rows)
            ? parsed.data.rows
          : Array.isArray(parsed?.data)
            ? parsed.data
            : [];
    return candidates
      .map((row: unknown) => normalizeTickerRow(row))
      .filter((row: TickerRow | null): row is TickerRow => !!row)
      .filter((row: TickerRow) => CURATED_TICKER_SYMBOLS.has(row.symbol));
  } catch {
    return [];
  }
}

function formatPrice(symbol: string, price: number): string {
  if (symbol === "USDCX") return price.toFixed(2);
  if (symbol === "WELSH") return price.toFixed(6);
  if (price >= 1000) return price.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (price >= 1) return price.toFixed(2);
  return price.toFixed(4);
}

async function fetchAndStoreSnapshot(
  ctx: any,
  {
    snapshotType,
    path,
    scope,
    title,
    summary,
  }: {
    snapshotType: string;
    path: string;
    scope?: string;
    title?: string;
    summary?: string;
  },
) {
  const response = await fetch(buildUrl(path), {
    headers: { Accept: "application/json, text/html;q=0.9,*/*;q=0.8" },
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Tenero fetch failed: ${response.status} ${details}`);
  }

  const rawBody = await response.text();
  const syncedAt = Date.now();
  const result = await ctx.runMutation(teneroInternal.ingestSnapshot, {
    snapshotType,
    scope,
    title,
    summary,
    rawJson: rawBody,
    syncedAt,
  });

  return {
    source: SOURCE,
    snapshotType,
    syncedAt,
    ...result,
  };
}

export const syncSnapshot = action({
  args: {
    snapshotType: v.string(),
    path: v.string(),
    scope: v.optional(v.string()),
    title: v.optional(v.string()),
    summary: v.optional(v.string()),
  },
  handler: async (ctx, { snapshotType, path, scope, title, summary }): Promise<any> => {
    return await fetchAndStoreSnapshot(ctx, {
      snapshotType,
      path,
      scope,
      title,
      summary,
    });
  },
});

export const refreshTickerIfStale = action({
  args: {
    force: v.optional(v.boolean()),
    maxAgeMs: v.optional(v.number()),
  },
  handler: async (ctx, { force, maxAgeMs }): Promise<any> => {
    const latest: any = await ctx.runQuery((api as any)["integrations/tenero"].latestSnapshot, {
      snapshotType: "token-ticker",
    });
    const rows = parseTickerRows(latest?.rawJson);
    const ageMs: number = latest?.syncedAt ? Date.now() - latest.syncedAt : Number.POSITIVE_INFINITY;
    const resolvedMaxAgeMs = typeof maxAgeMs === "number" && maxAgeMs > 0
      ? maxAgeMs
      : DEFAULT_TICKER_MAX_AGE_MS;
    const stale = !latest || rows.length === 0 || ageMs > resolvedMaxAgeMs;

    if (!force && !stale) {
      return {
        ageMs,
        reason: "fresh",
        refreshed: false,
        snapshotType: "token-ticker",
        source: SOURCE,
        syncedAt: latest?.syncedAt ?? null,
      };
    }

    const result = await fetchAndStoreSnapshot(ctx, {
      snapshotType: "token-ticker",
      path: DEFAULT_TICKER_ENDPOINT,
      title: "Stacks token ticker",
      summary: "Curated token prices for HUD and market surfaces.",
    });

    return {
      ageMs: 0,
      reason: stale ? "stale" : "forced",
      refreshed: true,
      ...result,
    };
  },
});

export const latestSnapshot = query({
  args: {
    snapshotType: v.string(),
  },
  handler: async (ctx, { snapshotType }) => {
    return await ctx.db
      .query("externalMarketSnapshots")
      .withIndex("by_source_snapshotType", (q) => q.eq("source", SOURCE).eq("snapshotType", snapshotType))
      .order("desc")
      .first();
  },
});

export const tickerRows = query({
  args: {},
  handler: async (ctx) => {
    const latest = await ctx.db
      .query("externalMarketSnapshots")
      .withIndex("by_source_snapshotType", (q) => q.eq("source", SOURCE).eq("snapshotType", "token-ticker"))
      .order("desc")
      .first();

    const rows = parseTickerRows(latest?.rawJson);
    const sourceRows = rows.length > 0 ? rows : FALLBACK_TICKER;
    const ageMs = latest?.syncedAt ? Date.now() - latest.syncedAt : null;
    return {
      source: rows.length > 0 ? SOURCE : "fallback",
      ageMs,
      isStale: !latest || ageMs === null ? true : ageMs > DEFAULT_TICKER_MAX_AGE_MS,
      syncedAt: latest?.syncedAt ?? Date.now(),
      items: sourceRows.map((row) => ({
        symbol: row.symbol,
        price: row.price,
        priceLabel: formatPrice(row.symbol, row.price),
        change24h: row.change24h,
      })),
    };
  },
});

export const ingestSnapshot = internalMutation({
  args: {
    snapshotType: v.string(),
    scope: v.optional(v.string()),
    title: v.optional(v.string()),
    summary: v.optional(v.string()),
    rawJson: v.string(),
    syncedAt: v.number(),
  },
  handler: async (ctx, { snapshotType, scope, title, summary, rawJson, syncedAt }) => {
    const existing = await ctx.db
      .query("externalMarketSnapshots")
      .withIndex("by_source_scope", (q) => q.eq("source", SOURCE).eq("scope", scope))
      .collect();

    const matching = existing.find((item) => item.snapshotType === snapshotType);
    const payload = {
      source: SOURCE,
      snapshotType,
      scope,
      title,
      summary,
      rawJson,
      syncedAt,
      updatedAt: syncedAt,
    };

    if (matching) {
      await ctx.db.patch(matching._id, payload);
      return { updated: true, snapshotId: matching._id };
    }

    const id = await ctx.db.insert("externalMarketSnapshots", payload);
    return { updated: false, snapshotId: id };
  },
});
