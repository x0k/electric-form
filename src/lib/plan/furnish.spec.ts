import { describe, expect, it } from 'vitest';
import { applyOperation, type Operation } from '#lib/plan/operations';
import { createEmptyApartment, type ApartmentState } from '#lib/plan/model';
import { floorCenterMm } from '#lib/plan/furnish';

const BASE: Operation[] = [
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
  {
    type: 'addWall',
    wallId: 'w3',
    a: { x: 6000, y: 4000 },
    b: { x: 0, y: 4000 },
    thicknessMm: 200,
    heightMm: 2700,
  },
  {
    type: 'addWall',
    wallId: 'w4',
    a: { x: 0, y: 4000 },
    b: { x: 0, y: 0 },
    thicknessMm: 200,
    heightMm: 2700,
  },
  {
    type: 'addRoom',
    roomId: 'r1',
    name: 'Гостиная',
    outline: [
      { x: 0, y: 0 },
      { x: 6000, y: 0 },
      { x: 6000, y: 4000 },
      { x: 0, y: 4000 },
    ],
    wallIds: ['w1', 'w2', 'w3', 'w4'],
  },
];

function applyAll(base: ApartmentState, ops: Operation[]): ApartmentState {
  let s = base;
  for (const op of ops) {
    const r = applyOperation(s, op);
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (r.ok) s = r.state;
  }
  return s;
}

describe('параметрические объекты: якоря вместо случайных координат', () => {
  it('шкаф у стены: якорь wall, следует за стеной', () => {
    let s = applyAll(createEmptyApartment(), BASE);
    s = applyAll(s, [
      {
        type: 'addFloorObject',
        objectId: 'ward1',
        kind: 'wardrobe',
        anchor: {
          type: 'wall',
          wallId: 'w1',
          alongMm: 2000,
          fromWallMm: 50,
          rotationDeg: 0,
        },
      },
    ]);
    const c1 = floorCenterMm(s, s.floorObjects['ward1']);
    expect(c1).toBeDefined();
    // Стена удлинилась — объект на том же along, центр по новой оси.
    const r = applyOperation(s, {
      type: 'updateWall',
      wallId: 'w1',
      b: { x: 7000, y: 0 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.floorObjects['ward1'].anchor).toMatchObject({
      alongMm: 2000,
      fromWallMm: 50,
    });
  });

  it('кровать в углу комнаты: якорь corner резолвится детерминированно', () => {
    let s = applyAll(createEmptyApartment(), BASE);
    s = applyAll(s, [
      {
        type: 'addFloorObject',
        objectId: 'bed1',
        kind: 'bedDouble',
        anchor: {
          type: 'corner',
          roomId: 'r1',
          corner: 'SW',
          dxMm: 800,
          dyMm: 1000,
          rotationDeg: 0,
        },
      },
    ]);
    const c = floorCenterMm(s, s.floorObjects['bed1']);
    expect(c).toEqual({ x: 800, y: 1000 });
  });

  it('навесной шкафчик висит на стене с высотой', () => {
    let s = applyAll(createEmptyApartment(), BASE);
    s = applyAll(s, [
      {
        type: 'addWallObject',
        objectId: 'cab1',
        kind: 'wallCabinet',
        anchor: { wallId: 'w1', alongMm: 3000, heightMm: 1500 },
      },
    ]);
    expect(s.wallObjects['cab1'].anchor.heightMm).toBe(1500);
    const bad = applyOperation(s, {
      type: 'addWallObject',
      objectId: 'cab2',
      kind: 'wallCabinet',
      anchor: { wallId: 'ghost', alongMm: 1000, heightMm: 1500 },
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.code).toBe('UNKNOWN_HOST');
  });

  it('габариты вне каталога и мусорный якорь отклоняются', () => {
    let s = applyAll(createEmptyApartment(), BASE);
    const wide = applyOperation(s, {
      type: 'addFloorObject',
      objectId: 'w1x',
      kind: 'wardrobe',
      wMm: 5000,
      anchor: {
        type: 'room',
        roomId: 'r1',
        xMm: 3000,
        yMm: 2000,
        rotationDeg: 0,
      },
    });
    expect(wide.ok).toBe(false);
    const wallKind = applyOperation(s, {
      type: 'addFloorObject',
      objectId: 'w2x',
      kind: 'wallCabinet',
      anchor: {
        type: 'room',
        roomId: 'r1',
        xMm: 3000,
        yMm: 2000,
        rotationDeg: 0,
      },
    });
    expect(wallKind.ok).toBe(false);
    const offWall = applyOperation(s, {
      type: 'addFloorObject',
      objectId: 'w3x',
      kind: 'wardrobe',
      anchor: {
        type: 'wall',
        wallId: 'w1',
        alongMm: 5900,
        fromWallMm: 0,
        rotationDeg: 0,
      },
    });
    // along 5900 при ширине 1200 выходит за стену 6000.
    expect(offWall.ok).toBe(false);
  });
});
