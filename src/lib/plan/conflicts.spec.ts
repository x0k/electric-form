import { describe, expect, it } from 'vitest';
import { applyOperation, type Operation } from '#lib/plan/operations';
import { createEmptyApartment, type ApartmentState } from '#lib/plan/model';
import { detectConflicts, removeOpForEntity } from '#lib/plan/conflicts';

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

describe('conflicts: распах проверяется габаритом, а не центром', () => {
  it('край шкафа в распахе — конфликт, хотя центр снаружи', () => {
    // Распах d1: x ∈ [1000..1900]. Шкаф 1200 wide центром на 600:
    // footprint [0..1200] заходит в распах на 200 мм.
    let s = applyAll(createEmptyApartment(), BASE);
    s = applyAll(s, [
      {
        type: 'addFloorObject',
        objectId: 'ward1',
        kind: 'wardrobe',
        anchor: {
          type: 'wall',
          wallId: 'w1',
          alongMm: 600,
          fromWallMm: 50,
          rotationDeg: 0,
        },
      },
    ]);
    const conflicts = detectConflicts(s);
    expect(conflicts.some((c) => c.code === 'OBJECT_BLOCKS_DOOR')).toBe(true);
  });

  it('далёкий шкаф — чисто', () => {
    let s = applyAll(createEmptyApartment(), BASE);
    s = applyAll(s, [
      {
        type: 'addFloorObject',
        objectId: 'ward1',
        kind: 'wardrobe',
        anchor: {
          type: 'wall',
          wallId: 'w1',
          alongMm: 4000,
          fromWallMm: 50,
          rotationDeg: 0,
        },
      },
    ]);
    expect(detectConflicts(s)).toEqual([]);
  });

  it('removeOpForEntity строит удаление по префиксу id', () => {
    expect(removeOpForEntity('d')).toMatchObject({
      type: 'deleteOpening',
      openingId: 'd',
    });
    expect(removeOpForEntity('win-2')).toMatchObject({
      type: 'deleteOpening',
      openingId: 'win-2',
    });
    expect(removeOpForEntity('f')).toMatchObject({
      type: 'removeFloorObject',
      objectId: 'f',
    });
    expect(removeOpForEntity('m')).toMatchObject({
      type: 'removeWallObject',
      objectId: 'm',
    });
    expect(removeOpForEntity('sk-3')).toMatchObject({
      type: 'removeElecPoint',
      pointId: 'sk-3',
    });
    expect(removeOpForEntity('lt-2')).toMatchObject({
      type: 'removeLuminaire',
      luminaireId: 'lt-2',
    });
    // Стены и мусор удалять нечем — только через диалог/панель.
    expect(removeOpForEntity('w1')).toBeNull();
    expect(removeOpForEntity('')).toBeNull();
  });
});
