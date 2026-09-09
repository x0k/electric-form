<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    label,
    error = null,
    hint = '',
    badge = '',
    children,
  }: {
    label: string;
    error?: string | null;
    hint?: string;
    badge?: string;
    children: Snippet;
  } = $props();
</script>

<div class="form-control w-full">
  <span class="label-text py-1 font-medium"
    >{label}{#if badge}
      <span
        class="badge badge-ghost badge-xs ml-1 align-middle"
        title="Посчитано автоматически из введённых данных — измените при нужде"
        >{badge}</span
      >{/if}</span
  >
  {@render children()}
  {#if hint && !error}
    <span class="label-text-alt py-0.5 opacity-60">{hint}</span>
  {/if}
  {#if error}
    <span class="label-text-alt py-0.5 text-error">{error}</span>
  {/if}
</div>
