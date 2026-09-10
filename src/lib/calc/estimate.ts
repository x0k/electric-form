import type { General, Project } from '#lib/project/types';
import { METHOD } from './method';

/** Типовая оценка розеток 220В без учёта ручного ввода (чистая формула). */
export function estimateSocketsAuto(g: General): number {
  return Math.round(
    g.rooms * METHOD.socketsPerRoom +
      (g.kitchenPresent ? METHOD.socketsKitchen : 0) +
      g.bathrooms * METHOD.socketsPerBathroom +
      METHOD.socketsBase
  );
}

/** Оценка количества розеток 220В: явное число, 0 = не надо. */
export function estimateSockets(p: Project): number {
  return p.general.socketsEstimate;
}

/**
 * Предлагаемые количества для кнопки «Заполнить» — чистые формулы,
 * сами никуда не подставляются. Правило: пустое поле = 0, число = фиксация.
 * Исключение — обычные выключатели: они структурные, по одному на группу.
 */
export function suggestPassThroughQty(p: Project): number {
  return Math.max(p.lighting.groups, 1);
}

export function suggestDimmerQty(p: Project): number {
  return Math.max(1, Math.ceil(p.lighting.groups / 3));
}

export function suggestLedKitchenQty(): number {
  return 1;
}

export function suggestLedMirrorQty(p: Project): number {
  return Math.max(p.general.bathrooms, 1);
}

export function suggestLedDecorQty(): number {
  return 1;
}

export function suggestLeakQty(p: Project): number {
  return Math.max(p.general.bathrooms + 1, 2);
}

export function suggestValveQty(): number {
  return 2;
}

export function suggestSmokeQty(p: Project): number {
  return Math.max(p.general.rooms, 1);
}

export function suggestMotionQty(p: Project): number {
  return Math.max(1, Math.ceil(p.general.rooms / 2));
}

export function suggestCurtainQty(p: Project): number {
  return Math.max(p.general.rooms, 1);
}

/** Точек освещения (грубо: 2 на группу). */
export function estimateLightPoints(p: Project): number {
  return p.lighting.groups * 2;
}

/** Активные зоны ленты: комплекты с количеством > 0 (кухня/зеркала/декор). */
export function estimateLedZones(p: Project): number {
  return [
    (p.lighting.ledKitchenQty ?? 0) > 0,
    (p.lighting.ledMirrorQty ?? 0) > 0,
    (p.lighting.ledDecorQty ?? 0) > 0,
  ].filter(Boolean).length;
}

/** Push-диммирование ленты: выбран push и есть хотя бы одна зона. */
export function isPushLed(p: Project): boolean {
  return p.lighting.ledControl === 'push' && estimateLedZones(p) > 0;
}

/** Количество отдельных силовых линий. 0 шт = нет потребителя. */
export function estimateDedicatedLines(p: Project): number {
  let n = 0;
  for (const c of p.power.consumers) {
    const qty = c.qty ?? 0;
    if (qty <= 0) continue;
    if (c.dedicatedLine) n += qty;
  }
  return n;
}

/** Активных кондиционеров (для закладных трасс). */
export function estimateConditionerQty(p: Project): number {
  const c = p.power.consumers.find((x) => x.kind === 'conditioner');
  return c?.qty ?? 0;
}

/** Все линии щита (грубо, для автоматов и трудозатрат). */
export function estimatePanelLines(p: Project): number {
  const base =
    Math.max(p.general.rooms, 1) +
    (p.general.kitchenPresent ? 2 : 1) +
    p.general.bathrooms;
  const extra =
    (p.panel.options.fridgeLine ? 1 : 0) + (p.panel.options.netLine ? 1 : 0);
  return base + estimateDedicatedLines(p) + extra;
}
