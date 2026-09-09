import { parseProject } from '#lib/project/validate';
import type { Project } from '#lib/project/types';

export function exportAll(list: Project[]): string {
  return JSON.stringify(list, null, 2);
}

/** Строгий импорт одного проекта; бросает на невалидном JSON. */
export function importProject(json: string): Project {
  const parsed = parseProject(JSON.parse(json));
  if (!parsed.ok) throw new Error(`Невалидный проект: ${parsed.issues[0]}`);
  return parsed.project;
}

/**
 * Импорт списка: битые записи пропускаются. Если валидного нет ничего —
 * бросает, чтобы UI показал ошибку вместо тихого пустого импорта.
 */
export function importMany(json: string): Project[] {
  const raw: unknown = JSON.parse(json);
  const arr = Array.isArray(raw) ? raw : [raw];
  const out: Project[] = [];
  for (const x of arr) {
    const parsed = parseProject(x);
    if (parsed.ok) out.push(parsed.project);
  }
  if (arr.length > 0 && out.length === 0)
    throw new Error('В файле нет валидных проектов');
  return out;
}
