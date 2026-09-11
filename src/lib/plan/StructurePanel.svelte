<script lang="ts">
  import { Boxes } from '@lucide/svelte';
  import type { RenderScene, RenderSlabPoly, RenderWallBox } from './render';
  import { polygonAreaMm2 } from './geometry';

  /**
   * Блок конструкции (не часть Feature Tree): стены и плиты
   * + карточка информации по выделению.
   */

  interface Props {
    scene: RenderScene;
    selectedId: string | null;
    onSelectEntity: (id: string) => void;
  }

  let { scene, selectedId, onSelectEntity }: Props = $props();

  const walls: RenderWallBox[] = $derived(scene.walls);
  const slabs: RenderSlabPoly[] = $derived(scene.slabs);
  const selectedWall = $derived(walls.find((w) => w.id === selectedId) ?? null);
  const selectedSlab = $derived(slabs.find((s) => s.id === selectedId) ?? null);

  function slabLabel(s: RenderSlabPoly): string {
    return s.kind === 'floor' ? 'Пол' : 'Потолок';
  }
</script>

<section class="rounded-box bg-base-200 p-3 text-sm shadow-xl">
  <h2 class="mb-1 flex items-center gap-1 font-semibold">
    <Boxes size={16} /> Конструкция ({walls.length + slabs.length})
  </h2>
  <ul class="menu w-full rounded-box bg-base-100 p-1">
    {#each walls as w (w.id)}
      <li>
        <button
          data-testid="object-item"
          data-id={w.id}
          class:active={selectedId === w.id}
          onclick={() => onSelectEntity(w.id)}
        >
          <span class="font-mono text-xs">{w.id}</span>
          <span class="text-xs opacity-70">
            Стена {(w.lengthMm / 1000).toFixed(1)} м
          </span>
        </button>
      </li>
    {/each}
    {#each slabs as s (s.id)}
      <li>
        <button
          data-testid="object-item"
          data-id={s.id}
          class:active={selectedId === s.id}
          onclick={() => onSelectEntity(s.id)}
        >
          <span class="font-mono text-xs">{s.id}</span>
          <span class="text-xs opacity-70">{slabLabel(s)}</span>
        </button>
      </li>
    {/each}
  </ul>
  {#if selectedWall}
    {@const w = selectedWall}
    <div
      class="mt-2 rounded-box bg-base-100 p-2 text-xs"
      data-testid="wall-info"
    >
      <p class="font-mono font-semibold">{w.id}</p>
      <p>Длина (по контуру): {(w.lengthMm / 1000).toFixed(1)} м</p>
      <p>Толщина: {w.thicknessMm} мм</p>
      <p>Высота: {(w.heightMm / 1000).toFixed(2)} м</p>
    </div>
  {:else if selectedSlab}
    {@const s = selectedSlab}
    <div
      class="mt-2 rounded-box bg-base-100 p-2 text-xs"
      data-testid="wall-info"
    >
      <p class="font-mono font-semibold">{s.id}</p>
      <p>{slabLabel(s)}</p>
      <p>Площадь: {(polygonAreaMm2(s.points) / 1_000_000).toFixed(1)} м²</p>
      <p>Уровень: {(s.levelMm / 1000).toFixed(2)} м</p>
    </div>
  {/if}
</section>
