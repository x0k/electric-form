import * as v from 'valibot';
import { ProjectSchema } from './schemas';
import type { Project } from './types';

/** Строгий парсинг без миграций: неполное и старое отклоняется. */
export function parseProject(
  raw: unknown
): { ok: true; project: Project } | { ok: false; issues: string[] } {
  const res = v.safeParse(ProjectSchema, raw);
  if (res.success) return { ok: true, project: res.output };
  return {
    ok: false,
    issues: res.issues.map(
      (i) =>
        `${i.path?.map((p) => String(p.key)).join('.') ?? ''}: ${i.message}`
    ),
  };
}
