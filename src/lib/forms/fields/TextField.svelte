<script lang="ts">
  import { useField } from '@formisch/svelte';
  import type { ProjectForm, StringPath } from '#lib/forms/ctx';
  import { ProjectSchema } from '#lib/project/schemas';
  import FieldShell from './FieldShell.svelte';

  let {
    form,
    path,
    label,
    hint = '',
    placeholder = '',
  }: {
    form: ProjectForm;
    path: StringPath;
    label: string;
    hint?: string;
    placeholder?: string;
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
  <input
    {...field.props}
    type="text"
    class="input input-bordered w-full"
    class:input-error={!!error}
    value={field.input ?? ''}
    {placeholder}
  />
</FieldShell>
