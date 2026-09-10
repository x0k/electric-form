<script lang="ts">
  import { Monitor, Moon, Sun } from '@lucide/svelte';

  import { THEMES, THEME_TITLES, Theme } from '#lib/theme.js';
  import { themeManager } from '../theme.svelte.js';

  const ICONS = {
    [Theme.System]: Monitor,
    [Theme.Light]: Sun,
    [Theme.Dark]: Moon,
  };
</script>

<div
  class="flex items-center gap-0.5"
  role="group"
  aria-label="Тема оформления"
>
  {#each THEMES as t (t)}
    {@const Icon = ICONS[t]}
    {@const active = themeManager.theme === t}
    <button
      class="btn btn-circle btn-sm"
      class:btn-neutral={active}
      class:btn-ghost={!active}
      title={THEME_TITLES[t]}
      aria-label={THEME_TITLES[t]}
      aria-pressed={active}
      onclick={() => (themeManager.theme = t)}
    >
      <Icon size={17} />
    </button>
  {/each}
</div>
