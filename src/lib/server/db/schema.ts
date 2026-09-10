import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Проекты хранятся JSON-блобом целиком (валидация — valibot ProjectSchema
 * на записи). `name` денормализовано для списка без парсинга JSON.
 */
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  data: text('data').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

/** Базовый прайс каталога (сид из seed.json при старте). */
export const catalogMaterials = sqliteTable('catalog_materials', {
  id: text('id').primaryKey(),
  category: text('category').notNull(),
  name: text('name').notNull(),
  unit: text('unit').notNull(),
  priceRub: integer('price_rub').notNull(),
  article: text('article'),
  wastePct: integer('waste_pct'),
});

/** Пользовательские переопределения цены/запаса поверх базы. */
export const catalogOverrides = sqliteTable('catalog_overrides', {
  materialId: text('material_id').primaryKey(),
  priceRub: integer('price_rub'),
  wastePct: integer('waste_pct'),
});

/** Прогоны Go-парсера цен (parsers/). */
export const priceRuns = sqliteTable('price_runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  city: text('city').notNull(),
  status: text('status').notNull(),
  error: text('error'),
  startedAt: text('started_at').notNull(),
  finishedAt: text('finished_at'),
});

/** Сырые офферы магазинов: все цены хранятся, смета берет min. */
export const priceOffers = sqliteTable('price_offers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  runId: integer('run_id'),
  materialId: text('material_id').notNull(),
  shop: text('shop').notNull(),
  title: text('title').notNull(),
  url: text('url').notNull(),
  article: text('article'),
  priceRub: integer('price_rub').notNull(),
  unit: text('unit').notNull(),
  inStock: integer('in_stock').notNull(),
  city: text('city').notNull(),
  observedAt: text('observed_at').notNull(),
});

export type ProjectRow = typeof projects.$inferSelect;
export type MaterialRow = typeof catalogMaterials.$inferSelect;
export type OverrideRow = typeof catalogOverrides.$inferSelect;
export type PriceRunRow = typeof priceRuns.$inferSelect;
export type PriceOfferRow = typeof priceOffers.$inferSelect;
