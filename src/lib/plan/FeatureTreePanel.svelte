<script lang="ts">
  import type { Snippet } from 'svelte';
  import { Layers, Box, Eye, EyeOff } from '@lucide/svelte';
  import type { Feature } from './history';
  import { STAGE_ORDER, stageLabel } from './history';

  /**
   * Общее дерево истории для обоих редакторов (скетч и модель), как в
   * FreeCAD: одиночный клик только выбирает строку, глаз включает
   * просмотр коммита, двойной клик уходит в редактирование этапа.
   * Кнопка Commit живёт здесь же, в подвале (footer) — сразу под деревом.
   * Текущий этап в работе всегда виден последней строкой «черновик».
   */

  /** Текущий этап в работе (ещё не закоммичен). */
  export interface DraftStage {
    /** Порядковый номер будущей Feature (0-based). */
    index: number;
    label: string;
  }

  interface Props {
    features: Feature[];
    previewIndex: number | null;
    onTogglePreview: (index: number) => void;
    onEditFeature: (index: number) => void;
    /** Текущий этап в работе; null — скрыть (просмотр/правка прошлого). */
    draftStage?: DraftStage | null;
    /** Подвал: Commit и вторичные действия этапа. */
    footer?: Snippet;
  }

  let {
    features,
    previewIndex,
    onTogglePreview,
    onEditFeature,
    draftStage = null,
    footer,
  }: Props = $props();

  /** Выбранная кликом строка (визуально, как в FreeCAD). */
  let selectedIndex: number | null = $state(null);

  /** Готово этапов: закоммиченные + текущий черновик в работе. */
  const doneCount = $derived(features.length + (draftStage ? 1 : 0));
</script>

<section
  class="rounded-box bg-base-200 p-3 text-sm shadow-xl"
  data-testid="stage-tree"
>
  <h2 class="mb-1 flex items-center gap-1 font-semibold">
    <Layers size={16} /> Этапы {doneCount}/{STAGE_ORDER.length}
  </h2>
  {#if features.length === 0 && !draftStage}
    <p class="text-xs opacity-60">Пока пусто.</p>
  {:else}
    <ul class="menu w-full rounded-box bg-base-100 p-1">
      {#each features as f (f.id)}
        {@const previewing = previewIndex === f.index}
        {@const selected = selectedIndex === f.index}
        <li>
          <div
            role="option"
            aria-selected={previewing || selected}
            class:menu-active={previewing}
            class:bg-base-300={selected && !previewing}
          >
            <button
              data-testid="feature-item"
              data-index={f.index}
              class="flex min-w-0 flex-1 items-center gap-1 text-left"
              title="Клик — выбрать, двойной клик — редактировать этап"
              onclick={() => (selectedIndex = f.index)}
              ondblclick={() => onEditFeature(f.index)}
            >
              <Box size={14} />
              <span class="font-mono text-xs">#{f.index + 1}</span>
              <span class="truncate text-xs">{f.label}</span>
              <span class="badge badge-xs opacity-70"
                >{stageLabel(f.stage)}</span
              >
              <span class="text-xs opacity-60">{f.ops.length} оп.</span>
            </button>
            <button
              class="btn btn-ghost btn-xs shrink-0"
              class:btn-primary={previewing}
              data-testid="feature-preview"
              data-index={f.index}
              title={previewing ? 'Скрыть просмотр' : 'Просмотр этапа'}
              aria-label={`Просмотр этапа ${f.index + 1}`}
              aria-pressed={previewing}
              onclick={() => onTogglePreview(f.index)}
            >
              {#if previewing}
                <EyeOff size={14} />
              {:else}
                <Eye size={14} />
              {/if}
            </button>
          </div>
        </li>
      {/each}
      {#if draftStage}
        {@const ds = draftStage}
        <li>
          <div
            role="option"
            aria-selected={selectedIndex === ds.index}
            class:bg-base-300={selectedIndex === ds.index}
          >
            <button
              data-testid="draft-stage"
              data-index={ds.index}
              class="flex min-w-0 flex-1 items-center gap-1 text-left"
              title="Текущий этап в работе"
              onclick={() => (selectedIndex = ds.index)}
            >
              <Box size={14} />
              <span class="font-mono text-xs">#{ds.index + 1}</span>
              <span class="truncate text-xs">{ds.label}</span>
              <span class="badge badge-primary badge-xs">черновик</span>
            </button>
          </div>
        </li>
      {/if}
    </ul>
  {/if}
  {#if footer}
    <div class="mt-2 flex flex-col gap-1 border-t border-base-300 pt-2">
      {@render footer()}
    </div>
  {/if}
</section>
