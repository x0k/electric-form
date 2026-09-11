import { describe, expect, it } from 'vitest';
import { applyOperation, type Operation } from '#lib/plan/operations';
import { createEmptyApartment, type ApartmentState } from '#lib/plan/model';
import { modelToScene, selectableIds } from '#lib/plan/render';

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

describe('render: проёмы и параметрика в сцене', () => {
  it('проём, мебель, электрика и свет попадают в сцену с id 1-в-1', () => {
    let s = applyAll(createEmptyApartment(), BASE);
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
      {
        type: 'addWallObject',
        objectId: 'cab1',
        kind: 'wallCabinet',
        anchor: { wallId: 'w2', alongMm: 2000, heightMm: 1500 },
      },
      {
        type: 'addElecPoint',
        pointId: 'sk1',
        kind: 'socket',
        wallId: 'w2',
        alongMm: 1000,
        heightMm: 300,
        purpose: 'ТВ',
        groupId: null,
      },
      {
        type: 'addLuminaire',
        luminaireId: 'lt1',
        kind: 'ceilingLamp',
        roomId: 'r1',
        xMm: 3000,
        yMm: 2000,
        groupId: null,
      },
    ]);
    const scene = modelToScene(s);
    expect(scene.openings).toHaveLength(1);
    expect(scene.openings[0]).toMatchObject({
      id: 'd1',
      wallId: 'w1',
      widthMm: 900,
      cxMm: 1450,
      cyMm: 0,
    });
    // Концы проёма лежат на оси стены.
    expect(scene.openings[0].p0).toEqual({ x: 1000, y: 0 });
    expect(scene.openings[0].p1).toEqual({ x: 1900, y: 0 });
    expect(scene.floorObjects).toHaveLength(1);
    expect(scene.floorObjects[0].id).toBe('ward1');
    expect(scene.wallObjects).toHaveLength(1);
    expect(scene.wallObjects[0]).toMatchObject({ id: 'cab1', zMm: 1500 });
    expect(scene.elec).toHaveLength(1);
    expect(scene.elec[0]).toMatchObject({ id: 'sk1', zMm: 300 });
    expect(scene.lights).toHaveLength(1);
    // Все id выбираемы.
    const ids = selectableIds(scene);
    for (const id of ['d1', 'ward1', 'cab1', 'sk1', 'lt1']) {
      expect(ids).toContain(id);
    }
  });

  it('пустая модель даёт пустые слои, bounds дефолтные', () => {
    const scene = modelToScene(createEmptyApartment());
    expect(scene.openings).toEqual([]);
    expect(scene.floorObjects).toEqual([]);
    expect(scene.elec).toEqual([]);
    expect(scene.lights).toEqual([]);
  });
});
