<script lang="ts">
  import { onMount } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import {
    focus,
    getDeepErrorEntries,
    getInput,
    reset,
    validate,
  } from '@formisch/svelte';
  import type { DeepErrorEntry } from '@formisch/svelte';
  import * as v from 'valibot';
  import { calculate } from '#lib/calc/engine';
  import { calcSavings } from '#lib/calc/savings';
  import {
    SEED_CATALOG,
    applyOverrides,
    type OverrideMap,
  } from '#lib/catalog/index';
  import { loadOverrides } from '#lib/storage/repo';
  import { createProjectForm } from '#lib/forms/ctx';
  import type { ProjectInput } from '#lib/forms/ctx';
  import { applyDerivedFields, deriveKey } from '#lib/forms/derived';
  import { STEPS } from '#lib/forms/steps';
  import { ProjectSchema } from '#lib/project/schemas';
  import type { Project } from '#lib/project/types';
  import GeneralStep from './steps/GeneralStep.svelte';
  import LightingStep from './steps/LightingStep.svelte';
  import LowVoltageStep from './steps/LowVoltageStep.svelte';
  import PanelStep from './steps/PanelStep.svelte';
  import PowerStep from './steps/PowerStep.svelte';
  import SensorsStep from './steps/SensorsStep.svelte';
  import WorkStep from './steps/WorkStep.svelte';
  import ResultView from './result/ResultView.svelte';
  import StepsMenu from './nav/StepsMenu.svelte';
  import WizardBar from './nav/WizardBar.svelte';

  let { project, onsave }: { project: Project; onsave: (p: Project) => void } =
    $props();

  // Formisch — единственный источник правды. Черновика нет:
  // ввод, touched/edited, ошибки живут в сторе, превью и автосейв
  // читают распарсенный выход схемы.
  const form = createProjectForm(project);
  let lastValid = $state<Project>(project);

  // Переход на другой проект (p/[id]) — перебазируем стор.
  let currentId = $state(project.meta.id);
  let prevDerivedKey = $state<string | null>(null);
  $effect(() => {
    if (project.meta.id !== currentId) {
      currentId = project.meta.id;
      lastValid = project;
      prevDerivedKey = null;
      reset(form, { initialInput: project });
    }
  });

  let step = $state(0);
  // Свободная навигация: этапы не блокируются, состояние видно по бейджам.
  let visited = new SvelteSet<number>([0]);
  let stepErrCounts = $state<number[]>(STEPS.map(() => 0));
  let allErrors = $state<ErrorItem[]>([]);
  let validatedOnce = $state(false);
  let saved = $state(true);

  // Пользовательские цены/запасы поверх seed-каталога (редактор /catalog).
  let overrides = $state<OverrideMap>({});
  onMount(() => {
    overrides = loadOverrides();
  });
  const catalog = $derived(applyOverrides(SEED_CATALOG, overrides));
  const overriddenCount = $derived(Object.keys(overrides).length);

  // Живой ввод из стора. Во время некорректного промежуточного ввода
  // (пустое число → undefined/NaN) парсинг падает — превью держится
  // на последнем валидном, стор при этом хранит черновик и ошибки.
  const liveInput = $derived(getInput(form));
  const parsed = $derived(v.safeParse(ProjectSchema, liveInput));
  $effect(() => {
    if (parsed.success) lastValid = parsed.output;
  });
  const view: Project = $derived(parsed.success ? parsed.output : lastValid);

  // Производные поля (группы света, двери, ТВ/инет): пересчитываем из
  // введённых данных, пока поле не тронуто вручную. Первый прогон после
  // загрузки только запоминает ключ — чужие сохранённые значения не трогаем.
  $effect(() => {
    const key = deriveKey(view.general);
    if (prevDerivedKey === null) {
      prevDerivedKey = key;
      return;
    }
    if (key === prevDerivedKey) return;
    prevDerivedKey = key;
    applyDerivedFields(form, view);
  });

  // Автосейв (дебаунс): валидируем стор, сохраняем только выход схемы.
  let timer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    void liveInput;
    saved = false;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const res = await validate(form);
      if (res.success) {
        lastValid = res.output;
        onsave(res.output);
        saved = true;
      }
    }, 600);
    return () => clearTimeout(timer);
  });

  const result = $derived(calculate(view, catalog));
  const savings = $derived(calcSavings(view, catalog));

  function entriesFor(
    stepIdx: number,
    entries: DeepErrorEntry<ProjectInput>[]
  ): number {
    const paths = STEPS[stepIdx]?.paths ?? [];
    return entries.filter((e) => {
      const segs: readonly (string | number)[] = e.path;
      return paths.some((prefix) =>
        prefix.every((s, i) => String(segs[i]) === s)
      );
    }).length;
  }

  interface ErrorItem {
    label: string;
    message: string;
    target: DeepErrorEntry<ProjectInput>['path'];
  }

  async function refreshValidation() {
    await validate(form);
    const entries = getDeepErrorEntries(form);
    stepErrCounts = STEPS.map((_, i) => entriesFor(i, entries));
    allErrors = entries.map((e) => {
      const segs: readonly (string | number)[] = e.path;
      return {
        label: segs.join('.') || '—',
        message: e.errors[0] ?? 'ошибка',
        target: e.path,
      };
    });
    validatedOnce = true;
  }

  /** Свободный переход; на «Итоге» всегда обновляем статусы валидации. */
  async function go(to: number) {
    const clamped = Math.max(0, Math.min(STEPS.length - 1, to));
    step = clamped;
    visited.add(clamped);
    if (STEPS[clamped]?.id === 'result') await refreshValidation();
  }

  const doneCount = $derived(
    STEPS.filter(
      (_, i) => visited.has(i) && !(validatedOnce && stepErrCounts[i] > 0)
    ).length
  );
  const totalErrors = $derived(stepErrCounts.reduce((a, n) => a + n, 0));

  let menuOpen = $state(false);

  async function goAndClose(to: number) {
    menuOpen = false;
    await go(to);
  }

  type ErrorPath = DeepErrorEntry<ProjectInput>['path'];

  function focusError(target: ErrorPath) {
    // Пустой путь — ошибка уровня формы, фокусировать нечего.
    if (target.length === 0) return;
    try {
      focus<typeof ProjectSchema, Exclude<ErrorPath, readonly []>>(form, {
        path: target,
      });
    } catch {
      // ignore: путь мог устареть
    }
  }
