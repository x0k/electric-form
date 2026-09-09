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
  const display = $derived(() => {
    const v = field.input as number | undefined;
    return typeof v === 'number' && Number.isNaN(v) ? undefined : v;
  });
</script>

<FieldShell {label} {error} {hint}>
  <input
    {...field.props}
    type="number"
    class="input input-bordered h-11 w-full"
    class:input-error={!!error}
    value={display()}
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
</FieldShell>
