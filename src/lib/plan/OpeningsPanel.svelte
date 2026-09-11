<script lang="ts">
  import { DoorOpen } from '@lucide/svelte';
  import type { Operation } from './operations';
  import type { Opening } from './openings';

  /**
   * Список проёмов: доводка чисел + удаление.
   * Ставится и двигается всё мышью на канвасе (ToolCard + drag).
   */

  interface Props {
    openings: Opening[];
    onOp: (op: Operation) => void;
  }

  let { openings, onOp }: Props = $props();
</script>

<section
  class="rounded-box bg-base-200 p-3 text-sm shadow-xl"
  data-testid="openings-panel"
>
  <h2 class="mb-2 flex items-center gap-1 font-semibold">
    <DoorOpen size={16} /> Проёмы
    <span class="badge badge-sm ml-1">{openings.length}</span>
  </h2>
  <p class="mb-2 text-xs opacity-70">
    Клик по стене — поставить, тащите проём вдоль стены. Отступ и ширина — ниже.
  </p>

  <ul class="menu w-full rounded-box bg-base-100 p-1">
    {#each openings as o (o.id)}
      <li>
        <div class="flex flex-col gap-1 py-1">
          <div class="flex items-center gap-1">
            <span class="font-mono text-xs">{o.id}</span>
            <span class="text-xs opacity-70">
              {o.kind === 'door' ? 'Дверь' : 'Окно'} · {o.wallId} · {o.widthMm}×{o.heightMm}{o.kind ===
              'window'
                ? ` · sill ${o.sillMm}`
                : ''}
            </span>
            <button
              class="btn btn-xs btn-ghost ml-auto"
              data-testid="opening-del"
              data-id={o.id}
              title="Удалить проём"
              onclick={() => onOp({ type: 'deleteOpening', openingId: o.id })}
            >
              ✕
            </button>
          </div>
          <div class="flex gap-1">
            <label class="flex flex-1 items-center gap-1 text-xs"
              >Отступ<input
                type="number"
                class="input input-xs input-bordered w-full"
                step="10"
                min="0"
                value={o.offsetMm}
                data-testid="opening-off"
                data-id={o.id}
                onchange={(e) =>
                  onOp({
                    type: 'updateOpening',
                    openingId: o.id,
                    offsetMm: Number(e.currentTarget.value),
                  })}
              /></label
            >
            <label class="flex flex-1 items-center gap-1 text-xs"
              >Ширина<input
                type="number"
                class="input input-xs input-bordered w-full"
                step="10"
                value={o.widthMm}
                data-testid="opening-w"
                data-id={o.id}
                onchange={(e) =>
                  onOp({
                    type: 'updateOpening',
                    openingId: o.id,
                    widthMm: Number(e.currentTarget.value),
                  })}
              /></label
            >
          </div>
        </div>
      </li>
    {/each}
  </ul>
</section>
