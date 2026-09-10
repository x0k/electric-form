<script lang="ts">
  import { useField } from '@formisch/svelte';
  import type { ProjectForm, StringPath } from '#lib/forms/ctx';
  import { ProjectSchema } from '#lib/project/schemas';
  import FieldShell from './FieldShell.svelte';

  let {
    form,
    path,
    label,
    options,
    hint = '',
  }: {
    form: ProjectForm;
    path: StringPath;
    label: string;
    options: readonly { value: string; label: string; hint?: string }[];
    hint?: string;
  } = $props();

  const field = useField<typeof ProjectSchema, StringPath>(
    () => form,
    () => ({ path })
  );
  const error = $derived(
    (field.isEdited || form.isSubmitted) && field.errors
      ? (field.errors[0] ?? null)
      : null
  );
  const current = $derived(field.input);
  const selectedHint = $derived(
    options.find((o) => o.value === current)?.hint ?? ''
  );
</script>

<FieldShell {label} {error} {hint}>
  <div
    role="radiogroup"
    aria-label={label}
    class="grid gap-2"
    style="grid-template-columns: repeat({options.length}, minmax(0, 1fr));"
  >
    {#each options as o (o.value)}
      <button
        type="button"
        role="radio"
        aria-checked={current === o.value}
        class="btn min-h-11"
        class:btn-primary={current === o.value}
        class:btn-outline={current !== o.value}
        onclick={() => field.onInput(o.value)}
      >
        {o.label}
      </button>
    {/each}
  </div>
  {#if selectedHint && !error}
    <p class="pt-1 text-xs opacity-60">{selectedHint}</p>
  {/if}
</FieldShell>
