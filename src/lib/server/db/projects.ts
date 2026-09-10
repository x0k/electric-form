import { desc, eq } from 'drizzle-orm';
import { parseProject } from '#lib/project/validate';
import { createDefaultProject, nowIso, uid } from '#lib/project/defaults';
import type { Project } from '#lib/project/types';
import type { Db } from './client';
import { projects } from './schema';

export interface ProjectSummary {
  id: string;
  name: string;
  areaM2: number;
  rooms: number;
  bathrooms: number;
  updatedAt: string;
}

function toSummary(p: Project): ProjectSummary {
  return {
    id: p.meta.id,
    name: p.meta.name,
    areaM2: p.general.areaM2,
    rooms: p.general.rooms,
    bathrooms: p.general.bathrooms,
    updatedAt: p.meta.updatedAt,
  };
}

/** Битые записи пропускаем, как раньше делал localStorage-слой. */
function tryParse(data: string): Project | null {
  try {
    const parsed = parseProject(JSON.parse(data));
    return parsed.ok ? parsed.project : null;
  } catch {
    return null;
  }
}

export async function listProjects(db: Db): Promise<ProjectSummary[]> {
  const rows = await db
    .select()
    .from(projects)
    .orderBy(desc(projects.updatedAt));
  const out: ProjectSummary[] = [];
  for (const r of rows) {
    const p = tryParse(r.data);
    if (p) out.push(toSummary(p));
  }
  return out;
}

export async function getProject(db: Db, id: string): Promise<Project | null> {
  const rows = await db.select().from(projects).where(eq(projects.id, id));
  if (rows.length === 0) return null;
  return tryParse(rows[0].data);
}

/** Взять существующий или создать дефолтный с заданным id (для p/[id]). */
export async function ensureProject(db: Db, id: string): Promise<Project> {
  const found = await getProject(db, id);
  if (found) return found;
  const p = createDefaultProject('Новая квартира');
  p.meta.id = id;
  await insertProject(db, p);
  return p;
}

export async function createProject(db: Db, name: string): Promise<Project> {
  const p = createDefaultProject(name.trim() || 'Новая квартира');
  await insertProject(db, p);
  return p;
}

async function insertProject(db: Db, p: Project): Promise<void> {
  await db.insert(projects).values({
    id: p.meta.id,
    name: p.meta.name,
    data: JSON.stringify(p),
    createdAt: p.meta.createdAt,
    updatedAt: p.meta.updatedAt,
  });
}

export async function saveProject(db: Db, p: Project): Promise<Project> {
  const stamped: Project = {
    ...p,
    meta: { ...p.meta, updatedAt: nowIso() },
  };
  await db
    .insert(projects)
    .values({
      id: stamped.meta.id,
      name: stamped.meta.name,
      data: JSON.stringify(stamped),
      createdAt: stamped.meta.createdAt,
      updatedAt: stamped.meta.updatedAt,
    })
    .onConflictDoUpdate({
      target: projects.id,
      set: {
        name: stamped.meta.name,
        data: JSON.stringify(stamped),
        updatedAt: stamped.meta.updatedAt,
      },
    });
  return stamped;
}

export async function duplicateProject(
  db: Db,
  id: string
): Promise<Project | null> {
  const src = await getProject(db, id);
  if (!src) return null;
  const copy: Project = JSON.parse(JSON.stringify(src)) as Project;
  copy.meta.id = uid();
  copy.meta.name = `${src.meta.name} (копия)`;
  const ts = nowIso();
  copy.meta.createdAt = ts;
  copy.meta.updatedAt = ts;
  await insertProject(db, copy);
  return copy;
}

export async function deleteProject(db: Db, id: string): Promise<void> {
  await db.delete(projects).where(eq(projects.id, id));
}

export async function exportProjects(db: Db): Promise<Project[]> {
  const rows = await db
    .select()
    .from(projects)
    .orderBy(desc(projects.updatedAt));
  const out: Project[] = [];
  for (const r of rows) {
    const p = tryParse(r.data);
    if (p) out.push(p);
  }
  return out;
}

/**
 * Импорт списка: битые записи пропускаются, существующие id перезаписываются.
 * Возвращает число импортированных.
 */
export async function importProjects(
  db: Db,
  items: unknown[]
): Promise<number> {
  let n = 0;
  for (const x of items) {
    const parsed = parseProject(x);
    if (!parsed.ok) continue;
    await saveProject(db, parsed.project);
    n++;
  }
  if (items.length > 0 && n === 0)
    throw new Error('В файле нет валидных проектов');
  return n;
}
