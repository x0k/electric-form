import { describe, expect, it } from 'vitest';
import { SEED_CATALOG } from '#lib/catalog/index';
import { calculate } from '#lib/calc/engine';
import { calcSavings } from '#lib/calc/savings';
import { createDefaultProject } from '#lib/project/defaults';

describe('engine v1', () => {
  it('пустой дефолт даёт положительный итог и разбивку', () => {
    const p = createDefaultProject('test');
    const r = calculate(p, SEED_CATALOG);
    expect(r.totalRub).toBeGreaterThan(50_000);
    expect(r.lines.length).toBeGreaterThan(10);
    expect(r.categoryTotals.cable).toBeGreaterThan(0);
    expect(r.categoryTotals.panel).toBeGreaterThan(0);
    expect(r.panelBoxId).toBeTruthy();
    expect(r.daysMin).toBeGreaterThanOrEqual(1);
    expect(r.daysMax).toBeGreaterThan(r.daysMin);
    expect(r.rangeRub.min).toBeLessThan(r.totalRub);
    expect(r.rangeRub.max).toBeGreaterThan(r.totalRub);
  });

  it('кондиционеры и реле напряжения увеличивают итог', () => {
    const base = createDefaultProject('base');
    const mod = createDefaultProject('mod');
    mod.ac.count = 3;
    mod.ac.dedicatedLines = true;
    mod.panel.options.voltageRelay = true;
    mod.panel.options.spd = true;
    const rb = calculate(base, SEED_CATALOG);
    const rm = calculate(mod, SEED_CATALOG);
    expect(rm.totalRub).toBeGreaterThan(rb.totalRub);
  });

  it('what-if экономия считает дельту', () => {
    const p = createDefaultProject('save');
    p.panel.options.voltageRelay = true;
    p.panel.options.spd = true;
    const s = calcSavings(p, SEED_CATALOG);
    expect(s.length).toBeGreaterThan(0);
    expect(s[0].deltaRub).toBeGreaterThan(0);
  });

  it('модули щита растут с опциями', () => {
    const a = createDefaultProject('a');
    const b = createDefaultProject('b');
    b.panel.options.voltageRelay = true;
    b.panel.options.spd = true;
    b.panel.options.contactor = true;
    b.panel.options.wattmeter = true;
    const ra = calculate(a, SEED_CATALOG);
    const rb = calculate(b, SEED_CATALOG);
    expect(rb.panelModules).toBeGreaterThan(ra.panelModules);
  });
});
