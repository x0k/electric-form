import seed from '#lib/catalog/seed.json';
import type { Material } from '#lib/catalog/types';
import { catalogMaterials } from './schema';
import type { Db } from './client';

const SEED = seed as Material[];

/**
 * Сид базового прайса: вставляет недостающие позиции, существующие
 * не трогает. Переопределения живут в отдельной таблице и не затираются.
 */
export function seedCatalogMaterials(db: Db): void {
  const rows = SEED.map((m) => ({
    id: m.id,
    category: m.category,
    name: m.name,
    unit: m.unit,
    priceRub: m.priceRub,
    article: m.article ?? null,
    wastePct: m.wastePct ?? null,
  }));
  db.insert(catalogMaterials).values(rows).onConflictDoNothing().run();
}
