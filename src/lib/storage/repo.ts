import { migrate } from '#lib/project/migrate';
import type { Project } from '#lib/project/types';
import { nowIso } from '#lib/project/defaults';

const PROJECTS_KEY = 'electric-form:v1:projects';
const OVERRIDES_KEY = 'electric-form:v1:catalog-overrides';

function ls(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function loadProjects(): Project[] {
  const store = ls();
  if (!store) return [];
  try {
    const raw = store.getItem(PROJECTS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown[];
    if (!Array.isArray(arr)) return [];
    return arr.map((x) => migrate(x));
  } catch {
    return [];
  }
}

export function persistProjects(projects: Project[]): void {
  const store = ls();
  if (!store) return;
  try {
    const stamped = projects.map((p) => ({
      ...p,
      meta: { ...p.meta, updatedAt: nowIso() },
    }));
    store.setItem(PROJECTS_KEY, JSON.stringify(stamped));
  } catch {
    // quota / ssr — молча игнорируем
  }
}

export function loadOverrides(): Record<
  string,
  { priceRub?: number; wastePct?: number }
> {
  const store = ls();
  if (!store) return {};
  try {
    return (JSON.parse(store.getItem(OVERRIDES_KEY) ?? '{}') ?? {}) as Record<
      string,
      { priceRub?: number; wastePct?: number }
    >;
  } catch {
    return {};
  }
}

export function persistOverrides(
  o: Record<string, { priceRub?: number; wastePct?: number }>
): void {
  ls()?.setItem(OVERRIDES_KEY, JSON.stringify(o));
}

/** Дебаунс-автосейв одного проекта в список. */
export function upsertProject(list: Project[], project: Project): Project[] {
  const i = list.findIndex((p) => p.meta.id === project.meta.id);
  if (i < 0) return [...list, project];
  const next = [...list];
  next[i] = project;
  return next;
}
