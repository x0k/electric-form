import { describe, expect, it } from 'vitest';
import { createDefaultProject } from '#lib/project/defaults';
import { parseProject } from '#lib/project/validate';

describe('project schema', () => {
  it('дефолт валиден', () => {
    const p = createDefaultProject();
    expect(parseProject(p).ok).toBe(true);
  });

  it('scope по умолчанию: заказчик ничего не ставит сам', () => {
    expect(createDefaultProject().scope.customerSockets).toBe(false);
  });

  it('неполный проект без закупочного количества отклоняется', () => {
    const raw = JSON.parse(
      JSON.stringify(createDefaultProject('incomplete'))
    ) as Record<string, unknown>;
    delete (raw['lighting'] as Record<string, unknown>)['passThroughQty'];
    const parsed = parseProject(raw);
    expect(parsed.ok).toBe(false);
  });

  it('неизвестные ключи отбрасываются, проект валиден', () => {
    const raw = {
      ...JSON.parse(JSON.stringify(createDefaultProject('old'))),
      schemaVersion: 3,
      sensors: {
        ...createDefaultProject('old').sensors,
        smoke: true,
        curtains: true,
      },
    };
    const parsed = parseProject(raw);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect('schemaVersion' in parsed.project).toBe(false);
      expect('smoke' in parsed.project.sensors).toBe(false);
    }
  });

  it('битый проект отклоняется с issues', () => {
    const parsed = parseProject({
      meta: { id: 'x', name: 'old', createdAt: 't', updatedAt: 't' },
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.issues.length).toBeGreaterThan(0);
  });

  it('мусор отклоняется', () => {
    expect(parseProject(null).ok).toBe(false);
    expect(parseProject('nope').ok).toBe(false);
    expect(parseProject([]).ok).toBe(false);
  });
});
