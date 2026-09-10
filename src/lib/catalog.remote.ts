import { spawn } from 'node:child_process';
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
  getLatestRun,
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

function runScrapeDetached(bin: string, dbPath: string): void {
  // Асинхронный запуск: процесс отсоединяется, stdout/stderr наследуются —
  // логи парсера подхватывает docker logs. Результат (офферы + статус)
  // пишется парсером в БД инкрементально, статус отслеживается через
  // getRefreshStatus (query.live).
  const child = spawn(
    bin,
    ['scrape', '--city', DEFAULT_CITY, '--db', dbPath, '--delay', '600ms'],
    { detached: true, stdio: ['ignore', 'inherit', 'inherit'] }
  );
  child.on('error', (err) => {
    console.error(`[prices] не удалось запустить парсер: ${err.message}`);
  });
  child.unref();
}

/** Live-статус обновления цен: стримит последний прогон, пока открыт каталог. */
export const getRefreshStatus = query.live(async function* (): AsyncGenerator<{
  run: PriceRun | null;
}> {
  let last = '';
  for (;;) {
    const run = await getLatestRun(getDb(), DEFAULT_CITY);
    const key = run
      ? `${run.id}:${run.status}:${run.finishedAt ?? ''}:${run.error ?? ''}`
      : 'none';
    if (key !== last) {
      last = key;
      yield { run };
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
});

/**
 * Ручной запуск парсера со страницы каталога. Возвращается сразу после
 * старта фонового процесса; прогресс виден через getRefreshStatus,
 * итог (офферы) — через getPriceData после завершения прогона.
 */
export const refreshPrices = command(
  async (): Promise<{ started: boolean }> => {
    const bin = resolvePricesBin();
    if (!bin) {
      throw error(
        503,
        'Бинарь парсера не найден. Соберите: cd parsers && go build -o ../parsers-bin ./cmd/prices'
      );
    }
    const running = await getLatestRun(getDb(), DEFAULT_CITY);
    if (running?.status === 'running') {
      throw error(409, 'Обновление цен уже запущено, дождитесь завершения');
    }
    runScrapeDetached(bin, resolveDbPath());
    return { started: true };
  }
);

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
