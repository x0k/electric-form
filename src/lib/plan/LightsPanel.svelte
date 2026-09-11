<script lang="ts">
  import { Lightbulb } from '@lucide/svelte';
  import type { Operation } from './operations';
  import type { Luminaire } from './lighting';

  /** Список света + автопредложения. Ставится кликом по помещению. */

  interface Props {
    lights: Luminaire[];
    onOp: (op: Operation) => void;
    onSuggest: () => void;
  }

  let { lights, onOp, onSuggest }: Props = $props();
</script>

<section
  class="rounded-box bg-base-200 p-3 text-sm shadow-xl"
  data-testid="lights-panel"
>
  <h2 class="mb-1 flex items-center gap-1 font-semibold">
    <Lightbulb size={16} /> Освещение
    <span class="badge badge-sm ml-1">{lights.length}</span>
  </h2>
  <p class="mb-2 text-xs opacity-70">
    Клик по помещению — поставить, drag — двигать. Группа света связывается с
    выключателем по совпадающему id группы.
  </p>
  <button
    class="btn btn-sm btn-outline w-full"
    data-testid="light-suggest"
    onclick={onSuggest}
  >
    Предложить свет (центр + споты &gt; 15 м²)
  </button>
  <ul class="menu mt-2 w-full rounded-box bg-base-100 p-1">
    {#each lights as l (l.id)}
      <li>
        <div class="flex items-center gap-1 py-1">
          <span class="font-mono text-xs">{l.id}</span>
          <span class="text-xs">{l.kind} · {l.roomId} · ({l.xMm}, {l.yMm})</span
          >
          <button
            class="btn btn-xs btn-ghost ml-auto"
            data-testid="light-del"
            data-id={l.id}
            onclick={() => onOp({ type: 'removeLuminaire', luminaireId: l.id })}
            >✕</button
          >
        </div>
      </li>
    {/each}
  </ul>
</section>
