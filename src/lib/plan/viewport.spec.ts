import { describe, expect, it } from 'vitest';
import {
  isNdcInside,
  lockToAxis,
  orthoTopNdcToPlan,
  planToOrthoTopNdc,
  snapPlanPoint,
} from '#lib/plan/viewport';

describe('viewport', () => {
  it('snap по умолчанию — сетка 1 см', () => {
    expect(snapPlanPoint({ x: 1234, y: 5678 })).toEqual({ x: 1230, y: 5680 });
  });

  it('snap к укрупнённому шагу остаётся на базовой сетке', () => {
    expect(snapPlanPoint({ x: 1234, y: 5678 }, 100)).toEqual({
      x: 1200,
      y: 5700,
    });
  });

  it('NDC ↔ план обратимы (вид сверху, север сверху)', () => {
    const center = { x: 3000, y: 2000 };
    const half = { halfW: 4000, halfH: 3000 };
    expect(orthoTopNdcToPlan({ x: 0, y: 0 }, center, half)).toEqual(center);
    expect(orthoTopNdcToPlan({ x: 1, y: 1 }, center, half)).toEqual({
      x: 7000,
      y: 5000,
    });
    const plan = { x: 6000, y: 4000 };
    const ndc = planToOrthoTopNdc(plan, center, half);
    expect(orthoTopNdcToPlan(ndc, center, half)).toEqual(
      expect.objectContaining({ x: 6000, y: 4000 })
    );
  });

  it('isNdcInside отличает кадр от мимо', () => {
    expect(isNdcInside({ x: 0, y: 0 })).toBe(true);
    expect(isNdcInside({ x: 1, y: -1 })).toBe(true);
    expect(isNdcInside({ x: 1.5, y: 0 })).toBe(false);
  });

  it('lockToAxis тянет вдоль доминирующей оси', () => {
    const o = { x: 1000, y: 1000 };
    expect(lockToAxis({ x: 2500, y: 1100 }, o)).toEqual({ x: 2500, y: 1000 });
    expect(lockToAxis({ x: 1100, y: 2500 }, o)).toEqual({ x: 1000, y: 2500 });
    // Ничья — горизонталь.
    expect(lockToAxis({ x: 2000, y: 2000 }, o)).toEqual({ x: 2000, y: 1000 });
  });
});
