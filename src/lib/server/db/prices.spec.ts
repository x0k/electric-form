import { describe, expect, it } from 'vitest';
import { SEED_CATALOG } from '#lib/catalog/catalog';
import { calculate } from '#lib/calc/engine';
import { createDefaultProject } from '#lib/project/defaults';
import { getCatalog } from './catalog';
import { createMemoryDb } from './client';
import {
  applyMarketMin,
  finishPriceRun,
  getLatestRun,
  getMarketMin,
  isPriceRunStale,
  startPriceRun,
} from './prices';
import { priceOffers, priceRuns } from './schema';

function offer(
  overrides: Partial<typeof priceOffers.$inferInsert> & {
    materialId: string;
    priceRub: number;
  }
) {
  return {
    runId: 1,
    shop: 'orion',
    title: 't',
    url: 'https://example.com/1',
    article: null,
    unit: 'm',
    inStock: 1,
    city: 'syktyvkar',
    observedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('market min prices', () => {
  it('берет минимум из свежих в наличии с совпадающей единицей', async () => {
    const db = createMemoryDb();
    const cable = SEED_CATALOG.find((m) => m.id === 'cable-vvg-3x2.5')!;
    await db.insert(priceOffers).values([
      offer({ materialId: cable.id, shop: 'orion', priceRub: 114, unit: 'm' }),
      offer({
        materialId: cable.id,
        shop: 'kristall',
        priceRub: 199,
        unit: 'm',
      }),
      // Дешевле, но бухта за шт — не смешивается с метрами.
      offer({ materialId: cable.id, shop: 'mkrep', priceRub: 50, unit: 'pcs' }),
      // Дешевле, но нет в наличии.
      offer({
        materialId: cable.id,
        shop: 'mkrep',
        priceRub: 90,
        unit: 'm',
        inStock: 0,
      }),
      // Дешевле, но протух.
      offer({
        materialId: cable.id,
        shop: 'orion',
        priceRub: 80,
        unit: 'm',
        observedAt: new Date(Date.now() - 30 * 86400_000).toISOString(),
      }),
    ]);
    const market = await getMarketMin(db, [cable]);
    expect(market[cable.id]?.priceRub).toBe(114);
    expect(market[cable.id]?.shop).toBe('orion');
  });

  it('applyMarketMin не поднимает цену выше базы', async () => {
    const db = createMemoryDb();
    const cable = SEED_CATALOG.find((m) => m.id === 'cable-vvg-3x2.5')!;
    expect(applyMarketMin([cable], {})[0].priceRub).toBe(cable.priceRub);
    const lowered = applyMarketMin([cable], {
      [cable.id]: { priceRub: 10, shop: 'orion', url: '', observedAt: '' },
    });
    expect(lowered[0].priceRub).toBe(10);
    const raised = applyMarketMin([cable], {
      [cable.id]: { priceRub: 99999, shop: 'orion', url: '', observedAt: '' },
    });
    expect(raised[0].priceRub).toBe(cable.priceRub);
  });

  it('getCatalog подменяет materials рыночным min', async () => {
    const db = createMemoryDb();
    const before = await getCatalog(db);
    const cableBase = before.base.find((m) => m.id === 'cable-vvg-3x2.5')!;
    await db.insert(priceOffers).values([
      offer({
        materialId: cableBase.id,
        priceRub: cableBase.priceRub - 5,
        unit: cableBase.unit,
      }),
    ]);
    const after = await getCatalog(db);
    expect(after.market[cableBase.id]?.priceRub).toBe(cableBase.priceRub - 5);
    expect(after.materials.find((m) => m.id === cableBase.id)?.priceRub).toBe(
      cableBase.priceRub - 5
    );
  });

  it('смета считает по рыночному min (сквозной тест)', async () => {
    const db = createMemoryDb();
    const project = createDefaultProject('plain');
    const seedTotal = calculate(
      project,
      (await getCatalog(db)).materials
    ).totalRub;
    expect(seedTotal).toBeGreaterThan(0);
    // Снижаем цену ходовой позиции вдвое — итог сметы обязан упасть.
    const cable = SEED_CATALOG.find((m) => m.id === 'cable-vvg-3x2.5')!;
    await db.insert(priceOffers).values([
      offer({
        materialId: cable.id,
        priceRub: Math.floor(cable.priceRub / 2),
        unit: cable.unit,
      }),
    ]);
    const lowered = calculate(project, (await getCatalog(db)).materials);
    expect(lowered.totalRub).toBeLessThan(seedTotal);
    const line = lowered.lines.find((l) => l.materialId === cable.id);
    expect(line?.priceRub).toBe(Math.floor(cable.priceRub / 2));
  });

  it('getLatestRun возвращает последний прогон или null', async () => {
    const db = createMemoryDb();
    expect(await getLatestRun(db)).toBeNull();
    const now = new Date().toISOString();
    await db
      .insert(priceRuns)
      .values({ city: 'syktyvkar', status: 'running', startedAt: now });
    await db.insert(priceRuns).values({
      city: 'syktyvkar',
      status: 'partial',
      error: '1/3 без офферов',
      startedAt: now,
      finishedAt: now,
    });
    const run = await getLatestRun(db);
    expect(run?.status).toBe('partial');
    expect(run?.error).toBe('1/3 без офферов');
  });

  it('startPriceRun/finishPriceRun и stale по heartbeat', async () => {
    const db = createMemoryDb();
    const run = await startPriceRun(db);
    expect(run.status).toBe('running');
    expect(await getLatestRun(db)).toMatchObject({ id: run.id });
    // Свежий heartbeat — не stale.
    expect(isPriceRunStale((await getLatestRun(db))!)).toBe(false);
    // Старый heartbeat — stale.
    const stale = {
      ...(await getLatestRun(db))!,
      lastBeatAt: new Date(Date.now() - 60 * 60_000).toISOString(),
    };
    expect(isPriceRunStale(stale)).toBe(true);
    await finishPriceRun(db, run.id, 'timeout', 'boom');
    const done = await getLatestRun(db);
    expect(done?.status).toBe('timeout');
    expect(done?.finishedAt).not.toBeNull();
    expect(isPriceRunStale(done!)).toBe(false);
  });
});
