/**
 * Освещение (Этап 11 ТЗ): светильники, LED-ленты, группы и связь
 * с выключателями.
 *
 * Светильник привязан к помещению (roomId) + точке плана (x/y) —
 * физический смысл: точка на потолке. Группа света (groupId) связывается
 * с выключателем/группой выключателей по id группы электрики
 * (switchGroupId): «для каждого светильника указывается выключатель».
 */

import { BASE_GRID_MM, pointInPolygon } from './geometry';
import type { Room } from './model';

export type LightKind = 'ceilingLamp' | 'spot' | 'ledStrip' | 'wallLamp';

export interface LightGroup {
  id: string;
  label: string;
}

export interface Luminaire {
  id: string;
  kind: LightKind;
  roomId: string;
  xMm: number;
  yMm: number;
  /** Группа света; связь с выключателем — через совпадающий groupId электрики. */
  groupId: string | null;
}

export function lightKindLabel(kind: LightKind): string {
  switch (kind) {
    case 'ceilingLamp':
      return 'Потолочный светильник';
    case 'spot':
      return 'Точечный светильник';
    case 'ledStrip':
      return 'LED-лента';
    case 'wallLamp':
      return 'Бра';
  }
}

export interface LuminaireDraft {
  id: string;
  kind: LightKind;
  roomId: string;
  xMm: number;
  yMm: number;
  groupId: string | null;
}

const KNOWN: LightKind[] = ['ceilingLamp', 'spot', 'ledStrip', 'wallLamp'];

/** Проверка светильника. null — валидно. */
export function validateLuminaire(
  rooms: Record<string, Room>,
  groups: Record<string, LightGroup>,
  draft: LuminaireDraft
): string | null {
  const room = rooms[draft.roomId];
  if (!room) return `Помещение "${draft.roomId}" не найдено.`;
  if (!draft.id) return 'Пустой id светильника запрещён.';
  if (!KNOWN.includes(draft.kind))
    return `Неизвестный тип света "${draft.kind}".`;
  for (const [v, n] of [
    [draft.xMm, 'x'],
    [draft.yMm, 'y'],
  ] as const) {
    if (!Number.isInteger(v))
      return `Светильник "${draft.id}": ${n} — целые мм.`;
    if (v % BASE_GRID_MM !== 0)
      return `Светильник "${draft.id}": ${n}=${v} не кратен 1 см.`;
  }
  if (
    room.outline.length >= 3 &&
    !pointInPolygon({ x: draft.xMm, y: draft.yMm }, room.outline)
  ) {
    return `Светильник "${draft.id}": точка вне помещения "${room.name}".`;
  }
  if (draft.groupId !== null && !groups[draft.groupId]) {
    return `Светильник "${draft.id}": группа "${draft.groupId}" не найдена.`;
  }
  return null;
}
