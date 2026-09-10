<script lang="ts">
  import { ArrowLeft } from '@lucide/svelte';
  import ThemeSwitch from './ThemeSwitch.svelte';

  let {
    title,
    backHref = null,
  }: {
    title: string;
    backHref?: string | null;
  } = $props();
</script>

<header
  class="sticky top-0 z-20 border-b border-base-300 bg-base-100/90 backdrop-blur"
>
  <div class="mx-auto flex h-14 w-full max-w-xl items-center gap-1 px-3">
    {#if backHref}
      <a
        href={backHref}
        class="btn btn-ghost btn-circle btn-sm shrink-0"
        aria-label="Назад к проектам"
      >
        <ArrowLeft size={20} />
      </a>
    {/if}
    <a href="/" class="min-w-0 flex-1 truncate px-1 text-[15px] font-bold"
      >{title}</a
    >
    <ThemeSwitch />
  </div>
</header>
