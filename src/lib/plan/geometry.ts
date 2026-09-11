/**
 * Чистая геометрия 2D-плана. Без зависимостей от UI и рендера.
 *
 * Единицы: миллиметры, целые числа. Базовая сетка домена — 1 см (10 мм):
 * все координаты обязаны быть кратны BASE_GRID_MM.
 *
 * Редактор вправе привязывать к укрупнённым шагам (5/10/50 см для мебели) —
 * любой шаг, кратный базовой сетке, автоматически валиден для домена,
 * поэтому валидация операций не меняется.
 */

export const BASE_GRID_MM = 10;
/** @deprecated Используйте BASE_GRID_MM. */
export const GRID_MM = BASE_GRID_MM;

/** Стандартные шаги привязки редактора, мм: 1 см — стены, 5–10 см — мебель. */
export const SNAP_STEPS_MM = [10, 50, 100, 500] as const;
export type SnapStepMm = (typeof SNAP_STEPS_MM)[number];

/** Минимальная длина стены: 10 см. Короче — шум/ошибка ввода. */
export const MIN_WALL_LENGTH_MM = 100;

/** Допустимая толщина стены: 5..50 см. */
export const MIN_WALL_THICKNESS_MM = 50;
export const MAX_WALL_THICKNESS_MM = 500;

/** Допустимая высота стены: 2..4 м. */
export const MIN_WALL_HEIGHT_MM = 2000;
export const MAX_WALL_HEIGHT_MM = 4000;

/** Минимальная площадь помещения: 0.5 м² (иначе — огрызок контура). */
export const MIN_ROOM_AREA_MM2 = 500_000;

export interface Vec2 {
  x: number;
  y: number;
}

/** Привязка координаты к сетке 1 см. */
export function snapMm(value: number): number {
  return snapMmToStep(value, BASE_GRID_MM);
}

export function snapPoint(p: Vec2): Vec2 {
  return { x: snapMm(p.x), y: snapMm(p.y) };
}

export function isOnGrid(value: number): boolean {
  return isOnStep(value, BASE_GRID_MM);
}

export function isPointOnGrid(p: Vec2): boolean {
  return isOnGrid(p.x) && isOnGrid(p.y);
}

/**
 * Привязка к укрупнённому шагу (например 50/100 мм для мебели).
 * Шаг обязан быть целым и кратным базовой сетке — иначе snap уводил бы
 * точку с базовой сетки и домен отклонял бы такие координаты.
 */
export function snapMmToStep(value: number, stepMm: number): number {
  assertSnapStep(stepMm);
  return Math.round(value / stepMm) * stepMm;
}

export function snapPointToStep(p: Vec2, stepMm: number): Vec2 {
  return { x: snapMmToStep(p.x, stepMm), y: snapMmToStep(p.y, stepMm) };
}

export function isOnStep(value: number, stepMm: number): boolean {
  assertSnapStep(stepMm);
  return Number.isInteger(value) && value % stepMm === 0;
}

export function isPointOnStep(p: Vec2, stepMm: number): boolean {
  return isOnStep(p.x, stepMm) && isOnStep(p.y, stepMm);
}

function assertSnapStep(stepMm: number): void {
  if (!Number.isInteger(stepMm) || stepMm <= 0 || stepMm % BASE_GRID_MM !== 0) {
    throw new Error(
      `Шаг привязки должен быть целым и кратным базовой сетке ${BASE_GRID_MM} мм, получено: ${stepMm}.`
    );
  }
}

export function wallLengthMm(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Площадь полигона по формуле шнурков (мм², всегда ≥ 0). */
export function polygonAreaMm2(points: Vec2[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    sum += p.x * q.y - q.x * p.y;
  }
  return Math.abs(sum) / 2;
}

/** Периметр замкнутого полигона в мм. */
export function polygonPerimeterMm(points: Vec2[]): number {
  if (points.length < 2) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    sum += wallLengthMm(points[i], points[(i + 1) % points.length]);
  }
  return sum;
}

/** Замкнут ли контур (первая точка совпадает с последней). */
export function isClosedRing(points: Vec2[]): boolean {
  if (points.length < 4) return false;
  const first = points[0];
  const last = points[points.length - 1];
  return first.x === last.x && first.y === last.y;
}

/** Убрать дублирующуюся замыкающую точку для расчётов площади. */
export function openRing(points: Vec2[]): Vec2[] {
  if (isClosedRing(points)) return points.slice(0, -1);
  return points;
}

/** Точка строго внутри полигона (ray casting; граница — снаружи). */
export function pointInPolygon(p: Vec2, polygon: Vec2[]): boolean {
  const ring = openRing(polygon);
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.y > p.y !== b.y > p.y) {
      const x = a.x + ((p.y - a.y) / (b.y - a.y)) * (b.x - a.x);
      if (p.x < x) inside = !inside;
    }
  }
  return inside;
}

/** Допуск авто-фиксации оси по углу сырого отрезка, градусы. */
export const AXIS_AUTO_TOL_DEG = 5;

/**
 * Чисто ли сырой отрезок идёт вдоль оси (для авто-constraints).
 * Снапнутые координаты тут врут (сетка дотягивает диагонали до осей),
 * поэтому смотрим угол СЫРОГО отрезка от origin.
 */
export function axisAngleClean(
  raw: Vec2,
  origin: Vec2,
  tolDeg: number = AXIS_AUTO_TOL_DEG
): 'h' | 'v' | null {
  const dx = raw.x - origin.x;
  const dy = raw.y - origin.y;
  if (dx === 0 && dy === 0) return null;
  const ang = (Math.abs(Math.atan2(dy, dx)) * 180) / Math.PI;
  if (ang <= tolDeg || ang >= 180 - tolDeg) return 'h';
  if (Math.abs(ang - 90) <= tolDeg) return 'v';
  return null;
}
