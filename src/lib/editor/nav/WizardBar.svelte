<script lang="ts">
  import { STEPS } from '#lib/forms/steps';

  let {
    step,
    onPrev,
    onNext,
  }: {
    step: number;
    onPrev: () => void;
    onNext: () => void;
  } = $props();

  const isLast = $derived(step >= STEPS.length - 1);
</script>

<!-- Компактная нижняя навигация: назад / далее / меню -->
<div
  class="fixed inset-x-0 bottom-0 z-10 border-t border-base-300 bg-base-100/95 backdrop-blur"
>
  <div
    class="mx-auto flex w-full max-w-xl items-center gap-2 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
  >
    <button
      class="btn btn-square shrink-0"
      disabled={step === 0}
      aria-label="Предыдущий этап"
      onclick={onPrev}>←</button
    >
    {#if !isLast}
      <button
        class="btn btn-primary h-12 min-w-0 flex-1 justify-between"
        onclick={onNext}
      >
        <span class="min-w-0 flex-1 truncate text-left">
          {`Далее: ${STEPS[step + 1].title}`}
        </span>
        <span aria-hidden="true">→</span>
      </button>
    {/if}
    <label
      for="steps-drawer"
      class="btn btn-square shrink-0 tabular-nums"
      aria-label="Все этапы"
    >
      {step + 1}/{STEPS.length}
    </label>
  </div>
</div>
