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
  finishPriceRun,
  getLatestOffers,
  getLatestRun,
  isPriceRunStale,
  startPriceRun,
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

function runScrapeDetached(bin: string, dbPath: string, runId: number): void {
  // Асинхронный запуск: процесс отсоединяется, stdout/stderr наследуются —
  // логи парсера подхватывает docker logs. Результат (офферы + статус +
  // heartbeat) пишется парсером в БД инкрементально, статус отслеживается
  // через getRefreshStatus (query.live). Строка прогона создана заранее
  // (startPriceRun), парсер занимает её по --run-id.
  let child;
  try {
    child = spawn(
      bin,
      [
        'scrape',
        '--city',
        DEFAULT_CITY,
        '--db',
        dbPath,
        '--delay',
        '600ms',
        '--run-id',
        String(runId),
      ],
      { detached: true, stdio: ['ignore', 'inherit', 'inherit'] }
    );
  } catch (err) {
    throw error(
      500,
      `Не удалось запустить парсер: ${err instanceof Error ? err.message : err}`
    );
  }
  child.on('error', (err) => {
    console.error(
      `[prices] run ${runId}: не удалось запустить парсер: ${err.message}`
    );
    void finishPriceRun(getDb(), runId, 'error', `spawn: ${err.message}`).catch(
      (e) => console.error(`[prices] run ${runId}: finish failed`, e)
    );
  });
  child.unref();
}

/** Live-статус обновления цен: стримит последний прогон, пока открыт каталог. */
export const getRefreshStatus = query.live(async function* (): AsyncGenerator<{
  run: PriceRun | null;
  stale: boolean;
}> {
  let last = '';
  for (;;) {
    const run = await getLatestRun(getDb(), DEFAULT_CITY);
    const stale = run ? isPriceRunStale(run) : false;
    const key = run
      ? `${run.id}:${run.status}:${run.finishedAt ?? ''}:${run.error ?? ''}:${run.doneCount ?? ''}:${run.lastBeatAt ?? ''}:${stale}`
      : 'none';
    if (key !== last) {
      last = key;
      yield { run, stale };
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
});

/**
 * Ручной запуск парсера со страницы каталога. Возвращается сразу после
 * старта фонового процесса; прогресс виден через getRefreshStatus,
 * итог (офферы) — через getPriceData после завершения прогона.
 * Зависший прогон (нет heartbeat дольше PRICE_RUN_STALE_MS) закрывается
 * как timeout и не блокирует новый запуск.
 */
export const refreshPrices = command(
  async (): Promise<{ started: boolean; runId: number }> => {
    const bin = resolvePricesBin();
    if (!bin) {
      throw error(
        503,
        'Бинарь парсера не найден. Соберите: cd parsers && go build -o ../parsers-bin ./cmd/prices'
      );
    }
    const db = getDb();
    const prev = await getLatestRun(db, DEFAULT_CITY);
    if (prev?.status === 'running') {
      if (!isPriceRunStale(prev)) {
        throw error(409, 'Обновление цен уже запущено, дождитесь завершения');
      }
      await finishPriceRun(
        db,
        prev.id,
        'timeout',
        'Нет heartbeat дольше 30 минут — процесс, видимо, умер (рестарт контейнера убивает фоновый парсер).'
      );
    }
    const run = await startPriceRun(db, DEFAULT_CITY);
    runScrapeDetached(bin, resolveDbPath(), run.id);
    return { started: true, runId: run.id };
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
