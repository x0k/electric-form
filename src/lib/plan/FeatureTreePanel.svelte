<script lang="ts">
  import { Layers, Box, PencilLine } from '@lucide/svelte';
  import type { Feature } from './history';
  import { stageLabel } from './history';

  interface Props {
    features: Feature[];
    previewIndex: number | null;
    onTogglePreview: (index: number) => void;
    onEditLayout: () => void;
  }

  let { features, previewIndex, onTogglePreview, onEditLayout }: Props =
    $props();
</script>

<section class="rounded-box bg-base-200 p-3 text-sm shadow-xl">
  <h2 class="mb-1 flex items-center gap-1 font-semibold">
    <Layers size={16} /> Feature Tree
  </h2>
  <ul class="menu w-full rounded-box bg-base-100 p-1">
    {#each features as f (f.id)}
      <li>
        <button
          data-testid="feature-item"
          data-index={f.index}
          class:active={previewIndex === f.index}
          onclick={() => onTogglePreview(f.index)}
        >
          <Box size={14} />
          <span class="font-mono text-xs">#{f.index + 1}</span>
          <span class="text-xs">{f.label}</span>
          <span class="badge badge-xs opacity-70">{stageLabel(f.stage)}</span>
          <span class="text-xs opacity-60">{f.ops.length} оп.</span>
        </button>
      </li>
    {/each}
  </ul>
  <button
    class="btn btn-sm mt-2 w-full"
    data-testid="edit-layout"
    onclick={onEditLayout}
  >
    <PencilLine size={14} /> Изменить контур
  </button>
</section>
