<script lang="ts">
  import FieldShell from './FieldShell.svelte';

  let {
    label,
    value = $bindable(''),
    options,
    error = null,
    hint = '',
  }: {
    label: string;
    value: string;
    options: readonly { value: string; label: string }[];
    error?: string | null;
    hint?: string;
  } = $props();
</script>

<FieldShell {label} {error} {hint}>
  <select
    class="select select-bordered w-full"
    class:select-error={!!error}
    bind:value
  >
    {#each options as o (o.value)}
      <option value={o.value}>{o.label}</option>
    {/each}
  </select>
</FieldShell>
