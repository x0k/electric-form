import * as v from 'valibot';
import { createDefaultProject } from './defaults';
import { ProjectSchema, SCHEMA_VERSION } from './schemas';
import type { Project } from './types';

/**
 * Миграция сырого JSON в актуальный Project.
 * Неизвестные/старые структуры дополняются дефолтами, затем валидируются.
 */
export function migrate(raw: unknown): Project {
  const fallback = createDefaultProject('Импортированный проект');
  if (typeof raw !== 'object' || raw === null) return fallback;

  const obj = raw as Record<string, unknown>;
  const version = obj['schemaVersion'];
  void version;

  // v1: shallow-merge по секциям поверх дефолта, дальше — строгий parse.
  const merged = {
    ...fallback,
    ...(obj as object),
    meta: { ...fallback.meta, ...((obj['meta'] as object) ?? {}) },
    general: { ...fallback.general, ...((obj['general'] as object) ?? {}) },
    power: { ...fallback.power, ...((obj['power'] as object) ?? {}) },
    ac: { ...fallback.ac, ...((obj['ac'] as object) ?? {}) },
    lowVoltage: {
      ...fallback.lowVoltage,
      ...((obj['lowVoltage'] as object) ?? {}),
    },
    lighting: { ...fallback.lighting, ...((obj['lighting'] as object) ?? {}) },
    bathrooms: {
      ...fallback.bathrooms,
      ...((obj['bathrooms'] as object) ?? {}),
    },
    sensors: { ...fallback.sensors, ...((obj['sensors'] as object) ?? {}) },
    panel: {
      ...fallback.panel,
      ...((obj['panel'] as object) ?? {}),
      options: {
        ...fallback.panel.options,
        ...(((obj['panel'] as Record<string, unknown> | undefined)?.[
          'options'
        ] as object) ?? {}),
      },
    },
    work: { ...fallback.work, ...((obj['work'] as object) ?? {}) },
    schemaVersion: SCHEMA_VERSION,
  };

  const parsed = v.safeParse(ProjectSchema, merged);
  if (parsed.success) return parsed.output;
  return fallback;
}
