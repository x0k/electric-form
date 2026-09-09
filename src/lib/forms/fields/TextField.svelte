<script lang="ts">
  import FieldShell from './FieldShell.svelte';

  let {
    label,
    value = $bindable(''),
    error = null,
    hint = '',
    placeholder = '',
    name = undefined as string | undefined,
  }: {
    label: string;
    value: string;
    error?: string | null;
    hint?: string;
    placeholder?: string;
    name?: string;
  } = $props();
</script>

<FieldShell {label} {error} {hint}>
  <input
    type="text"
    class="input input-bordered w-full"
    class:input-error={!!error}
    bind:value
    {placeholder}
    {name}
  />
</FieldShell>
