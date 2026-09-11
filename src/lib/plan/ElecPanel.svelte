<script lang="ts">
  import { Plug } from '@lucide/svelte';
  import type { Operation } from './operations';
  import type { ElecPoint } from './electrics';

  /** Список электрики + автопредложения. Ставится кликом по стене. */

  interface Props {
    points: ElecPoint[];
    onOp: (op: Operation) => void;
    onSuggest: () => void;
  }

  let { points, onOp, onSuggest }: Props = $props();
</script>

<section
  class="rounded-box bg-base-200 p-3 text-sm shadow-xl"
  data-testid="elec-panel"
>
  <h2 class="mb-1 flex items-center gap-1 font-semibold">
    <Plug size={16} /> Розетки и выключатели
    <span class="badge badge-sm ml-1">{points.length}</span>
  </h2>
  <p class="mb-2 text-xs opacity-70">
    Клик по стене — поставить, drag вдоль стены — двигать.
  </p>
  <button
    class="btn btn-sm btn-outline w-full"
    data-testid="elec-suggest"
    onclick={onSuggest}
  >
    Предложить автоматически (потребители + двери + шаг 3 м)
  </button>
  <ul class="menu mt-2 w-full rounded-box bg-base-100 p-1">
    {#each points as p (p.id)}
      <li>
        <div class="flex items-center gap-1 py-1">
          <span class="font-mono text-xs">{p.id}</span>
          <span class="text-xs"
            >{p.kind === 'socket' ? 'Роз' : 'Выкл'} · {p.wallId} · {p.alongMm} · {p.heightMm}
            мм · {p.purpose}</span
          >
          <button
            class="btn btn-xs btn-ghost ml-auto"
            data-testid="elec-del"
            data-id={p.id}
            onclick={() => onOp({ type: 'removeElecPoint', pointId: p.id })}
            >✕</button
          >
        </div>
      </li>
    {/each}
  </ul>
</section>
