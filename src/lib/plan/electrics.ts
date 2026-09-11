/**
 * Электрика (Этап 9 ТЗ): розетки и выключатели.
 *
 * Как и проёмы/мебель — параметрически на стене:
 * wallId + alongMm (центр вдоль стены) + heightMm (от пола).
 * Назначение (purpose) и группа (groupId) обязательны по ТЗ §4:
 * «для каждого элемента задаётся назначение», «поддержка групп».
 *
 * Стандарты по умолчанию (меняются правилами autoplace, не доменом):
 * - розетка: 300 мм от пола;
 * - выключатель: 900 мм;
 * - отступ от угла/проёма при автопредложении: ≥100 мм (проверка
 *   конфликтов — в conflicts.ts, домен принимает любые along на стене).
 */

import { BASE_GRID_MM, wallLengthMm } from './geometry';
import type { Wall } from './model';

export type ElecKind = 'socket' | 'switch';

export interface ElecGroup {
  id: string;
  label: string;
}

export interface ElecPoint {
  id: string;
  kind: ElecKind;
  /** Стена-носитель — явная зависимость. */
  wallId: string;
  alongMm: number;
  heightMm: number;
  /** Назначение: «ТВ», «кухня», «свет гостиной»… */
  purpose: string;
  /** Группа розеток/выключателей (может быть null = без группы). */
  groupId: string | null;
}

/** Стандартные высоты установки, мм. */
export const SOCKET_STD_H_MM = 300;
export const SWITCH_STD_H_MM = 900;
/** Допустимый диапазон высот (домен принимает шире стандартов). */
export const ELEC_H_MIN_MM = 100;
export const ELEC_H_MAX_MM = 2000;

export function elecKindLabel(kind: ElecKind): string {
  return kind === 'socket' ? 'Розетка' : 'Выключатель';
}

export interface ElecDraft {
  id: string;
  kind: ElecKind;
  wallId: string;
  alongMm: number;
  heightMm: number;
  purpose: string;
  groupId: string | null;
}

/** Проверка точки против стен и групп. null — валидно. */
export function validateElec(
  walls: Record<string, Wall>,
  groups: Record<string, ElecGroup>,
  draft: ElecDraft
): string | null {
  const wall = walls[draft.wallId];
  if (!wall) return `Стена "${draft.wallId}" не найдена.`;
  if (!draft.id) return 'Пустой id электроточки запрещён.';
  for (const [v, n] of [
    [draft.alongMm, 'along'],
    [draft.heightMm, 'height'],
  ] as const) {
    if (!Number.isInteger(v)) return `${label(draft)}: ${n} — целые мм.`;
    if (v % BASE_GRID_MM !== 0)
      return `${label(draft)}: ${n}=${v} не кратен 1 см.`;
  }
  const len = wallLengthMm(wall.a, wall.b);
  if (draft.alongMm < 0 || draft.alongMm > len) {
    return `${label(draft)}: along вне стены (длина ${Math.round(len)} мм).`;
  }
  if (draft.heightMm < ELEC_H_MIN_MM || draft.heightMm > ELEC_H_MAX_MM) {
    return `${label(draft)}: высота ${ELEC_H_MIN_MM}..${ELEC_H_MAX_MM} мм.`;
  }
  if (!draft.purpose.trim()) return `${label(draft)}: укажите назначение.`;
  if (draft.groupId !== null && !groups[draft.groupId]) {
    return `${label(draft)}: группа "${draft.groupId}" не найдена.`;
  }
  return null;
}

function label(d: Pick<ElecDraft, 'id' | 'kind'>): string {
  return `${elecKindLabel(d.kind)} "${d.id}"`;
}
