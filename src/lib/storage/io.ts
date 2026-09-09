import { migrate } from '#lib/project/migrate';
import { parseProject } from '#lib/project/validate';
import type { Project } from '#lib/project/types';

export function exportProject(p: Project): string {
  return JSON.stringify(p, null, 2);
}

export function exportAll(list: Project[]): string {
  return JSON.stringify(list, null, 2);
}

export function importProject(json: string): Project {
  const raw: unknown = JSON.parse(json);
  const parsed = parseProject(raw);
  if (parsed.ok) return parsed.project;
  // Пробуем мягкую миграцию старых структур
  return migrate(raw);
}

export function importMany(json: string): Project[] {
  const raw: unknown = JSON.parse(json);
  if (!Array.isArray(raw)) return [importProject(json)];
  return (raw as unknown[]).map((x) => migrate(x));
}
