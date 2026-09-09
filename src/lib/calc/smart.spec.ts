import { describe, expect, it } from 'vitest';
import { SEED_CATALOG } from '#lib/catalog/index';
import { calculate } from '#lib/calc/engine';
import { createDefaultProject } from '#lib/project/defaults';

describe('smart rules', () => {
  it('умный свет добавляет DIN-реле в щит', () => {
    const off = calculate(createDefaultProject('off'), SEED_CATALOG);
    expect(off.lines.some((l) => l.materialId === 'relay-smart')).toBe(false);

    const p = createDefaultProject('on');
    p.lighting.groups = 4;
    p.lighting.smart = true;
    const r = calculate(p, SEED_CATALOG);
    const relays = r.lines.filter((l) => l.materialId === 'relay-smart');
    expect(relays.length).toBe(1);
    expect(relays[0].qty).toBe(2); // ceil(4/2)
    expect(relays[0].stage).toBe('rough');
    expect(relays[0].category).toBe('panel');
  });

  it('датчики температуры, открытия и хаб — по своим тумблерам', () => {
    const p = createDefaultProject('sensors');
    p.general.rooms = 3;
    p.sensors.temp = true;
    p.sensors.openSensor = true;
    p.sensors.smartHome = true;
    const r = calculate(p, SEED_CATALOG);
    const byId = (id: string) => r.lines.filter((l) => l.materialId === id);

    expect(byId('temp-sensor')[0].qty).toBe(3); // по числу комнат
    expect(byId('open-sensor')[0].qty).toBe(p.general.doorsCount); // из числа дверей
    expect(byId('smarthome-hub')[0].qty).toBe(1);
    for (const l of [
      ...byId('temp-sensor'),
      ...byId('open-sensor'),
      ...byId('smarthome-hub'),
    ]) {
      expect(l.stage).toBe('finish');
      expect(l.category).toBe('automation');
    }
  });

  it('без тумблеров новых позиций нет', () => {
    const r = calculate(createDefaultProject('plain'), SEED_CATALOG);
    for (const id of [
      'relay-smart',
      'temp-sensor',
      'open-sensor',
      'smarthome-hub',
    ]) {
      expect(r.lines.some((l) => l.materialId === id)).toBe(false);
    }
  });
});
