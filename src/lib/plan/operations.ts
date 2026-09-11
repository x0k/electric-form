/**
 * Операции Этапа 1 «Планировка помещения» + задел под следующие этапы.
 *
 * Каждая операция — атомарное изменение черновика внутри Feature.
 * Применение чистое: (state, op) → { ok, state } | { ok: false, error }.
 * Невалидная операция никогда не мутирует состояние.
 */

import {
  GRID_MM,
  MAX_WALL_HEIGHT_MM,
  MAX_WALL_THICKNESS_MM,
  MIN_ROOM_AREA_MM2,
  MIN_WALL_HEIGHT_MM,
  MIN_WALL_LENGTH_MM,
  MIN_WALL_THICKNESS_MM,
  isPointOnGrid,
  openRing,
  polygonAreaMm2,
  snapPoint,
  wallLengthMm,
} from './geometry';
import {
  cloneState,
  findDependents,
  hostExists,
  type ApartmentState,
  type SlabKind,
} from './model';

export type Operation =
  | {
      type: 'addWall';
      wallId: string;
      a: { x: number; y: number };
      b: { x: number; y: number };
      thicknessMm: number;
      heightMm: number;
    }
  | {
      type: 'updateWall';
      wallId: string;
      a?: { x: number; y: number };
      b?: { x: number; y: number };
      thicknessMm?: number;
      heightMm?: number;
    }
  | { type: 'deleteWall'; wallId: string; cascade?: boolean }
  | {
      type: 'addRoom';
      roomId: string;
      name: string;
      outline: { x: number; y: number }[];
      wallIds: string[];
    }
  | {
      type: 'updateRoom';
      roomId: string;
      name?: string;
      outline?: { x: number; y: number }[];
      wallIds?: string[];
    }
  | { type: 'deleteRoom'; roomId: string; cascade?: boolean }
  | {
      type: 'upsertSlab';
      slabId: string;
      kind: SlabKind;
      levelMm: number;
      thicknessMm: number;
      outline: { x: number; y: number }[];
    }
  | { type: 'deleteSlab'; slabId: string; cascade?: boolean }
  | {
      type: 'placeObject';
      objectId: string;
      kind: string;
      label: string;
      hostId: string | null;
    }
  | { type: 'removeObject'; objectId: string };

export type ApplyErrorCode =
  | 'ID_TAKEN'
  | 'NOT_FOUND'
  | 'OFF_GRID'
  | 'BAD_GEOMETRY'
  | 'BAD_THICKNESS'
  | 'BAD_HEIGHT'
  | 'BAD_LEVEL'
  | 'UNKNOWN_HOST'
  | 'HAS_DEPENDENTS';

export interface ApplyError {
  code: ApplyErrorCode;
  message: string;
  /** Зависимости, блокирующие удаление (для диалога §6 ТЗ). */
  dependents?: { kind: string; id: string; label: string }[];
}

export type ApplyResult =
  { ok: true; state: ApartmentState } | { ok: false; error: ApplyError };

function fail(code: ApplyErrorCode, message: string): ApplyResult {
  return { ok: false, error: { code, message } };
}

function checkIdFree(state: ApartmentState, id: string): ApplyResult | null {
  if (!id) return fail('BAD_GEOMETRY', 'Пустой id запрещён.');
  if (hostExists(state, id))
    return fail('ID_TAKEN', `Сущность с id "${id}" уже существует.`);
  return null;
}

function checkSnapped(
  points: { x: number; y: number }[],
  what: string
): ApplyResult | null {
  for (const p of points) {
    if (!Number.isInteger(p.x) || !Number.isInteger(p.y)) {
      return fail(
        'OFF_GRID',
        `${what}: координаты должны быть целыми мм, получено (${p.x}, ${p.y}).`
      );
    }
    if (!isPointOnGrid(p)) {
      return fail(
        'OFF_GRID',
        `${what}: точка (${p.x}, ${p.y}) не на сетке 1 см (кратно ${GRID_MM} мм).`
      );
    }
  }
  return null;
}

