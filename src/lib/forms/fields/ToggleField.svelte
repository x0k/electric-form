<script lang="ts">
  import { useField } from '@formisch/svelte';
  import type { BooleanPath, ProjectForm } from '#lib/forms/ctx';
  import { ProjectSchema } from '#lib/project/schemas';

  let {
    form,
    path,
    label,
    hint = '',
  }: {
    form: ProjectForm;
    path: BooleanPath;
    label: string;
    hint?: string;
  } = $props();

  const field = useField<typeof ProjectSchema, BooleanPath>(
    () => form,
    () => ({ path })
  );
  const error = $derived(
    (field.isEdited || form.isSubmitted) && field.errors
      ? (field.errors[0] ?? null)
      : null
  );
</script>

<div class="form-control">
  <label class="label min-h-12 cursor-pointer justify-start gap-3">
    <input
      {...field.props}
      type="checkbox"
      class="toggle toggle-primary"
      class:toggle-error={!!error}
      checked={!!field.input}
      oninput={(e) => field.onInput(e.currentTarget.checked)}
    />
    <span class="label-text">{label}</span>
  </label>
  {#if hint && !error}
    <p class="pl-1 text-xs opacity-60">{hint}</p>
  {/if}
  {#if error}
    <p class="pl-1 text-xs text-error">{error}</p>
  {/if}
</div>
