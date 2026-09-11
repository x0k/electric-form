/**
 * Преобразование Domain Model → нейтральное описание сцены (Renderer Adapter, §7 ТЗ).
 *
 * Чистые данные без three.js: рендерер позже переводит миллиметры в свои
 * единицы и строит меши. Id сущностей сохраняются 1-в-1 — по ним работает
 * выбор объектов и будущая подсветка конфликтов.
 */

import { wallLengthMm } from './geometry';
import type { Vec2 } from './geometry';
import type { ApartmentState } from './model';

/** Стена как бокс: центр, длина, угол поворота в плане, толщина, высота. */
export interface RenderWallBox {
  kind: 'wall';
  id: string;
  cxMm: number;
  cyMm: number;
  lengthMm: number;
  angleRad: number;
  thicknessMm: number;
  heightMm: number;
}

/** Плита пола/потолка как плоский полигон на своём уровне. */
export interface RenderSlabPoly {
  kind: 'floor' | 'ceiling';
  id: string;
  levelMm: number;
  points: Vec2[];
}

export interface RenderBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface RenderScene {
  walls: RenderWallBox[];
  slabs: RenderSlabPoly[];
  /** Габариты всего содержимого в мм — для наведения камеры. */
  bounds: RenderBounds;
}

/** Габариты пустой сцены: комната 6×4 м по умолчанию. */
export const EMPTY_SCENE_BOUNDS: RenderBounds = {
  minX: 0,
  minY: 0,
  maxX: 6000,
  maxY: 4000,
};

export function modelToScene(state: ApartmentState): RenderScene {
  const walls: RenderWallBox[] = Object.values(state.walls).map((w) => ({
    kind: 'wall',
    id: w.id,
    cxMm: (w.a.x + w.b.x) / 2,
    cyMm: (w.a.y + w.b.y) / 2,
    lengthMm: wallLengthMm(w.a, w.b),
    angleRad: Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x),
    thicknessMm: w.thicknessMm,
    heightMm: w.heightMm,
  }));
  walls.sort((a, b) => (a.id < b.id ? -1 : 1));

  const slabs: RenderSlabPoly[] = Object.values(state.slabs).map((s) => ({
    kind: s.kind,
    id: s.id,
    levelMm: s.levelMm,
    points: s.outline.map((p) => ({ ...p })),
  }));
  slabs.sort((a, b) => (a.id < b.id ? -1 : 1));

  return { walls, slabs, bounds: sceneBounds(walls, slabs) };
}

function sceneBounds(
  walls: RenderWallBox[],
  slabs: RenderSlabPoly[]
): RenderBounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const w of walls) {
    const dx = (Math.abs(Math.cos(w.angleRad)) * w.lengthMm) / 2;
    const dy = (Math.abs(Math.sin(w.angleRad)) * w.lengthMm) / 2;
    minX = Math.min(minX, w.cxMm - dx);
    maxX = Math.max(maxX, w.cxMm + dx);
    minY = Math.min(minY, w.cyMm - dy);
    maxY = Math.max(maxY, w.cyMm + dy);
  }
  for (const s of slabs) {
    for (const p of s.points) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
  }

  if (!Number.isFinite(minX)) return { ...EMPTY_SCENE_BOUNDS };
  // Тригонометрия даёт эпсилон-хвосты (cos 90° ≈ 6e-17) — режем до мкм.
  const q = (v: number) => Math.round(v * 1000) / 1000 + 0;
  return { minX: q(minX), minY: q(minY), maxX: q(maxX), maxY: q(maxY) };
}

/** Все выбираемые id сцены (стены + плиты) — для списков и тестов. */
export function selectableIds(scene: RenderScene): string[] {
  return [...scene.walls.map((w) => w.id), ...scene.slabs.map((s) => s.id)];
}
