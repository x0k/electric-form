import { command, query } from '$app/server';
import { error } from '@sveltejs/kit';
import * as v from 'valibot';
import { ProjectSchema } from '#lib/project/schemas';
import { getDb } from '#lib/server/db/client';
import {
  createProject,
  deleteProject,
  duplicateProject,
  ensureProject,
  exportProjects,
  importProjects,
  listProjects,
  saveProject,
} from '#lib/server/db/projects';

const idSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(128));

export const getProjectList = query(async () => {
  return listProjects(getDb());
});

/** Чтение с get-or-create: страница p/[id] ждёт его прямо в разметке. */
export const getProject = query(idSchema, async (id) => {
  return ensureProject(getDb(), id);
});

export const exportAllProjects = query(async () => {
  return exportProjects(getDb());
});

export const createNewProject = command(
  v.object({ name: v.pipe(v.string(), v.maxLength(200)) }),
  async ({ name }) => {
    const p = await createProject(getDb(), name);
    // Single-flight: обновлённый список едет обратно вместе с ответом.
    void getProjectList().refresh();
    return p;
  }
);

export const persistProject = command(ProjectSchema, async (p) => {
  const saved = await saveProject(getDb(), p);
  // Список показывает имя/площадь — его обновляем. Сам проект не
  // рефрешим: редактор и так владеет актуальным состоянием, иначе
  // каждый автосейв заново саспендил бы страницу.
  void getProjectList().refresh();
  return saved;
});

export const duplicateProjectById = command(idSchema, async (id) => {
  const copy = await duplicateProject(getDb(), id);
  if (!copy) throw error(400, 'Проект не найден');
  void getProjectList().refresh();
  return copy;
});

export const deleteProjectById = command(idSchema, async (id) => {
  await deleteProject(getDb(), id);
  void getProjectList().refresh();
});

/** Импорт из JSON-файла: битые записи пропускаются. */
export const importProjectsJson = command(v.string(), async (json) => {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw error(400, 'Не удалось прочитать файл');
  }
  const arr = Array.isArray(raw) ? raw : [raw];
  try {
    const n = await importProjects(getDb(), arr);
    void getProjectList().refresh();
    return n;
  } catch (e) {
    throw error(400, e instanceof Error ? e.message : 'Импорт не удался');
  }
});
