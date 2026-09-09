<script lang="ts">
  import { useField } from '@formisch/svelte';
  import type { ProjectForm } from '#lib/forms/ctx';
  import FieldShell from './FieldShell.svelte';

  let {
    form,
    path,
    label,
    hint = '',
    min,
    max,
    step = 1,
  }: {
    form: ProjectForm;
    path: any;
    label: string;
    hint?: string;
    min?: number;
    max?: number;
    step?: number;
  } = $props();

  const field = useField(
    () => form,
    () => ({ path })
  );
  const error = $derived(
    (field.isEdited || form.isSubmitted) && field.errors
      ? (field.errors[0] ?? null)
      : null
  );
  // NaN бывает при промежуточном вводе ("-", "1e") — показываем пусто,
  // в сторе при этом лежит NaN и валидация его подсветит.
  const validNum = $derived(() => {
    const v = field.input as number | undefined;
    return typeof v === 'number' && !Number.isNaN(v) ? v : undefined;
  });
  const display = $derived(validNum());

  function decimals(n: number): number {
    const s = String(n);
    const i = s.indexOf('.');
    return i < 0 ? 0 : s.length - i - 1;
  }

  function clamp(v: number): number {
    let r = v;
    if (min !== undefined) r = Math.max(min, r);
    if (max !== undefined) r = Math.min(max, r);
    // Убираем хвосты float-арифметики (0.1 + 0.05 → 0.15, а не 0.15000001).
    const p = Math.max(decimals(step), decimals(r));
    return Number(r.toFixed(p));
  }

  function nudge(dir: 1 | -1) {
    const base = validNum() ?? min ?? 0;
    field.onInput(clamp(base + dir * step) as never);
  }
</script>

<FieldShell {label} {error} {hint}>
  <div class="flex gap-1.5">
    <button
      type="button"
      class="btn btn-square h-11 w-11 shrink-0 text-xl"
      aria-label="{label}: меньше"
      onclick={() => nudge(-1)}>−</button
    >
    <input
      {...field.props}
      type="number"
      class="input input-bordered h-11 w-full min-w-0 flex-1 text-center"
      class:input-error={!!error}
      value={display}
      inputmode="decimal"
      {min}
      {max}
      {step}
      oninput={(e) =>
        field.onInput(
          e.currentTarget.value === ''
            ? undefined
            : (e.currentTarget.valueAsNumber as number | undefined)
        )}
    />
    <button
      type="button"
      class="btn btn-square h-11 w-11 shrink-0 text-xl"
      aria-label="{label}: больше"
      onclick={() => nudge(1)}>+</button
    >
  </div>
</FieldShell>
