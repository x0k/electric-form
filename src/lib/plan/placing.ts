/**
 * Графическое размещение (доменная половина).
 *
 * Вьювер сообщает только сырой хит курсора (точка плана + стена под
 * курсором + высота из iso), а ВСЯ математика якорей живёт здесь —
 * чисто, без three.js, покрыта unit-тестами:
 *
 * - place*: клик → операция добавления с выведенным якорем;
 * - moveObject: drag → операция обновления якоря того же типа;
 * - вьювер лишь рисует гост и двигает его, состояние не трогает.
 *
 * Правило простое: клик по стене = привязка к стене, клик по полу =
 * привязка к помещению. Числа из форм используются только для высот
 * и габаритов, позиция всегда идёт с канваса.
 */

import {
  pointInPolygon,
  snapMm,
  snapPoint,
  wallLengthMm,
  type Vec2,
} from './geometry';
import { hostExists, type ApartmentState, type Room, type Wall } from './model';
import { validateOpening, type OpeningKind } from './openings';
import { catalogLabel, findCatalogEntry } from './catalog';
import {
  inwardNormalMm,
  isRotationDeg,
  validateFloorAnchor,
  validateWallAnchor,
} from './furnish';
import {
  SOCKET_STD_H_MM,
  SWITCH_STD_H_MM,
  validateElec,
  type ElecKind,
} from './electrics';
import { validateLuminaire, type LightKind } from './lighting';
import type { Operation } from './operations';

/** Сырой хит курсора от вьювера (всё не снапнуто, домен снаппит сам). */
export interface PlaceHit {
  /** Точка на плоскости пола под курсором, мм (сырая). */
  plan: Vec2;
  /** Та же точка до вычета захвата (нужна drag вьюверу; домен не использует). */
  raw?: Vec2;
  /** Стена под курсором (попадание в меш стены), если есть. */
  wallId?: string;
}

export type PlaceResult =
  { ok: true; op: Operation; id: string } | { ok: false; error: string };

function fail(error: string): PlaceResult {
  return { ok: false, error };
}

/** Проекция точки на ось стены: дистанция от a вдоль стены (сырая). */
export function projectAlong(wall: Wall, p: Vec2): number {
  const len = wallLengthMm(wall.a, wall.b);
  if (len < 1e-9) return 0;
  const dx = (wall.b.x - wall.a.x) / len;
  const dy = (wall.b.y - wall.a.y) / len;
  return (p.x - wall.a.x) * dx + (p.y - wall.a.y) * dy;
}

/**
 * Глубина точки вглубь комнаты от ВНУТРЕННЕЙ грани стены (сырая).
 * null — у стены нет помещения (нет внутренней стороны).
 */
export function depthFromWall(
  state: ApartmentState,
  wall: Wall,
  p: Vec2
): number | null {
  const inw = inwardNormalMm(state, wall);
  if (!inw) return null;
  const len = wallLengthMm(wall.a, wall.b);
  if (len < 1e-9) return 0;
  return (
    (p.x - wall.a.x) * inw.x + (p.y - wall.a.y) * inw.y - wall.thicknessMm / 2
  );
}

/** Помещение, содержащее точку (по снапнутой точке). */
export function roomAt(state: ApartmentState, p: Vec2): Room | null {
  const q = snapPoint(p);
  for (const room of Object.values(state.rooms)) {
    if (room.outline.length >= 3 && pointInPolygon(q, room.outline)) {
      return room;
    }
  }
  return null;
}

