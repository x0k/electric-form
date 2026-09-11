<script lang="ts">
  import SketchEditor from '#lib/plan/SketchEditor.svelte';
  import ModelEditor from '#lib/plan/ModelEditor.svelte';
  import PlanViewer from '#lib/plan/PlanViewer.svelte';
  import { modelToScene } from '#lib/plan/render';
  import { DEFAULT_LAYOUT_OPTS } from '#lib/plan/layout';
  import {
    commitDraft,
    createHistory,
    discardDraft,
    editFeature,
    headState,
    makeFeatureId,
    stageOp,
    stateAt,
    stageLabel,
    type FeatureConflict,
    type PlanHistory,
    type StageKind,
  } from '#lib/plan/history';
  import { applyOperation, type Operation } from '#lib/plan/operations';
  import { cloneState, findDependents } from '#lib/plan/model';
  import { detectConflicts } from '#lib/plan/conflicts';
  import { suggestElec, suggestLights } from '#lib/plan/autoplace';
  import type { Vec2 } from '#lib/plan/geometry';

  /**
   * Мастер этапов: каждый этап — отдельный экран.
   * Вперёд — только через Commit (автопереход на следующий экран),
   * назад и в просмотр — через Feature Tree.
   * Правка прошлой Feature — через «Редактировать этап» из просмотра,
   * Commit пересчитывает зависимые этапы (editFeature).
   */

  type Screen =
    | 'sketch'
    | 'openings'
    | 'floorObjects'
    | 'wallObjects'
    | 'sockets'
    | 'lighting'
    | 'viewer';

  /** Экраны-модель (без sketch и viewer), в порядке ТЗ. */
  const MODEL_SCREENS: Exclude<Screen, 'sketch' | 'viewer'>[] = [
    'openings',
    'floorObjects',
    'wallObjects',
    'sockets',
    'lighting',
  ];

  const STEP_TOTAL = MODEL_SCREENS.length + 2; // sketch + viewer

  let history: PlanHistory = $state(createHistory());
  let screen: Screen = $state('sketch');
  /** Read-only просмотр коммита через Feature Tree. */
  let previewIndex: number | null = $state(null);
  /** Правка прошлой Feature (draft = её новые ops). */
  let editingIndex: number | null = $state(null);
  let message: string | null = $state(null);
  let pendingDelete: { wallId: string; names: string[] } | null = $state(null);
  // Черновик для правки контура: outline головы + имя; null — чистый контур.
  let editInitial: { outline: Vec2[]; roomName: string } | null = $state(null);
  let sketchKey = $state(0);

  const committed = $derived(history.features.length > 0);
  const head = $derived(headState(history));
  const previewing = $derived(previewIndex !== null);
  const editing = $derived(editingIndex !== null);

  /**
   * Состояние для сцены и панелей:
   * - просмотр: коммит как есть;
   * - правка: replay с подменой ops правимой Feature черновиком;
   * - черновик: голова + staged-операции best-effort.
   */
  const preview = $derived.by(() => {
    if (previewIndex !== null) {
      const r = stateAt(history, previewIndex);
      return { state: r.state, errors: [] as string[], conflicts: r.conflicts };
    }
    if (editingIndex !== null) {
      const replaced = history.features.map((f, i) =>
        i === editingIndex ? { ...f, ops: [...history.draft] } : f
      );
      const r = stateAt({ features: replaced, draft: [] }, replaced.length - 1);
      return {
        state: r.state,
        errors: r.conflicts.map(
          (c) => `Feature #${c.featureIndex + 1}: ${c.error.message}`
        ),
        conflicts: r.conflicts,
      };
    }
    let s = cloneState(head);
    const errors: string[] = [];
    for (const op of history.draft) {
      const r = applyOperation(s, op);
      if (r.ok) s = r.state;
      else errors.push(`${op.type}: ${r.error.message}`);
    }
    return {
      state: s,
      errors,
      conflicts: [] as FeatureConflict[],
    };
  });

  const scene = $derived(modelToScene(preview.state));

  const liveConflicts = $derived(detectConflicts(preview.state));
  const historyConflicts = $derived(
    previewing || editing
      ? preview.conflicts
      : stateAt(history, history.features.length - 1).conflicts
  );
  const previewFeature = $derived(
    previewIndex !== null ? history.features[previewIndex] : null
  );

  /** Голова работ: экран за самой поздней Feature (пропуски — пустые Feature). */
  function headScreen(): Screen {
    let lastIdx = -1;
    for (const f of history.features) {
      const i = MODEL_SCREENS.indexOf(
        f.stage as (typeof MODEL_SCREENS)[number]
      );
      if (i > lastIdx) lastIdx = i;
    }
    if (lastIdx === -1) return 'openings';
    return lastIdx + 1 < MODEL_SCREENS.length
      ? MODEL_SCREENS[lastIdx + 1]
      : 'viewer';
  }

  function stepNumber(s: Screen): number {
    if (s === 'sketch') return 1;
    if (s === 'viewer') return STEP_TOTAL;
    return MODEL_SCREENS.indexOf(s) + 2;
  }

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
      message = 'Стены возведены. Следующий этап — двери и окна.';
      screen = 'openings';
    } else {
      const e = editFeature(history, 0, payload.ops);
      if (!e.ok) {
        message = `Правка отклонена: ${e.error.message}`;
        return;
      }
      history = e.result.history;
      const n = e.result.conflicts.length;
      message =
        n === 0
          ? 'Планировка обновлена, зависимые шаги пересчитаны.'
          : `Планировка обновлена, конфликтов downstream: ${n} — см. панель.`;
      screen = headScreen();
    }
    editInitial = null;
    previewIndex = null;
    editingIndex = null;
  }

  function handleEditLayout() {
    if (history.draft.length > 0 || editingIndex !== null) {
      message = 'Сначала закоммитьте или сбросьте черновик текущего этапа.';
      return;
    }
    const room = head.rooms[DEFAULT_LAYOUT_OPTS.roomId];
    if (!room) {
      message = 'В голове истории нет помещения для правки.';
      return;
    }
    editInitial = { outline: room.outline, roomName: room.name };
    sketchKey += 1;
    previewIndex = null;
    message = null;
    screen = 'sketch';
  }

  /** Клик по Feature Tree: просмотр коммита на его экране. */
  function handleTreeSelect(i: number) {
    if (previewIndex === i) {
      previewIndex = null;
      screen = headScreen();
      message = null;
      return;
    }
    if (history.draft.length > 0 || editingIndex !== null) {
      message = 'Сначала закоммитьте или сбросьте черновик текущего этапа.';
      return;
    }
    const f = history.features[i];
    if (!f) return;
    previewIndex = i;
    screen = f.stage === 'layout' ? 'openings' : (f.stage as Screen);
    message = null;
  }

  /** Из просмотра — в правку этого этапа. */
  function handleEditStage() {
    if (previewIndex === null) return;
    const f = history.features[previewIndex];
    if (!f) return;
    if (f.stage === 'layout') {
      previewIndex = null;
      handleEditLayout();
      return;
    }
    editingIndex = previewIndex;
    previewIndex = null;
    history = { ...history, draft: [...f.ops] };
    screen = f.stage as Screen;
    message = `Редактирование Feature #${f.index + 1} (${stageLabel(f.stage)}). Commit пересчитает зависимые этапы.`;
  }

  function handleOp(op: Operation) {
    if (previewIndex !== null) return;
    history = stageOp(history, op);
  }

  function handleCommitStage() {
    if (screen === 'sketch' || screen === 'viewer') return;
    if (editingIndex !== null) {
      const idx = editingIndex;
      const e = editFeature(history, idx, history.draft);
      if (!e.ok) {
        message = `Правка отклонена: ${e.error.message}`;
        return;
      }
      history = { ...e.result.history, draft: [] };
      const n = e.result.conflicts.length;
      message =
        n === 0
          ? `Feature #${idx + 1} обновлена, зависимые пересчитаны.`
          : `Применено, конфликтов downstream: ${n} — см. панель.`;
      editingIndex = null;
      previewIndex = null;
      screen = headScreen();
      return;
    }
    const stage = screen as StageKind;
    const c = commitDraft(history, {
      stage,
      label: `${stageLabel(stage)} #${history.features.length + 1}`,
    });
    if (!c.ok) {
      message = `Commit отклонён: ${c.error.message}`;
      return;
    }
    history = c.history;
    previewIndex = null;
    message = `${stageLabel(stage)} — закоммичено.`;
    screen = headScreen();
  }

  function handleDiscard() {
    history = discardDraft(history);
    if (editingIndex !== null) {
      editingIndex = null;
      screen = headScreen();
    }
    message = null;
  }

  /**
   * Пропуск этапа: коммитит ПУСТУЮ Feature, чтобы история осталась полной
   * (этап виден в дереве, позже заполняется через «Редактировать этап»).
   */
  function handleSkip() {
    if (screen === 'sketch' || screen === 'viewer') return;
    if (history.draft.length > 0) {
      message = 'В черновике есть изменения — Commit или Сбросить.';
      return;
    }
    const stage = screen as StageKind;
    history = {
      features: [
        ...history.features,
        {
          id: makeFeatureId(),
          index: history.features.length,
          stage,
          label: `${stageLabel(stage)} — пусто`,
          ops: [],
          createdAt: new Date().toISOString(),
        },
      ],
      draft: [],
    };
    previewIndex = null;
    message = `${stageLabel(stage)} — пропущен (пусто, можно дополнить позже).`;
    screen = headScreen();
  }

  function handleToViewer() {
    if (history.draft.length > 0 || editingIndex !== null) {
      message = 'Сначала закоммитьте или сбросьте черновик текущего этапа.';
      return;
    }
    previewIndex = null;
    screen = 'viewer';
    message = null;
  }

  function handleBackToHead() {
    previewIndex = null;
    message = null;
    if (screen === 'viewer') return;
    screen = headScreen();
  }

  function handleSuggestElec() {
    const { switches, sockets } = suggestElec(preview.state);
    let h = history;
    for (const s of switches) {
      h = stageOp(h, {
        type: 'addElecPoint',
        pointId: s.id,
        kind: s.kind,
        wallId: s.wallId,
        alongMm: s.alongMm,
        heightMm: s.heightMm,
        purpose: s.purpose,
        groupId: s.groupId,
      });
    }
    for (const s of sockets) {
      h = stageOp(h, {
        type: 'addElecPoint',
        pointId: s.id,
        kind: s.kind,
        wallId: s.wallId,
        alongMm: s.alongMm,
        heightMm: s.heightMm,
        purpose: s.purpose,
        groupId: s.groupId,
      });
    }
    history = h;
    message = `Предложено: ${switches.length} выкл. + ${sockets.length} роз. Проверьте и Commit.`;
  }

  function handleSuggestLights() {
    const drafts = suggestLights(preview.state);
    let h = history;
    for (const d of drafts) {
      h = stageOp(h, {
        type: 'addLuminaire',
        luminaireId: d.id,
        kind: d.kind,
        roomId: d.roomId,
        xMm: d.xMm,
        yMm: d.yMm,
        groupId: d.groupId,
      });
    }
    history = h;
    message = `Предложено светильников: ${drafts.length}. Проверьте и Commit.`;
  }

  function handleDeleteWall(wallId: string) {
    const deps = findDependents(preview.state, wallId);
    if (deps.length === 0) {
      handleOp({ type: 'deleteWall', wallId });
      return;
    }
    pendingDelete = { wallId, names: deps.map((d) => d.label) };
  }
