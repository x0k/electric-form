<script lang="ts">
  import { onMount } from 'svelte';
  import './layout.css';
  import favicon from '#lib/assets/favicon.svg';
  import { ensureGcsLoaded } from '#lib/plan/gcs';

  let { children } = $props();

  // Численный решатель греем фоном: к первому клику в скетче готов.
  onMount(() => {
    ensureGcsLoaded().catch(() => {
      // Ошибка всплывёт честно при первом solve (SketchEditor ждёт готовности).
    });
  });
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
{@render children()}
