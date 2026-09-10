import { describe, expect, it } from 'vitest';
import { createDefaultProject } from '#lib/project/defaults';
import {
  deriveDoorsCount,
  deriveLightingGroups,
  deriveTvOutlets,
  deriveWifiAP,
} from '#lib/forms/derived';
import { parseProject } from '#lib/project/validate';

describe('дефолт проекта', () => {
  it('валиден', () => {
    expect(parseProject(createDefaultProject()).ok).toBe(true);
  });

  it('производные посчитаны теми же формулами, что живая синхронизация', () => {
    const p = createDefaultProject();
    const g = p.general;
    expect(p.lighting.groups).toBe(deriveLightingGroups(g));
    expect(g.doorsCount).toBe(deriveDoorsCount(g));
  });

  it('слаботочка по умолчанию нули — включается явно', () => {
    const p = createDefaultProject();
    expect(p.lowVoltage.tvOutlets).toBe(0);
    expect(p.lowVoltage.wifiAP).toBe(0);
    expect(p.lowVoltage.ethernetPoints).toBe(0);
    // Формулы типовых живы и используются кнопкой «Заполнить типовые».
    expect(deriveTvOutlets(p.general)).toBeGreaterThan(0);
    expect(deriveWifiAP(p.general)).toBeGreaterThan(0);
  });

  it('не содержит тихого присутствия вне производных', () => {
    const p = createDefaultProject();
    expect(p.lowVoltage.cameras).toBe(0);
    // Закупочные количества — явные нули, а не пустота.
    expect(p.lighting.passThroughQty).toBe(0);
    expect(p.lighting.dimmerQty).toBe(0);
    expect(p.lighting.ledKitchenQty).toBe(0);
    expect(p.lighting.ledMirrorQty).toBe(0);
    expect(p.lighting.ledDecorQty).toBe(0);
    expect(p.sensors.leakQty).toBe(0);
    expect(p.sensors.valveQty).toBe(0);
    expect(p.sensors.smokeQty).toBe(0);
    expect(p.sensors.motionQty).toBe(0);
    expect(p.sensors.curtainQty).toBe(0);
    // Потребители: количества нулевые (0 = нет), линии отдельные по умолчанию.
    expect(p.power.consumers.every((c) => c.qty === 0)).toBe(true);
    expect(p.power.consumers.every((c) => c.dedicatedLine)).toBe(true);
    // Щит и работы: без запаса и опций.
    expect(p.panel.reserveModules).toBe(0);
    expect(Object.values(p.panel.options).every((v) => !v)).toBe(true);
    expect(p.power.consumers.find((c) => c.kind === 'conditioner')!.qty).toBe(
      0
    );
    expect(p.power.conditionerChase).toBe(false);
    // Лента: ни щита, ни плавного пуска по умолчанию.
    expect(p.lighting.ledPanel).toBe(false);
    expect(p.lighting.ledControl).toBe('triac');
    expect(p.lighting.ledSoftstart).toBe(false);
  });
});
