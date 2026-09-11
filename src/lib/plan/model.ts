/**
 * Состояние планировки (Domain Model, Этап 1).
 *
 * Чистые данные без UI и рендера. Все размеры — целые миллиметры,
 * координаты плана — кратные GRID_MM (сетка 1 см).
 *
 * Зависимости явные:
 * - Room.wallIds → Wall.id (стены, образующие помещение);
 * - PlacedObject.hostId → Wall.id | Room.id | Slab.id (задел под этапы 2–5).
 */

import type { Vec2 } from './geometry';

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
}

export function createEmptyApartment(): ApartmentState {
  return { walls: {}, rooms: {}, slabs: {}, objects: {} };
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
  };
}

export interface DependentRef {
  kind: 'room' | 'object';
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
  return out;
}

/** Существует ли сущность с таким id (стена, помещение, плита, объект). */
export function hostExists(state: ApartmentState, id: string): boolean {
  return (
    id in state.walls ||
    id in state.rooms ||
    id in state.slabs ||
    id in state.objects
  );
}
