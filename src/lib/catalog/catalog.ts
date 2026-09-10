import seed from './seed.json';
import type { CatalogOverride, Material } from './types';

export const SEED_CATALOG: Material[] = seed as Material[];

export type OverrideMap = Record<string, CatalogOverride>;

export function applyOverrides(
  seedCatalog: Material[],
  overrides: OverrideMap
): Material[] {
  if (Object.keys(overrides).length === 0) return seedCatalog;
  return seedCatalog.map((m) => {
    const o = overrides[m.id];
    return o ? { ...m, ...o } : m;
  });
}

export function catalogById(catalog: Material[]): Map<string, Material> {
  return new Map(catalog.map((m) => [m.id, m]));
}
