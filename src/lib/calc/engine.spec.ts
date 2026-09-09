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
    const cond = mod.power.consumers.find((c) => c.kind === 'conditioner')!;
    cond.present = true;
    cond.qty = 3;
    cond.dedicatedLine = true;
    mod.power.conditionerChase = true;
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

  it('этапы в сумме дают итог, кабель — черновой, розетки — чистовой', () => {
    const p = createDefaultProject('stages');
    p.general.areaM2 = 70;
    p.power.consumers[0].present = true;
    p.power.consumers[0].qty = 1;
    p.power.consumers[0].dedicatedLine = true;
    p.lowVoltage.ethernetPoints = 4;
    p.lighting.groups = 4;
    const r = calculate(p, SEED_CATALOG);
    expect(r.stageTotals.rough + r.stageTotals.finish).toBe(r.totalRub);
    expect(r.stageTotals.rough).toBeGreaterThan(0);
    expect(r.stageTotals.finish).toBeGreaterThan(0);
    const cableStage = new Set(
      r.lines.filter((l) => l.category === 'cable').map((l) => l.stage)
    );
    expect([...cableStage]).toEqual(['rough']);
    const socketsStage = new Set(
      r.lines.filter((l) => l.category === 'sockets').map((l) => l.stage)
    );
    expect([...socketsStage]).toEqual(['finish']);
    // Дни этапов покрывают общий срок.
    expect(r.stageDays.rough.min).toBeGreaterThanOrEqual(1);
    expect(r.stageDays.finish.min).toBeGreaterThanOrEqual(1);
  });

  it('флаг заказчика исключает розетки из сметы в «своими силами»', () => {
    const base = createDefaultProject('full');
    base.general.areaM2 = 70;
    const full = calculate(base, SEED_CATALOG);
    const mod = createDefaultProject('self');
    mod.general.areaM2 = 70;
    mod.scope.customerSockets = true;
    const cut = calculate(mod, SEED_CATALOG);
    const socketsSum = full.lines
      .filter((l) => l.category === 'sockets')
      .reduce((a, l) => a + l.sumRub, 0);
    expect(socketsSum).toBeGreaterThan(0);
    expect(cut.excludedTotalRub).toBe(socketsSum);
    expect(cut.totalRub).toBe(full.totalRub - socketsSum);
    expect(cut.lines.some((l) => l.category === 'sockets')).toBe(false);
    expect(cut.excludedLines.every((l) => l.category === 'sockets')).toBe(true);
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
