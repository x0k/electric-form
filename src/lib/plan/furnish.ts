/**
 * Параметрическое размещение объектов (этапы 6–7 ТЗ).
 *
 * Принцип из правок к ТЗ: расположение объектов — ПАРАМЕТРИЧЕСКОЕ,
 * а не «случайно где-то в пространстве». Каждый объект хранит якорь:
 *
 * - floor/wall: привязка к стене — alongMm (центр вдоль стены от a)
 *   + fromWallMm (глубина в комнату от внутренней грани) + поворот;
 * - room: привязка к помещению — абсолютные x/y в плане (проверяется,
 *   что центр внутри полигона помещения);
 * - corner: угол помещения + отступы внутрь (dx/dy).
 *
 * Якорь к стене даёт главное свойство: объект СЛЕДУЕТ за стеной при
 * updateWall — абсолютные координаты нигде не хранятся, а вычисляются
 * функцией footprintMm/stateAt. Поворот — только кратно 90°.
 */

import {
  BASE_GRID_MM,
  pointInPolygon,
  wallLengthMm,
  type Vec2,
} from './geometry';
import type { ApartmentState, Room, Wall } from './model';

export type CornerId = 'SW' | 'SE' | 'NE' | 'NW';

export type FloorAnchor =
  | {
      type: 'wall';
      wallId: string;
      alongMm: number;
      fromWallMm: number;
      rotationDeg: 0 | 90 | 180 | 270;
    }
  | {
      type: 'room';
      roomId: string;
      xMm: number;
      yMm: number;
      rotationDeg: 0 | 90 | 180 | 270;
    }
  | {
      type: 'corner';
      roomId: string;
      corner: CornerId;
      dxMm: number;
      dyMm: number;
      rotationDeg: 0 | 90 | 180 | 270;
    };

export interface FloorObject {
  id: string;
  kind: string;
  label: string;
  anchor: FloorAnchor;
  wMm: number;
  dMm: number;
  hMm: number;
}

export interface WallAnchor {
  wallId: string;
  /** Центр объекта вдоль стены от a, мм. */
  alongMm: number;
  /** Высота низа объекта от пола, мм. */
  heightMm: number;
}

export interface WallObject {
  id: string;
  kind: string;
  label: string;
  anchor: WallAnchor;
  wMm: number;
  hMm: number;
  depthMm: number;
}

/** Центр якоря в плане (производная величина). */
export function floorCenterMm(
  state: ApartmentState,
  obj: Pick<FloorObject, 'anchor' | 'wMm' | 'dMm'>
): Vec2 | null {
  const a = obj.anchor;
  if (a.type === 'room') return { x: a.xMm, y: a.yMm };
  if (a.type === 'corner') {
    const room = state.rooms[a.roomId];
    if (!room) return null;
    const c = roomCornerMm(room, a.corner);
    if (!c) return null;
    const sx = a.corner === 'SW' || a.corner === 'NW' ? 1 : -1;
    const sy = a.corner === 'SW' || a.corner === 'SE' ? 1 : -1;
    return { x: c.x + sx * a.dxMm, y: c.y + sy * a.dyMm };
  }
  const wall = state.walls[a.wallId];
  if (!wall) return null;
  const inward = inwardNormalMm(state, wall, a);
  const len = wallLengthMm(wall.a, wall.b);
  if (len < 1e-9) return { ...wall.a };
  const t = a.alongMm / len;
  const onAxis = {
    x: wall.a.x + (wall.b.x - wall.a.x) * t,
    y: wall.a.y + (wall.b.y - wall.a.y) * t,
  };
  // fromWall — от внутренней грани вглубь комнаты + полглубины до центра.
  const halfD = obj.dMm / 2;
  const inset = wall.thicknessMm / 2 + a.fromWallMm + halfD;
  if (!inward) return onAxis;
  return { x: onAxis.x + inward.x * inset, y: onAxis.y + inward.y * inset };
}

/**
 * Угол поворота объекта в плане (для рендера).
 * wall-якорь: 0° — ширина вдоль стены; room/corner: относительно осей плана.
 */
export function floorAngleRad(
  state: ApartmentState,
  obj: Pick<FloorObject, 'anchor'>
): number {
  const a = obj.anchor;
  if (a.type === 'wall') {
    const wall = state.walls[a.wallId];
    if (!wall) return 0;
    const base = Math.atan2(wall.b.y - wall.a.y, wall.b.x - wall.a.x);
    return base + (a.rotationDeg * Math.PI) / 180;
  }
  return (a.rotationDeg * Math.PI) / 180;
}

/** Точка монтажа навесного объекта: план + высота. */
export function wallMountMm(
  walls: Record<string, Wall>,
  obj: Pick<WallObject, 'anchor'>
): (Vec2 & { zMm: number }) | null {
  const wall = walls[obj.anchor.wallId];
  if (!wall) return null;
  const len = wallLengthMm(wall.a, wall.b);
  if (len < 1e-9) return { ...wall.a, zMm: obj.anchor.heightMm };
  const t = obj.anchor.alongMm / len;
  return {
    x: wall.a.x + (wall.b.x - wall.a.x) * t,
    y: wall.a.y + (wall.b.y - wall.a.y) * t,
    zMm: obj.anchor.heightMm,
  };
}

