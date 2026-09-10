import { and, desc, eq, gt } from 'drizzle-orm';
import type { Material } from '#lib/catalog/types';
import type { Db } from './client';
import { priceOffers, priceRuns } from './schema';

/** Город по умолчанию — Сыктывкар (поддомен kristall43, витрины магазинов). */
export const DEFAULT_CITY = 'syktyvkar';

/** Свежесть оффера: старше — не участвует в min-цене. */
export const PRICE_FRESH_DAYS = 7;

export interface MarketMin {
  priceRub: number;
  shop: string;
  url: string;
  observedAt: string;
}

export interface MarketOffer {
  id: number;
  materialId: string;
  shop: string;
  title: string;
  url: string;
  article: string | null;
  priceRub: number;
  unit: string;
  inStock: boolean;
  observedAt: string;
}

export interface PriceRun {
  id: number;
  city: string;
  status: string;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

function freshCutoff(): string {
  return new Date(Date.now() - PRICE_FRESH_DAYS * 86400_000).toISOString();
}

/**
 * Минимальная цена по магазинам для каждого материала:
 * только в наличии, свежее PRICE_FRESH_DAYS и строго в единице
 * измерения материала — бухту за шт с метрами не смешиваем.
 */
export async function getMarketMin(
  db: Db,
  base: Material[],
  city: string = DEFAULT_CITY
): Promise<Record<string, MarketMin>> {
  const units = new Map(base.map((m) => [m.id, m.unit]));
  const rows = await db
    .select()
    .from(priceOffers)
    .where(
      and(
        eq(priceOffers.city, city),
        eq(priceOffers.inStock, 1),
        gt(priceOffers.observedAt, freshCutoff())
      )
    );
  const out: Record<string, MarketMin> = {};
  for (const r of rows) {
    if (r.unit !== units.get(r.materialId)) continue;
    const cur = out[r.materialId];
    if (!cur || r.priceRub < cur.priceRub) {
      out[r.materialId] = {
        priceRub: r.priceRub,
        shop: r.shop,
        url: r.url,
        observedAt: r.observedAt,
      };
    }
  }
  return out;
}

/** Применить рыночный min к базовому прайсу (смета берет минимум). */
export function applyMarketMin(
  base: Material[],
  market: Record<string, MarketMin>
): Material[] {
  if (Object.keys(market).length === 0) return base;
  return base.map((m) => {
    const mm = market[m.id];
    if (!mm || mm.priceRub >= m.priceRub) return m;
    return { ...m, priceRub: mm.priceRub };
  });
}

/** Последний прогон по городу (для live-статуса обновления цен). */
export async function getLatestRun(
  db: Db,
  city: string = DEFAULT_CITY
): Promise<PriceRun | null> {
  const runs = await db
    .select()
    .from(priceRuns)
    .where(eq(priceRuns.city, city))
    .orderBy(desc(priceRuns.id))
    .limit(1);
  if (runs.length === 0) return null;
  const r = runs[0];
  return {
    id: r.id,
    city: r.city,
    status: r.status,
    error: r.error,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
  };
}

/** Офферы последнего завершенного прогона по городу (для UI каталога). */
export async function getLatestOffers(
  db: Db,
  city: string = DEFAULT_CITY
): Promise<{ run: PriceRun | null; offers: MarketOffer[] }> {
  const runs = await db
    .select()
    .from(priceRuns)
    .where(eq(priceRuns.city, city))
    .orderBy(desc(priceRuns.id))
    .limit(1);
  if (runs.length === 0) return { run: null, offers: [] };
  const r = runs[0];
  const run: PriceRun = {
    id: r.id,
    city: r.city,
    status: r.status,
    error: r.error,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
  };
  if (r.status === 'running') return { run, offers: [] };
  const rows = await db
    .select()
    .from(priceOffers)
    .where(eq(priceOffers.runId, r.id));
  return {
    run,
    offers: rows.map((o) => ({
      id: o.id,
      materialId: o.materialId,
      shop: o.shop,
      title: o.title,
      url: o.url,
      article: o.article,
      priceRub: o.priceRub,
      unit: o.unit,
      inStock: o.inStock === 1,
      observedAt: o.observedAt,
    })),
  };
}
