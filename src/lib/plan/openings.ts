/**
 * Проёмы (двери и окна) — отдельный этап перед расстановкой объектов (§3 ТЗ
 * с поправкой: двери/окна выносятся из мебели в свою Feature).
 *
 * Ключевое решение: проём хранится ПАРАМЕТРИЧЕСКИ относительно стены,
 * а не абсолютными координатами:
 * - wallId — несущая стена (явная зависимость §6);
 * - offsetMm — расстояние от начала стены (a) до ближнего края проёма;
 * - widthMm — ширина проёма вдоль стены.
 *
 * При изменении геометрии стены (updateWall) проём автоматически следует
 * за ней — пересчитывается только производная точка центра, параметры
 * offset/width не меняются. Проверка вместимости идёт по актуальной длине.
 *
 * Все размеры — целые мм, кратные сетке 1 см (BASE_GRID_MM).
 */

import { BASE_GRID_MM, wallLengthMm, type Vec2 } from './geometry';
import type { Wall } from './model';

export type OpeningKind = 'door' | 'window';

export interface Opening {
  id: string;
  kind: OpeningKind;
  /** Несущая стена — явная зависимость. */
  wallId: string;
  /** От начала стены a до ближнего края проёма, мм. */
  offsetMm: number;
  /** Ширина проёма вдоль стены, мм. */
  widthMm: number;
  /** Высота проёма, мм. */
  heightMm: number;
  /** Высота подоконника от пола, мм. У двери всегда 0. */
  sillMm: number;
}

/** Минимальный простенок от торца стены и между проёмами, мм. */
export const MIN_PIER_MM = 100;

/** Допустимые габариты дверей, мм. */
export const DOOR_LIMITS = {
  widthMin: 600,
  widthMax: 1100,
  heightMin: 1900,
  heightMax: 2200,
} as const;

/** Допустимые габариты окон, мм. */
export const WINDOW_LIMITS = {
  widthMin: 600,
  widthMax: 2400,
  heightMin: 800,
  heightMax: 1800,
  sillMin: 500,
  sillMax: 1200,
} as const;

export function openingKindLabel(kind: OpeningKind): string {
  return kind === 'door' ? 'Дверь' : 'Окно';
}

/** Интервал проёма вдоль стены: [offset, offset + width]. */
export function openingInterval(o: Pick<Opening, 'offsetMm' | 'widthMm'>): {
  from: number;
  to: number;
} {
  return { from: o.offsetMm, to: o.offsetMm + o.widthMm };
}

/** Расстояние от начала стены до центра проёма. */
export function openingCenterAlong(
  o: Pick<Opening, 'offsetMm' | 'widthMm'>
): number {
  return o.offsetMm + o.widthMm / 2;
}

/**
 * Центр проёма в плане (производная величина — не хранится).
 * Лежит ровно на оси стены a→b.
 */
export function openingCenterMm(
  wall: Wall,
  o: Pick<Opening, 'offsetMm' | 'widthMm'>
): Vec2 {
  const len = wallLengthMm(wall.a, wall.b);
  if (len < 1e-9) return { ...wall.a };
  const along = openingCenterAlong(o);
  const t = along / len;
  return {
    x: wall.a.x + (wall.b.x - wall.a.x) * t,
    y: wall.a.y + (wall.b.y - wall.a.y) * t,
  };
}

/**
 * Концы проёма в плане (для рендера выреза и проверки наложений).
 * Возвращает пару точек на оси стены.
 */
export function openingEndsMm(
  wall: Wall,
  o: Pick<Opening, 'offsetMm' | 'widthMm'>
): { p0: Vec2; p1: Vec2 } {
  const len = wallLengthMm(wall.a, wall.b);
  if (len < 1e-9) return { p0: { ...wall.a }, p1: { ...wall.b } };
  const t0 = o.offsetMm / len;
  const t1 = (o.offsetMm + o.widthMm) / len;
  return {
    p0: {
      x: wall.a.x + (wall.b.x - wall.a.x) * t0,
      y: wall.a.y + (wall.b.y - wall.a.y) * t0,
    },
    p1: {
      x: wall.a.x + (wall.b.x - wall.a.x) * t1,
      y: wall.a.y + (wall.b.y - wall.a.y) * t1,
    },
  };
}