</script>

<div class="drawer drawer-end">
  <input
    id="steps-drawer"
    type="checkbox"
    class="drawer-toggle"
    bind:checked={menuOpen}
  />
  <div class="drawer-content">
    <div class="mx-auto w-full max-w-xl px-3 pt-3 pb-28">
      <a class="link link-hover text-sm opacity-70" href="/">← Проекты</a>
      <div class="mt-1 flex items-center gap-2">
        <h1 class="min-w-0 flex-1 truncate text-lg font-bold">
          {view.meta.name}
        </h1>
        <span class="badge badge-ghost badge-sm shrink-0"
          >{saved ? 'сохранено' : '…'}</span
        >
      </div>
      <div class="mt-1 flex items-center gap-2 text-xs opacity-60">
        <span class="tabular-nums"
          >{STEPS[step].title} · {step + 1}/{STEPS.length}</span
        >
        <progress
          class="progress progress-primary h-1 flex-1"
          value={doneCount}
          max={STEPS.length}
          aria-label="Заполнено этапов: {doneCount} из {STEPS.length}"
        ></progress>
      </div>

      {#if STEPS[step].id === 'result' && validatedOnce && totalErrors > 0}
        <div class="alert alert-error mt-3 text-sm">
          <ul>
            {#each allErrors as e (e.label + e.message)}
              <li>
                <button
                  class="link link-hover font-mono"
                  onclick={() => focusError(e.target)}><b>{e.label}</b></button
                >: {e.message}
              </li>
            {/each}
          </ul>
        </div>
      {/if}

      <div class="card mt-3 bg-base-200 p-3">
        {#if STEPS[step].id === 'general'}
          <GeneralStep {form} {view} />
        {:else if STEPS[step].id === 'power'}
          <PowerStep {form} {view} />
        {:else if STEPS[step].id === 'lowvoltage'}
          <LowVoltageStep {form} {view} />
        {:else if STEPS[step].id === 'lighting'}
          <LightingStep {form} {view} />
        {:else if STEPS[step].id === 'sensors'}
          <SensorsStep {form} {view} />
        {:else if STEPS[step].id === 'panel'}
          <PanelStep {form} {view} />
        {:else}
          <details class="collapse-arrow bg-base-100 collapse mb-3">
            <summary class="collapse-title font-medium"
              >Настройки сроков</summary
            >
            <div class="collapse-content">
              <WorkStep {form} />
            </div>
          </details>
          <ResultView {form} {view} {result} {savings} {overriddenCount} />
        {/if}
      </div>
    </div>

    <WizardBar {step} onPrev={() => go(step - 1)} onNext={() => go(step + 1)} />
  </div>

  <StepsMenu
    {step}
    {stepErrCounts}
    {validatedOnce}
    {visited}
    {doneCount}
    onSelect={(i) => goAndClose(i)}
    onShowResult={() => goAndClose(STEPS.length - 1)}
  />
</div>
