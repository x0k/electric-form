import { describe, expect, it } from 'vitest';
import { applyOperation, type Operation } from '#lib/plan/operations';
import {
  createEmptyApartment,
  findDependents,
  type ApartmentState,
} from '#lib/plan/model';

/** Прямоугольная комната 6×4 м: 4 стены + помещение + пол/потолок. */
function buildFlatOps(): Operation[] {
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
      type: 'upsertSlab',
      slabId: 'floor1',
      kind: 'floor',
      levelMm: 0,
      thicknessMm: 200,
      outline: [
        { x: 0, y: 0 },
        { x: 6000, y: 0 },
        { x: 6000, y: 4000 },
        { x: 0, y: 4000 },
      ],
    },
    {
      type: 'upsertSlab',
      slabId: 'ceil1',
      kind: 'ceiling',
      levelMm: 2700,
      thicknessMm: 200,
      outline: [
        { x: 0, y: 0 },
        { x: 6000, y: 0 },
        { x: 6000, y: 4000 },
        { x: 0, y: 4000 },
      ],
    },
  ];
}

function applyAll(base: ApartmentState, ops: Operation[]): ApartmentState {
  let state = base;
  for (const op of ops) {
    const res = applyOperation(state, op);
    expect(res.ok, JSON.stringify(res)).toBe(true);
    if (res.ok) state = res.state;
  }
  return state;
}

describe('plan model: реальная квартира без UI', () => {
  it('строит контур, стены, помещение, пол и потолок', () => {
    const state = applyAll(createEmptyApartment(), buildFlatOps());
    expect(Object.keys(state.walls)).toHaveLength(4);
    expect(state.rooms['r1'].name).toBe('Гостиная');
    expect(state.rooms['r1'].wallIds).toEqual(['w1', 'w2', 'w3', 'w4']);
    expect(state.slabs['floor1'].kind).toBe('floor');
    expect(state.slabs['ceil1'].levelMm).toBe(2700);
  });

  it('редактирует стену и размеры помещения', () => {
    let state = applyAll(createEmptyApartment(), buildFlatOps());
    const res = applyOperation(state, {
      type: 'updateWall',
      wallId: 'w2',
      b: { x: 6000, y: 5000 },
    });
    expect(res.ok).toBe(true);
    if (res.ok) state = res.state;
    expect(state.walls['w2'].b).toEqual({ x: 6000, y: 5000 });
  });

  it('отклоняет координаты вне сетки 1 см', () => {
    const res = applyOperation(createEmptyApartment(), {
      type: 'addWall',
      wallId: 'w1',
      a: { x: 0, y: 0 },
      b: { x: 6005, y: 0 },
      thicknessMm: 120,
      heightMm: 2700,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('OFF_GRID');
  });

  it('отклоняет слишком короткую стену и крошечное помещение', () => {
    const short = applyOperation(createEmptyApartment(), {
      type: 'addWall',
      wallId: 'w1',
      a: { x: 0, y: 0 },
      b: { x: 50, y: 0 },
      thicknessMm: 120,
      heightMm: 2700,
    });
    expect(short.ok).toBe(false);

    const tiny = applyOperation(createEmptyApartment(), {
      type: 'addRoom',
      roomId: 'r1',
      name: 'Кладовка',
      outline: [
        { x: 0, y: 0 },
        { x: 500, y: 0 },
        { x: 500, y: 500 },
        { x: 0, y: 500 },
      ],
      wallIds: [],
    });
    expect(tiny.ok).toBe(false);
    if (!tiny.ok) expect(tiny.error.code).toBe('BAD_GEOMETRY');
  });

  it('удаление стены с зависимостями требует подтверждения', () => {
    const state = applyAll(createEmptyApartment(), buildFlatOps());
    const dependents = findDependents(state, 'w1');
    expect(dependents.length).toBeGreaterThanOrEqual(1);

    const blocked = applyOperation(state, { type: 'deleteWall', wallId: 'w1' });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.error.code).toBe('HAS_DEPENDENTS');
      expect(blocked.error.message).toMatch(/продолжить/i);
      expect(blocked.error.dependents?.length).toBe(dependents.length);
    }

    // Незаметное удаление запрещено: без cascade стена остаётся.
    expect(state.walls['w1']).toBeDefined();

    const cascade = applyOperation(state, {
      type: 'deleteWall',
      wallId: 'w1',
      cascade: true,
    });
    expect(cascade.ok).toBe(true);
    if (cascade.ok) {
      expect(cascade.state.walls['w1']).toBeUndefined();
      expect(cascade.state.rooms['r1'].wallIds).not.toContain('w1');
    }
  });

  it('объект с хозяином блокирует удаление хозяина', () => {
    let state = applyAll(createEmptyApartment(), buildFlatOps());
    const placed = applyOperation(state, {
      type: 'placeObject',
      objectId: 'o1',
      kind: 'window',
      label: 'Окно #1',
      hostId: 'w2',
    });
    expect(placed.ok).toBe(true);
    if (placed.ok) state = placed.state;

    const blocked = applyOperation(state, { type: 'deleteWall', wallId: 'w2' });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      // Стена #3 в ТЗ: окно + ещё зависимости перечислены явно.
      expect(blocked.error.dependents?.some((d) => d.id === 'o1')).toBe(true);
    }
  });

  it('привязка к несуществующему хозяину отклоняется', () => {
    const res = applyOperation(createEmptyApartment(), {
      type: 'placeObject',
      objectId: 'o1',
      kind: 'socket',
      label: 'Розетка #7',
      hostId: 'ghost-wall',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('UNKNOWN_HOST');
  });
});
