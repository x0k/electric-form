<script lang="ts">
  import { TriangleAlert } from '@lucide/svelte';
  import type { PlanConflict } from './conflicts';
  import type { FeatureConflict } from './history';
  import type { Operation } from './operations';

  interface Props {
    live: PlanConflict[];
    historyConflicts: FeatureConflict[];
    draftErrors: string[];
    onOp: (op: Operation) => void;
  }

  let { live, historyConflicts, draftErrors, onOp }: Props = $props();

  const total = $derived(
    live.length + historyConflicts.length + draftErrors.length
  );

  /** Быстрое разрешение: удалить сущность-нарушителя (первый id). */
  function resolve(c: PlanConflict) {
    const id = c.entityIds[0];
    if (
      id.startsWith('sk') ||
      id.startsWith('sw') ||
      id.startsWith('auto-sw') ||
      id.startsWith('auto-sk')
    ) {
      onOp({ type: 'removeElecPoint', pointId: id });
    } else if (
      id.startsWith('lt') ||
      id.startsWith('auto-lt') ||
      id.startsWith('auto-spot')
    ) {
      onOp({ type: 'removeLuminaire', luminaireId: id });
    } else if (id.startsWith('d') || id.startsWith('win')) {
      onOp({ type: 'deleteOpening', openingId: id });
    } else if (id.startsWith('m')) {
      onOp({ type: 'removeWallObject', objectId: id });
    } else if (id.startsWith('f')) {
      onOp({ type: 'removeFloorObject', objectId: id });
    }
  }
</script>

<section
  class="rounded-box bg-base-200 p-3 text-sm shadow-xl"
  data-testid="conflicts-panel"
>
  <h2 class="mb-1 flex items-center gap-1 font-semibold">
    <TriangleAlert size={16} /> Конфликты
    <span class="badge badge-sm ml-1" class:badge-error={total > 0}
      >{total}</span
    >
  </h2>
  {#if total === 0}
    <p class="text-xs opacity-70">Конфликтов нет.</p>
  {:else}
    <ul class="flex flex-col gap-1">
      {#each draftErrors as e (e)}
        <li
          class="alert alert-error alert-sm py-1 text-xs"
          data-testid="conflict-item"
        >
          <span>{e}</span>
        </li>
      {/each}
      {#each live as c (c.code + c.entityIds.join(','))}
        <li
          class="alert alert-warning alert-sm py-1 text-xs"
          data-testid="conflict-item"
        >
          <span>{c.message}</span>
          <button
            class="btn btn-xs ml-auto"
            data-testid="conflict-resolve"
            onclick={() => resolve(c)}
          >
            Удалить
          </button>
        </li>
      {/each}
      {#each historyConflicts as h (h.featureId + h.opIndex)}
        <li
          class="alert alert-error alert-sm py-1 text-xs"
          data-testid="conflict-item"
        >
          <span>
            Feature #{h.featureIndex + 1}: операция {h.opIndex + 1} не применилась
            ({h.error.code}: {h.error.message})
          </span>
        </li>
      {/each}
    </ul>
  {/if}
</section>
