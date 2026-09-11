<script lang="ts">
  import SketchEditor from '#lib/plan/SketchEditor.svelte';
  import ModelEditor from '#lib/plan/ModelEditor.svelte';
  import { modelToScene } from '#lib/plan/render';
  import { DEFAULT_LAYOUT_OPTS } from '#lib/plan/layout';
  import {
    commitDraft,
    createHistory,
    editFeature,
    headState,
    stageOp,
    stateAt,
    type PlanHistory,
  } from '#lib/plan/history';
  import type { Operation } from '#lib/plan/operations';
  import type { Vec2 } from '#lib/plan/geometry';

  /**
   * Страница — только автомат стадий и история:
   * sketch-стадия → commit → модель-стадия (изометрия).
   * Вся механика живёт в SketchEditor / ModelEditor.
   */

  type Stage = 'sketch' | 'model';

  let history: PlanHistory = $state(createHistory());
  let stage: Stage = $state('sketch');
  let previewIndex: number | null = $state(null);
  let message: string | null = $state(null);
  // Черновик для правки: outline головы + имя; null — чистый контур.
  let editInitial: { outline: Vec2[]; roomName: string } | null = $state(null);
  let sketchKey = $state(0);

  const committed = $derived(history.features.length > 0);

  /** Сцена: голова истории или просмотр выбранной Feature. */
  const scene = $derived.by(() => {
    const state =
      previewIndex !== null
        ? stateAt(history, previewIndex).state
        : headState(history);
    return modelToScene(state);
  });

  function handleCommitSketch(payload: { ops: Operation[]; roomName: string }) {
    if (!committed) {
      let h = history;
      for (const op of payload.ops) h = stageOp(h, op);
      const c = commitDraft(h, {
        stage: 'layout',
        label: `Планировка: ${payload.roomName}`,
      });
      if (!c.ok) {
        message = `Commit отклонён: ${c.error.message}`;
        return;
      }
      history = c.history;
      message =
        'Стены возведены. Изометрия — следующий шаг: расстановка объектов.';
    } else {
      const e = editFeature(history, 0, payload.ops);
      if (!e.ok) {
        message = `Правка отклонена: ${e.error.message}`;
        return;
      }
      history = e.result.history;
      message = 'Планировка обновлена, зависимые шаги пересчитаны.';
    }
    editInitial = null;
    previewIndex = null;
    stage = 'model';
  }

  function handleEditLayout() {
    const room = headState(history).rooms[DEFAULT_LAYOUT_OPTS.roomId];
    if (!room) {
      message = 'В голове истории нет помещения для правки.';
      return;
    }
    editInitial = { outline: room.outline, roomName: room.name };
    sketchKey += 1;
    previewIndex = null;
    message = null;
    stage = 'sketch';
  }
</script>

<svelte:head>
  <title>Планировка — редактор</title>
</svelte:head>

<main class="relative h-screen w-full overflow-hidden">
  {#if stage === 'sketch'}
    {#key sketchKey}
      <SketchEditor
        initialOutline={editInitial?.outline ?? null}
        initialRoomName={editInitial?.roomName ?? 'Комната'}
        {committed}
        onCommit={handleCommitSketch}
      />
    {/key}
  {:else}
    <ModelEditor
      {scene}
      features={history.features}
      {previewIndex}
      onTogglePreview={(i) => (previewIndex = previewIndex === i ? null : i)}
      onBackToHead={() => {
        previewIndex = null;
        message = null;
      }}
      onEditLayout={handleEditLayout}
    />
  {/if}

  {#if message}
    <div
      class="pointer-events-none absolute bottom-3 left-1/2 z-20 max-w-md -translate-x-1/2"
    >
      <p class="alert alert-sm py-2 text-sm shadow-xl" role="status">
        {message}
      </p>
    </div>
  {/if}
</main>
