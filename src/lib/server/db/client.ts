import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { drizzle, type NodeSQLiteDatabase } from 'drizzle-orm/node-sqlite';
import { migrate } from 'drizzle-orm/node-sqlite/migrator';

import { seedCatalogMaterials } from './seed';

export type Db = NodeSQLiteDatabase;

let instance: Db | null = null;

/** Путь к файлу БД: SQLITE_PATH > DATA_DIR/app.db > ./data/app.db */
export function resolveDbPath(): string {
  const direct = process.env.SQLITE_PATH;
  if (direct) return direct;
  const dir = process.env.DATA_DIR ?? join(process.cwd(), 'data');
  return join(dir, 'app.db');
}

/** Папка с миграциями drizzle (v3 layout, без journal.json). */
export function resolveMigrationsFolder(): string {
  return process.env.MIGRATIONS_FOLDER ?? join(process.cwd(), 'drizzle');
}

export function getDb(): Db {
  if (instance) return instance;
  const path = resolveDbPath();
  mkdirSync(dirname(path), { recursive: true });
  const client = new DatabaseSync(path);
  client.exec(
    'PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;'
  );
  const db = drizzle({ client });
  migrate(db, { migrationsFolder: resolveMigrationsFolder() });
  seedCatalogMaterials(db);
  instance = db;
  return instance;
}

/** Для тестов: in-memory БД с той же схемой, без миграций на диске. */
export function createMemoryDb(): Db {
  const client = new DatabaseSync(':memory:');
  const db = drizzle({ client });
  client.exec(
    `CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
     CREATE TABLE catalog_materials (id TEXT PRIMARY KEY, category TEXT NOT NULL, name TEXT NOT NULL, unit TEXT NOT NULL, price_rub INTEGER NOT NULL, article TEXT, waste_pct INTEGER);
     CREATE TABLE catalog_overrides (material_id TEXT PRIMARY KEY, price_rub INTEGER, waste_pct INTEGER);`
  );
  seedCatalogMaterials(db);
  return db;
}
