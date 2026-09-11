import { beforeAll, describe, expect, it } from 'vitest';
import { ensureGcsLoaded, isGcsLoaded, solveWithGcs } from '#lib/plan/gcs';

beforeAll(async () => {
  await ensureGcsLoaded();
  expect(isGcsLoaded()).toBe(true);
});

describe('gcs: маппинг и семантика', () => {
  it('прямоугольник решается в миллиметрах', () => {
    const out = solveWithGcs(
      [
        { id: 'p1', x: 0, y: 0, fixed: true },
        { id: 'p2', x: 6000, y: 10 },
        { id: 'p3', x: 6010, y: 4000 },
        { id: 'p4', x: 0, y: 4000 },
      ],
      [
        { id: 'c1', type: 'horizontal', a: 'p1', b: 'p2' },
        { id: 'c2', type: 'vertical', a: 'p2', b: 'p3' },
        { id: 'c3', type: 'horizontal', a: 'p3', b: 'p4' },
        { id: 'c4', type: 'vertical', a: 'p4', b: 'p1' },
        { id: 'c5', type: 'length', a: 'p1', b: 'p2', lengthMm: 6000 },
      ]
    );
    expect(out.ok).toBe(true);
    expect(out.conflictingIds).toEqual([]);
    expect(out.points['p2'].y).toBeCloseTo(0, 6);
    expect(out.points['p3'].x).toBeCloseTo(6000, 3);
    expect(
      Math.hypot(out.points['p2'].x - 0, out.points['p2'].y - 0)
    ).toBeCloseTo(6000, 3);
  });

  it('без фиксации решение плавает, но constraints держатся', () => {
    const out = solveWithGcs(
      [
        { id: 'p1', x: 0, y: 10 },
        { id: 'p2', x: 6000, y: 0 },
      ],
      [{ id: 'c1', type: 'horizontal', a: 'p1', b: 'p2' }]
    );
    expect(out.ok).toBe(true);
    // Горизонталь выполнена (где именно — решает solver).
    expect(out.points['p1'].y).toBeCloseTo(out.points['p2'].y, 6);
  });

  it('фиксированная точка стоит, остальные следуют', () => {
    const out = solveWithGcs(
      [
        { id: 'p1', x: 0, y: 0 },
        { id: 'p2', x: 6500, y: 500, fixed: true },
      ],
      [
        { id: 'c1', type: 'horizontal', a: 'p1', b: 'p2' },
        { id: 'c2', type: 'length', a: 'p1', b: 'p2', lengthMm: 6000 },
      ]
    );
    expect(out.ok).toBe(true);
    expect(out.points['p2']).toEqual({ x: 6500, y: 500 });
    expect(out.points['p1'].y).toBeCloseTo(500, 6);
    expect(Math.hypot(out.points['p2'].x - out.points['p1'].x, 0)).toBeCloseTo(
      6000,
      3
    );
  });

  it('coincident сводит пару', () => {
    const out = solveWithGcs(
      [
        { id: 'p1', x: 0, y: 0 },
        { id: 'p2', x: 1000, y: 0 },
      ],
      [{ id: 'c1', type: 'coincident', a: 'p1', b: 'p2' }]
    );
    expect(out.ok).toBe(true);
    expect(out.points['p1'].x).toBeCloseTo(out.points['p2'].x, 6);
    expect(out.points['p1'].y).toBeCloseTo(out.points['p2'].y, 6);
  });

  it('настоящий конфликт: статус и виновные по нашим id', () => {
    const out = solveWithGcs(
      [
        { id: 'p1', x: 0, y: 0, fixed: true },
        { id: 'p2', x: 6000, y: 0 },
      ],
      [
        { id: 'c1', type: 'horizontal', a: 'p1', b: 'p2' },
        { id: 'c2', type: 'vertical', a: 'p1', b: 'p2' },
        { id: 'c3', type: 'length', a: 'p1', b: 'p2', lengthMm: 6000 },
      ]
    );
    expect(out.ok).toBe(false);
    // Вертикаль и длина против горизонтали при фиксированном начале.
    expect(out.conflictingIds).toContain('c2');
    expect(out.conflictingIds).toContain('c3');
  });

  it('битые ссылки пропускаются, а не роняют solve', () => {
    const out = solveWithGcs(
      [{ id: 'p1', x: 0, y: 0 }],
      [{ id: 'c1', type: 'horizontal', a: 'p1', b: 'ghost' }]
    );
    expect(out.ok).toBe(true);
    expect(out.points['p1']).toEqual({ x: 0, y: 0 });
  });
});
