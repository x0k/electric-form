import { describe, expect, it } from 'vitest';
import { applyOperation, type Operation } from '#lib/plan/operations';
import { createEmptyApartment, type ApartmentState } from '#lib/plan/model';
import { detectConflicts } from '#lib/plan/conflicts';
import { suggestElec, suggestLights } from '#lib/plan/autoplace';

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

describe('электрика, свет, конфликты, автопредложения', () => {
  it('розетка и выключатель с назначением и группой', () => {
    let s = applyAll(createEmptyApartment(), BASE);
    s = applyAll(s, [
      { type: 'upsertElecGroup', groupId: 'g1', label: 'Группа 1' },
      {
        type: 'addElecPoint',
        pointId: 'sk1',
        kind: 'socket',
        wallId: 'w2',
        alongMm: 2000,
        heightMm: 300,
        purpose: 'ТВ',
        groupId: 'g1',
      },
      {
        type: 'addElecPoint',
        pointId: 'sw1',
        kind: 'switch',
        wallId: 'w1',
        alongMm: 2100,
        heightMm: 900,
        purpose: 'Свет',
        groupId: null,
      },
    ]);
    expect(s.elecPoints['sk1'].purpose).toBe('ТВ');
    const bad = applyOperation(s, {
      type: 'addElecPoint',
      pointId: 'sk2',
      kind: 'socket',
      wallId: 'ghost',
      alongMm: 100,
      heightMm: 300,
      purpose: 'x',
      groupId: null,
    });
    expect(bad.ok).toBe(false);
  });

  it('светильник внутри комнаты, вне — отказ', () => {
    let s = applyAll(createEmptyApartment(), BASE);
    s = applyAll(s, [
      { type: 'upsertLightGroup', groupId: 'lg1', label: 'Потолок' },
      {
        type: 'addLuminaire',
        luminaireId: 'lt1',
        kind: 'ceilingLamp',
        roomId: 'r1',
        xMm: 3000,
        yMm: 2000,
        groupId: 'lg1',
      },
    ]);
    expect(s.luminaires['lt1'].kind).toBe('ceilingLamp');
    const bad = applyOperation(s, {
      type: 'addLuminaire',
      luminaireId: 'lt2',
      kind: 'spot',
      roomId: 'r1',
      xMm: 9000,
      yMm: 9000,
      groupId: null,
    });
    expect(bad.ok).toBe(false);
  });

  it('конфликты: розетка у проёма и шкаф в распахе двери', () => {
    let s = applyAll(createEmptyApartment(), BASE);
    s = applyAll(s, [
      {
        type: 'addElecPoint',
        pointId: 'sk1',
        kind: 'socket',
        wallId: 'w1',
        alongMm: 1200,
        heightMm: 300,
        purpose: 'x',
        groupId: null,
      },
      {
        type: 'addFloorObject',
        objectId: 'ward1',
        kind: 'wardrobe',
        anchor: {
          type: 'wall',
          wallId: 'w1',
          alongMm: 1450,
          fromWallMm: 100,
          rotationDeg: 0,
        },
      },
    ]);
    const conflicts = detectConflicts(s);
    expect(conflicts.some((c) => c.code === 'ELEC_TOO_CLOSE')).toBe(true);
    expect(conflicts.some((c) => c.code === 'OBJECT_BLOCKS_DOOR')).toBe(true);
  });

  it('авто: выключатель у двери, розетки под технику, свет в центр', () => {
    let s = applyAll(createEmptyApartment(), BASE);
    s = applyAll(s, [
      {
        type: 'addFloorObject',
        objectId: 'fr1',
        kind: 'fridge',
        anchor: {
          type: 'room',
          roomId: 'r1',
          xMm: 5500,
          yMm: 500,
          rotationDeg: 0,
        },
      },
    ]);
    const { switches, sockets } = suggestElec(s);
    expect(switches.length).toBeGreaterThanOrEqual(1);
    expect(switches[0].heightMm).toBe(900);
    // Розетка под холодильник + дежурные.
    expect(sockets.length).toBeGreaterThanOrEqual(2);
    // Повторный прогон детерминирован.
    const again = suggestElec(s);
    expect(again.switches.map((x) => x.id)).toEqual(switches.map((x) => x.id));
    const lights = suggestLights(s);
    expect(lights.length).toBeGreaterThanOrEqual(1);
    expect(lights[0]).toMatchObject({ roomId: 'r1', kind: 'ceilingLamp' });
  });
});
