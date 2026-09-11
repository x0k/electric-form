/**
 * Операции Этапов 1, 5a–7 «Планировка → Проёмы → Объекты».
 *
 * Каждая операция — атомарное изменение черновика внутри Feature.
 * Применение чистое: (state, op) → { ok, state } | { ok: false, error }.
 * Невалидная операция никогда не мутирует состояние.
 *
 * Проёмы и объекты хранятся параметрически (см. openings.ts, furnish.ts):
 * при updateWall они автоматически следуют за стеной, проверки
 * вместимости идут по актуальной длине стены.
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
import { validateOpening, type OpeningKind } from './openings';
import { findCatalogEntry, validateDims } from './catalog';
import { validateElec, type ElecKind } from './electrics';
import { validateLuminaire, type LightKind } from './lighting';
import {
  validateFloorAnchor,
  validateWallAnchor,
  type FloorAnchor,
  type WallAnchor,
} from './furnish';

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
  | { type: 'removeObject'; objectId: string }
  | {
      type: 'addOpening';
      openingId: string;
      kind: OpeningKind;
      wallId: string;
      offsetMm: number;
      widthMm: number;
      heightMm: number;
      sillMm: number;
    }
  | {
      type: 'updateOpening';
      openingId: string;
      offsetMm?: number;
      widthMm?: number;
      heightMm?: number;
      sillMm?: number;
    }
  | { type: 'deleteOpening'; openingId: string }
  | {
      type: 'addFloorObject';
      objectId: string;
      kind: string;
      label?: string;
      anchor: FloorAnchor;
      wMm?: number;
      dMm?: number;
      hMm?: number;
    }
  | {
      type: 'updateFloorObject';
      objectId: string;
      label?: string;
      anchor?: FloorAnchor;
      wMm?: number;
      dMm?: number;
      hMm?: number;
    }
  | { type: 'removeFloorObject'; objectId: string }
  | {
      type: 'addWallObject';
      objectId: string;
      kind: string;
      label?: string;
      anchor: WallAnchor;
      wMm?: number;
      hMm?: number;
      depthMm?: number;
    }
  | {
      type: 'updateWallObject';
      objectId: string;
      label?: string;
      anchor?: WallAnchor;
      wMm?: number;
      hMm?: number;
      depthMm?: number;
    }
  | { type: 'removeWallObject'; objectId: string }
  | { type: 'upsertElecGroup'; groupId: string; label: string }
  | { type: 'deleteElecGroup'; groupId: string; cascade?: boolean }
  | {
      type: 'addElecPoint';
      pointId: string;
      kind: ElecKind;
      wallId: string;
      alongMm: number;
      heightMm: number;
      purpose: string;
      groupId: string | null;
    }
  | {
      type: 'updateElecPoint';
      pointId: string;
      wallId?: string;
      alongMm?: number;
      heightMm?: number;
      purpose?: string;
      groupId?: string | null;
    }
  | { type: 'removeElecPoint'; pointId: string }
  | { type: 'upsertLightGroup'; groupId: string; label: string }
  | { type: 'deleteLightGroup'; groupId: string; cascade?: boolean }
  | {
      type: 'addLuminaire';
      luminaireId: string;
      kind: LightKind;
      roomId: string;
      xMm: number;
      yMm: number;
      groupId: string | null;
    }
  | {
      type: 'updateLuminaire';
      luminaireId: string;
      roomId?: string;
      xMm?: number;
      yMm?: number;
      groupId?: string | null;
    }
  | { type: 'removeLuminaire'; luminaireId: string };

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
          } else if (d.kind === 'opening') {
            // Проём без стены не существует — удаляем явно.
            delete next.openings[d.id];
          } else if (d.kind === 'wallObject') {
            delete next.wallObjects[d.id];
          } else if (d.kind === 'floorObject') {
            // Только wall-якорь теряет хозяина; room/corner живут дальше.
            const fo = next.floorObjects[d.id];
            if (fo && fo.anchor.type === 'wall') delete next.floorObjects[d.id];
          } else if (d.kind === 'elecPoint') {
            delete next.elecPoints[d.id];
          } else {
            const obj = next.objects[d.id];
            if (obj) obj.hostId = null;
          }
        }
      }
      // После удаления стены проверяем, что surviving проёмы/объекты
      // всё ещё вмещаются (укорочение стены updateWall проверяется иначе:
      // там replay downstream сам даст конфликты; здесь стена уже gone).
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
          if (d.kind === 'floorObject') {
            delete next.floorObjects[d.id];
          } else if (d.kind === 'luminaire') {
            delete next.luminaires[d.id];
          } else {
            const obj = next.objects[d.id];
            if (obj) obj.hostId = null;
          }
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

    case 'addOpening': {
      const taken = checkIdFree(prev, op.openingId);
      if (taken) return taken;
      const err = validateOpening(prev.walls, prev.openings ?? {}, {
        id: op.openingId,
        kind: op.kind,
        wallId: op.wallId,
        offsetMm: op.offsetMm,
        widthMm: op.widthMm,
        heightMm: op.heightMm,
        sillMm: op.sillMm,
      });
      if (err) return fail(codeForOpeningError(err), err);
      const next = cloneState(prev);
      next.openings[op.openingId] = {
        id: op.openingId,
        kind: op.kind,
        wallId: op.wallId,
        offsetMm: op.offsetMm,
        widthMm: op.widthMm,
        heightMm: op.heightMm,
        sillMm: op.sillMm,
      };
      return { ok: true, state: next };
    }

    case 'updateOpening': {
      const cur = (prev.openings ?? {})[op.openingId];
      if (!cur) return fail('NOT_FOUND', `Проём "${op.openingId}" не найден.`);
      const draft = {
        id: cur.id,
        kind: cur.kind,
        wallId: cur.wallId,
        offsetMm: op.offsetMm ?? cur.offsetMm,
        widthMm: op.widthMm ?? cur.widthMm,
        heightMm: op.heightMm ?? cur.heightMm,
        sillMm: op.sillMm ?? cur.sillMm,
      };
      const err = validateOpening(
        prev.walls,
        prev.openings ?? {},
        draft,
        cur.id
      );
      if (err) return fail(codeForOpeningError(err), err);
      const next = cloneState(prev);
      next.openings[op.openingId] = { ...draft };
      return { ok: true, state: next };
    }

    case 'deleteOpening': {
      if (!(prev.openings ?? {})[op.openingId]) {
        return fail('NOT_FOUND', `Проём "${op.openingId}" не найден.`);
      }
      const next = cloneState(prev);
      delete next.openings[op.openingId];
      return { ok: true, state: next };
    }

    case 'addFloorObject': {
      const taken = checkIdFree(prev, op.objectId);
      if (taken) return taken;
      const entry = findCatalogEntry(op.kind);
      if (!entry) return fail('BAD_GEOMETRY', `Неизвестный тип "${op.kind}".`);
      if (entry.group !== 'floor') {
        return fail(
          'BAD_GEOMETRY',
          `"${op.kind}" — навесной, используйте addWallObject.`
        );
      }
      const wMm = op.wMm ?? entry.defW;
      const dMm = op.dMm ?? entry.defD;
      const hMm = op.hMm ?? entry.defH;
      const dims = validateDims(op.kind, wMm, dMm, hMm);
      if (dims) return fail('BAD_GEOMETRY', dims);
      const anchorErr = validateFloorAnchor(prev, op.anchor, wMm);
      if (anchorErr) return fail(hostCode(anchorErr), anchorErr);
      const next = cloneState(prev);
      next.floorObjects[op.objectId] = {
        id: op.objectId,
        kind: op.kind,
        label: op.label?.trim() ? op.label : entry.label,
        anchor: { ...op.anchor } as FloorAnchor,
        wMm,
        dMm,
        hMm,
      };
      return { ok: true, state: next };
    }

    case 'updateFloorObject': {
      const cur = (prev.floorObjects ?? {})[op.objectId];
      if (!cur) return fail('NOT_FOUND', `Объект "${op.objectId}" не найден.`);
      const wMm = op.wMm ?? cur.wMm;
      const dMm = op.dMm ?? cur.dMm;
      const hMm = op.hMm ?? cur.hMm;
      const dims = validateDims(cur.kind, wMm, dMm, hMm);
      if (dims) return fail('BAD_GEOMETRY', dims);
      const anchor = (op.anchor ?? cur.anchor) as FloorAnchor;
      const anchorErr = validateFloorAnchor(prev, anchor, wMm);
      if (anchorErr) return fail(hostCode(anchorErr), anchorErr);
      const next = cloneState(prev);
      next.floorObjects[op.objectId] = {
        ...cur,
        label: op.label !== undefined ? op.label : cur.label,
        anchor: { ...anchor } as FloorAnchor,
        wMm,
        dMm,
        hMm,
      };
      return { ok: true, state: next };
    }

    case 'removeFloorObject': {
      if (!(prev.floorObjects ?? {})[op.objectId]) {
        return fail('NOT_FOUND', `Объект "${op.objectId}" не найден.`);
      }
      const next = cloneState(prev);
      delete next.floorObjects[op.objectId];
      return { ok: true, state: next };
    }

    case 'addWallObject': {
      const taken = checkIdFree(prev, op.objectId);
      if (taken) return taken;
      const entry = findCatalogEntry(op.kind);
      if (!entry) return fail('BAD_GEOMETRY', `Неизвестный тип "${op.kind}".`);
      if (entry.group !== 'wall') {
        return fail(
          'BAD_GEOMETRY',
          `"${op.kind}" — напольный, используйте addFloorObject.`
        );
      }
      const wMm = op.wMm ?? entry.defW;
      const depthMm = op.depthMm ?? entry.defD;
      const hMm = op.hMm ?? entry.defH;
      const dims = validateDims(op.kind, wMm, depthMm, hMm);
      if (dims) return fail('BAD_GEOMETRY', dims);
      const anchorErr = validateWallAnchor(prev.walls, op.anchor, wMm);
      if (anchorErr) return fail(hostCode(anchorErr), anchorErr);
      const next = cloneState(prev);
      next.wallObjects[op.objectId] = {
        id: op.objectId,
        kind: op.kind,
        label: op.label?.trim() ? op.label : entry.label,
        anchor: { ...op.anchor },
        wMm,
        hMm,
        depthMm,
      };
      return { ok: true, state: next };
    }

    case 'updateWallObject': {
      const cur = (prev.wallObjects ?? {})[op.objectId];
      if (!cur) return fail('NOT_FOUND', `Объект "${op.objectId}" не найден.`);
      const wMm = op.wMm ?? cur.wMm;
      const depthMm = op.depthMm ?? cur.depthMm;
      const hMm = op.hMm ?? cur.hMm;
      const dims = validateDims(cur.kind, wMm, depthMm, hMm);
      if (dims) return fail('BAD_GEOMETRY', dims);
      const anchor = op.anchor ?? cur.anchor;
      const anchorErr = validateWallAnchor(prev.walls, anchor, wMm);
      if (anchorErr) return fail(hostCode(anchorErr), anchorErr);
      const next = cloneState(prev);
      next.wallObjects[op.objectId] = {
        ...cur,
        label: op.label !== undefined ? op.label : cur.label,
        anchor: { ...anchor },
        wMm,
        hMm,
        depthMm,
      };
      return { ok: true, state: next };
    }

    case 'removeWallObject': {
      if (!(prev.wallObjects ?? {})[op.objectId]) {
        return fail('NOT_FOUND', `Объект "${op.objectId}" не найден.`);
      }
      const next = cloneState(prev);
      delete next.wallObjects[op.objectId];
      return { ok: true, state: next };
    }

    case 'upsertElecGroup': {
      if (!op.groupId)
        return fail('BAD_GEOMETRY', 'Пустой id группы запрещён.');
      if (!op.label.trim()) return fail('BAD_GEOMETRY', 'Имя группы пустое.');
      const next = cloneState(prev);
      next.elecGroups[op.groupId] = { id: op.groupId, label: op.label };
      return { ok: true, state: next };
    }

    case 'deleteElecGroup': {
      if (!prev.elecGroups[op.groupId]) {
        return fail('NOT_FOUND', `Группа "${op.groupId}" не найдена.`);
      }
      const members = Object.values(prev.elecPoints ?? {}).filter(
        (p) => p.groupId === op.groupId
      );
      if (members.length > 0 && !op.cascade) {
        return {
          ok: false,
          error: {
            code: 'HAS_DEPENDENTS',
            message: `Группа удаляется. В ней ${members.length} точка(и). Продолжить?`,
            dependents: members.map((m) => ({
              kind: 'elecPoint',
              id: m.id,
              label: m.id,
            })),
          },
        };
      }
      const next = cloneState(prev);
      delete next.elecGroups[op.groupId];
      if (op.cascade) {
        for (const m of members) {
          const pt = next.elecPoints[m.id];
          if (pt) pt.groupId = null;
        }
      }
      return { ok: true, state: next };
    }

    case 'addElecPoint': {
      const taken = checkIdFree(prev, op.pointId);
      if (taken) return taken;
      const err = validateElec(prev.walls, prev.elecGroups ?? {}, {
        id: op.pointId,
        kind: op.kind,
        wallId: op.wallId,
        alongMm: op.alongMm,
        heightMm: op.heightMm,
        purpose: op.purpose,
        groupId: op.groupId,
      });
      if (err) return fail(codeForOpeningError(err), err);
      const next = cloneState(prev);
      next.elecPoints[op.pointId] = {
        id: op.pointId,
        kind: op.kind,
        wallId: op.wallId,
        alongMm: op.alongMm,
        heightMm: op.heightMm,
        purpose: op.purpose,
        groupId: op.groupId,
      };
      return { ok: true, state: next };
    }

    case 'updateElecPoint': {
      const cur = (prev.elecPoints ?? {})[op.pointId];
      if (!cur)
        return fail('NOT_FOUND', `Электроточка "${op.pointId}" не найдена.`);
      const draft = {
        id: cur.id,
        kind: cur.kind,
        wallId: op.wallId ?? cur.wallId,
        alongMm: op.alongMm ?? cur.alongMm,
        heightMm: op.heightMm ?? cur.heightMm,
        purpose: op.purpose ?? cur.purpose,
        groupId: op.groupId !== undefined ? op.groupId : cur.groupId,
      };
      const err = validateElec(prev.walls, prev.elecGroups ?? {}, draft);
      if (err) return fail(codeForOpeningError(err), err);
      const next = cloneState(prev);
      next.elecPoints[op.pointId] = { ...draft };
      return { ok: true, state: next };
    }

    case 'removeElecPoint': {
      if (!(prev.elecPoints ?? {})[op.pointId]) {
        return fail('NOT_FOUND', `Электроточка "${op.pointId}" не найдена.`);
      }
      const next = cloneState(prev);
      delete next.elecPoints[op.pointId];
      return { ok: true, state: next };
    }

    case 'upsertLightGroup': {
      if (!op.groupId)
        return fail('BAD_GEOMETRY', 'Пустой id группы запрещён.');
      if (!op.label.trim()) return fail('BAD_GEOMETRY', 'Имя группы пустое.');
      const next = cloneState(prev);
      next.lightGroups[op.groupId] = { id: op.groupId, label: op.label };
      return { ok: true, state: next };
    }

    case 'deleteLightGroup': {
      if (!prev.lightGroups[op.groupId]) {
        return fail('NOT_FOUND', `Группа "${op.groupId}" не найдена.`);
      }
      const members = Object.values(prev.luminaires ?? {}).filter(
        (l) => l.groupId === op.groupId
      );
      if (members.length > 0 && !op.cascade) {
        return {
          ok: false,
          error: {
            code: 'HAS_DEPENDENTS',
            message: `Группа удаляется. В ней ${members.length} светильник(а). Продолжить?`,
            dependents: members.map((m) => ({
              kind: 'luminaire',
              id: m.id,
              label: m.id,
            })),
          },
        };
      }
      const next = cloneState(prev);
      delete next.lightGroups[op.groupId];
      if (op.cascade) {
        for (const m of members) {
          const l = next.luminaires[m.id];
          if (l) l.groupId = null;
        }
      }
      return { ok: true, state: next };
    }

    case 'addLuminaire': {
      const taken = checkIdFree(prev, op.luminaireId);
      if (taken) return taken;
      const err = validateLuminaire(prev.rooms, prev.lightGroups ?? {}, {
        id: op.luminaireId,
        kind: op.kind,
        roomId: op.roomId,
        xMm: op.xMm,
        yMm: op.yMm,
        groupId: op.groupId,
      });
      if (err) return fail(codeForOpeningError(err), err);
      const next = cloneState(prev);
      next.luminaires[op.luminaireId] = {
        id: op.luminaireId,
        kind: op.kind,
        roomId: op.roomId,
        xMm: op.xMm,
        yMm: op.yMm,
        groupId: op.groupId,
      };
      return { ok: true, state: next };
    }

    case 'updateLuminaire': {
      const cur = (prev.luminaires ?? {})[op.luminaireId];
      if (!cur)
        return fail('NOT_FOUND', `Светильник "${op.luminaireId}" не найден.`);
      const draft = {
        id: cur.id,
        kind: cur.kind,
        roomId: op.roomId ?? cur.roomId,
        xMm: op.xMm ?? cur.xMm,
        yMm: op.yMm ?? cur.yMm,
        groupId: op.groupId !== undefined ? op.groupId : cur.groupId,
      };
      const err = validateLuminaire(prev.rooms, prev.lightGroups ?? {}, draft);
      if (err) return fail(codeForOpeningError(err), err);
      const next = cloneState(prev);
      next.luminaires[op.luminaireId] = { ...draft };
      return { ok: true, state: next };
    }

    case 'removeLuminaire': {
      if (!(prev.luminaires ?? {})[op.luminaireId]) {
        return fail('NOT_FOUND', `Светильник "${op.luminaireId}" не найден.`);
      }
      const next = cloneState(prev);
      delete next.luminaires[op.luminaireId];
      return { ok: true, state: next };
    }
  }
}

function hostCode(message: string): ApplyErrorCode {
  return /не найдена?/.test(message) ? 'UNKNOWN_HOST' : 'BAD_GEOMETRY';
}

function codeForOpeningError(message: string): ApplyErrorCode {
  if (/не найдена?/.test(message)) return 'UNKNOWN_HOST';
  if (/кратен|целые/.test(message)) return 'OFF_GRID';
  return 'BAD_GEOMETRY';
}
