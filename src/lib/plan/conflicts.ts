/**
 * Конфликты и зависимости (Этап 8 ТЗ).
 *
 * Валидация операций не даёт создать заведомо битое состояние, но
 * история пересчитывается: укорочение стены или удаление объекта может
 * сделать ранее валидные проёмы/розетки/свет конфликтными. Этот модуль —
 * чистая проверка ГОТОВОГО состояния: detectConflicts(state) возвращает
 * список конфликтов для панели и для отчёта editFeature/stateAt.
 *
 * Коды стабильны и используются UI и тестами.
 */

import { pointInPolygon, wallLengthMm, type Vec2 } from './geometry';
import { floorAngleRad, floorCenterMm, inwardNormalMm } from './furnish';
import type { FloorObject } from './furnish';
import { MIN_PIER_MM, openingInterval } from './openings';
import { polysOverlap, rectInFrame, rotatedRect, wallDir } from './polygon';
import type { ApartmentState } from './model';

export type ConflictCode =
  | 'OPENING_OUT_OF_WALL'
  | 'OPENING_OVERLAP'
  | 'OBJECT_OUTSIDE_ROOM'
  | 'OBJECT_BLOCKS_DOOR'
  | 'ELEC_TOO_CLOSE'
  | 'ELEC_BEHIND_FURNITURE'
  | 'LIGHT_OUTSIDE_ROOM';

export interface PlanConflict {
  code: ConflictCode;
  message: string;
  entityIds: string[];
}

/** Зона распахивания двери вглубь комнаты, мм. */
export const DOOR_SWING_MM = 900;
/** Минимальный отступ электрики от проёма/торца, мм. */
export const ELEC_CLEAR_MM = 100;

export function detectConflicts(state: ApartmentState): PlanConflict[] {
  const out: PlanConflict[] = [];
  out.push(...checkOpenings(state));
  out.push(...checkFloorObjects(state));
  out.push(...checkElec(state));
  out.push(...checkLights(state));
  return out;
}

function checkOpenings(state: ApartmentState): PlanConflict[] {
  const out: PlanConflict[] = [];
  const byWall = new Map<string, { id: string; from: number; to: number }[]>();
  for (const o of Object.values(state.openings ?? {})) {
    const wall = state.walls[o.wallId];
    if (!wall) {
      out.push({
        code: 'OPENING_OUT_OF_WALL',
        message: `Проём "${o.id}": стена "${o.wallId}" отсутствует.`,
        entityIds: [o.id],
      });
      continue;
    }
    const len = wallLengthMm(wall.a, wall.b);
    const { from, to } = openingInterval(o);
    if (from < -1e-9 || to - len > 1e-9) {
      out.push({
        code: 'OPENING_OUT_OF_WALL',
        message: `Проём "${o.id}": выходит за стену "${o.wallId}" (длина ${Math.round(len)} мм).`,
        entityIds: [o.id, o.wallId],
      });
    }
    const list = byWall.get(o.wallId) ?? [];
    list.push({ id: o.id, from, to });
    byWall.set(o.wallId, list);
  }
  for (const [, list] of byWall) {
    const sorted = [...list].sort((a, b) => a.from - b.from);
    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i].from - sorted[i - 1].to;
      if (gap < MIN_PIER_MM - 1e-9) {
        out.push({
          code: 'OPENING_OVERLAP',
          message: `Проёмы "${sorted[i - 1].id}" и "${sorted[i].id}": простенок меньше ${MIN_PIER_MM} мм.`,
          entityIds: [sorted[i - 1].id, sorted[i].id],
        });
      }
    }
  }
  return out;
}

function checkFloorObjects(state: ApartmentState): PlanConflict[] {
  const out: PlanConflict[] = [];
  const rooms = Object.values(state.rooms);
  for (const o of Object.values(state.floorObjects ?? {})) {
    const c = floorCenterMm(state, o);
    if (!c) {
      out.push({
        code: 'OBJECT_OUTSIDE_ROOM',
        message: `Объект "${o.label}" (${o.id}): якорь ссылается на удалённую стену/комнату.`,
        entityIds: [o.id],
      });
      continue;
    }
    const inside = rooms.some(
      (r) => r.outline.length >= 3 && pointInPolygon(c, r.outline)
    );
    if (!inside) {
      out.push({
        code: 'OBJECT_OUTSIDE_ROOM',
        message: `Объект "${o.label}" (${o.id}): центр вне помещений.`,
        entityIds: [o.id],
      });
    }
    // Дверной распах: footprint объекта против полигона распаха.
    // Учитывается ГАБАРИТ, а не только центр: шкаф краем в распахе —
    // тоже конфликт. Касание гранью в грань — не счёт.
    const fp = furnitureFootprint(state, o);
    if (!fp) continue;
    for (const op of Object.values(state.openings ?? {})) {
      if (op.kind !== 'door') continue;
      const swing = doorSwingPoly(state, op.wallId, op.offsetMm, op.widthMm);
      if (!swing) continue;
      if (polysOverlap([fp], [swing])) {
        out.push({
          code: 'OBJECT_BLOCKS_DOOR',
          message: `Объект "${o.label}" (${o.id}): перекрывает распах двери "${op.id}".`,
          entityIds: [o.id, op.id],
        });
        break;
      }
    }
  }
  return out;
}

