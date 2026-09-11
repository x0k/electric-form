/**
 * Автопредложения электрики и света (Этап 10 ТЗ).
 *
 * Детерминированные эвристики поверх готового состояния:
 * - выключатель у каждой двери (+150 мм от края проёма, 900 мм);
 * - розетка для каждого бытового потребителя (вдоль ближайшей стены
 *   на его along, 300 мм; для кухни — 1100 мм над столешницей);
 * - дежурные розетки по длинным стенам (шаг ~3 м, отступ 300 мм от углов);
 * - свет: один потолочный светильник в центр каждого помещения
 *   + точечные при площади > 15 м².
 *
 * Функции чистые: вход — состояние, выход — черновые предложения
 * (без применения). Id детерминированы (`auto-…`), чтобы повторный
 * прогон давал тот же набор — это и проверяется тестами.
 * Проёмы учитываются: предложения ближе 100 мм к проёму пропускаются.
 */

import { polygonAreaMm2, wallLengthMm, type Vec2 } from './geometry';
import { openingInterval } from './openings';
import { ELEC_CLEAR_MM } from './conflicts';
import { SWITCH_STD_H_MM, SOCKET_STD_H_MM, type ElecDraft } from './electrics';
import type { LuminaireDraft } from './lighting';
import type { ApartmentState } from './model';

export interface ElecSuggestions {
  switches: ElecDraft[];
  sockets: ElecDraft[];
}

const APPLIANCE_KINDS = new Set([
  'stove',
  'fridge',
  'washer',
  'kitchenBase',
  'tvStand',
]);

/** Выключатели у дверей + розетки под технику и по стенам. */
export function suggestElec(state: ApartmentState): ElecSuggestions {
  const switches: ElecDraft[] = [];
  const sockets: ElecDraft[] = [];
  const taken = new Set(Object.keys(state.elecPoints ?? {}));

  const freeId = (base: string): string => {
    let id = base;
    let n = 2;
    while (taken.has(id)) {
      id = `${base}-${n}`;
      n += 1;
    }
    taken.add(id);
    return id;
  };

  // 1. Выключатель у каждой двери.
  for (const o of Object.values(state.openings ?? {})) {
    if (o.kind !== 'door') continue;
    const wall = state.walls[o.wallId];
    if (!wall) continue;
    const len = wallLengthMm(wall.a, wall.b);
    const { to } = openingInterval(o);
    const along = to + 150;
    if (along > len - ELEC_CLEAR_MM) continue;
    if (alongOverlapsOpening(state, o.wallId, along, o.id)) continue;
    switches.push({
      id: freeId(`auto-sw-${o.id}`),
      kind: 'switch',
      wallId: o.wallId,
      alongMm: round10(along),
      heightMm: SWITCH_STD_H_MM,
      purpose: `Свет у двери ${o.id}`,
      groupId: null,
    });
  }

  // 2. Розетки под технику: along = проекция центра объекта на стену.
  for (const fo of Object.values(state.floorObjects ?? {})) {
    if (!APPLIANCE_KINDS.has(fo.kind)) continue;
    const wallId = nearestWallId(state, fo.id);
    if (!wallId) continue;
    const wall = state.walls[wallId];
    if (!wall) continue;
    const along = projectAlong(state, wallId, fo.id);
    if (along === null) continue;
    const len = wallLengthMm(wall.a, wall.b);
    if (along < ELEC_CLEAR_MM || len - along < ELEC_CLEAR_MM) continue;
    if (alongOverlapsOpening(state, wallId, along, null)) continue;
    const kitchen = fo.kind === 'kitchenBase' || fo.kind === 'stove';
    sockets.push({
      id: freeId(`auto-sk-${fo.id}`),
      kind: 'socket',
      wallId,
      alongMm: round10(along),
      heightMm: kitchen ? 1100 : SOCKET_STD_H_MM,
      purpose: fo.label,
      groupId: null,
    });
  }

  // 3. Дежурные розетки: по стенам комнат длиннее 2 м, шаг ~3 м.
  for (const room of Object.values(state.rooms)) {
    for (const wallId of room.wallIds) {
      const wall = state.walls[wallId];
      if (!wall) continue;
      const len = wallLengthMm(wall.a, wall.b);
      if (len < 2000) continue;
      const count = Math.max(1, Math.floor(len / 3000));
      for (let i = 0; i < count; i++) {
        const along =
          300 +
          (i * (len - 600)) / Math.max(count, 1) +
          (count === 1 ? (len - 600) / 2 - 300 : 0);
        const a = round10(along);
        if (a < ELEC_CLEAR_MM || len - a < ELEC_CLEAR_MM) continue;
        if (alongOverlapsOpening(state, wallId, a, null)) continue;
        if (nearExisting(state, sockets, wallId, a, 500)) continue;
        sockets.push({
          id: freeId(`auto-sk-${wallId}-${i + 1}`),
          kind: 'socket',
          wallId,
          alongMm: a,
          heightMm: SOCKET_STD_H_MM,
          purpose: `Дежурная ${room.name}`,
          groupId: null,
        });
      }
    }
  }

  return { switches, sockets };
}

