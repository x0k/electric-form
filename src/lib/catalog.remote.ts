import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { command, query } from '$app/server';
import { error } from '@sveltejs/kit';
import * as v from 'valibot';
import { getDb, resolveDbPath } from '#lib/server/db/client';
import {
  getCatalog,
  resetAllOverrides,
  resetOverride,
  setOverride,
} from '#lib/server/db/catalog';
import {
  DEFAULT_CITY,
  getLatestOffers,
  type MarketOffer,
  type PriceRun,
} from '#lib/server/db/prices';

const idSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(128));

const overrideSchema = v.object({
  priceRub: v.optional(v.pipe(v.number(), v.minValue(0))),
  wastePct: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(100))),
});

export const getCatalogData = query(async () => {
  return getCatalog(getDb());
});

export interface PriceData {
  run: PriceRun | null;
  offers: MarketOffer[];
  offersByMaterial: Record<string, MarketOffer[]>;
}

export const getPriceData = query(async (): Promise<PriceData> => {
  const { run, offers } = await getLatestOffers(getDb(), DEFAULT_CITY);
  const offersByMaterial: Record<string, MarketOffer[]> = {};
  for (const o of offers) {
    (offersByMaterial[o.materialId] ??= []).push(o);
  }
  for (const list of Object.values(offersByMaterial)) {
    list.sort((a, b) => a.priceRub - b.priceRub);
  }
  return { run, offers, offersByMaterial };
});

/** Путь к бинарю парсера: PRICES_BIN > ./parsers-bin рядом с рабочей папкой. */
function resolvePricesBin(): string | null {
  const direct = process.env.PRICES_BIN;
  if (direct && existsSync(direct)) return direct;
  const local = join(process.cwd(), 'parsers-bin');
  if (existsSync(local)) return local;
  return null;
}

function runScrape(
  bin: string,
  dbPath: string
): Promise<{ code: number; tail: string }> {
  return new Promise((resolve) => {
    execFile(
      bin,
      ['scrape', '--city', DEFAULT_CITY, '--db', dbPath, '--delay', '600ms'],
      { timeout: 15 * 60_000, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const tail = `${stdout}\n${stderr}`.slice(-4000);
        resolve({ code: err ? 1 : 0, tail });
      }
    );
  });
}

/**
 * Ручной запуск парсера со страницы каталога. Пишет офферы в БД,
 * смета после этого считает по новым min-ценам.
 */
export const refreshPrices = command(async () => {
  const bin = resolvePricesBin();
  if (!bin) {
    throw error(
      503,
      'Бинарь парсера не найден. Соберите: cd parsers && go build -o ../parsers-bin ./cmd/prices'
    );
  }
  const { code, tail } = await runScrape(bin, resolveDbPath());
  void getCatalogData().refresh();
  void getPriceData().refresh();
  if (code !== 0) {
    throw error(500, `Парсер завершился с ошибкой:\n${tail}`);
  }
  return true;
});

export const setCatalogOverride = command(
  v.object({ id: idSchema, override: overrideSchema }),
  async ({ id, override }) => {
    try {
      await setOverride(getDb(), id, override);
    } catch (e) {
      throw error(400, e instanceof Error ? e.message : 'Неизвестный материал');
    }
    void getCatalogData().refresh();
  }
);

export const resetCatalogOverride = command(idSchema, async (id) => {
  await resetOverride(getDb(), id);
  void getCatalogData().refresh();
});

export const resetAllCatalogOverrides = command(async () => {
  await resetAllOverrides(getDb());
  void getCatalogData().refresh();
});
