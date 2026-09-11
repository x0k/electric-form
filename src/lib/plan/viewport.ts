/**
 * Viewport-математика редактора (Этап 3, чистая, без three.js).
 *
 * - snapPlanPoint: привязка сырой точки плана к шагу сетки;
 * - orthoTopNdcToPlan / planToOrthoTopNdc: обратимое преобразование
 *   «NDC ↔ план» для вида сверху (орто, север сверху).
 *
 * Соглашение вида сверху (совпадает с PlanViewer):
 * мир three: x → x плана, z → −y плана; камера смотрит строго вниз (−Y),
 * up = (0,0,−1), т.е. верх экрана = +Y плана. Тогда:
 * plan.x = cx + ndc.x * halfW; plan.y = cy + ndc.y * halfH.
 */

import { BASE_GRID_MM, snapPointToStep, type Vec2 } from './geometry';

export interface Ndc {
  x: number;
  y: number;
}

export interface OrthoHalfExtents {
  halfW: number;
  halfH: number;
}

/** Привязка точки плана к шагу (по умолчанию — базовая сетка 1 см). */
export function snapPlanPoint(p: Vec2, stepMm: number = BASE_GRID_MM): Vec2 {
  return snapPointToStep(p, stepMm);
}

/** NDC (−1..1) → план (мм) для орто-камеры сверху. */
export function orthoTopNdcToPlan(
  ndc: Ndc,
  center: Vec2,
  half: OrthoHalfExtents
): Vec2 {
  return {
    x: center.x + ndc.x * half.halfW,
    y: center.y + ndc.y * half.halfH,
  };
}

/** План (мм) → NDC для орто-камеры сверху (обратное преобразование). */
export function planToOrthoTopNdc(
  plan: Vec2,
  center: Vec2,
  half: OrthoHalfExtents
): Ndc {
  const halfW = half.halfW === 0 ? 1 : half.halfW;
  const halfH = half.halfH === 0 ? 1 : half.halfH;
  return {
    x: (plan.x - center.x) / halfW,
    y: (plan.y - center.y) / halfH,
  };
}

/** NDC внутри кадра (−1..1 по обеим осям, с эпсилоном на границе). */
export function isNdcInside(ndc: Ndc, eps = 1e-9): boolean {
  return (
    ndc.x >= -1 - eps &&
    ndc.x <= 1 + eps &&
    ndc.y >= -1 - eps &&
    ndc.y <= 1 + eps
  );
}

/**
 * Shift-лок оси (как в CAD): тянем вдоль доминирующей оси от origin,
 * вторая координата фиксируется. Применяется ДО снаппинга.
 */
export function lockToAxis(raw: Vec2, origin: Vec2): Vec2 {
  const dx = Math.abs(raw.x - origin.x);
  const dy = Math.abs(raw.y - origin.y);
  return dx >= dy ? { x: raw.x, y: origin.y } : { x: origin.x, y: raw.y };
}
