import { describe, expect, it } from 'vitest';
import { SEED_CATALOG } from '#lib/catalog/index';
import { calculate } from '#lib/calc/engine';
import { STEPS } from '#lib/forms/steps';
import { createDefaultProject } from '#lib/project/defaults';
import { parseProject } from '#lib/project/validate';

describe('7 steps', () => {
  it('steps shape', () => {
    expect(STEPS.map((s) => s.id)).toEqual([
      'general',
      'power',
      'lowvoltage',
      'lighting',
      'sensors',
      'panel',
      'result',
    ]);
    const power = STEPS.find((s) => s.id === 'power')!;
    expect(power.paths).toEqual([['ac'], ['power']]);
    const result = STEPS.find((s) => s.id === 'result')!;
    expect(result.paths).toEqual([['work']]);
  });
  it('default valid, no bathrooms section, sup from sensors', () => {
    const p = createDefaultProject('x');
    expect(parseProject(p).ok).toBe(true);
    expect('bathrooms' in (p as object)).toBe(false);
    expect(p.sensors.supRequired).toBe(true);
    const ids = calculate(p, SEED_CATALOG).lines.map((l) => l.materialId);
    expect(ids).toContain('sup-kit');
    const off = createDefaultProject('y');
    off.sensors.supRequired = false;
    const ids2 = calculate(off, SEED_CATALOG).lines.map((l) => l.materialId);
    expect(ids2).not.toContain('sup-kit');
  });
});
