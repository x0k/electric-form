import { describe, expect, it } from 'vitest';
import { SEED_CATALOG } from '#lib/catalog/index';
import { calculate } from '#lib/calc/engine';
import { createDefaultProject } from '#lib/project/defaults';

function ledProject() {
  const p = createDefaultProject('led');
  p.general.areaM2 = 60;
  p.lighting.groups = 4;
  p.lighting.ledKitchenQty = 1;
  return p;
}

describe('led rules', () => {
  it('декор-подсветка даёт комплект только с явным количеством', () => {
    expect(
      calculate(ledProject(), SEED_CATALOG).lines.some(
        (l) => l.materialId === 'led-decor'
      )
    ).toBe(false);
    const p = ledProject();
    p.lighting.ledDecorQty = 2;
    const r = calculate(p, SEED_CATALOG);
    const decor = r.lines.filter((l) => l.materialId === 'led-decor');
    expect(decor.length).toBe(1);
    expect(decor[0].qty).toBe(2);
    expect(decor[0].stage).toBe('finish');
  });

  it('LED-щит добавляет кабель и корпус в черновой этап', () => {
    const p = ledProject();
    p.lighting.ledPanel = true;
    const r = calculate(p, SEED_CATALOG);
    const cable = r.lines.filter((l) => l.ruleId === 'led-power-cable');
    expect(cable.length).toBe(1);
    expect(cable[0].stage).toBe('rough');
    expect(cable[0].qty).toBe(12); // 1 зона × 12 м
    const box = r.lines.filter((l) => l.materialId === 'led-box');
    expect(box.length).toBe(1);
    expect(box[0].stage).toBe('rough');
    expect(r.labor.some((t) => t.label === 'Закладка LED-щита')).toBe(true);
  });

  it('без LED-щита кабеля и корпуса нет', () => {
    const r = calculate(ledProject(), SEED_CATALOG);
    expect(r.lines.some((l) => l.ruleId === 'led-power-cable')).toBe(false);
    expect(r.lines.some((l) => l.materialId === 'led-box')).toBe(false);
  });

  it('push: драйверы и кнопки вместо софтстарта', () => {
    const p = ledProject();
    p.lighting.ledControl = 'push';
    p.lighting.ledSoftstart = true; // при push игнорируется
    const r = calculate(p, SEED_CATALOG);
    expect(r.lines.some((l) => l.materialId === 'led-driver-push')).toBe(true);
    expect(r.lines.some((l) => l.materialId === 'push-button')).toBe(true);
    expect(r.lines.some((l) => l.materialId === 'led-softstart')).toBe(false);
  });

  it('triac + плавный пуск: модули без драйверов', () => {
    const p = ledProject();
    p.lighting.ledControl = 'triac';
    p.lighting.ledSoftstart = true;
    const r = calculate(p, SEED_CATALOG);
    const soft = r.lines.filter((l) => l.materialId === 'led-softstart');
    expect(soft.length).toBe(1);
    expect(soft[0].qty).toBe(1); // 1 зона
    expect(r.lines.some((l) => l.materialId === 'led-driver-push')).toBe(false);
  });
});