/** Footprint напольного объекта в плане (центр + w×d + угол). */
function furnitureFootprint(
  state: ApartmentState,
  o: FloorObject
): Vec2[] | null {
  const c = floorCenterMm(state, o);
  if (!c) return null;
  return rotatedRect(c, o.wMm, o.dMm, floorAngleRad(state, o));
}

/**
 * Полигон распаха двери: [offset..offset+width] от внутренней грани
 * вглубь комнаты на DOOR_SWING_MM.
 */
function doorSwingPoly(
  state: ApartmentState,
  wallId: string,
  offsetMm: number,
  widthMm: number
): Vec2[] | null {
  const wall = state.walls[wallId];
  if (!wall) return null;
  const len = wallLengthMm(wall.a, wall.b);
  if (len < 1e-9) return null;
  const inw = inwardNormalMm(state, wall);
  if (!inw) return null;
  return rectInFrame(
    wall.a,
    wallDir(wall),
    inw,
    offsetMm,
    wall.thicknessMm / 2,
    offsetMm + widthMm,
    wall.thicknessMm / 2 + DOOR_SWING_MM
  );
}

function checkElec(state: ApartmentState): PlanConflict[] {
  const out: PlanConflict[] = [];
  const points = Object.values(state.elecPoints ?? {});
  for (const p of points) {
    const wall = state.walls[p.wallId];
    if (!wall) continue; // висячая точка — конфликт истории, не тихий.
    const len = wallLengthMm(wall.a, wall.b);
    if (p.alongMm < ELEC_CLEAR_MM || len - p.alongMm < ELEC_CLEAR_MM) {
      out.push({
        code: 'ELEC_TOO_CLOSE',
        message: `Электроточка "${p.id}": ближе ${ELEC_CLEAR_MM} мм к углу стены.`,
        entityIds: [p.id, p.wallId],
      });
    }
    for (const o of Object.values(state.openings ?? {})) {
      if (o.wallId !== p.wallId) continue;
      const { from, to } = openingInterval(o);
      if (
        p.alongMm >= from - ELEC_CLEAR_MM &&
        p.alongMm <= to + ELEC_CLEAR_MM
      ) {
        out.push({
          code: 'ELEC_TOO_CLOSE',
          message: `Электроточка "${p.id}": ближе ${ELEC_CLEAR_MM} мм к проёму "${o.id}".`,
          entityIds: [p.id, o.id],
        });
        break;
      }
    }
    // За мебелью: тот же wall-якорь в пределах полуширины + 100 мм.
    for (const fo of Object.values(state.floorObjects ?? {})) {
      if (fo.anchor.type !== 'wall' || fo.anchor.wallId !== p.wallId) continue;
      if (fo.anchor.fromWallMm > 600) continue;
      if (Math.abs(fo.anchor.alongMm - p.alongMm) <= fo.wMm / 2 + 100) {
        out.push({
          code: 'ELEC_BEHIND_FURNITURE',
          message: `Электроточка "${p.id}": за объектом "${fo.label}" (${fo.id}).`,
          entityIds: [p.id, fo.id],
        });
        break;
      }
    }
  }
  return out;
}

function checkLights(state: ApartmentState): PlanConflict[] {
  const out: PlanConflict[] = [];
  for (const l of Object.values(state.luminaires ?? {})) {
    const room = state.rooms[l.roomId];
    if (!room) {
      out.push({
        code: 'LIGHT_OUTSIDE_ROOM',
        message: `Светильник "${l.id}": помещение "${l.roomId}" отсутствует.`,
        entityIds: [l.id],
      });
      continue;
    }
    if (
      room.outline.length >= 3 &&
      !pointInPolygon({ x: l.xMm, y: l.yMm }, room.outline)
    ) {
      out.push({
        code: 'LIGHT_OUTSIDE_ROOM',
        message: `Светильник "${l.id}": вне помещения "${room.name}".`,
        entityIds: [l.id, room.id],
      });
    }
  }
  return out;
}
