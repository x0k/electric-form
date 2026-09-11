import { describe, expect, it } from 'vitest';
import { applyOperation, type Operation } from '#lib/plan/operations';
import { createEmptyApartment, findDependents } from '#lib/plan/model';
import { openingCenterMm } from '#lib/plan/openings';
import type { ApartmentState } from '#lib/plan/model';

function wallOps(): Operation[] {
  return [
    {
      type: 'addWall',
      wallId: 'w1',
      a: { x: 0, y: 0 },
      b: { x: 6000, y: 0 },
      thicknessMm: 200,
      heightMm: 2700,
    },
    {
      type: 'addWall',
      wallId: 'w2',
      a: { x: 6000, y: 0 },
      b: { x: 6000, y: 4000 },
      thicknessMm: 200,
      heightMm: 2700,
    },
  ];
}

function applyAll(base: ApartmentState, ops: Operation[]): ApartmentState {
  let s = base;
  for (const op of ops) {
    const r = applyOperation(s, op);
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (r.ok) s = r.state;
  }
  return s;
}

describe('проёмы: отдельный параметрический этап', () => {
  it('дверь и окно встают на стену по offset/width', () => {
    let s = applyAll(createEmptyApartment(), wallOps());
    s = applyAll(s, [
      {
        type: 'addOpening',
        openingId: 'd1',
        kind: 'door',
        wallId: 'w1',
        offsetMm: 1000,
        widthMm: 900,
        heightMm: 2000,
        sillMm: 0,
      },
      {
        type: 'addOpening',
        openingId: 'win1',
        kind: 'window',
        wallId: 'w1',
        offsetMm: 3000,
        widthMm: 1500,
        heightMm: 1400,
        sillMm: 900,
      },
    ]);
    expect(Object.keys(s.openings)).toEqual(['d1', 'win1']);
    const c = openingCenterMm(s.walls['w1'], s.openings['d1']);
    expect(c).toEqual({ x: 1450, y: 0 });
  });

  it('проём следует за стеной: параметры не меняются при updateWall', () => {
    let s = applyAll(createEmptyApartment(), wallOps());
    s = applyAll(s, [
      {
        type: 'addOpening',
        openingId: 'd1',
        kind: 'door',
        wallId: 'w1',
        offsetMm: 1000,
        widthMm: 900,
        heightMm: 2000,
        sillMm: 0,
      },
    ]);
    const r = applyOperation(s, {
      type: 'updateWall',
      wallId: 'w1',
      b: { x: 7000, y: 0 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Параметры те же, центр пересчитался по новой длине.
    expect(r.state.openings['d1'].offsetMm).toBe(1000);
    expect(
      openingCenterMm(r.state.walls['w1'], r.state.openings['d1'])
    ).toEqual({ x: 1450, y: 0 });
  });

  it('наложение и выход за стену отклоняются', () => {
    let s = applyAll(createEmptyApartment(), wallOps());
    s = applyAll(s, [
      {
        type: 'addOpening',
        openingId: 'd1',
        kind: 'door',
        wallId: 'w1',
        offsetMm: 1000,
        widthMm: 900,
        heightMm: 2000,
        sillMm: 0,
      },
    ]);
    const overlap = applyOperation(s, {
      type: 'addOpening',
      openingId: 'd2',
      kind: 'door',
      wallId: 'w1',
      offsetMm: 1500,
      widthMm: 900,
      heightMm: 2000,
      sillMm: 0,
    });
    expect(overlap.ok).toBe(false);
    const outside = applyOperation(s, {
      type: 'addOpening',
      openingId: 'w9',
      kind: 'window',
      wallId: 'w1',
      offsetMm: 5000,
      widthMm: 1500,
      heightMm: 1400,
      sillMm: 900,
    });
    expect(outside.ok).toBe(false);
    const offgrid = applyOperation(s, {
      type: 'addOpening',
      openingId: 'd3',
      kind: 'door',
      wallId: 'w1',
      offsetMm: 1005,
      widthMm: 900,
      heightMm: 2000,
      sillMm: 0,
    });
    expect(offgrid.ok).toBe(false);
    if (!offgrid.ok) expect(offgrid.error.code).toBe('OFF_GRID');
  });

  it('удаление стены блокируется проёмом и каскад его сносит', () => {
    let s = applyAll(createEmptyApartment(), wallOps());
    s = applyAll(s, [
      {
        type: 'addOpening',
        openingId: 'd1',
        kind: 'door',
        wallId: 'w1',
        offsetMm: 1000,
        widthMm: 900,
        heightMm: 2000,
        sillMm: 0,
      },
    ]);
    expect(findDependents(s, 'w1').some((d) => d.id === 'd1')).toBe(true);
    const blocked = applyOperation(s, { type: 'deleteWall', wallId: 'w1' });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error.code).toBe('HAS_DEPENDENTS');
    const cascade = applyOperation(s, {
      type: 'deleteWall',
      wallId: 'w1',
      cascade: true,
    });
    expect(cascade.ok).toBe(true);
    if (cascade.ok) expect(cascade.state.openings['d1']).toBeUndefined();
  });
});
