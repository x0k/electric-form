import { describe, expect, it } from 'vitest';
import { createDefaultProject } from '#lib/project/defaults';
import { migrate } from '#lib/project/migrate';
import { parseProject } from '#lib/project/validate';

describe('project schema v1', () => {
  it('дефолт валиден', () => {
    const p = createDefaultProject();
    expect(parseProject(p).ok).toBe(true);
  });

  it('миграция дополняет старую структуру', () => {
    const p = migrate({
      meta: { id: 'x', name: 'old', createdAt: 't', updatedAt: 't' },
    });
    expect(p.schemaVersion).toBe(1);
    expect(p.general.areaM2).toBeGreaterThan(0);
    expect(p.power.consumers.length).toBe(12);
    expect(parseProject(p).ok).toBe(true);
  });

  it('невалидный мусор даёт fallback', () => {
    const p = migrate(null);
    expect(parseProject(p).ok).toBe(true);
  });
});
