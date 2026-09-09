<script lang="ts">
  import { useField } from '@formisch/svelte';
  import type { ProjectForm } from '#lib/forms/ctx';
  import FieldShell from './FieldShell.svelte';

  let {
    form,
    path,
    label,
    options,
    hint = '',
  }: {
    form: ProjectForm;
    path: any;
    label: string;
    options: readonly { value: string; label: string }[];
    hint?: string;
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
</script>

<FieldShell {label} {error} {hint}>
  <select
    {...field.props}
    class="select select-bordered w-full"
    class:select-error={!!error}
    value={(field.input as string | undefined) ?? ''}
  >
    {#each options as o (o.value)}
      <option value={o.value}>{o.label}</option>
    {/each}
  </select>
</FieldShell>
