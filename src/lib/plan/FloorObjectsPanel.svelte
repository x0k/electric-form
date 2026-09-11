<script lang="ts">
  import { Sofa } from '@lucide/svelte';
  import type { Operation } from './operations';
  import type { FloorObject } from './furnish';

  /**
   * Список напольных объектов: габариты + удаление.
   * Ставится кликом (по стене — вплотную, по полу — в помещение),
   * двигается перетаскиванием. Якорь следует из позиции на канвасе.
   */

  interface Props {
    objects: FloorObject[];
    onOp: (op: Operation) => void;
  }

  let { objects, onOp }: Props = $props();

  function anchorText(o: FloorObject): string {
    const a = o.anchor;
    if (a.type === 'wall')
      return `${a.wallId} · ${a.alongMm}/${a.fromWallMm} · ∠${a.rotationDeg}°`;
    if (a.type === 'room')
      return `${a.roomId} · (${a.xMm}, ${a.yMm}) · ∠${a.rotationDeg}°`;
    return `${a.roomId} · ${a.corner}+${a.dxMm}/${a.dyMm} · ∠${a.rotationDeg}°`;
  }
</script>

<section
  class="rounded-box bg-base-200 p-3 text-sm shadow-xl"
  data-testid="floor-panel"
>
  <h2 class="mb-1 flex items-center gap-1 font-semibold">
    <Sofa size={16} /> Напольные объекты
    <span class="badge badge-sm ml-1">{objects.length}</span>
  </h2>
  <p class="mb-2 text-xs opacity-70">
    Клик — поставить (у стены — вплотную), drag — двигать. Размеры — ниже.
  </p>

  <ul class="menu w-full rounded-box bg-base-100 p-1">
    {#each objects as o (o.id)}
      <li>
        <div class="flex flex-col gap-1 py-1">
          <div class="flex items-center gap-1">
            <span class="font-mono text-xs">{o.id}</span>
            <span class="text-xs">{o.label}</span>
            <span class="text-xs opacity-60">{anchorText(o)}</span>
            <button
              class="btn btn-xs btn-ghost ml-auto"
              data-testid="floor-del"
              data-id={o.id}
              onclick={() =>
                onOp({ type: 'removeFloorObject', objectId: o.id })}>✕</button
            >
          </div>
          <div class="flex gap-1">
            <label class="flex flex-1 items-center gap-1 text-xs"
              >Ш<input
                type="number"
                class="input input-xs input-bordered w-full"
                step="10"
                value={o.wMm}
                data-testid="floor-w"
                data-id={o.id}
                onchange={(e) =>
                  onOp({
                    type: 'updateFloorObject',
                    objectId: o.id,
                    wMm: Number(e.currentTarget.value),
                  })}
              /></label
            >
            <label class="flex flex-1 items-center gap-1 text-xs"
              >Г<input
                type="number"
                class="input input-xs input-bordered w-full"
                step="10"
                value={o.dMm}
                data-testid="floor-d"
                data-id={o.id}
                onchange={(e) =>
                  onOp({
                    type: 'updateFloorObject',
                    objectId: o.id,
                    dMm: Number(e.currentTarget.value),
                  })}
              /></label
            >
            <label class="flex flex-1 items-center gap-1 text-xs"
              >В<input
                type="number"
                class="input input-xs input-bordered w-full"
                step="10"
                value={o.hMm}
                data-testid="floor-h"
                data-id={o.id}
                onchange={(e) =>
                  onOp({
                    type: 'updateFloorObject',
                    objectId: o.id,
                    hMm: Number(e.currentTarget.value),
                  })}
              /></label
            >
          </div>
        </div>
      </li>
    {/each}
  </ul>
</section>