</script>

<svelte:head>
  <title>Планировка — редактор</title>
</svelte:head>

<main class="relative h-screen w-full overflow-hidden">
  {#if screen === 'sketch'}
    {#key sketchKey}
      <SketchEditor
        initialOutline={editInitial?.outline ?? null}
        initialRoomName={editInitial?.roomName ?? 'Комната'}
        {committed}
        onCommit={handleCommitSketch}
      />
    {/key}
  {:else if screen === 'viewer'}
    <div class="relative h-screen w-full overflow-hidden bg-base-100">
      <div class="absolute inset-0">
        <PlanViewer
          {scene}
          selectedIds={[]}
          cameraMode="orbit"
          showGrid
          gridStepMm={100}
          sketch={null}
        />
      </div>
      <div class="absolute left-3 top-3 z-10">
        <div
          class="flex flex-col gap-2 rounded-box bg-base-100/95 p-3 shadow-xl backdrop-blur"
        >
          <p class="text-sm font-semibold" data-testid="step-title">
            Шаг {STEP_TOTAL} из {STEP_TOTAL} · Просмотр квартиры
          </p>
          <p class="text-xs opacity-70" data-testid="viewer-summary">
            Этапов закоммичено: {history.features.length}. Свободная камера.
          </p>
          <button
            class="btn btn-sm"
            data-testid="viewer-back"
            onclick={() => {
              screen = headScreen();
            }}
          >
            К редактору
          </button>
        </div>
      </div>
    </div>
  {:else}
    <ModelEditor
      {scene}
      base={preview.state}
      features={history.features}
      {previewIndex}
      {editingIndex}
      {previewFeature}
      previewConflictCount={previewing || editing
        ? preview.conflicts.length
        : 0}
      stage={screen}
      stepNumber={stepNumber(screen)}
      stepTotal={STEP_TOTAL}
      draftCount={history.draft.length}
      draftErrors={preview.errors}
      {liveConflicts}
      {historyConflicts}
      onOp={handleOp}
      onError={(m) => (message = m)}
      onCommit={handleCommitStage}
      onDiscard={handleDiscard}
      onSkip={handleSkip}
      onToViewer={handleToViewer}
      onSuggestElec={handleSuggestElec}
      onSuggestLights={handleSuggestLights}
      onTogglePreview={handleTreeSelect}
      onBackToHead={handleBackToHead}
      onEditLayout={handleEditLayout}
      onEditStage={handleEditStage}
      onDeleteWall={handleDeleteWall}
    />
  {/if}

  {#if pendingDelete}
    <div
      class="absolute inset-0 z-30 flex items-center justify-center bg-black/40"
      data-testid="delete-confirm"
    >
      <div class="rounded-box bg-base-100 p-4 shadow-xl">
        <p class="mb-2 text-sm font-semibold">
          Стена удаляется. На ней закреплены {pendingDelete.names.length} объект(а).
          Продолжить?
        </p>
        <ul
          class="mb-3 max-h-32 list-disc overflow-y-auto pl-5 text-xs opacity-70"
        >
          {#each pendingDelete.names as n (n)}<li>{n}</li>{/each}
        </ul>
        <div class="flex gap-2">
          <button
            class="btn btn-sm"
            data-testid="delete-cancel"
            onclick={() => (pendingDelete = null)}
          >
            Отмена
          </button>
          <button
            class="btn btn-sm btn-error"
            data-testid="delete-cascade"
            onclick={() => {
              if (pendingDelete)
                handleOp({
                  type: 'deleteWall',
                  wallId: pendingDelete.wallId,
                  cascade: true,
                });
              pendingDelete = null;
            }}
          >
            Удалить вместе с зависимыми
          </button>
        </div>
      </div>
    </div>
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
