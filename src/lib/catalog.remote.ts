import { command, query } from '$app/server';
import { error } from '@sveltejs/kit';
import * as v from 'valibot';
import { getDb } from '#lib/server/db/client';
import {
  getCatalog,
  resetAllOverrides,
  resetOverride,
  setOverride,
} from '#lib/server/db/catalog';

const idSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(128));

const overrideSchema = v.object({
  priceRub: v.optional(v.pipe(v.number(), v.minValue(0))),
  wastePct: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(100))),
});

export const getCatalogData = query(async () => {
  return getCatalog(getDb());
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
