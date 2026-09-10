import { createForm } from '@formisch/svelte';
import * as v from 'valibot';
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

/** Вход схемы — тип, по которому formisch вычисляет пути и значения полей. */
export type ProjectInput = v.InferInput<typeof ProjectSchema>;

/**
 * Объединение всех путей в T, ведущих к значению типа V.
 * Массивы проходятся через числовой индекс
 * (['power', 'consumers', number, 'qty']).
 */
type Drill<T, V, P extends readonly (string | number)[]> =
  | (T extends V
      ? P extends readonly [string | number, ...(string | number)[]]
        ? P
        : never
      : never)
  | (T extends readonly (infer I)[]
      ? Drill<I, V, readonly [...P, number]>
      : never)
  | (T extends readonly unknown[]
      ? never
      : T extends Record<string, unknown>
        ? {
            [K in Extract<keyof T, string | number>]: Drill<
              T[K],
              V,
              readonly [...P, K]
            >;
          }[Extract<keyof T, string | number>]
        : never);

export type PathsFor<T, V> = Drill<T, V, []>;

/** Пути числовых полей (площади, количества, номиналы). */
export type NumberPath = PathsFor<ProjectInput, number>;
/** Пути строковых полей (название, стадии, фазы). */
export type StringPath = PathsFor<ProjectInput, string>;
/** Пути булевых полей (галки, опции щита). */
export type BooleanPath = PathsFor<ProjectInput, boolean>;