/** Свет по помещениям: центр + точечные при большой площади. */
export function suggestLights(state: ApartmentState): LuminaireDraft[] {
  const out: LuminaireDraft[] = [];
  const taken = new Set(Object.keys(state.luminaires ?? {}));
  for (const room of Object.values(state.rooms)) {
    if (room.outline.length < 3) continue;
    const c = centroid(room.outline);
    const id = `auto-lt-${room.id}`;
    if (!taken.has(id)) {
      out.push({
        id,
        kind: 'ceilingLamp',
        roomId: room.id,
        xMm: round10(c.x),
        yMm: round10(c.y),
        groupId: null,
      });
      taken.add(id);
    }
    const areaM2 = polygonAreaMm2(room.outline) / 1_000_000;
    if (areaM2 > 15) {
      // Два спота по бокам от центра (±1 м, на сетке).
      for (const [dx, sfx] of [
        [-1000, 'a'],
        [1000, 'b'],
      ] as const) {
        const sid = `auto-spot-${room.id}-${sfx}`;
        if (taken.has(sid)) continue;
        out.push({
          id: sid,
          kind: 'spot',
          roomId: room.id,
          xMm: round10(c.x + dx),
          yMm: round10(c.y),
          groupId: null,
        });
        taken.add(sid);
      }
    }
  }
  return out;
}

function round10(v: number): number {
  return Math.round(v / 10) * 10;
}

function alongOverlapsOpening(
  state: ApartmentState,
  wallId: string,
  along: number,
  ignoreId: string | null
): boolean {
  for (const o of Object.values(state.openings ?? {})) {
    if (o.wallId !== wallId || o.id === ignoreId) continue;
    const { from, to } = openingInterval(o);
    if (along >= from - ELEC_CLEAR_MM && along <= to + ELEC_CLEAR_MM)
      return true;
  }
  return false;
}

function nearExisting(
  state: ApartmentState,
  drafts: ElecDraft[],
  wallId: string,
  along: number,
  radius: number
): boolean {
  for (const p of Object.values(state.elecPoints ?? {})) {
    if (p.wallId === wallId && Math.abs(p.alongMm - along) < radius)
      return true;
  }
  for (const d of drafts) {
    if (d.wallId === wallId && Math.abs(d.alongMm - along) < radius)
      return true;
  }
  return false;
}

/** Ближайшая стена помещения к объекту (по центру). */
function nearestWallId(state: ApartmentState, floorId: string): string | null {
  const fo = state.floorObjects[floorId];
  if (!fo) return null;
  // wall-якорь — сама стена; иначе ищем стену комнаты с min дистанцией.
  if (fo.anchor.type === 'wall') return fo.anchor.wallId;
  const roomId = fo.anchor.roomId;
  const room = state.rooms[roomId];
  if (!room) return null;
  const c =
    fo.anchor.type === 'room'
      ? { x: fo.anchor.xMm, y: fo.anchor.yMm }
      : { x: 0, y: 0 };
  let best: string | null = null;
  let bestD = Infinity;
  for (const wid of room.wallIds) {
    const w = state.walls[wid];
    if (!w) continue;
    const d = distPointSeg(c, w.a, w.b);
    if (d < bestD) {
      bestD = d;
      best = wid;
    }
  }
  return best;
}

function projectAlong(
  state: ApartmentState,
  wallId: string,
  floorId: string
): number | null {
  const fo = state.floorObjects[floorId];
  const wall = state.walls[wallId];
  if (!fo || !wall) return null;
  if (fo.anchor.type === 'wall' && fo.anchor.wallId === wallId)
    return fo.anchor.alongMm;
  if (fo.anchor.type !== 'room') return null;
  const len = wallLengthMm(wall.a, wall.b);
  if (len < 1e-9) return null;
  const dx = (wall.b.x - wall.a.x) / len;
  const dy = (wall.b.y - wall.a.y) / len;
  const rx = fo.anchor.xMm - wall.a.x;
  const ry = fo.anchor.yMm - wall.a.y;
  const along = rx * dx + ry * dy;
  return Math.min(Math.max(along, 0), len);
}

function distPointSeg(p: Vec2, a: Vec2, b: Vec2): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  if (len2 < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.min(
    1,
    Math.max(0, ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2)
  );
  return Math.hypot(p.x - (a.x + vx * t), p.y - (a.y + vy * t));
}

function centroid(outline: Vec2[]): Vec2 {
  let sx = 0;
  let sy = 0;
  for (const p of outline) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / outline.length, y: sy / outline.length };
}
