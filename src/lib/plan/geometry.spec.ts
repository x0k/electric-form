import { describe, expect, it } from 'vitest';
import {
  GRID_MM,
  SNAP_STEPS_MM,
  axisAngleClean,
  isPointOnGrid,
  isPointOnStep,
  pointInPolygon,
  polygonAreaMm2,
  polygonPerimeterMm,
  snapMm,
  snapMmToStep,
  snapPoint,
  snapPointToStep,
  wallLengthMm,
} from '#lib/plan/geometry';

describe('geometry: сетка 1 см', () => {
  it('шаг сетки — 10 мм', () => {
    expect(GRID_MM).toBe(10);
  });

  it('snap округляет к ближайшему сантиметру', () => {
    expect(snapMm(0)).toBe(0);
    expect(snapMm(4)).toBe(0);
    expect(snapMm(5)).toBe(10);
    expect(snapMm(1234)).toBe(1230);
    expect(snapMm(1235)).toBe(1240);
    expect(snapMm(-14)).toBe(-10);
  });

  it('snapPoint привязывает обе координаты', () => {
    expect(snapPoint({ x: 1234, y: 5678 })).toEqual({ x: 1230, y: 5680 });
  });

  it('isPointOnGrid отличает сетку от мусора', () => {
    expect(isPointOnGrid({ x: 100, y: 200 })).toBe(true);
    expect(isPointOnGrid({ x: 105, y: 200 })).toBe(false);
    expect(isPointOnGrid({ x: 100.5, y: 200 })).toBe(false);
  });

  it('длина стены считается в мм', () => {
    expect(wallLengthMm({ x: 0, y: 0 }, { x: 3000, y: 4000 })).toBe(5000);
  });

  it('площадь и периметр прямоугольника 6×4 м', () => {
    const rect = [
      { x: 0, y: 0 },
      { x: 6000, y: 0 },
      { x: 6000, y: 4000 },
      { x: 0, y: 4000 },
    ];
    expect(polygonAreaMm2(rect)).toBe(24_000_000);
    expect(polygonPerimeterMm(rect)).toBe(20_000);
  });
});

describe('geometry: укрупнённая сетка для мебели', () => {
  it('стандартные шаги кратны базовой сетке', () => {
    expect(SNAP_STEPS_MM).toContain(10);
    for (const step of SNAP_STEPS_MM) {
      expect(step % GRID_MM).toBe(0);
    }
  });

  it('snap к 5/10 см', () => {
    expect(snapMmToStep(1234, 50)).toBe(1250);
    expect(snapMmToStep(1234, 100)).toBe(1200);
    expect(snapMmToStep(1276, 100)).toBe(1300);
    expect(snapPointToStep({ x: 1234, y: 5678 }, 100)).toEqual({
      x: 1200,
      y: 5700,
    });
  });

  it('укрупнённая привязка остаётся на базовой сетке 1 см', () => {
    for (const step of [50, 100, 500] as const) {
      const p = snapPointToStep({ x: 1234, y: 5678 }, step);
      expect(isPointOnGrid(p)).toBe(true);
      expect(isPointOnStep(p, step)).toBe(true);
    }
  });

  it('некратный базовой сетке шаг отклоняется', () => {
    expect(() => snapMmToStep(100, 15)).toThrow();
    expect(() => snapMmToStep(100, 0)).toThrow();
  });

  it('axisAngleClean отличает чистые оси от диагоналей', () => {
    const o = { x: 0, y: 0 };
    expect(axisAngleClean({ x: 6000, y: 30 }, o)).toBe('h');
    expect(axisAngleClean({ x: 30, y: 4000 }, o)).toBe('v');
    expect(axisAngleClean({ x: -6000, y: -20 }, o)).toBe('h');
    expect(axisAngleClean({ x: 3000, y: 3000 }, o)).toBeNull();
    expect(axisAngleClean({ x: 0, y: 0 }, o)).toBeNull();
  });

  it('pointInPolygon отличает внутри/снаружи/границу', () => {
    const rect = [
      { x: 0, y: 0 },
      { x: 6000, y: 0 },
      { x: 6000, y: 4000 },
      { x: 0, y: 4000 },
    ];
    expect(pointInPolygon({ x: 3000, y: 2000 }, rect)).toBe(true);
    expect(pointInPolygon({ x: -10, y: 2000 }, rect)).toBe(false);
    expect(pointInPolygon({ x: 3000, y: 5000 }, rect)).toBe(false);
    // Та же площадь независимо от обхода.
    const cw = [...rect].reverse();
    expect(pointInPolygon({ x: 3000, y: 2000 }, cw)).toBe(true);
    expect(pointInPolygon({ x: 7000, y: 2000 }, cw)).toBe(false);
  });
});