export interface OpeningDraft {
  id: string;
  kind: OpeningKind;
  wallId: string;
  offsetMm: number;
  widthMm: number;
  heightMm: number;
  sillMm: number;
}

/**
 * Проверка проёма против актуального состояния стен.
 * walls — словарь стен, others — остальные проёмы (для наложений).
 * ignoreId — сам проём при update (не сравнивать с собой).
 * Возвращает null при валидности, иначе человекочитаемую причину.
 */
export function validateOpening(
  walls: Record<string, Wall>,
  others: Record<string, Opening>,
  draft: OpeningDraft,
  ignoreId?: string
): string | null {
  const wall = walls[draft.wallId];
  if (!wall) return `Стена "${draft.wallId}" не найдена.`;
  if (!draft.id) return 'Пустой id проёма запрещён.';
  for (const key of ['offsetMm', 'widthMm', 'heightMm', 'sillMm'] as const) {
    const v = draft[key];
    if (!Number.isInteger(v)) return `${label(draft)}: ${key} — целые мм.`;
    if (v % BASE_GRID_MM !== 0)
      return `${label(draft)}: ${key}=${v} не кратен сетке 1 см.`;
  }
  if (draft.offsetMm < 0) return `${label(draft)}: offset отрицательный.`;
  const lim = draft.kind === 'door' ? DOOR_LIMITS : WINDOW_LIMITS;
  if (draft.widthMm < lim.widthMin || draft.widthMm > lim.widthMax) {
    return `${label(draft)}: ширина должна быть ${lim.widthMin}..${lim.widthMax} мм.`;
  }
  if (draft.heightMm < lim.heightMin || draft.heightMm > lim.heightMax) {
    return `${label(draft)}: высота должна быть ${lim.heightMin}..${lim.heightMax} мм.`;
  }
  if (draft.kind === 'door') {
    if (draft.sillMm !== 0) return `${label(draft)}: у двери sill всегда 0.`;
  } else {
    if (
      draft.sillMm < WINDOW_LIMITS.sillMin ||
      draft.sillMm > WINDOW_LIMITS.sillMax
    ) {
      return `${label(draft)}: подоконник должен быть ${WINDOW_LIMITS.sillMin}..${WINDOW_LIMITS.sillMax} мм.`;
    }
    if (draft.sillMm + draft.heightMm > wall.heightMm) {
      return `${label(draft)}: верх окна выше стены (${wall.heightMm} мм).`;
    }
  }
  if (draft.kind === 'door' && draft.heightMm > wall.heightMm) {
    return `${label(draft)}: дверь выше стены (${wall.heightMm} мм).`;
  }
  const wallLen = wallLengthMm(wall.a, wall.b);
  const end = draft.offsetMm + draft.widthMm;
  if (end - wallLen > 1e-9) {
    return `${label(draft)}: проём выходит за конец стены (длина ${Math.round(wallLen)} мм).`;
  }
  // Простенки от торцов.
  if (draft.offsetMm < MIN_PIER_MM || wallLen - end < MIN_PIER_MM) {
    return `${label(draft)}: простенок до торца меньше ${MIN_PIER_MM} мм.`;
  }
  // Наложения с соседями на той же стене.
  for (const other of Object.values(others)) {
    if (other.id === ignoreId || other.id === draft.id) continue;
    if (other.wallId !== draft.wallId) continue;
    const a0 = draft.offsetMm;
    const a1 = end;
    const b0 = other.offsetMm;
    const b1 = other.offsetMm + other.widthMm;
    const overlap = Math.min(a1, b1) - Math.max(a0, b0);
    if (overlap > -MIN_PIER_MM) {
      return `${label(draft)}: пересекается с проёмом "${other.id}" (нужен простенок ${MIN_PIER_MM} мм).`;
    }
  }
  return null;
}

function label(d: Pick<OpeningDraft, 'id' | 'kind'>): string {
  return `${openingKindLabel(d.kind)} "${d.id}"`;
}