/** Свободный id вида base, base-2, … (уникален по всем коллекциям). */
export function uniqueId(state: ApartmentState, base: string): string {
  if (!hostExists(state, base)) return base;
  let n = 2;
  while (hostExists(state, `${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/**
 * Напольный объект кликом: по стене — якорь к стене (вплотную),
 * по полу — якорь к помещению. Габариты — дефолт каталога.
 */
export function placeFloorObject(
  state: ApartmentState,
  hit: PlaceHit,
  opts: { kind: string; rotationDeg?: number; id?: string }
): PlaceResult {
  const entry = findCatalogEntry(opts.kind);
  if (!entry) return fail(`Неизвестный тип объекта "${opts.kind}".`);
  if (entry.group !== 'floor') {
    return fail(`"${opts.kind}" — навесной, кликните на стене в своём этапе.`);
  }
  const rotationDeg = opts.rotationDeg ?? 0;
  if (!isRotationDeg(rotationDeg)) {
    return fail('Поворот — только 0/90/180/270°.');
  }
  const id = opts.id ?? uniqueId(state, 'f');
  const label = entry.label;
  const wall = hit.wallId ? state.walls[hit.wallId] : undefined;
  if (wall) {
    const anchor = {
      type: 'wall' as const,
      wallId: wall.id,
      alongMm: snapMm(projectAlong(wall, hit.plan)),
      fromWallMm: 0,
      rotationDeg,
    };
    const err = validateFloorAnchor(state, anchor, entry.defW);
    if (err) return fail(err);
    return {
      ok: true,
      id,
      op: {
        type: 'addFloorObject',
        objectId: id,
        kind: entry.kind,
        label,
        anchor,
        wMm: entry.defW,
        dMm: entry.defD,
        hMm: entry.defH,
      },
    };
  }
  const room = roomAt(state, hit.plan);
  if (!room) return fail('Кликните внутри помещения или по стене.');
  const p = snapPoint(hit.plan);
  const anchor = {
    type: 'room' as const,
    roomId: room.id,
    xMm: p.x,
    yMm: p.y,
    rotationDeg,
  };
  const err = validateFloorAnchor(state, anchor, entry.defW);
  if (err) return fail(err);
  return {
    ok: true,
    id,
    op: {
      type: 'addFloorObject',
      objectId: id,
      kind: entry.kind,
      label,
      anchor,
      wMm: entry.defW,
      dMm: entry.defD,
      hMm: entry.defH,
    },
  };
}

/** Навесной объект / розетка / проём кликом — только по стене. */
function wallAlongOrFail(
  state: ApartmentState,
  hit: PlaceHit,
  what: string
): { wall: Wall; alongMm: number } | { error: string } {
  const wall = hit.wallId ? state.walls[hit.wallId] : undefined;
  if (!wall) return { error: `${what}: кликните по стене.` };
  return { wall, alongMm: snapMm(projectAlong(wall, hit.plan)) };
}

export function placeWallObject(
  state: ApartmentState,
  hit: PlaceHit,
  opts: { kind: string; heightMm: number; id?: string }
): PlaceResult {
  const entry = findCatalogEntry(opts.kind);
  if (!entry) return fail(`Неизвестный тип объекта "${opts.kind}".`);
  if (entry.group !== 'wall') {
    return fail(`"${opts.kind}" — напольный, кликните по полу в своём этапе.`);
  }
  const r = wallAlongOrFail(state, hit, entry.label);
  if ('error' in r) return fail(r.error);
  const id = opts.id ?? uniqueId(state, 'm');
  const anchor = {
    wallId: r.wall.id,
    alongMm: r.alongMm,
    heightMm: opts.heightMm,
  };
  const err = validateWallAnchor(state.walls, anchor, entry.defW);
  if (err) return fail(err);
  return {
    ok: true,
    id,
    op: {
      type: 'addWallObject',
      objectId: id,
      kind: entry.kind,
      label: entry.label,
      anchor,
      wMm: entry.defW,
      hMm: entry.defH,
      depthMm: entry.defD,
    },
  };
}

export function placeElecPoint(
  state: ApartmentState,
  hit: PlaceHit,
  opts: {
    kind: ElecKind;
    heightMm: number;
    purpose: string;
    groupId: string | null;
    id?: string;
  }
): PlaceResult {
  const r = wallAlongOrFail(
    state,
    hit,
    opts.kind === 'socket' ? 'Розетка' : 'Выключатель'
  );
  if ('error' in r) return fail(r.error);
  const id = opts.id ?? uniqueId(state, opts.kind === 'socket' ? 'sk' : 'sw');
  const draft = {
    id,
    kind: opts.kind,
    wallId: r.wall.id,
    alongMm: r.alongMm,
    heightMm: opts.heightMm,
    purpose: opts.purpose,
    groupId: opts.groupId,
  };
  const err = validateElec(state.walls, state.elecGroups ?? {}, draft);
  if (err) return fail(err);
  return { ok: true, id, op: { type: 'addElecPoint', pointId: id, ...draft } };
}

export function placeLuminaire(
  state: ApartmentState,
  hit: PlaceHit,
  opts: { kind: LightKind; groupId: string | null; id?: string }
): PlaceResult {
  const room = roomAt(state, hit.plan);
  if (!room) return fail('Светильник: кликните внутри помещения.');
  const p = snapPoint(hit.plan);
  const id = opts.id ?? uniqueId(state, 'lt');
  const draft = {
    id,
    kind: opts.kind,
    roomId: room.id,
    xMm: p.x,
    yMm: p.y,
    groupId: opts.groupId,
  };
  const err = validateLuminaire(state.rooms, state.lightGroups ?? {}, draft);
  if (err) return fail(err);
  return {
    ok: true,
    id,
    op: { type: 'addLuminaire', luminaireId: id, ...draft },
  };
}

export function placeOpening(
  state: ApartmentState,
  hit: PlaceHit,
  opts: {
    kind: OpeningKind;
    widthMm: number;
    heightMm: number;
    sillMm: number;
    id?: string;
  }
): PlaceResult {
  const wall = hit.wallId ? state.walls[hit.wallId] : undefined;
  if (!wall) return fail('Проём: кликните по стене.');
  const along = projectAlong(wall, hit.plan);
  const id = opts.id ?? uniqueId(state, opts.kind === 'door' ? 'd' : 'win');
  const draft = {
    id,
    kind: opts.kind,
    wallId: wall.id,
    offsetMm: snapMm(along - opts.widthMm / 2),
    widthMm: opts.widthMm,
    heightMm: opts.heightMm,
    sillMm: opts.sillMm,
  };
  const err = validateOpening(state.walls, state.openings ?? {}, draft);
  if (err) return fail(err);
  return { ok: true, id, op: { type: 'addOpening', openingId: id, ...draft } };
}

/**
 * Перетаскивание объекта: хит — желаемый ЦЕНТР (вьювер вычитает захват).
 * Якорь сохраняет тип; высоты и габариты не меняются — только план.
 */
export function moveObject(
  state: ApartmentState,
  id: string,
  hit: PlaceHit
): PlaceResult {
  const fo = state.floorObjects?.[id];
  if (fo) {
    const a = fo.anchor;
    if (a.type === 'corner') {
      return fail('Угловой якорь двигается только числами в панели.');
    }
    if (a.type === 'room') {
      const p = snapPoint(hit.plan);
      const room = state.rooms[a.roomId];
      if (!room) return fail(`Помещение "${a.roomId}" не найдено.`);
      if (!pointInPolygon(p, room.outline)) {
        return fail('Вне помещения — отпустите внутри комнаты.');
      }
      return {
        ok: true,
        id,
        op: {
          type: 'updateFloorObject',
          objectId: id,
          anchor: { ...a, xMm: p.x, yMm: p.y },
        },
      };
    }
    // wall-якорь: перетащили на другую стену — перепривязка вплотную.
    const targetId =
      hit.wallId && state.walls[hit.wallId] ? hit.wallId : a.wallId;
    const wall = state.walls[targetId];
    if (!wall) return fail(`Стена "${targetId}" не найдена.`);
    const alongMm = snapMm(projectAlong(wall, hit.plan));
    let fromWallMm = 0;
    if (targetId === a.wallId) {
      const depth = depthFromWall(state, wall, hit.plan);
      fromWallMm =
        depth === null ? a.fromWallMm : snapMm(Math.max(0, depth - fo.dMm / 2));
    }
    const anchor = { ...a, wallId: targetId, alongMm, fromWallMm };
    const err = validateFloorAnchor(state, anchor, fo.wMm);
    if (err) return fail(err);
    return {
      ok: true,
      id,
      op: { type: 'updateFloorObject', objectId: id, anchor },
    };
  }

  const wo = state.wallObjects?.[id];
  if (wo) {
    const wallId =
      hit.wallId && state.walls[hit.wallId] ? hit.wallId : wo.anchor.wallId;
    const wall = state.walls[wallId];
    if (!wall) return fail(`Стена "${wallId}" не найдена.`);
    const anchor = {
      ...wo.anchor,
      wallId,
      alongMm: snapMm(projectAlong(wall, hit.plan)),
    };
    const err = validateWallAnchor(state.walls, anchor, wo.wMm);
    if (err) return fail(err);
    return {
      ok: true,
      id,
      op: { type: 'updateWallObject', objectId: id, anchor },
    };
  }

  const ep = state.elecPoints?.[id];
  if (ep) {
    const wallId =
      hit.wallId && state.walls[hit.wallId] ? hit.wallId : ep.wallId;
    const wall = state.walls[wallId];
    if (!wall) return fail(`Стена "${wallId}" не найдена.`);
    const draft = {
      ...ep,
      wallId,
      alongMm: snapMm(projectAlong(wall, hit.plan)),
    };
    const err = validateElec(state.walls, state.elecGroups ?? {}, draft);
    if (err) return fail(err);
    return {
      ok: true,
      id,
      op: {
        type: 'updateElecPoint',
        pointId: id,
        wallId,
        alongMm: draft.alongMm,
      },
    };
  }

  const lu = state.luminaires?.[id];
  if (lu) {
    const p = snapPoint(hit.plan);
    const room = state.rooms[lu.roomId];
    if (!room) return fail(`Помещение "${lu.roomId}" не найдено.`);
    if (!pointInPolygon(p, room.outline)) {
      return fail('Вне помещения — отпустите внутри комнаты.');
    }
    return {
      ok: true,
      id,
      op: { type: 'updateLuminaire', luminaireId: id, xMm: p.x, yMm: p.y },
    };
  }

  const op = state.openings?.[id];
  if (op) {
    const wall = state.walls[op.wallId];
    if (!wall) return fail(`Стена "${op.wallId}" не найдена.`);
    const draft = {
      ...op,
      offsetMm: snapMm(projectAlong(wall, hit.plan) - op.widthMm / 2),
    };
    const err = validateOpening(
      state.walls,
      state.openings ?? {},
      draft,
      op.id
    );
    if (err) return fail(err);
    return {
      ok: true,
      id,
      op: { type: 'updateOpening', openingId: id, offsetMm: draft.offsetMm },
    };
  }

  return fail(`Объект "${id}" не найден или не двигается мышью.`);
}

/** Высота установки по умолчанию для электрики. */
export function defaultElecHeight(kind: ElecKind): number {
  return kind === 'socket' ? SOCKET_STD_H_MM : SWITCH_STD_H_MM;
}

export function defaultElecPurpose(kind: ElecKind): string {
  return kind === 'socket' ? 'Розетка' : 'Свет';
}

export { catalogLabel };
