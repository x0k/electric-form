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
    options: readonly { value: string; label: string }[];
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
</script>

<FieldShell {label} {error} {hint}>
  <select
    {...field.props}
    class="select select-bordered w-full"
    class:select-error={!!error}
    value={field.input ?? ''}
  >
    {#each options as o (o.value)}
      <option value={o.value}>{o.label}</option>
    {/each}
  </select>
</FieldShell>
