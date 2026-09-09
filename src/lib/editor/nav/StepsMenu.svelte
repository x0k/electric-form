<script lang="ts">
  import { STEPS } from '#lib/forms/steps';

  type StepStatus = 'current' | 'error' | 'done' | 'todo';

  let {
    step,
    stepErrCounts,
    validatedOnce,
    visited,
    doneCount,
    onSelect,
    onShowResult,
  }: {
    step: number;
    stepErrCounts: number[];
    validatedOnce: boolean;
    visited: ReadonlySet<number>;
    doneCount: number;
    onSelect: (i: number) => void;
    onShowResult: () => void;
  } = $props();

  function status(i: number): StepStatus {
    if (i === step) return 'current';
    if (validatedOnce && (stepErrCounts[i] ?? 0) > 0) return 'error';
    if (visited.has(i)) return 'done';
    return 'todo';
  }

  function hasErrors(i: number): boolean {
    return validatedOnce && (stepErrCounts[i] ?? 0) > 0;
  }

  function label(i: number): string {
    if (hasErrors(i)) return `ошибок: ${stepErrCounts[i]}`;
    if (status(i) === 'done') return 'заполнен';
    if (i === step) return 'текущий';
    return 'не заполнен';
  }
</script>

<!-- Боковое меню этапов -->
<div class="drawer-side z-30">
  <label
    for="steps-drawer"
    aria-label="Закрыть меню этапов"
    class="drawer-overlay"
  ></label>
  <div class="flex min-h-full w-80 max-w-[85vw] flex-col bg-base-200 p-3">
    <div class="flex items-center gap-2 px-1">
      <h2 class="flex-1 text-lg font-bold">Этапы</h2>
      <span class="text-xs opacity-60 tabular-nums"
        >{doneCount}/{STEPS.length}</span
      >
      <label
        for="steps-drawer"
        class="btn btn-ghost btn-sm"
        aria-label="Закрыть">✕</label
      >
    </div>
    <progress
      class="progress progress-primary mt-2 h-1 w-full"
      value={doneCount}
      max={STEPS.length}
    ></progress>
    <ul class="menu mt-2 flex-1 gap-1 p-0">
      {#each STEPS as s, i (s.id)}
        {@const st = status(i)}
        <li>
          <button
            class="min-h-14 items-center gap-3 rounded-xl px-3 py-2 text-left active:scale-[0.99]"
            class:bg-primary={st === 'current' && !hasErrors(i)}
            class:text-primary-content={st === 'current' && !hasErrors(i)}
            class:bg-error={st === 'current' && hasErrors(i)}
            class:text-error-content={st === 'current' && hasErrors(i)}
            class:border-error={st === 'error'}
            class:border={st === 'error'}
            aria-current={i === step ? 'step' : undefined}
            onclick={() => onSelect(i)}
          >
            {#if hasErrors(i)}
              <span class="badge badge-error shrink-0">{stepErrCounts[i]}</span>
            {:else if st === 'done'}
              <span class="badge badge-success shrink-0">✓</span>
            {:else}
              <span class="badge badge-ghost shrink-0">{i + 1}</span>
            {/if}
            <span class="min-w-0 flex-1">
              <span class="block font-medium">{s.title}</span>
              <span class="block text-xs opacity-60">
                {label(i)}
              </span>
            </span>
            <span aria-hidden="true" class="shrink-0 opacity-50">›</span>
          </button>
        </li>
      {/each}
    </ul>
    <button class="btn btn-primary mt-2 w-full" onclick={onShowResult}
      >Показать итог →</button
    >
  </div>
</div>
