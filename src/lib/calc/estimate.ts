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

/** Точек освещения (грубо: 2 на группу). */
export function estimateLightPoints(p: Project): number {
  return p.lighting.groups * 2;
}

/** Активные зоны ленты (кухня/зеркала/декор) — для БП, управления и кабеля. */
export function estimateLedZones(p: Project): number {
  return [
    p.lighting.kitchenLed,
    p.lighting.mirrorLed,
    p.lighting.decorLed,
  ].filter(Boolean).length;
}

/** Push-диммирование ленты: диммирование включено и выбран push. */
export function isPushLed(p: Project): boolean {
  return (
    p.lighting.dimming &&
    estimateLedZones(p) > 0 &&
    p.lighting.ledControl === 'push'
  );
}

/** Количество отдельных силовых линий. */
export function estimateDedicatedLines(p: Project): number {
  let n = 0;
  for (const c of p.power.consumers) {
    if (!c.present) continue;
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
  return base + estimateDedicatedLines(p) + estimateAcLines(p);
}
