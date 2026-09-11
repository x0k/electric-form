/**
 * Преобразование Domain Model → нейтральное описание сцены (Renderer Adapter, §7 ТЗ).
 *
 * Чистые данные без three.js: рендерер позже переводит миллиметры в свои
 * единицы и строит меши. Id сущностей сохраняются 1-в-1 — по ним работает
 * выбор объектов и будущая подсветка конфликтов.
 */

import { openRing, pointInPolygon, wallLengthMm } from './geometry';
import type { Vec2 } from './geometry';
import type { ApartmentState, Wall } from './model';

/**
 * Стена как бокс. ВАЖНО: контур скетча — ВНУТРЕННЯЯ грань стен:
 * центр бокса сдвинут наружу на полтолщины, а длина lengthMm —
 * внутренняя (по контуру). Концы продлены на miter-стыки (extA/extB),
 * чтобы внешние грани сходились чисто.
 */
export interface RenderWallBox {
  kind: 'wall';
  id: string;
  cxMm: number;
  cyMm: number;
  lengthMm: number;
  angleRad: number;
  thicknessMm: number;
  heightMm: number;
  /**
   * Удлинения бокса за концы a/b для miter-стыков, мм.
   * Внешние грани соседей сходятся чисто, без новых углов и выбоин;
   * 0 — стыка нет (стена вне помещений).
   */
  extAMm: number;
  extBMm: number;
  /** Истинные концы внутренней грани (для стыков углов, без офсета). */
  axMm: number;
  ayMm: number;
  bxMm: number;
  byMm: number;
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
  const walls: RenderWallBox[] = Object.values(state.walls).map((w) => {
    const lengthMm = wallLengthMm(w.a, w.b);
    const outward = outwardNormalMm(state, w);
    const { extA, extB } = miterExtensions(state, w);
    const axX = lengthMm < 1e-9 ? 0 : (w.b.x - w.a.x) / lengthMm;
    const axY = lengthMm < 1e-9 ? 0 : (w.b.y - w.a.y) / lengthMm;
    return {
      kind: 'wall',
      id: w.id,
      cxMm:
        (w.a.x + w.b.x) / 2 +
        (outward ? (outward.x * w.thicknessMm) / 2 : 0) +
        ((extB - extA) / 2) * axX,
      cyMm:
        (w.a.y + w.b.y) / 2 +
        (outward ? (outward.y * w.thicknessMm) / 2 : 0) +
        ((extB - extA) / 2) * axY,
      lengthMm,
      angleRad: Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x),
      thicknessMm: w.thicknessMm,
      heightMm: w.heightMm,
      extAMm: extA,
      extBMm: extB,
      axMm: w.a.x,
      ayMm: w.a.y,
      bxMm: w.b.x,
      byMm: w.b.y,
    };
  });
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
    const spanMm = w.lengthMm + (w.extAMm ?? 0) + (w.extBMm ?? 0);
    const c = Math.abs(Math.cos(w.angleRad));
    const s = Math.abs(Math.sin(w.angleRad));
    // Габарит бокса: длина вдоль оси + толщина поперёк.
    const dx = (c * spanMm + s * w.thicknessMm) / 2;
    const dy = (s * spanMm + c * w.thicknessMm) / 2;
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

/**
 * Внутренние углы полигона по вершинам (0..2π), с учётом обхода.
 * Вырожденные рёбра дают π (стык не нужен).
 */
export function interiorAngles(outline: Vec2[]): number[] {
  const ring = openRing(outline);
  const n = ring.length;
  let area2 = 0;
  for (let i = 0; i < n; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % n];
    area2 += p.x * q.y - q.x * p.y;
  }
  const ccw = area2 > 0;
  return ring.map((_, i) => {
    const prev = ring[(i - 1 + n) % n];
    const cur = ring[i];
    const next = ring[(i + 1) % n];
    const e1x = cur.x - prev.x;
    const e1y = cur.y - prev.y;
    const e2x = next.x - cur.x;
    const e2y = next.y - cur.y;
    const turn = Math.atan2(e1x * e2y - e1y * e2x, e1x * e2x + e1y * e2y);
    return ccw ? Math.PI - turn : Math.PI + turn;
  });
}

