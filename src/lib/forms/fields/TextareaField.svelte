<script lang="ts">
  import { useField } from '@formisch/svelte';
  import type { ProjectForm } from '#lib/forms/ctx';
  import FieldShell from './FieldShell.svelte';

  let {
    form,
    path,
    label,
    hint = '',
    rows = 2,
  }: {
    form: ProjectForm;
    path: any;
    label: string;
    hint?: string;
    rows?: number;
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
  <textarea
    {...field.props}
    class="textarea textarea-bordered w-full"
    class:textarea-error={!!error}
    {rows}
    value={(field.input as string | undefined) ?? ''}></textarea>
</FieldShell>