export function applyOperation(
  prev: ApartmentState,
  op: Operation
): ApplyResult {
  switch (op.type) {
    case 'addWall': {
      const taken = checkIdFree(prev, op.wallId);
      if (taken) return taken;
      const a = snapPoint(op.a);
      const b = snapPoint(op.b);
      const grid = checkSnapped([op.a, op.b], `Стена "${op.wallId}"`);
      if (grid) return grid;
      if (wallLengthMm(a, b) < MIN_WALL_LENGTH_MM) {
        return fail(
          'BAD_GEOMETRY',
          `Стена "${op.wallId}" короче ${MIN_WALL_LENGTH_MM} мм.`
        );
      }
      if (
        !Number.isInteger(op.thicknessMm) ||
        op.thicknessMm < MIN_WALL_THICKNESS_MM ||
        op.thicknessMm > MAX_WALL_THICKNESS_MM
      ) {
        return fail(
          'BAD_THICKNESS',
          `Толщина стены "${op.wallId}" должна быть ${MIN_WALL_THICKNESS_MM}..${MAX_WALL_THICKNESS_MM} мм.`
        );
      }
      if (
        !Number.isInteger(op.heightMm) ||
        op.heightMm < MIN_WALL_HEIGHT_MM ||
        op.heightMm > MAX_WALL_HEIGHT_MM
      ) {
        return fail(
          'BAD_HEIGHT',
          `Высота стены "${op.wallId}" должна быть ${MIN_WALL_HEIGHT_MM}..${MAX_WALL_HEIGHT_MM} мм.`
        );
      }
      const next = cloneState(prev);
      next.walls[op.wallId] = {
        id: op.wallId,
        a,
        b,
        thicknessMm: op.thicknessMm,
        heightMm: op.heightMm,
      };
      return { ok: true, state: next };
    }

    case 'updateWall': {
      const wall = prev.walls[op.wallId];
      if (!wall) return fail('NOT_FOUND', `Стена "${op.wallId}" не найдена.`);
      const a = op.a ? snapPoint(op.a) : wall.a;
      const b = op.b ? snapPoint(op.b) : wall.b;
      if (op.a || op.b) {
        const grid = checkSnapped(
          [op.a ?? wall.a, op.b ?? wall.b],
          `Стена "${op.wallId}"`
        );
        if (grid) return grid;
        if (wallLengthMm(a, b) < MIN_WALL_LENGTH_MM) {
          return fail(
            'BAD_GEOMETRY',
            `Стена "${op.wallId}" короче ${MIN_WALL_LENGTH_MM} мм.`
          );
        }
      }
      const thicknessMm = op.thicknessMm ?? wall.thicknessMm;
      if (
        !Number.isInteger(thicknessMm) ||
        thicknessMm < MIN_WALL_THICKNESS_MM ||
        thicknessMm > MAX_WALL_THICKNESS_MM
      ) {
        return fail(
          'BAD_THICKNESS',
          `Толщина стены "${op.wallId}" должна быть ${MIN_WALL_THICKNESS_MM}..${MAX_WALL_THICKNESS_MM} мм.`
        );
      }
      const heightMm = op.heightMm ?? wall.heightMm;
      if (
        !Number.isInteger(heightMm) ||
        heightMm < MIN_WALL_HEIGHT_MM ||
        heightMm > MAX_WALL_HEIGHT_MM
      ) {
        return fail(
          'BAD_HEIGHT',
          `Высота стены "${op.wallId}" должна быть ${MIN_WALL_HEIGHT_MM}..${MAX_WALL_HEIGHT_MM} мм.`
        );
      }
      const next = cloneState(prev);
      next.walls[op.wallId] = { ...wall, a, b, thicknessMm, heightMm };
      return { ok: true, state: next };
    }

    case 'deleteWall': {
      if (!prev.walls[op.wallId]) {
        return fail('NOT_FOUND', `Стена "${op.wallId}" не найдена.`);
      }
      const dependents = findDependents(prev, op.wallId);
      if (dependents.length > 0 && !op.cascade) {
        return {
          ok: false,
          error: {
            code: 'HAS_DEPENDENTS',
            message: `Стена удаляется. На ней закреплены ${dependents.length} объект(а). Продолжить?`,
            dependents,
          },
        };
      }
      const next = cloneState(prev);
      delete next.walls[op.wallId];
      if (op.cascade) {
        for (const d of dependents) {
          if (d.kind === 'room') {
            const room = next.rooms[d.id];
            if (room) {
              room.wallIds = room.wallIds.filter((w) => w !== op.wallId);
            }
          } else {
            const obj = next.objects[d.id];
            if (obj) obj.hostId = null;
          }
        }
      }
      return { ok: true, state: next };
    }

    case 'addRoom': {
      const taken = checkIdFree(prev, op.roomId);
      if (taken) return taken;
      if (!op.name.trim()) return fail('BAD_GEOMETRY', 'Имя помещения пустое.');
      const grid = checkSnapped(op.outline, `Помещение "${op.roomId}"`);
      if (grid) return grid;
      const ring = openRing(op.outline.map(snapPoint));
      if (ring.length < 3) {
        return fail(
          'BAD_GEOMETRY',
          `Помещение "${op.roomId}": нужно минимум 3 точки контура.`
        );
      }
      if (polygonAreaMm2(ring) < MIN_ROOM_AREA_MM2) {
        return fail(
          'BAD_GEOMETRY',
          `Помещение "${op.roomId}": площадь меньше 0.5 м².`
        );
      }
      for (const wid of op.wallIds) {
        if (!prev.walls[wid]) {
          return fail('UNKNOWN_HOST', `Стена "${wid}" не найдена.`);
        }
      }
      const next = cloneState(prev);
      next.rooms[op.roomId] = {
        id: op.roomId,
        name: op.name,
        outline: ring,
        wallIds: [...op.wallIds],
      };
      return { ok: true, state: next };
    }

    case 'updateRoom': {
      const room = prev.rooms[op.roomId];
      if (!room)
        return fail('NOT_FOUND', `Помещение "${op.roomId}" не найдено.`);
      const name = op.name ?? room.name;
      if (!name.trim()) return fail('BAD_GEOMETRY', 'Имя помещения пустое.');
      let outline = room.outline;
      if (op.outline) {
        const grid = checkSnapped(op.outline, `Помещение "${op.roomId}"`);
        if (grid) return grid;
        const ring = openRing(op.outline.map(snapPoint));
        if (ring.length < 3) {
          return fail(
            'BAD_GEOMETRY',
            `Помещение "${op.roomId}": нужно минимум 3 точки контура.`
          );
        }
        if (polygonAreaMm2(ring) < MIN_ROOM_AREA_MM2) {
          return fail(
            'BAD_GEOMETRY',
            `Помещение "${op.roomId}": площадь меньше 0.5 м².`
          );
        }
        outline = ring;
      }
      const wallIds = op.wallIds ?? room.wallIds;
      for (const wid of wallIds) {
        if (!prev.walls[wid]) {
          return fail('UNKNOWN_HOST', `Стена "${wid}" не найдена.`);
        }
      }
      const next = cloneState(prev);
      next.rooms[op.roomId] = { ...room, name, outline, wallIds: [...wallIds] };
      return { ok: true, state: next };
    }

    case 'deleteRoom': {
      if (!prev.rooms[op.roomId]) {
        return fail('NOT_FOUND', `Помещение "${op.roomId}" не найдено.`);
      }
      const dependents = findDependents(prev, op.roomId);
      if (dependents.length > 0 && !op.cascade) {
        return {
          ok: false,
          error: {
            code: 'HAS_DEPENDENTS',
            message: `Помещение удаляется. От него зависят ${dependents.length} объект(а). Продолжить?`,
            dependents,
          },
        };
      }
      const next = cloneState(prev);
      delete next.rooms[op.roomId];
      if (op.cascade) {
        for (const d of dependents) {
          const obj = next.objects[d.id];
          if (obj) obj.hostId = null;
        }
        // Плиты пола/потолка контур не теряют — они независимы от комнат.
      }
      return { ok: true, state: next };
    }

    case 'upsertSlab': {
      const grid = checkSnapped(op.outline, `Плита "${op.slabId}"`);
      if (grid) return grid;
      const ring = openRing(op.outline.map(snapPoint));
      if (ring.length < 3) {
        return fail(
          'BAD_GEOMETRY',
          `Плита "${op.slabId}": нужно минимум 3 точки контура.`
        );
      }
      if (polygonAreaMm2(ring) < MIN_ROOM_AREA_MM2) {
        return fail(
          'BAD_GEOMETRY',
          `Плита "${op.slabId}": площадь меньше 0.5 м².`
        );
      }
      if (!Number.isInteger(op.levelMm) || !Number.isInteger(op.thicknessMm)) {
        return fail(
          'BAD_LEVEL',
          `Плита "${op.slabId}": уровень и толщина — целые мм.`
        );
      }
      if (op.thicknessMm < 50 || op.thicknessMm > 500) {
        return fail(
          'BAD_LEVEL',
          `Плита "${op.slabId}": толщина должна быть 50..500 мм.`
        );
      }
      if (!isPointOnGrid({ x: op.levelMm, y: 0 })) {
        return fail(
          'OFF_GRID',
          `Плита "${op.slabId}": уровень ${op.levelMm} мм не кратен 1 см.`
        );
      }
      const next = cloneState(prev);
      next.slabs[op.slabId] = {
        id: op.slabId,
        kind: op.kind,
        levelMm: op.levelMm,
        thicknessMm: op.thicknessMm,
        outline: ring,
      };
      return { ok: true, state: next };
    }

    case 'deleteSlab': {
      if (!prev.slabs[op.slabId]) {
        return fail('NOT_FOUND', `Плита "${op.slabId}" не найдена.`);
      }
      const dependents = findDependents(prev, op.slabId);
      if (dependents.length > 0 && !op.cascade) {
        return {
          ok: false,
          error: {
            code: 'HAS_DEPENDENTS',
            message: `Плита удаляется. От неё зависят ${dependents.length} объект(а). Продолжить?`,
            dependents,
          },
        };
      }
      const next = cloneState(prev);
      delete next.slabs[op.slabId];
      if (op.cascade) {
        for (const d of dependents) {
          const obj = next.objects[d.id];
          if (obj) obj.hostId = null;
        }
      }
      return { ok: true, state: next };
    }

    case 'placeObject': {
      const taken = checkIdFree(prev, op.objectId);
      if (taken) return taken;
      if (op.hostId !== null && !hostExists(prev, op.hostId)) {
        return fail('UNKNOWN_HOST', `Хозяин "${op.hostId}" не найден.`);
      }
      const next = cloneState(prev);
      next.objects[op.objectId] = {
        id: op.objectId,
        kind: op.kind,
        label: op.label,
        hostId: op.hostId,
      };
      return { ok: true, state: next };
    }

    case 'removeObject': {
      if (!prev.objects[op.objectId]) {
        return fail('NOT_FOUND', `Объект "${op.objectId}" не найден.`);
      }
      const next = cloneState(prev);
      delete next.objects[op.objectId];
      return { ok: true, state: next };
    }
  }
}
