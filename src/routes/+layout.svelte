<script lang="ts">
  import { ArrowLeft } from '@lucide/svelte';
  import './layout.css';
  import favicon from '#lib/assets/favicon.svg';
  import ThemeSwitch from '#lib/ThemeSwitch.svelte';
  import { header } from '../header.svelte.js';

  let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<header
  class="sticky top-0 z-20 border-b border-base-300 bg-base-100/90 backdrop-blur"
>
  <div class="mx-auto flex h-14 w-full max-w-xl items-center gap-1 px-3">
    {#if header.backHref}
      <a
        href={header.backHref}
        class="btn btn-ghost btn-circle btn-sm shrink-0"
        aria-label="Назад к проектам"
      >
        <ArrowLeft size={20} />
      </a>
    {/if}
    <a href="/" class="min-w-0 flex-1 truncate px-1 text-[15px] font-bold"
      >{header.title}</a
    >
    <ThemeSwitch />
  </div>
</header>
{@render children()}
