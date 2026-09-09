import { createForm } from '@formisch/svelte';
import { ProjectSchema } from '#lib/project/schemas';
import type { Project } from '#lib/project/types';

/** Форма редактора проекта. Один стор на страницу p/[id]. */
export function createProjectForm(project: Project) {
  return createForm({
    schema: ProjectSchema,
    initialInput: project,
    // Показываем ошибку после первого изменения, дальше — live.
    validate: 'change',
    revalidate: 'input',
  });
}

export type ProjectForm = ReturnType<typeof createProjectForm>;
