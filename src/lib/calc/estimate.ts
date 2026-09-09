import type { Project } from '#lib/project/types';
import { METHOD } from './method';

/** Оценка количества розеток 220В. */
export function estimateSockets(p: Project): number {
  const manual = p.general.socketsEstimate;
  if (manual > 0) return manual;
  return Math.round(
    p.general.rooms * METHOD.socketsPerRoom +
      (p.general.kitchenPresent ? METHOD.socketsKitchen : 0) +
      p.general.bathrooms * METHOD.socketsPerBathroom +
      METHOD.socketsBase
  );
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

/** Количество отдельных силовых линий. Кондиционер — мастер ac, дубль из power игнорим. */
export function estimateDedicatedLines(p: Project): number {
  let n = 0;
  for (const c of p.power.consumers) {
    if (!c.present) continue;
    if (c.kind === 'conditioner') continue;
    const qty = Math.max(c.qty, 1);
    if (c.dedicatedLine) n += qty;
  }
  return n;
}

export function estimateAcLines(p: Project): number {
  if (p.ac.count <= 0 && !p.ac.reserveFuture) return 0;
  if (!p.ac.dedicatedLines) return 0;
  return p.ac.count + (p.ac.reserveFuture ? 1 : 0);
}

/** Все линии щита (грубо, для автоматов и трудозатрат). */
export function estimatePanelLines(p: Project): number {
  const base =
    Math.max(p.general.rooms, 1) +
    (p.general.kitchenPresent ? 2 : 1) +
    p.general.bathrooms;
  const extra =
    (p.panel.options.fridgeLine ? 1 : 0) + (p.panel.options.netLine ? 1 : 0);
  return base + estimateDedicatedLines(p) + estimateAcLines(p) + extra;
}
