/**
 * Состояние выбора объектов в сцене. Чистые функции — та же логика
 * используется и в 3D-вьювере (клик → raycast → id), и в списках Этапа 3+.
 */

export type SelectionId = string | null;

/** Клик по объекту выбирает его; клик по пустому месту снимает выбор. */
export function selectEntity(id: SelectionId): SelectionId {
  return id;
}

/** Тоггл для списков: повторный клик по выбранному снимает выбор. */
export function toggleEntity(current: SelectionId, id: string): SelectionId {
  return current === id ? null : id;
}

export function clearSelection(): SelectionId {
  return null;
}
