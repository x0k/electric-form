/**
 * Состояние планировки (Domain Model, Этапы 1, 5a–7).
 *
 * Чистые данные без UI и рендера. Все размеры — целые миллиметры,
 * координаты плана — кратные BASE_GRID_MM (сетка 1 см).
 *
 * Зависимости явные:
 * - Room.wallIds → Wall.id (стены, образующие помещение);
 * - Opening.wallId → Wall.id (проём вырезан в стене, Этап «Проёмы»);
 * - FloorObject.anchor → Wall.id | Room.id (параметрический якорь);
 * - WallObject.anchor.wallId → Wall.id (навесной объект);
 * - PlacedObject.hostId → Wall.id | Room.id | Slab.id (legacy-задел,
 *   оставлен для совместимости истории; новые этапы используют
 *   типизированные коллекции ниже).
 */

import type { Vec2 } from './geometry';
import type { Opening } from './openings';
import type { FloorAnchor, FloorObject, WallObject } from './furnish';
import type { ElecGroup, ElecPoint } from './electrics';
import type { LightGroup, Luminaire } from './lighting';

export type SlabKind = 'floor' | 'ceiling';

export interface Wall {
  id: string;
  /** Начало сегмента стены в плане, мм. */
  a: Vec2;
  /** Конец сегмента стены в плане, мм. */
  b: Vec2;
  thicknessMm: number;
  heightMm: number;
}

export interface Room {
  id: string;
  name: string;
  /** Контур помещения в плане (≥3 точек, без дублирующего замыкания). */
  outline: Vec2[];
  /** Стены, образующие помещение. Удаление такой стены — деструктивное. */
  wallIds: string[];
}

export interface Slab {
  id: string;
  kind: SlabKind;
  /** Уровень плиты (пол: обычно 0; потолок: обычно высота стен). */
  levelMm: number;
  thicknessMm: number;
  outline: Vec2[];
}

/**
 * Заглушка объекта будущих этапов (мебель, навесные, розетки, свет).
 * Уже на Этапе 1 хранит явную зависимость от хозяина — этого требует §6 ТЗ.
 */
export interface PlacedObject {
  id: string;
  /** Тип объекта следующих этапов: 'furniture' | 'door' | 'window' | ... */
  kind: string;
  label: string;
  hostId: string | null;
}

export interface ApartmentState {
  walls: Record<string, Wall>;
  rooms: Record<string, Room>;
  slabs: Record<string, Slab>;
  objects: Record<string, PlacedObject>;
  /** Проёмы дверей/окон — отдельный этап перед объектами. */
  openings: Record<string, Opening>;
  /** Напольные объекты с параметрическими якорями. */
  floorObjects: Record<string, FloorObject>;
  /** Навесные объекты с привязкой к стене. */
  wallObjects: Record<string, WallObject>;
  /** Электрика: группы и точки. */
  elecGroups: Record<string, ElecGroup>;
  elecPoints: Record<string, ElecPoint>;
  /** Освещение: группы и светильники. */
  lightGroups: Record<string, LightGroup>;
  luminaires: Record<string, Luminaire>;
}

export function createEmptyApartment(): ApartmentState {
  return {
    walls: {},
    rooms: {},
    slabs: {},
    objects: {},
    openings: {},
    floorObjects: {},
    wallObjects: {},
    elecGroups: {},
    elecPoints: {},
    lightGroups: {},
    luminaires: {},
  };
}

export function wallIds(state: ApartmentState): string[] {
  return Object.keys(state.walls).sort();
}

export function roomIds(state: ApartmentState): string[] {
  return Object.keys(state.rooms).sort();
}

