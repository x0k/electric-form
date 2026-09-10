<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    label,
    error = null,
    hint = '',
    children,
  }: {
    label: string;
    error?: string | null;
    hint?: string;
    children: Snippet;
  } = $props();
</script>

<div class="form-control w-full">
  <span class="label-text py-1 font-medium">{label}</span>
  {@render children()}
  {#if hint && !error}
    <span class="label-text-alt py-0.5 opacity-60">{hint}</span>
  {/if}
  {#if error}
    <span class="label-text-alt py-0.5 text-error">{error}</span>
  {/if}
</div>
