import { describe, expect, it } from 'vitest';
import {
  clipperAreaMm2,
  diffPolys,
  inflatePoly,
  intersectPolys,
  openingRect,
  polysOverlap,
  rectInFrame,
  rotatedRect,
  subtractOpenings,
  unionPolys,
  wallFootprint,
} from '#lib/plan/polygon';
import { polygonAreaMm2 } from '#lib/plan/geometry';
import { buildSampleFlat } from '#lib/plan/sample';

const SQ = [
  { x: 0, y: 0 },
  { x: 1000, y: 0 },
  { x: 1000, y: 1000 },
  { x: 0, y: 1000 },
];

describe('polygon: clipper-адаптер на целых мм', () => {
  it('площадь совпадает с ручной формулой шнурков', () => {
    expect(clipperAreaMm2(SQ)).toBe(polygonAreaMm2(SQ));
    const tri = [
      { x: 0, y: 0 },
      { x: 4000, y: 0 },
      { x: 0, y: 3000 },
    ];
    expect(clipperAreaMm2(tri)).toBe(polygonAreaMm2(tri));
  });

  it('union двух квадратов: сумма минус пересечение', () => {
    const b = [
      { x: 500, y: 500 },
      { x: 1500, y: 500 },
      { x: 1500, y: 1500 },
      { x: 500, y: 1500 },
    ];
    const u = unionPolys([SQ], [b]);
    const area = u.reduce((s, p) => s + clipperAreaMm2(p), 0);
    expect(area).toBe(1_000_000 + 1_000_000 - 250_000);
  });

  it('difference сквозной полосой даёт два куска', () => {
    const strip = [
      { x: 400, y: -100 },
      { x: 600, y: -100 },
      { x: 600, y: 1100 },
      { x: 400, y: 1100 },
    ];
    const parts = diffPolys([SQ], [strip]);
    expect(parts).toHaveLength(2);
    const area = parts.reduce((s, p) => s + clipperAreaMm2(p), 0);
    expect(area).toBe(1_000_000 - 200_000);
  });

  it('пересечение и касание: грань в грань — не overlap', () => {
    const right = SQ.map((p) => ({ x: p.x + 1000, y: p.y }));
    expect(intersectPolys([SQ], [right])).toHaveLength(0);
    expect(polysOverlap([SQ], [right])).toBe(false);
    const over = SQ.map((p) => ({ x: p.x + 999, y: p.y }));
    expect(polysOverlap([SQ], [over])).toBe(true);
  });

  it('inflate квадрата miter: рамка ровно на delta', () => {
    const grown = inflatePoly(SQ, 100, 'miter');
    expect(grown).toHaveLength(1);
    const xs = grown[0].map((p) => p.x);
    const ys = grown[0].map((p) => p.y);
    expect(Math.min(...xs)).toBe(-100);
    expect(Math.max(...xs)).toBe(1100);
    expect(Math.min(...ys)).toBe(-100);
    expect(Math.max(...ys)).toBe(1100);
    expect(clipperAreaMm2(grown[0])).toBe(1200 * 1200);
  });

  it('footprint стены 6м × 200мм: площадь и прямоугольность', () => {
    const s = buildSampleFlat();
    const fp = wallFootprint(s.walls['w1'], 200);
    expect(fp).toHaveLength(4);
    expect(clipperAreaMm2(fp)).toBe(6000 * 200);
  });

  it('вычитание двери из стены: два куска, площадь сходится', () => {
    const s = buildSampleFlat();
    const wall = s.walls['w1'];
    const fp = wallFootprint(wall, wall.thicknessMm);
    const hole = openingRect(wall, 1000, 900, wall.thicknessMm);
    const parts = subtractOpenings(fp, [hole]);
    expect(parts).toHaveLength(2);
    const area = parts.reduce((sum, p) => sum + clipperAreaMm2(p), 0);
    expect(area).toBe(6000 * 200 - 900 * 200);
    // Куски лежат по бокам проёма: [0..1000] и [1900..6000].
    const spans = parts
      .map((p) => [
        Math.min(...p.map((q) => q.x)),
        Math.max(...p.map((q) => q.x)),
      ])
      .sort((a, b) => a[0] - b[0]);
    expect(spans[0][1]).toBeLessThanOrEqual(1000);
    expect(spans[1][0]).toBeGreaterThanOrEqual(1900);
  });

  it('rotatedRect без поворота — точные углы', () => {
    const r = rotatedRect({ x: 100, y: 200 }, 400, 200, 0);
    expect(r).toEqual([
      { x: -100, y: 100 },
      { x: 300, y: 100 },
      { x: 300, y: 300 },
      { x: -100, y: 300 },
    ]);
  });

  it('rectInFrame строит отрезок вдоль оси стены', () => {
    const s = buildSampleFlat();
    const w2 = s.walls['w2'];
    const r = openingRect(w2, 500, 800, w2.thicknessMm);
    const xs = r.map((p) => p.x);
    const ys = r.map((p) => p.y);
    // Вертикальная стена x=6000: проём y ∈ [500..1300], x ∈ [5900..6100].
    expect(Math.min(...ys)).toBe(500);
    expect(Math.max(...ys)).toBe(1300);
    expect(Math.min(...xs)).toBe(5900);
    expect(Math.max(...xs)).toBe(6100);
  });
});
