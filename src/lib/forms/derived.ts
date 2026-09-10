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

export type DerivedPath =
  readonly ['general', 'doorsCount'] | readonly ['lighting', 'groups'];

export interface DerivedTarget {
  readonly path: DerivedPath;
  readonly value: number;
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
  for (const t of deriveTargets(view.general)) syncDerivedTarget(form, t);
}

/**
 * Синхронизация одной цели. Ветвление по первому сегменту сужает юнион
 * путей до конкретного литерала: методы formisch не принимают юнион
 * (условный тип в config схлопывается до одного члена и остальные
 * перестают проверяться), поэтому общий вызов для юниона невозможен.
 */
function syncDerivedTarget(form: ProjectForm, t: DerivedTarget): void {
  if (t.path[0] === 'general') {
    if (isEdited(form, { path: t.path })) return;
    if (getInput(form, { path: t.path }) === t.value) return;
    setInput(form, { path: t.path, input: t.value });
    reset(form, { path: t.path, keepInput: true });
  } else {
    if (isEdited(form, { path: t.path })) return;
    if (getInput(form, { path: t.path }) === t.value) return;
    setInput(form, { path: t.path, input: t.value });
    reset(form, { path: t.path, keepInput: true });
  }
}

export type ProcurementSection = 'lighting' | 'sensors';

/**
 * Кнопка «Пересчитать количества»: проставляет формулы во все поля
 * раздела. Все поля обязательные, пустых не бывает — поэтому это именно
 * пересчёт, а не заполнение пробелов. Введённое остаётся edited —
 * это явные данные, а не автоматика (reset здесь намеренно нет).
 * Вызовы выписаны явно: методы formisch принимают только конкретный
 * путь, юнион путей в цикле не проверяется (см. syncDerivedTarget).
 * @returns число полей раздела.
 */
export function fillProcurementBlanks(
  form: ProjectForm,
  view: Project,
  section: ProcurementSection
): number {
  if (section === 'lighting') {
    setInput(form, {
      path: ['lighting', 'passThroughQty'],
      input: suggestPassThroughQty(view),
    });
    setInput(form, {
      path: ['lighting', 'dimmerQty'],
      input: suggestDimmerQty(view),
    });
    setInput(form, {
      path: ['lighting', 'ledKitchenQty'],
      input: suggestLedKitchenQty(),
    });
    setInput(form, {
      path: ['lighting', 'ledMirrorQty'],
      input: suggestLedMirrorQty(view),
    });
    setInput(form, {
      path: ['lighting', 'ledDecorQty'],
      input: suggestLedDecorQty(),
    });
    return 5;
  }
  setInput(form, { path: ['sensors', 'leakQty'], input: suggestLeakQty(view) });
  setInput(form, { path: ['sensors', 'valveQty'], input: suggestValveQty() });
  setInput(form, {
    path: ['sensors', 'smokeQty'],
    input: suggestSmokeQty(view),
  });
  setInput(form, {
    path: ['sensors', 'motionQty'],
    input: suggestMotionQty(view),
  });
  setInput(form, {
    path: ['sensors', 'curtainQty'],
    input: suggestCurtainQty(view),
  });
  return 5;
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
  setInput(form, { path: ['lowVoltage', 'tvOutlets'], input: tv });
  setInput(form, { path: ['lowVoltage', 'wifiAP'], input: wifi });
  setInput(form, {
    path: ['lowVoltage', 'ethernetPoints'],
    input: deriveEthernetPoints(tv, wifi),
  });
  return 3;
}