/** Глубокая копия состояния (история хранит только immutable-снапшоты). */
export function cloneState(state: ApartmentState): ApartmentState {
  return {
    walls: Object.fromEntries(
      Object.entries(state.walls).map(([id, w]) => [
        id,
        { ...w, a: { ...w.a }, b: { ...w.b } },
      ])
    ),
    rooms: Object.fromEntries(
      Object.entries(state.rooms).map(([id, r]) => [
        id,
        {
          ...r,
          outline: r.outline.map((p) => ({ ...p })),
          wallIds: [...r.wallIds],
        },
      ])
    ),
    slabs: Object.fromEntries(
      Object.entries(state.slabs).map(([id, s]) => [
        id,
        { ...s, outline: s.outline.map((p) => ({ ...p })) },
      ])
    ),
    objects: Object.fromEntries(
      Object.entries(state.objects).map(([id, o]) => [id, { ...o }])
    ),
    openings: Object.fromEntries(
      Object.entries(state.openings ?? {}).map(([id, o]) => [id, { ...o }])
    ),
    floorObjects: Object.fromEntries(
      Object.entries(state.floorObjects ?? {}).map(([id, o]) => [
        id,
        { ...o, anchor: { ...o.anchor } as FloorAnchor },
      ])
    ),
    wallObjects: Object.fromEntries(
      Object.entries(state.wallObjects ?? {}).map(([id, o]) => [
        id,
        { ...o, anchor: { ...o.anchor } },
      ])
    ),
    elecGroups: Object.fromEntries(
      Object.entries(state.elecGroups ?? {}).map(([id, o]) => [id, { ...o }])
    ),
    elecPoints: Object.fromEntries(
      Object.entries(state.elecPoints ?? {}).map(([id, o]) => [id, { ...o }])
    ),
    lightGroups: Object.fromEntries(
      Object.entries(state.lightGroups ?? {}).map(([id, o]) => [id, { ...o }])
    ),
    luminaires: Object.fromEntries(
      Object.entries(state.luminaires ?? {}).map(([id, o]) => [id, { ...o }])
    ),
  };
}

export interface DependentRef {
  kind:
    | 'room'
    | 'object'
    | 'opening'
    | 'floorObject'
    | 'wallObject'
    | 'elecPoint'
    | 'luminaire';
  id: string;
  label: string;
}

/**
 * Все объекты, явно зависящие от сущности с targetId.
 * Используется для предупреждения до Commit (§6 ТЗ):
 * «Стена удаляется. На ней закреплены N объектов. Продолжить?»
 */
export function findDependents(
  state: ApartmentState,
  targetId: string
): DependentRef[] {
  const out: DependentRef[] = [];
  for (const room of Object.values(state.rooms)) {
    if (room.wallIds.includes(targetId)) {
      out.push({ kind: 'room', id: room.id, label: room.name });
    }
  }
  for (const obj of Object.values(state.objects)) {
    if (obj.hostId === targetId) {
      out.push({ kind: 'object', id: obj.id, label: obj.label });
    }
  }
  for (const o of Object.values(state.openings ?? {})) {
    if (o.wallId === targetId) {
      out.push({
        kind: 'opening',
        id: o.id,
        label: `${o.kind === 'door' ? 'Дверь' : 'Окно'} ${o.id}`,
      });
    }
  }
  for (const o of Object.values(state.floorObjects ?? {})) {
    const a = o.anchor;
    const hits =
      (a.type === 'wall' && a.wallId === targetId) ||
      ((a.type === 'room' || a.type === 'corner') && a.roomId === targetId);
    if (hits) out.push({ kind: 'floorObject', id: o.id, label: o.label });
  }
  for (const o of Object.values(state.wallObjects ?? {})) {
    if (o.anchor.wallId === targetId) {
      out.push({ kind: 'wallObject', id: o.id, label: o.label });
    }
  }
  for (const p of Object.values(state.elecPoints ?? {})) {
    if (p.wallId === targetId) {
      out.push({
        kind: 'elecPoint',
        id: p.id,
        label: `${p.kind === 'socket' ? 'Розетка' : 'Выключатель'} ${p.id}`,
      });
    }
    if (p.groupId === targetId) {
      out.push({ kind: 'elecPoint', id: p.id, label: `Точка группы ${p.id}` });
    }
  }
  for (const g of Object.values(state.elecGroups ?? {})) {
    if (g.id === targetId) continue;
  }
  for (const l of Object.values(state.luminaires ?? {})) {
    if (l.roomId === targetId) {
      out.push({ kind: 'luminaire', id: l.id, label: `Светильник ${l.id}` });
    }
  }
  return out;
}

/** Существует ли сущность с таким id (стена, помещение, плита, объект). */
export function hostExists(state: ApartmentState, id: string): boolean {
  return (
    id in state.walls ||
    id in state.rooms ||
    id in state.slabs ||
    id in state.objects ||
    id in (state.openings ?? {}) ||
    id in (state.floorObjects ?? {}) ||
    id in (state.wallObjects ?? {}) ||
    id in (state.elecGroups ?? {}) ||
    id in (state.elecPoints ?? {}) ||
    id in (state.lightGroups ?? {}) ||
    id in (state.luminaires ?? {})
  );
}
