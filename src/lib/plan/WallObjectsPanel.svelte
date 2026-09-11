<script lang="ts">
  import { Refrigerator } from '@lucide/svelte';
  import type { Operation } from './operations';
  import type { WallObject } from './furnish';

  /**
   * Список навесных: высота подвеса + удаление.
   * Ставится кликом по стене, along правится перетаскиванием.
   */

  interface Props {
    objects: WallObject[];
    onOp: (op: Operation) => void;
  }

  let { objects, onOp }: Props = $props();
</script>

<section
  class="rounded-box bg-base-200 p-3 text-sm shadow-xl"
  data-testid="wallobj-panel"
>
  <h2 class="mb-1 flex items-center gap-1 font-semibold">
    <Refrigerator size={16} /> Навесные объекты
    <span class="badge badge-sm ml-1">{objects.length}</span>
  </h2>
  <p class="mb-2 text-xs opacity-70">
    Клик по стене — повесить, drag вдоль стены — двигать. Высота — ниже.
  </p>
  <ul class="menu w-full rounded-box bg-base-100 p-1">
    {#each objects as o (o.id)}
      <li>
        <div class="flex flex-col gap-1 py-1">
          <div class="flex items-center gap-1">
            <span class="font-mono text-xs">{o.id}</span>
            <span class="text-xs"
              >{o.label} · {o.anchor.wallId} · along {o.anchor.alongMm}</span
            >
            <button
              class="btn btn-xs btn-ghost ml-auto"
              data-testid="wallobj-del"
              data-id={o.id}
              onclick={() => onOp({ type: 'removeWallObject', objectId: o.id })}
              >✕</button
            >
          </div>
          <label class="flex items-center gap-1 text-xs"
            >Высота низа, мм<input
              type="number"
              class="input input-xs input-bordered w-full"
              step="10"
              min="0"
              value={o.anchor.heightMm}
              data-testid="wallobj-h"
              data-id={o.id}
              onchange={(e) =>
                onOp({
                  type: 'updateWallObject',
                  objectId: o.id,
                  anchor: {
                    ...o.anchor,
                    heightMm: Number(e.currentTarget.value),
                  },
                })}
            /></label
          >
        </div>
      </li>
    {/each}
  </ul>
</section>
