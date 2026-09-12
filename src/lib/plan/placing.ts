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
import { rotatedRect } from './polygon';
import { catalogLabel, findCatalogEntry, validateDims } from './catalog';
import {
  floorAngleRad,
  floorCenterMm,
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
  /**
   * Точка попадания в стену, мм плана (сырая). Для привязок вдоль стены
   * берём ЕЁ, а не проекцию на пол: иначе параллакс высоких стен уводит
   * центр на метры от курсора. Нет стены — фолбэк на plan.
   */
  wallPoint?: Vec2;
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

/** Координата вдоль стены для привязки: точка стены точнее проекции на пол. */
function alongOf(wall: Wall, hit: PlaceHit): number {
  return projectAlong(wall, hit.wallPoint ?? hit.plan);
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
      alongMm: snapMm(alongOf(wall, hit)),
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
  return { wall, alongMm: snapMm(alongOf(wall, hit)) };
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
  const along = alongOf(wall, hit);
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
    const alongMm = snapMm(alongOf(wall, hit));
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
      alongMm: snapMm(alongOf(wall, hit)),
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
      alongMm: snapMm(alongOf(wall, hit)),
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
      offsetMm: snapMm(alongOf(wall, hit) - op.widthMm / 2),
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

/**
 * Край гизмо ресайза: start/end — торцы вдоль стены (проёмы, навесные,
 * ширина напольных у стены), e/w/n/s — стороны бокса в локальных осях.
 */
export type ResizeEdge = 'start' | 'end' | 'e' | 'w' | 'n' | 's';

/** Минимальный габарит при ресайзе мышью (точные лимиты — валидаторы). */
const MIN_RESIZE_MM = 100;

/** Локальный кадр бокса: uw — ось ширины, vw — ось глубины (единичные). */
function boxFrame(angleRad: number): { uw: Vec2; vw: Vec2 } {
  return {
    uw: { x: Math.cos(angleRad), y: Math.sin(angleRad) },
    vw: { x: Math.sin(angleRad), y: -Math.cos(angleRad) },
  };
}

/**
 * Чистая геометрия ресайза бокса с фиксацией противоположного края.
 * Та же функция двигает гост вьювера и считает операцию — превью не врёт.
 */
export function boxResizeGeom(
  box: { center: Vec2; angleRad: number; wMm: number; dMm: number },
  at: Vec2,
  edge: 'e' | 'w' | 'n' | 's'
): { center: Vec2; wMm: number; dMm: number } {
  const { uw, vw } = boxFrame(box.angleRad);
  const rel = { x: at.x - box.center.x, y: at.y - box.center.y };
  const u = rel.x * uw.x + rel.y * uw.y;
  const v = rel.x * vw.x + rel.y * vw.y;
  let minU = -box.wMm / 2;
  let maxU = box.wMm / 2;
  let minV = -box.dMm / 2;
  let maxV = box.dMm / 2;
  if (edge === 'e') maxU = Math.max(minU + MIN_RESIZE_MM, snapMm(u));
  else if (edge === 'w') minU = Math.min(maxU - MIN_RESIZE_MM, snapMm(u));
  else if (edge === 'n') maxV = Math.max(minV + MIN_RESIZE_MM, snapMm(v));
  else minV = Math.min(maxV - MIN_RESIZE_MM, snapMm(v));
  const wMm = maxU - minU;
  const dMm = maxV - minV;
  const cu = (minU + maxU) / 2;
  const cv = (minV + maxV) / 2;
  return {
    center: {
      x: box.center.x + uw.x * cu + vw.x * cv,
      y: box.center.y + uw.y * cu + vw.y * cv,
    },
    wMm,
    dMm,
  };
}

/**
 * Чистая геометрия ресайза отрезка вдоль оси (проём, ширина навесного):
 * alongMm — сырая координата курсора от начала отрезка.
 */
export function spanResizeGeom(
  offsetMm: number,
  widthMm: number,
  alongMm: number,
  edge: 'start' | 'end'
): { offsetMm: number; widthMm: number } {
  const a = snapMm(alongMm);
  if (edge === 'end') {
    return { offsetMm, widthMm: Math.max(MIN_RESIZE_MM, a - offsetMm) };
  }
  const end = offsetMm + widthMm;
  const start = Math.min(a, end - MIN_RESIZE_MM);
  return { offsetMm: start, widthMm: end - start };
}

/**
 * Ресайз объекта гизмо: at — сырая точка плана под курсором, edge —
 * тянущийся край. Якорь сохраняет тип; противоположный край зафиксирован.
 * Точные лимиты (каталог, простенки, наложения) проверяют валидаторы.
 */
export function resizeObject(
  state: ApartmentState,
  id: string,
  at: Vec2,
  edge: ResizeEdge
): PlaceResult {
  const op = state.openings?.[id];
  if (op) {
    if (edge !== 'start' && edge !== 'end') {
      return fail(`Проём "${id}": тяните за торец вдоль стены.`);
    }
    const wall = state.walls[op.wallId];
    if (!wall) return fail(`Стена "${op.wallId}" не найдена.`);
    const g = spanResizeGeom(
      op.offsetMm,
      op.widthMm,
      projectAlong(wall, at),
      edge
    );
    const draft = { ...op, offsetMm: g.offsetMm, widthMm: g.widthMm };
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
      op: {
        type: 'updateOpening',
        openingId: id,
        offsetMm: g.offsetMm,
        widthMm: g.widthMm,
      },
    };
  }

  const fo = state.floorObjects?.[id];
  if (fo) {
    const a = fo.anchor;
    if (a.type === 'corner') {
      return fail('Угловой якорь меняется только числами в панели.');
    }
    if (a.type === 'wall') {
      // У стены ширина идёт строго вдоль неё: боковой разворот и глубина
      // гизмо не тянет (глубина — числами в панели).
      if (a.rotationDeg === 90 || a.rotationDeg === 270) {
        return fail('Боковой разворот у стены: размеры — числами в панели.');
      }
      if (edge !== 'w' && edge !== 'e') {
        return fail(`Объект "${id}": у стены тяните за боковые стороны.`);
      }
    } else if (edge !== 'e' && edge !== 'w' && edge !== 'n' && edge !== 's') {
      return fail(`Объект "${id}": тяните за сторону бокса.`);
    }
    const center = floorCenterMm(state, fo);
    if (!center) return fail(`Центр объекта "${id}" не выводится.`);
    const angle = floorAngleRad(state, fo);
    // К этой точке edge уже проверен под тип якоря выше.
    const g = boxResizeGeom(
      { center, angleRad: angle, wMm: fo.wMm, dMm: fo.dMm },
      at,
      edge as 'e' | 'w' | 'n' | 's'
    );
    const dims = validateDims(fo.kind, g.wMm, g.dMm, fo.hMm);
    if (dims) return fail(dims);
    if (a.type === 'room') {
      const room = state.rooms[a.roomId];
      if (!room) return fail(`Помещение "${a.roomId}" не найдено.`);
      const anchor = {
        ...a,
        xMm: snapMm(g.center.x),
        yMm: snapMm(g.center.y),
      };
      if (
        !rotatedRect(g.center, g.wMm, g.dMm, angle).every((p) =>
          pointInPolygon(p, room.outline)
        )
      ) {
        return fail('Вне помещения — гизмо вышло из комнаты.');
      }
      const anchorErr = validateFloorAnchor(state, anchor, g.wMm);
      if (anchorErr) return fail(anchorErr);
      return {
        ok: true,
        id,
        op: {
          type: 'updateFloorObject',
          objectId: id,
          anchor,
          wMm: g.wMm,
          dMm: g.dMm,
        },
      };
    }
    // Якорь у стены, ширина строго вдоль неё: пересчёт along/fromWall
    // из нового центра точен (центр едет только вдоль стены).
    const wall = state.walls[a.wallId];
    if (!wall) return fail(`Стена "${a.wallId}" не найдена.`);
    const alongMm = snapMm(projectAlong(wall, g.center));
    const depth = depthFromWall(state, wall, g.center);
    const fromWallMm =
      depth === null ? a.fromWallMm : snapMm(Math.max(0, depth - g.dMm / 2));
    const anchor = { ...a, alongMm, fromWallMm };
    const anchorErr = validateFloorAnchor(state, anchor, g.wMm);
    if (anchorErr) return fail(anchorErr);
    return {
      ok: true,
      id,
      op: {
        type: 'updateFloorObject',
        objectId: id,
        anchor,
        wMm: g.wMm,
        dMm: g.dMm,
      },
    };
  }

  const wo = state.wallObjects?.[id];
  if (wo) {
    if (edge !== 'start' && edge !== 'end') {
      return fail(`Объект "${id}": тяните за торец вдоль стены.`);
    }
    const wall = state.walls[wo.anchor.wallId];
    if (!wall) return fail(`Стена "${wo.anchor.wallId}" не найдена.`);
    const g = spanResizeGeom(
      wo.anchor.alongMm - wo.wMm / 2,
      wo.wMm,
      projectAlong(wall, at),
      edge
    );
    const anchor = {
      ...wo.anchor,
      alongMm: snapMm(g.offsetMm + g.widthMm / 2),
    };
    const dims = validateDims(wo.kind, g.widthMm, wo.depthMm, wo.hMm);
    if (dims) return fail(dims);
    const err = validateWallAnchor(state.walls, anchor, g.widthMm);
    if (err) return fail(err);
    return {
      ok: true,
      id,
      op: { type: 'updateWallObject', objectId: id, anchor, wMm: g.widthMm },
    };
  }

  return fail(`Объект "${id}" не найден или не меняет размеры мышью.`);
}

/** Высота установки по умолчанию для электрики. */
export function defaultElecHeight(kind: ElecKind): number {
  return kind === 'socket' ? SOCKET_STD_H_MM : SWITCH_STD_H_MM;
}

export function defaultElecPurpose(kind: ElecKind): string {
  return kind === 'socket' ? 'Розетка' : 'Свет';
}

export { catalogLabel };
