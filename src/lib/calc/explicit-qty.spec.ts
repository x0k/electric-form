import { describe, expect, it } from 'vitest';
import { SEED_CATALOG, catalogById } from '#lib/catalog/index';
import { calculate } from '#lib/calc/engine';
import { createDefaultProject } from '#lib/project/defaults';

function lineQty(
  project: ReturnType<typeof createDefaultProject>,
  materialId: string
): number {
  const r = calculate(project, SEED_CATALOG);
  const lines = r.lines.filter((l) => l.materialId === materialId);
  expect(lines.length).toBeGreaterThan(0);
  return lines.reduce((a, l) => a + l.qty, 0);
}

function hasLine(
  project: ReturnType<typeof createDefaultProject>,
  materialId: string
): boolean {
  return calculate(project, SEED_CATALOG).lines.some(
    (l) => l.materialId === materialId
  );
}

describe('явные количества для закупки', () => {
  it('пустое поле = 0: без количества ничего нет', () => {
    const p = createDefaultProject('empty');
    p.lighting.groups = 6;
    expect(hasLine(p, 'switch-pass')).toBe(false);
    expect(hasLine(p, 'switch-dim')).toBe(false);
    expect(hasLine(p, 'smoke-sensor')).toBe(false);
    // Обычные выключатели структурные — по одному на группу.
    expect(lineQty(p, 'switch-1')).toBe(6);
  });

  it('проходные вытесняют обычные один к одному', () => {
    const p = createDefaultProject('pass');
    p.lighting.groups = 6;
    p.lighting.passThroughQty = 3;
    expect(lineQty(p, 'switch-pass')).toBe(3);
    expect(lineQty(p, 'switch-1')).toBe(3);
  });

  it('число фиксируется для закупки без тумблеров', () => {
    const p = createDefaultProject('manual');
    p.lighting.dimmerQty = 5;
    p.sensors.smokeQty = 2;
    expect(lineQty(p, 'switch-dim')).toBe(5);
    expect(lineQty(p, 'smoke-sensor')).toBe(2);
  });

  it('подсветка: комплекты только явные, push считается от зон', () => {
    const p = createDefaultProject('led');
    p.lighting.ledKitchenQty = 1;
    p.lighting.ledMirrorQty = 5;
    p.lighting.ledControl = 'push';
    expect(lineQty(p, 'led-kitchen')).toBe(1);
    expect(lineQty(p, 'led-mirror')).toBe(5);
    expect(lineQty(p, 'led-driver-push')).toBe(2); // 2 зоны
    expect(lineQty(p, 'push-button')).toBe(2);
  });

  it('датчики: явные количества без тумблеров', () => {
    const p = createDefaultProject('s');
    p.sensors.leakQty = 10;
    p.sensors.valveQty = 1;
    p.sensors.motionQty = 6;
    p.sensors.curtainQty = 2;
    expect(lineQty(p, 'leak-sensor')).toBe(10);
    expect(lineQty(p, 'leak-valve')).toBe(1);
    expect(lineQty(p, 'motion-sensor')).toBe(6);
    expect(lineQty(p, 'curtain-motor')).toBe(2);
  });

  it('ноль — тоже явный ответ (позиция исчезает из сметы)', () => {
    const p = createDefaultProject('zero');
    p.lighting.groups = 4;
    p.lighting.passThroughQty = 0;
    const r = calculate(p, SEED_CATALOG);
    // qty 0 отбрасывается движком (spec.qty <= 0).
    expect(r.lines.some((l) => l.materialId === 'switch-pass')).toBe(false);
    expect(catalogById(SEED_CATALOG).get('switch-pass')).toBeTruthy();
  });
});
