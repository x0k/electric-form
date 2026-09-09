import { describe, expect, it } from 'vitest';
import { createDefaultProject } from '#lib/project/defaults';
import { parseProject } from '#lib/project/validate';

describe('дефолт проекта', () => {
  it('валиден', () => {
    expect(parseProject(createDefaultProject()).ok).toBe(true);
  });

  it('не содержит тихого присутствия: смета строится только из явного ввода', () => {
    const p = createDefaultProject();
    // Слаботочка и свет: нули, а не типовые значения.
    expect(p.lowVoltage.ethernetPoints).toBe(0);
    expect(p.lowVoltage.tvOutlets).toBe(0);
    expect(p.lowVoltage.wifiAP).toBe(0);
    expect(p.lowVoltage.cameras).toBe(0);
    expect(p.lighting.groups).toBe(0);
    expect(p.lighting.kitchenLed).toBe(false);
    // Потребители: ни один не отмечен, отдельных линий нет.
    expect(p.power.consumers.every((c) => !c.present)).toBe(true);
    expect(p.power.consumers.every((c) => !c.dedicatedLine)).toBe(true);
    // Щит и работы: без запаса и опций.
    expect(p.panel.reserveModules).toBe(0);
    expect(Object.values(p.panel.options).every((v) => !v)).toBe(true);
    expect(p.sensors.leakage).toBe(false);
    expect(p.sensors.curtains).toBe(false);
    expect(p.ac.count).toBe(0);
    // Лента: ни щита, ни плавного пуска по умолчанию.
    expect(p.lighting.ledPanel).toBe(false);
    expect(p.lighting.ledControl).toBe('triac');
    expect(p.lighting.ledSoftstart).toBe(false);
  });
});
