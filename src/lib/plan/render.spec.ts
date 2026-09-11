import { describe, expect, it } from 'vitest';
import {
  modelToScene,
  selectableIds,
  type RenderScene,
} from '#lib/plan/render';
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
      cyMm: 0,
      lengthMm: 6000,
      angleRad: 0,
      thicknessMm: 200,
      heightMm: 2700,
    });

    // Вертикальная стена: центр и угол 90°.
    const w2 = scene.walls.find((w) => w.id === 'w2');
    expect(w2?.cxMm).toBe(6000);
    expect(w2?.cyMm).toBe(2000);
    expect(w2?.lengthMm).toBe(4000);
    expect(w2?.angleRad).toBeCloseTo(Math.PI / 2);
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

  it('bounds покрывают всю квартиру 6×4 м', () => {
    const scene = modelToScene(buildSampleFlat());
    expect(scene.bounds).toEqual({
      minX: 0,
      minY: 0,
      maxX: 6000,
      maxY: 4000,
    });
  });

  it('пустая модель даёт сцену с дефолтными bounds', () => {
    const scene: RenderScene = modelToScene(createEmptyApartment());
    expect(scene.walls).toEqual([]);
    expect(scene.slabs).toEqual([]);
    expect(scene.bounds.maxX).toBeGreaterThan(scene.bounds.minX);
  });
});
