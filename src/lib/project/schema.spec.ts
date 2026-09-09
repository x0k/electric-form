import { describe, expect, it } from 'vitest';
import { createDefaultProject } from '#lib/project/defaults';
import { migrate } from '#lib/project/migrate';
import { SCHEMA_VERSION } from '#lib/project/schemas';
import { parseProject } from '#lib/project/validate';

describe('project schema v2', () => {
  it('дефолт валиден', () => {
    const p = createDefaultProject();
    expect(parseProject(p).ok).toBe(true);
  });

  it('scope по умолчанию: заказчик ничего не ставит сам', () => {
    expect(createDefaultProject().scope.customerSockets).toBe(false);
  });

  it('миграция дополняет старую структуру', () => {
    const p = migrate({
      meta: { id: 'x', name: 'old', createdAt: 't', updatedAt: 't' },
    });
    expect(p.schemaVersion).toBe(SCHEMA_VERSION);
    expect(p.general.areaM2).toBeGreaterThan(0);
    expect(p.power.consumers.length).toBe(12);
    expect(p.scope.customerSockets).toBe(false);
    expect(parseProject(p).ok).toBe(true);
  });

  it('миграция v1-проекта сохраняет значения и ставит scope', () => {
    const old = { ...createDefaultProject('v1'), schemaVersion: 1 };
    const { scope, ...withoutScope } = old as Record<string, unknown>;
    void scope;
    const p = migrate({ ...withoutScope, schemaVersion: 1 });
    expect(p.schemaVersion).toBe(SCHEMA_VERSION);
    expect(p.meta.name).toBe('v1');
    expect(p.general.areaM2).toBe(60);
    expect(p.scope.customerSockets).toBe(false);
    expect(parseProject(p).ok).toBe(true);
  });

  it('миграция v2-проекта без полей ленты ставит их дефолты', () => {
    const v2 = createDefaultProject('v2');
    const { lighting, ...rest } = v2 as unknown as Record<string, unknown>;
    const { ledPanel, ledControl, ledSoftstart, ...oldLighting } =
      lighting as Record<string, unknown>;
    void ledPanel;
    void ledControl;
    void ledSoftstart;
    const p = migrate({ ...rest, lighting: oldLighting });
    expect(p.schemaVersion).toBe(SCHEMA_VERSION);
    expect(p.lighting.ledPanel).toBe(false);
    expect(p.lighting.ledControl).toBe('triac');
    expect(p.lighting.ledSoftstart).toBe(false);
    expect(p.lighting.kitchenLed).toBe(v2.lighting.kitchenLed);
    expect(parseProject(p).ok).toBe(true);
  });

  it('невалидный мусор даёт fallback', () => {
    const p = migrate(null);
    expect(parseProject(p).ok).toBe(true);
  });
});
