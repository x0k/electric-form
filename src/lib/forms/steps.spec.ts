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
      'lighting',
      'lowvoltage',
      'sensors',
      'panel',
      'result',
    ]);
    const power = STEPS.find((s) => s.id === 'power')!;
    expect(power.paths).toEqual([['power']]);
    const result = STEPS.find((s) => s.id === 'result')!;
    expect(result.paths).toEqual([['work']]);
  });
  it('default valid, no bathrooms section, sup from sensors', () => {
    const p = createDefaultProject('x');
    expect(parseProject(p).ok).toBe(true);
    expect('bathrooms' in (p as object)).toBe(false);
    expect(p.sensors.supRequired).toBe(false);
    const ids = calculate(p, SEED_CATALOG).lines.map((l) => l.materialId);
    expect(ids).not.toContain('sup-kit');
    const on = createDefaultProject('y');
    on.sensors.supRequired = true;
    const ids2 = calculate(on, SEED_CATALOG).lines.map((l) => l.materialId);
    expect(ids2).toContain('sup-kit');
  });
  it('conditioner is an ordinary power consumer; chase needs qty', () => {
    const base = createDefaultProject('base');
    const mod = createDefaultProject('mod');
    const cond = mod.power.consumers.find((c) => c.kind === 'conditioner')!;
    cond.present = true;
    cond.qty = 2;
    cond.dedicatedLine = true;
    mod.power.conditionerChase = true;
    const rb = calculate(base, SEED_CATALOG);
    const rm = calculate(mod, SEED_CATALOG);
    expect(rm.totalRub).toBeGreaterThan(rb.totalRub);
    expect(rm.panelModules).toBeGreaterThan(rb.panelModules);
    expect(rm.lines.map((l) => l.materialId)).toContain('corr-25');
    const noChase = createDefaultProject('nochase');
    const cond2 = noChase.power.consumers.find(
      (c) => c.kind === 'conditioner'
    )!;
    cond2.present = true;
    cond2.qty = 2;
    cond2.dedicatedLine = true;
    expect(
      calculate(noChase, SEED_CATALOG).lines.map((l) => l.materialId)
    ).not.toContain('corr-25');
  });
  it('автоматика — чистовой этап итога, СУП — черновой', () => {
    const p = createDefaultProject('stages');
    p.sensors.supRequired = true;
    p.sensors.leakQty = 2;
    p.sensors.valveQty = 2;
    p.sensors.smokeQty = 2;
    p.sensors.motionQty = 1;
    p.sensors.curtainQty = 1;
    p.sensors.temp = true;
    p.sensors.openSensor = true;
    p.sensors.smartHome = true;
    const lines = calculate(p, SEED_CATALOG).lines;
    const autoStages = new Set(
      lines.filter((l) => l.category === 'automation').map((l) => l.stage)
    );
    expect([...autoStages]).toEqual(['finish']);
    expect(lines.find((l) => l.ruleId === 'sup')?.stage).toBe('rough');
  });
});