/** Угол bbox помещения. */
export function roomCornerMm(room: Room, corner: CornerId): Vec2 | null {
  if (room.outline.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of room.outline) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  switch (corner) {
    case 'SW':
      return { x: minX, y: minY };
    case 'SE':
      return { x: maxX, y: minY };
    case 'NE':
      return { x: maxX, y: maxY };
    case 'NW':
      return { x: minX, y: maxY };
  }
}

/**
 * Внутренняя нормаль стены (в комнату). Инверсия outwardNormalMm:
 * ищем помещение из wallIds и отражаем наружную нормаль.
 */
export function inwardNormalMm(
  state: ApartmentState,
  wall: Wall,
  anchor?: { wallId: string }
): Vec2 | null {
  void anchor;
  const len = wallLengthMm(wall.a, wall.b);
  if (len < 1e-9) return null;
  const nx = -(wall.b.y - wall.a.y) / len;
  const ny = (wall.b.x - wall.a.x) / len;
  const mx = (wall.a.x + wall.b.x) / 2;
  const my = (wall.a.y + wall.b.y) / 2;
  for (const room of Object.values(state.rooms)) {
    if (!room.wallIds.includes(wall.id)) continue;
    if (room.outline.length < 3) continue;
    const plus = pointInPolygon({ x: mx + nx, y: my + ny }, room.outline);
    const minus = pointInPolygon({ x: mx - nx, y: my - ny }, room.outline);
    if (plus === minus) continue;
    const inw = plus ? { x: nx, y: ny } : { x: -nx, y: -ny };
    return { x: inw.x + 0, y: inw.y + 0 };
  }
  return null;
}

export function isRotationDeg(v: number): v is 0 | 90 | 180 | 270 {
  return v === 0 || v === 90 || v === 180 || v === 270;
}

/** Проверка якоря напольного объекта. null — валидно. */
export function validateFloorAnchor(
  state: ApartmentState,
  anchor: FloorAnchor,
  wMm: number
): string | null {
  if (!isRotationDeg(anchor.rotationDeg))
    return 'Поворот — только 0/90/180/270°.';
  if (anchor.type === 'wall') {
    const wall = state.walls[anchor.wallId];
    if (!wall) return `Стена "${anchor.wallId}" не найдена.`;
    for (const [v, n] of [
      [anchor.alongMm, 'along'],
      [anchor.fromWallMm, 'fromWall'],
    ] as const) {
      if (!Number.isInteger(v)) return `Якорь: ${n} — целые мм.`;
      if (v % BASE_GRID_MM !== 0) return `Якорь: ${n}=${v} не кратен 1 см.`;
    }
    const len = wallLengthMm(wall.a, wall.b);
    // Центр обязан лежать на стене с учётом половины ширины.
    if (
      anchor.alongMm < wMm / 2 - 1e-9 ||
      anchor.alongMm > len - wMm / 2 + 1e-9
    ) {
      return `Якорь: along ${anchor.alongMm} выходит за стену (длина ${Math.round(len)} мм, ширина ${wMm} мм).`;
    }
    if (anchor.fromWallMm < 0) return 'Якорь: fromWall отрицательный.';
    if (anchor.fromWallMm > 5000)
      return 'Якорь: fromWall больше 5 м — объект вне комнаты.';
    return null;
  }
  const room = state.rooms[anchor.roomId];
  if (!room) return `Помещение "${anchor.roomId}" не найдено.`;
  if (anchor.type === 'room') {
    for (const [v, n] of [
      [anchor.xMm, 'x'],
      [anchor.yMm, 'y'],
    ] as const) {
      if (!Number.isInteger(v)) return `Якорь: ${n} — целые мм.`;
      if (v % BASE_GRID_MM !== 0) return `Якорь: ${n}=${v} не кратен 1 см.`;
    }
    return null;
  }
  // corner
  for (const [v, n] of [
    [anchor.dxMm, 'dx'],
    [anchor.dyMm, 'dy'],
  ] as const) {
    if (!Number.isInteger(v)) return `Якорь: ${n} — целые мм.`;
    if (v % BASE_GRID_MM !== 0) return `Якорь: ${n}=${v} не кратен 1 см.`;
  }
  if (anchor.dxMm < 0 || anchor.dyMm < 0)
    return 'Якорь: отступы угла неотрицательны.';
  return null;
}

/** Проверка якоря навесного объекта. null — валидно. */
export function validateWallAnchor(
  walls: Record<string, Wall>,
  anchor: WallAnchor,
  wMm: number
): string | null {
  const wall = walls[anchor.wallId];
  if (!wall) return `Стена "${anchor.wallId}" не найдена.`;
  for (const [v, n] of [
    [anchor.alongMm, 'along'],
    [anchor.heightMm, 'height'],
  ] as const) {
    if (!Number.isInteger(v)) return `Якорь: ${n} — целые мм.`;
    if (v % BASE_GRID_MM !== 0) return `Якорь: ${n}=${v} не кратен 1 см.`;
  }
  const len = wallLengthMm(wall.a, wall.b);
  if (
    anchor.alongMm < wMm / 2 - 1e-9 ||
    anchor.alongMm > len - wMm / 2 + 1e-9
  ) {
    return `Якорь: along ${anchor.alongMm} выходит за стену (длина ${Math.round(len)} мм).`;
  }
  if (anchor.heightMm < 0 || anchor.heightMm > wall.heightMm) {
    return `Якорь: высота 0..${wall.heightMm} мм.`;
  }
  return null;
}
