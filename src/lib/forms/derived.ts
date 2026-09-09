import { getInput, isEdited, reset, setInput } from '@formisch/svelte';
import type { ProjectForm } from '#lib/forms/ctx';
import type { General, Project } from '#lib/project/types';

/** Источники производных: всё, от чего зависят формулы ниже. */
export function deriveKey(g: General): string {
  return JSON.stringify([g.rooms, g.kitchenPresent, g.bathrooms, g.areaM2]);
}

/** Групп освещения: комнаты + кухня + коридор. */
export function deriveLightingGroups(g: General): number {
  return g.rooms + (g.kitchenPresent ? 1 : 0) + 1;
}

/** Дверей: межкомнатные + санузлы + входная. */
export function deriveDoorsCount(g: General): number {
  return g.rooms + g.bathrooms + 1;
}

/** ТВ-розеток: по одной на комнату, минимум одна. */
export function deriveTvOutlets(g: General): number {
  return Math.max(g.rooms, 1);
}

/** Wi-Fi точек: одна на ~70 м². */
export function deriveWifiAP(g: General): number {
  return Math.max(1, Math.ceil(g.areaM2 / 70));
}

/** Ethernet: под каждое ТВ и Wi-Fi плюс одно рабочее место. */
export function deriveEthernetPoints(
  tvOutlets: number,
  wifiAP: number
): number {
  return tvOutlets + wifiAP + 1;
}

export interface DerivedTarget {
  path: readonly (string | number)[];
  value: number;
}

/** Цели в порядке зависимостей: ethernet считается от свежих tv/wifi. */
export function deriveTargets(g: General): DerivedTarget[] {
  const tv = deriveTvOutlets(g);
  const wifi = deriveWifiAP(g);
  return [
    { path: ['general', 'doorsCount'], value: deriveDoorsCount(g) },
    { path: ['lighting', 'groups'], value: deriveLightingGroups(g) },
    { path: ['lowVoltage', 'tvOutlets'], value: tv },
    { path: ['lowVoltage', 'wifiAP'], value: wifi },
    {
      path: ['lowVoltage', 'ethernetPoints'],
      value: deriveEthernetPoints(tv, wifi),
    },
  ];
}

/**
 * Применяет производные значения к нетронутым полям.
 * Тронутые пользователем поля не перезаписывает. После программной
 * записи снимает edited через per-field reset с keepInput, чтобы поле
 * осталось «автоматическим» и продолжало синхронизироваться.
 */
export function applyDerivedFields(form: ProjectForm, view: Project): void {
  for (const t of deriveTargets(view.general)) {
    const path = t.path as any;
    if (isEdited(form, { path })) continue;
    const cur = getInput(form, { path }) as number | undefined;
    if (cur !== t.value) {
      setInput(form, { path, input: t.value as never });
      reset(form, { path, keepInput: true });
    }
  }
}
