/**
 * Полигональный адаптер на clipper2-ts (BSL-1.0, пермиссивная).
 *
 * Зачем: булевы операции и offset руками не пишутся — там эпсилоны,
 * обходы и коллинеарность. Clipper целочисленный, а у нас все координаты
 * уже целые мм (запас до 2^53 огромен), поэтому масштабирование не нужно:
 * мм идут как есть, квантование только после поворотов (1 мм).
 *
 * Y плана = Y Clipper (инверсию для three.js делает рендер, как раньше).
 * Пустые результаты — честные [] (нет пересечения / всё вычтено).
 */

import {
  difference,
  inflatePaths,
  intersect,
  union,
  area as clipArea,
  FillRule,
  JoinType,
  EndType,
  type Path64,
} from 'clipper2-ts';
import type { Vec2 } from './geometry';
import type { Wall } from './model';

const FILL = FillRule.NonZero;
/** Квантование float-хвостов после поворотов: целые мм. */
const q = (v: number): number => Math.round(v);

function assertSafe(path: Path64, what: string): void {
  for (const p of path) {
    if (!Number.isSafeInteger(p.x) || !Number.isSafeInteger(p.y)) {
      throw new Error(`${what}: координаты вне safe-integer (${p.x}, ${p.y}).`);
    }
  }
}

export function toPath(points: Vec2[]): Path64 {
  const path = points.map((p) => ({ x: q(p.x), y: q(p.y) }));
  assertSafe(path, 'toPath');
  return path;
}

export function toPaths(polys: Vec2[][]): Path64[] {
  return polys.map(toPath);
}

export function fromPath(path: Path64): Vec2[] {
  return path.map((p) => ({ x: p.x, y: p.y }));
}

export function fromPaths(paths: Path64[]): Vec2[][] {
  return paths.map(fromPath);
}

/** Объединение полигонов (чистые внешние контуры, Т-стыки сходятся сами). */
export function unionPolys(a: Vec2[][], b: Vec2[][]): Vec2[][] {
  if (a.length === 0) return b.map((p) => [...p]);
  if (b.length === 0) return a.map((p) => [...p]);
  return fromPaths(union(toPaths(a), toPaths(b), FILL));
}

/** Вычитание: subject минус clips (сквозные вырезы дают куски, не дыры). */
export function diffPolys(subject: Vec2[][], clips: Vec2[][]): Vec2[][] {
  if (subject.length === 0) return [];
  if (clips.length === 0) return subject.map((p) => [...p]);
  return fromPaths(difference(toPaths(subject), toPaths(clips), FILL));
}

/** Пересечение двух наборов полигонов. */
export function intersectPolys(a: Vec2[][], b: Vec2[][]): Vec2[][] {
  if (a.length === 0 || b.length === 0) return [];
  return fromPaths(intersect(toPaths(a), toPaths(b), FILL));
}

/** Есть ли пересечение с ненулевой площадью (касание гранью — не счёт). */
export function polysOverlap(a: Vec2[][], b: Vec2[][]): boolean {
  const hit = intersectPolys(a, b);
  return hit.reduce((sum, p) => sum + Math.abs(clipArea(toPath(p))), 0) > 0;
}

/**
 * Offset полигона на deltaMm (плюс — наружу).
 * join: 'miter' — острые углы стен, 'round' — зоны, 'square' — мебель.
 */
export function inflatePoly(
  poly: Vec2[],
  deltaMm: number,
  join: 'miter' | 'round' | 'square' = 'miter'
): Vec2[][] {
  if (poly.length < 3) return [];
  const jt =
    join === 'round'
      ? JoinType.Round
      : join === 'square'
        ? JoinType.Square
        : JoinType.Miter;
  return fromPaths(
    inflatePaths(toPaths([poly]), q(deltaMm), jt, EndType.Polygon)
  );
}

/** Площадь полигона через Clipper (паритет с polygonAreaMm2 — в тестах). */
export function clipperAreaMm2(poly: Vec2[]): number {
  if (poly.length < 3) return 0;
  return Math.abs(clipArea(toPath(poly)));
}

/**
 * Прямоугольник в локальном фрейме: origin + dirX*w + dirY*h.
 * dirX/dirY — единичные, перпендикулярные (направление не важно).
 */
export function rectInFrame(
  origin: Vec2,
  dirX: Vec2,
  dirY: Vec2,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): Vec2[] {
  const at = (x: number, y: number): Vec2 => ({
    x: origin.x + dirX.x * x + dirY.x * y,
    y: origin.y + dirX.y * x + dirY.y * y,
  });
  return [at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1)];
}

/** Ось стены как единичный вектор (ноль-вектор при вырожденной стене). */
export function wallDir(wall: Wall): Vec2 {
  const dx = wall.b.x - wall.a.x;
  const dy = wall.b.y - wall.a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return { x: 0, y: 0 };
  return { x: dx / len, y: dy / len };
}

/** Нормаль стены (повёрнутый dir на +90°). */
export function wallNormal(dir: Vec2): Vec2 {
  return { x: -dir.y, y: dir.x };
}

/**
 * Footprint стены в плане: сегмент ± thickness/2.
 * extA/extB — удлинения концов под miter-стыки (как в рендере боксов).
 */
export function wallFootprint(
  wall: Wall,
  thicknessMm: number,
  extA = 0,
  extB = 0
): Vec2[] {
  const dir = wallDir(wall);
  const n = wallNormal(dir);
  const h = thicknessMm / 2;
  const origin = {
    x: wall.a.x - dir.x * extA,
    y: wall.a.y - dir.y * extA,
  };
  const len =
    Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y) + extA + extB;
  return rectInFrame(origin, dir, n, 0, -h, len, h);
}

/** Прямоугольник проёма в плане: [offset..offset+width] на всю толщину. */
export function openingRect(
  wall: Wall,
  offsetMm: number,
  widthMm: number,
  thicknessMm: number
): Vec2[] {
  const dir = wallDir(wall);
  const n = wallNormal(dir);
  const h = thicknessMm / 2;
  return rectInFrame(wall.a, dir, n, offsetMm, -h, offsetMm + widthMm, h);
}

/**
 * Куски footprint после вычитания проёмов — для честных дыр в рендере.
 * Сквозные вырезы (на всю толщину) дают отдельные куски, это нормально:
 * стена с N проёмами рисуется N+1 боксами вместо бокса с накладкой.
 */
export function subtractOpenings(footprint: Vec2[], holes: Vec2[][]): Vec2[][] {
  return diffPolys([footprint], holes);
}

/** Повёрнутый прямоугольник (footprint мебели): центр + w×d + угол. */
export function rotatedRect(
  center: Vec2,
  wMm: number,
  dMm: number,
  angleRad: number
): Vec2[] {
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  const hw = wMm / 2;
  const hd = dMm / 2;
  return [
    { x: -hw, y: -hd },
    { x: hw, y: -hd },
    { x: hw, y: hd },
    { x: -hw, y: hd },
  ].map((p) => ({
    x: center.x + p.x * c - p.y * s,
    y: center.y + p.x * s + p.y * c,
  }));
}
