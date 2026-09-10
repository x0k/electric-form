import { eq } from 'drizzle-orm';
import { applyOverrides, type OverrideMap } from '#lib/catalog/catalog';
import { DEFAULT_WASTE_PCT, type Material } from '#lib/catalog/types';
import type { Db } from './client';
import { catalogMaterials, catalogOverrides } from './schema';

export interface CatalogData {
  /** База без overrides (для инпутов и сравнения). */
  base: Material[];
  /** База с применёнными overrides (для расчётов). */
  materials: Material[];
  overrides: OverrideMap;
}

export async function getCatalog(db: Db): Promise<CatalogData> {
  const [mats, ovs] = await Promise.all([
    db.select().from(catalogMaterials),
    db.select().from(catalogOverrides),
  ]);
  const base: Material[] = mats.map((m) => ({
    id: m.id,
    category: m.category as Material['category'],
    name: m.name,
    unit: m.unit as Material['unit'],
    priceRub: m.priceRub,
    ...(m.article ? { article: m.article } : {}),
    ...(m.wastePct != null ? { wastePct: m.wastePct } : {}),
  }));
  const overrides: OverrideMap = {};
  for (const o of ovs) {
    const entry: { priceRub?: number; wastePct?: number } = {};
    if (o.priceRub != null) entry.priceRub = o.priceRub;
    if (o.wastePct != null) entry.wastePct = o.wastePct;
    if (Object.keys(entry).length > 0) overrides[o.materialId] = entry;
  }
  return { base, materials: applyOverrides(base, overrides), overrides };
}

export interface OverrideInput {
  priceRub?: number;
  wastePct?: number;
}

/**
 * Сохранить переопределение. Значения, совпадающие с базой, стираются
 * (строка удаляется, если пуста) — как раньше в localStorage-слое.
 */
export async function setOverride(
  db: Db,
  id: string,
  input: OverrideInput
): Promise<void> {
  const rows = await db
    .select()
    .from(catalogMaterials)
    .where(eq(catalogMaterials.id, id));
  if (rows.length === 0) throw new Error(`Неизвестный материал: ${id}`);
  const base = rows[0];

  const next: OverrideInput = {};
  if (
    input.priceRub != null &&
    Number.isFinite(input.priceRub) &&
    Math.round(input.priceRub) !== base.priceRub &&
    Math.round(input.priceRub) >= 0
  ) {
    next.priceRub = Math.round(input.priceRub);
  }
  const baseWaste =
    base.wastePct ?? DEFAULT_WASTE_PCT[base.category as Material['category']];
  if (
    input.wastePct != null &&
    Number.isFinite(input.wastePct) &&
    Math.round(input.wastePct) !== baseWaste
  ) {
    next.wastePct = Math.min(100, Math.max(0, Math.round(input.wastePct)));
  }

  if (next.priceRub == null && next.wastePct == null) {
    await db
      .delete(catalogOverrides)
      .where(eq(catalogOverrides.materialId, id));
    return;
  }
  await db
    .insert(catalogOverrides)
    .values({ materialId: id, ...next })
    .onConflictDoUpdate({
      target: catalogOverrides.materialId,
      set: { priceRub: next.priceRub ?? null, wastePct: next.wastePct ?? null },
    });
}

export async function resetOverride(db: Db, id: string): Promise<void> {
  await db.delete(catalogOverrides).where(eq(catalogOverrides.materialId, id));
}

export async function resetAllOverrides(db: Db): Promise<void> {
  await db.delete(catalogOverrides);
}
