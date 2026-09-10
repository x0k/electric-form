import * as v from 'valibot';
import { ProjectSchema } from './schemas';
import type { Project } from './types';

/**
 * Миграция со старого поля `present` (чекбокс «есть/нет») на счётчик,
 * где 0 = нет потребителя. Valibot неизвестные ключи отбрасывает сам,
 * здесь только чиним количество до парсинга: `present: true` + `qty: 0`
 * раньше считалось за 1 (Math.max(qty, 1)), а `present: false` гасит
 * мусорные qty/линии.
 */
function migratePowerConsumers(raw: unknown): void {
  if (typeof raw !== 'object' || raw === null) return;
  const power = (raw as Record<string, unknown>)['power'];
  if (typeof power !== 'object' || power === null) return;
  const consumers = (power as Record<string, unknown>)['consumers'];
  if (!Array.isArray(consumers)) return;
  for (const c of consumers) {
    if (typeof c !== 'object' || c === null) continue;
    const rec = c as Record<string, unknown>;
    if (!('present' in rec)) continue;
    const present = rec['present'] === true;
    const qty = typeof rec['qty'] === 'number' ? rec['qty'] : 0;
    if (present && !(qty > 0)) rec['qty'] = 1;
    if (!present) {
      rec['qty'] = 0;
      rec['dedicatedLine'] = false;
    }
  }
}

export function parseProject(
  raw: unknown
): { ok: true; project: Project } | { ok: false; issues: string[] } {
  migratePowerConsumers(raw);
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
