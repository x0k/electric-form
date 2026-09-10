import { getInput, isEdited, reset, setInput } from '@formisch/svelte';
import {
  suggestCurtainQty,
  suggestDimmerQty,
  suggestLeakQty,
  suggestLedDecorQty,
  suggestLedKitchenQty,
  suggestLedMirrorQty,
  suggestMotionQty,
  suggestPassThroughQty,
  suggestSmokeQty,
  suggestValveQty,
} from '#lib/calc/estimate';
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

/** Цели живой синхронизации: только структурные (двери, группы света).
 * Слаботочка больше не подставляется молча — только кнопкой «Заполнить
 * типовые», иначе дефолт клал бы деньги в смету без ведома пользователя. */
export function deriveTargets(g: General): DerivedTarget[] {
  return [
    { path: ['general', 'doorsCount'], value: deriveDoorsCount(g) },
    { path: ['lighting', 'groups'], value: deriveLightingGroups(g) },
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

export type ProcurementSection = 'lighting' | 'sensors';

interface ProcurementSuggestion {
  path: readonly [string, string];
  value: number;
}

/** Кандидаты кнопки «Заполнить»: формулы для пустых полей раздела. */
export function suggestProcurement(p: Project): ProcurementSuggestion[] {
  return [
    {
      path: ['lighting', 'passThroughQty'],
      value: suggestPassThroughQty(p),
    },
    {
      path: ['lighting', 'dimmerQty'],
      value: suggestDimmerQty(p),
    },
    {
      path: ['lighting', 'ledKitchenQty'],
      value: suggestLedKitchenQty(),
    },
    {
      path: ['lighting', 'ledMirrorQty'],
      value: suggestLedMirrorQty(p),
    },
    {
      path: ['lighting', 'ledDecorQty'],
      value: suggestLedDecorQty(),
    },
    {
      path: ['sensors', 'leakQty'],
      value: suggestLeakQty(p),
    },
    {
      path: ['sensors', 'valveQty'],
      value: suggestValveQty(),
    },
    {
      path: ['sensors', 'smokeQty'],
      value: suggestSmokeQty(p),
    },
    {
      path: ['sensors', 'motionQty'],
      value: suggestMotionQty(p),
    },
    {
      path: ['sensors', 'curtainQty'],
      value: suggestCurtainQty(p),
    },
  ];
}

/**
 * Кнопка «Пересчитать количества»: проставляет формулы во все поля
 * раздела. Все поля обязательные, пустых не бывает — поэтому это именно
 * пересчёт, а не заполнение пробелов. Введённое остаётся edited —
 * это явные данные, а не автоматика (reset здесь намеренно нет).
 * @returns число полей раздела.
 */
export function fillProcurementBlanks(
  form: ProjectForm,
  view: Project,
  section: ProcurementSection
): number {
  let filled = 0;
  for (const s of suggestProcurement(view)) {
    if (s.path[0] !== section) continue;
    const path = s.path as any;
    setInput(form, { path, input: s.value as never });
    filled += 1;
  }
  return filled;
}

/**
 * Кнопка «Заполнить типовые» для слаботочки: проставляет формулы
 * (ТВ/Wi-Fi от планировки, ethernet — от них) как явный ввод.
 * Введённое остаётся edited — это осознанные данные (reset намеренно нет).
 * @returns число полей (всегда 3).
 */
export function fillLowVoltageDefaults(
  form: ProjectForm,
  view: Project
): number {
  const tv = deriveTvOutlets(view.general);
  const wifi = deriveWifiAP(view.general);
  const targets = [
    { path: ['lowVoltage', 'tvOutlets'], value: tv },
    { path: ['lowVoltage', 'wifiAP'], value: wifi },
    {
      path: ['lowVoltage', 'ethernetPoints'],
      value: deriveEthernetPoints(tv, wifi),
    },
  ] as const;
  for (const t of targets) {
    setInput(form, { path: t.path as any, input: t.value as never });
  }
  return targets.length;
}
