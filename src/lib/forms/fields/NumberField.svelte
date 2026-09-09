<script lang="ts">
  import FieldShell from './FieldShell.svelte';

  let {
    label,
    value = $bindable(0),
    error = null,
    hint = '',
    min,
    max,
    step = 1,
    name = undefined as string | undefined,
  }: {
    label: string;
    value: number;
    error?: string | null;
    hint?: string;
    min?: number;
    max?: number;
    step?: number;
    name?: string;
  } = $props();
</script>

<FieldShell {label} {error} {hint}>
  <input
    type="number"
    class="input input-bordered w-full"
    class:input-error={!!error}
    bind:value
    {min}
    {max}
    {step}
    {name}
  />
</FieldShell>
