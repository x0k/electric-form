import { describe, expect, it } from 'vitest';
import {
  cornerWallIds,
  modelToScene,
  outwardNormalMm,
  selectableIds,
  type RenderScene,
} from '#lib/plan/render';
import { applyOperation } from '#lib/plan/operations';
import { createEmptyApartment } from '#lib/plan/model';
import { buildSampleFlat } from '#lib/plan/sample';

describe('model → render', () => {
  it('тестовая квартира собирается без UI', () => {
    const state = buildSampleFlat();
    expect(Object.keys(state.walls)).toHaveLength(4);
    expect(Object.keys(state.rooms)).toHaveLength(1);
    expect(Object.keys(state.slabs)).toHaveLength(2);
  });

  it('стены превращаются в боксы с центром, длиной и углом', () => {
    const scene = modelToScene(buildSampleFlat());
    expect(scene.walls).toHaveLength(4);

    const w1 = scene.walls.find((w) => w.id === 'w1');
    expect(w1).toMatchObject({
      kind: 'wall',
      cxMm: 3000,
      cyMm: -100,
      lengthMm: 6000,
      angleRad: 0,
      thicknessMm: 200,
      heightMm: 2700,
      extAMm: 200,
      extBMm: 200,
    });

    // Вертикальная стена: центр и угол 90°.
    const w2 = scene.walls.find((w) => w.id === 'w2');
    expect(w2?.cxMm).toBe(6100);
    expect(w2?.cyMm).toBe(2000);
    expect(w2?.lengthMm).toBe(4000);
    expect(w2?.angleRad).toBeCloseTo(Math.PI / 2);
    expect(w2?.extAMm).toBe(200);
    expect(w2?.extBMm).toBe(200);
  });

  it('контур — внутренняя грань: наружу смотрят все четыре стены', () => {
    const state = buildSampleFlat();
    expect(outwardNormalMm(state, state.walls['w1'])).toEqual({ x: 0, y: -1 });
    expect(outwardNormalMm(state, state.walls['w2'])).toEqual({ x: 1, y: 0 });
    expect(outwardNormalMm(state, state.walls['w3'])).toEqual({ x: 0, y: 1 });
    expect(outwardNormalMm(state, state.walls['w4'])).toEqual({ x: -1, y: 0 });
  });

  it('стена вне помещений — по центру, без стыков', () => {
    const res = applyOperation(createEmptyApartment(), {
      type: 'addWall',
      wallId: 'solo',
      a: { x: 0, y: 0 },
      b: { x: 1000, y: 0 },
      thicknessMm: 100,
      heightMm: 2700,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const scene = modelToScene(res.state);
    expect(scene.walls[0]).toMatchObject({
      cxMm: 500,
      cyMm: 0,
      extAMm: 0,
      extBMm: 0,
    });
  });

  it('miter-стыки: удлинение по внутреннему углу', () => {
    // Прямоугольный треугольник (0,0)-(4000,0)-(0,3000), толщина 200:
    // углы 90° → 200, 36.87° → 600, 53.13° → 400.
    let state = createEmptyApartment();
    const walls = [
      { id: 't1', a: { x: 0, y: 0 }, b: { x: 4000, y: 0 } },
      { id: 't2', a: { x: 4000, y: 0 }, b: { x: 0, y: 3000 } },
      { id: 't3', a: { x: 0, y: 3000 }, b: { x: 0, y: 0 } },
    ] as const;
    for (const w of walls) {
      const res = applyOperation(state, {
        type: 'addWall',
        wallId: w.id,
        a: w.a,
        b: w.b,
        thicknessMm: 200,
        heightMm: 2700,
      });
      expect(res.ok).toBe(true);
      if (res.ok) state = res.state;
    }
    const room = applyOperation(state, {
      type: 'addRoom',
      roomId: 'tri',
      name: 'Треугольник',
      outline: [
        { x: 0, y: 0 },
        { x: 4000, y: 0 },
        { x: 0, y: 3000 },
      ],
      wallIds: ['t1', 't2', 't3'],
    });
    expect(room.ok).toBe(true);
    if (!room.ok) return;
    const scene = modelToScene(room.state);
    const t1 = scene.walls.find((w) => w.id === 't1');
    // extA у прямого угла, extB у острого; центр сдвинут наружу и вдоль.
    expect(t1?.extAMm).toBe(200);
    expect(t1?.extBMm).toBe(600);
    expect(t1?.cxMm).toBe(2200);
    expect(t1?.cyMm).toBe(-100);
  });

  it('угол возвращает примыкающие стены для гашения', () => {
    const state = buildSampleFlat();
    expect(cornerWallIds(state, { x: 6000, y: 0 })).toEqual(['w1', 'w2']);
    expect(cornerWallIds(state, { x: 0, y: 4000 })).toEqual(['w3', 'w4']);
    expect(cornerWallIds(state, { x: 3000, y: 2000 })).toEqual([]);
  });

  it('плиты сохраняют id, тип и уровень', () => {
    const scene = modelToScene(buildSampleFlat());
    expect(scene.slabs).toHaveLength(2);
    expect(scene.slabs.find((s) => s.id === 'floor1')).toMatchObject({
      kind: 'floor',
      levelMm: 0,
    });
    expect(scene.slabs.find((s) => s.id === 'ceil1')).toMatchObject({
      kind: 'ceiling',
      levelMm: 2700,
    });
    expect(scene.slabs[0].points).toHaveLength(4);
  });

  it('id сущностей сохраняются 1-в-1 для выбора объектов', () => {
    const scene = modelToScene(buildSampleFlat());
    expect(selectableIds(scene).sort()).toEqual([
      'ceil1',
      'floor1',
      'w1',
      'w2',
      'w3',
      'w4',
    ]);
  });

  it('bounds покрывают стены с толщиной и стыками', () => {
    const scene = modelToScene(buildSampleFlat());
    expect(scene.bounds).toEqual({
      minX: -200,
      minY: -200,
      maxX: 6200,
      maxY: 4200,
    });
  });

  it('пустая модель даёт сцену с дефолтными bounds', () => {
    const scene: RenderScene = modelToScene(createEmptyApartment());
    expect(scene.walls).toEqual([]);
    expect(scene.slabs).toEqual([]);
    expect(scene.bounds.maxX).toBeGreaterThan(scene.bounds.minX);
  });
});
