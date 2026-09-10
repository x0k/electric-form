import { describe, expect, it } from 'vitest';
import {
  SEED_CATALOG,
  applyOverrides,
  catalogById,
  DEFAULT_WASTE_PCT,
} from '#lib/catalog/index';

describe('catalog overrides', () => {
  it('без правок возвращает тот же массив', () => {
    expect(applyOverrides(SEED_CATALOG, {})).toBe(SEED_CATALOG);
  });

  it('переопределяет цену и запас точечно', () => {
    const out = applyOverrides(SEED_CATALOG, {
      'cable-vvg-3x2.5': { priceRub: 200 },
      'fix-clips': { wastePct: 30 },
    });
    expect(out.find((m) => m.id === 'cable-vvg-3x2.5')?.priceRub).toBe(200);
    expect(out.find((m) => m.id === 'cable-vvg-3x1.5')?.priceRub).toBe(75);
    expect(out.find((m) => m.id === 'fix-clips')?.wastePct).toBe(30);
    // seed не мутирует
    expect(SEED_CATALOG.find((m) => m.id === 'cable-vvg-3x2.5')?.priceRub).toBe(
      120
    );
  });

  it('catalogById строит индекс', () => {
    const byId = catalogById(SEED_CATALOG);
    expect(byId.get('socket-220')?.priceRub).toBeGreaterThan(0);
    expect(byId.size).toBe(SEED_CATALOG.length);
  });

  it('дефолты запаса заданы для всех категорий', () => {
    for (const m of SEED_CATALOG) {
      const w = m.wastePct ?? DEFAULT_WASTE_PCT[m.category];
      expect(w).toBeGreaterThanOrEqual(0);
    }
  });
});