/** Удлинение конца стены на miter-стык: t/tan(θ/2), вогнутые — 0. */
export function miterExt(thicknessMm: number, interiorRad: number): number {
  if (interiorRad >= Math.PI) return 0;
  const tan = Math.tan(interiorRad / 2);
  if (!(tan > 1e-6)) return 0;
  // Целые мм: тригонометрические хвосты не нужны, глаз их не видит.
  return Math.round(Math.min(thicknessMm / tan, 5 * thicknessMm));
}

function samePoint(a: Vec2, b: Vec2): boolean {
  return a.x === b.x && a.y === b.y;
}

/**
 * Удлинения концов стены по стыкам помещения, чьё ребро она повторяет.
 * Нет совпадения с ребром — 0 (стена вне помещений ведёт себя как раньше).
 */
export function miterExtensions(
  state: ApartmentState,
  wall: Wall
): { extA: number; extB: number } {
  for (const room of Object.values(state.rooms)) {
    if (!room.wallIds.includes(wall.id)) continue;
    const ring = openRing(room.outline);
    const n = ring.length;
    if (n < 3) continue;
    const angles = interiorAngles(ring);
    for (let i = 0; i < n; i++) {
      const v0 = ring[i];
      const v1 = ring[(i + 1) % n];
      const fwd = samePoint(wall.a, v0) && samePoint(wall.b, v1);
      const rev = samePoint(wall.a, v1) && samePoint(wall.b, v0);
      if (!fwd && !rev) continue;
      const ia = fwd ? i : (i + 1) % n;
      const ib = fwd ? (i + 1) % n : i;
      return {
        extA: miterExt(wall.thicknessMm, angles[ia]),
        extB: miterExt(wall.thicknessMm, angles[ib]),
      };
    }
  }
  return { extA: 0, extB: 0 };
}
/**
 * Наружная нормаль стены (единичная, мм не важны) относительно помещения,
 * в чьих wallIds она числится. null — стена вне помещений (по центру).
 * Контур — внутренняя грань: точка середины ±1 мм ложится по разные
 * стороны границы, тест устойчив к направлению обхода.
 */
export function outwardNormalMm(
  state: ApartmentState,
  wall: Wall
): Vec2 | null {
  const len = wallLengthMm(wall.a, wall.b);
  if (len < 1e-9) return null;
  const nx = -(wall.b.y - wall.a.y) / len;
  const ny = (wall.b.x - wall.a.x) / len;
  const mx = (wall.a.x + wall.b.x) / 2;
  const my = (wall.a.y + wall.b.y) / 2;
  for (const room of Object.values(state.rooms)) {
    if (!room.wallIds.includes(wall.id)) continue;
    if (room.outline.length < 3) continue;
    const insidePlus = pointInPolygon({ x: mx + nx, y: my + ny }, room.outline);
    const insideMinus = pointInPolygon(
      { x: mx - nx, y: my - ny },
      room.outline
    );
    if (insidePlus === insideMinus) continue;
    const out = insidePlus ? { x: -nx, y: -ny } : { x: nx, y: ny };
    // Нормализуем -0, чтобы toEqual не спотыкался.
    return { x: out.x + 0, y: out.y + 0 };
  }
  return null;
}

/**
 * Стены, примыкающие к углу плана (конец в пределах 1 мм от угла).
 * В изометрии с этого угла они гасятся, чтобы видеть интерьер.
 */
export function cornerWallIds(state: ApartmentState, corner: Vec2): string[] {
  const out: string[] = [];
  for (const w of Object.values(state.walls)) {
    const near = (p: Vec2) => Math.hypot(p.x - corner.x, p.y - corner.y) <= 1;
    if (near(w.a) || near(w.b)) out.push(w.id);
  }
  return out.sort();
}
