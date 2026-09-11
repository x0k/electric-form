<script lang="ts">
  import PlanViewer, { type PlaceToolSpec } from './PlanViewer.svelte';
  import EditorToolbar from './EditorToolbar.svelte';
  import FeatureTreePanel, { type DraftStage } from './FeatureTreePanel.svelte';
  import StructurePanel from './StructurePanel.svelte';
  import OpeningsPanel from './OpeningsPanel.svelte';
  import FloorObjectsPanel from './FloorObjectsPanel.svelte';
  import WallObjectsPanel from './WallObjectsPanel.svelte';
  import ElecPanel from './ElecPanel.svelte';
  import LightsPanel from './LightsPanel.svelte';
  import ConflictsPanel from './ConflictsPanel.svelte';
  import type { RenderScene } from './render';
  import type { ApartmentState } from './model';
  import type { Feature, FeatureConflict, StageKind } from './history';
  import { stageLabel } from './history';
  import type { PlanConflict } from './conflicts';
  import type { EditorCameraMode } from './camera';
  import { applyOperation, type Operation } from './operations';
  import { toggleEntity } from './selection';
  import {
    defaultElecHeight,
    defaultElecPurpose,
    moveObject,
    placeElecPoint,
    placeFloorObject,
    placeLuminaire,
    placeOpening,
    placeWallObject,
    resizeObject,
    uniqueId,
    type PlaceHit,
    type ResizeEdge,
  } from './placing';
  import { FLOOR_CATALOG, WALL_CATALOG, findCatalogEntry } from './catalog';
  import { DOOR_LIMITS, WINDOW_LIMITS, type OpeningKind } from './openings';
  import { SOCKET_STD_H_MM, SWITCH_STD_H_MM, type ElecKind } from './electrics';
  import type { LightKind } from './lighting';
  import { DoorOpen, AppWindow } from '@lucide/svelte';

  /**
   * Один экран мастера = один этап. Размещение — графическое:
   * клик по стене/полу ставит объект (гост-превью со снаппингом 1 см),
   * drag двигает. ToolCard задаёт ЧТО ставить (тип, габариты, высоты),
   * позиция всегда идёт с канваса. Числа в списках — точная доводка.
   *
   * Вперёд — только через Commit, назад/просмотр — через Feature Tree.
   */

  interface Props {
    scene: RenderScene;
    /** Состояние для списков и dry-run: голова+черновик либо симуляция правки. */
    base: ApartmentState;
    features: Feature[];
    previewIndex: number | null;
    editingIndex: number | null;
    previewFeature: Feature | null;
    previewConflictCount: number;
    stage: StageKind;
    draftCount: number;
    draftErrors: string[];
    liveConflicts: PlanConflict[];
    historyConflicts: FeatureConflict[];
    onOp: (op: Operation) => void;
    onError: (message: string) => void;
    onCommit: () => void;
    onDiscard: () => void;
    onToViewer: () => void;
    onSuggestElec: () => void;
    onSuggestLights: () => void;
    onTogglePreview: (index: number) => void;
    onEditFeature: (index: number) => void;
    onBackToHead: () => void;
    onEditStage: () => void;
    onDeleteWall: (wallId: string) => void;
  }

  let {
    scene,
    base,
    features,
    previewIndex,
    editingIndex,
    previewFeature,
    previewConflictCount,
    stage,
    draftCount,
    draftErrors,
    liveConflicts,
    historyConflicts,
    onOp,
    onError,
    onCommit,
    onDiscard,
    onToViewer,
    onSuggestElec,
    onSuggestLights,
    onTogglePreview,
    onEditFeature,
    onBackToHead,
    onEditStage,
    onDeleteWall,
  }: Props = $props();

  const previewing = $derived(previewIndex !== null);
  const editing = $derived(editingIndex !== null);

  /** Commit — в подвале дерева, скрыт в режиме просмотра. */
  const commitSpec = $derived.by(() => {
    if (previewing) return null;
    return {
      testId: 'commit-stage',
      label: 'Продолжить',
      disabled: draftCount === 0,
      onCommit,
    };
  });

  /**
   * Текущий этап в работе — строкой «черновик» в дереве.
   * В просмотре/правке прошлого и при уже закоммиченном этапе скрыта.
   */
  const draftStage = $derived.by((): DraftStage | null => {
    if (previewing || editing) return null;
    if (features.some((f) => f.stage === stage)) return null;
    return { index: features.length, label: stageLabel(stage) };
  });

  let cameraMode: EditorCameraMode = $state('iso');
  let isoPreset = $state(0);
  let viewNonce = $state(0);
  let showGrid = $state(true);
  let selectedId: string | null = $state(null);

  // --- Конфиг инструмента (ЧТО ставить; ГДЕ — клик по канвасу) ---
  let toolOn = $state(true);
  // Проёмы
  let opKind: OpeningKind = $state('door');
  let opWidth = $state(900);
  let opHeight = $state(2000);
  let opSill = $state(900);
  // Напольные
  let flKind = $state('wardrobe');
  let flRot: 0 | 90 | 180 | 270 = $state(0);
  // Навесные
  let woKind = $state('wallCabinet');
  let woHeight = $state(1500);
  // Электрика
  let elKind: ElecKind = $state('socket');
  let elPurpose = $state(defaultElecPurpose('socket'));
  let elGroup = $state('');
  let elNewGroup = $state('');
  // Свет
  let liKind: LightKind = $state('ceilingLamp');
  let liGroup = $state('');
  let liNewGroup = $state('');

  function setOpKind(k: OpeningKind) {
    opKind = k;
    if (k === 'door') {
      opWidth = DOOR_LIMITS.widthMin + 300;
      opHeight = 2000;
    } else {
      opWidth = 1500;
      opHeight = 1400;
      opSill = 900;
    }
  }

  function setElKind(k: ElecKind) {
    elKind = k;
    elPurpose = defaultElecPurpose(k);
  }

  function cycleRot() {
    flRot = ((flRot + 90) % 360) as 0 | 90 | 180 | 270;
  }

  function freshGroupId(prefix: string, ids: Set<string>): string {
    let n = ids.size + 1;
    while (ids.has(`${prefix}${n}`)) n += 1;
    return `${prefix}${n}`;
  }

  const openings = $derived(
    Object.values(base.openings ?? {}).sort((a, b) => (a.id < b.id ? -1 : 1))
  );
  const floorObjects = $derived(
    Object.values(base.floorObjects ?? {}).sort((a, b) =>
      a.id < b.id ? -1 : 1
    )
  );
  const wallObjects = $derived(
    Object.values(base.wallObjects ?? {}).sort((a, b) => (a.id < b.id ? -1 : 1))
  );
  const elecGroups = $derived(Object.values(base.elecGroups ?? {}));
  const elecPoints = $derived(
    Object.values(base.elecPoints ?? {}).sort((a, b) => (a.id < b.id ? -1 : 1))
  );
  const lightGroups = $derived(Object.values(base.lightGroups ?? {}));
  const luminaires = $derived(
    Object.values(base.luminaires ?? {}).sort((a, b) => (a.id < b.id ? -1 : 1))
  );

  /** Id текущего слоя — их можно таскать (угловые якоря — только числами). */
  const draggableIds = $derived.by((): string[] => {
    if (previewing) return [];
    if (stage === 'openings') return openings.map((o) => o.id);
    if (stage === 'floorObjects')
      return floorObjects
        .filter((o) => o.anchor.type !== 'corner')
        .map((o) => o.id);
    if (stage === 'wallObjects') return wallObjects.map((o) => o.id);
    if (stage === 'sockets') return elecPoints.map((p) => p.id);
    if (stage === 'lighting') return luminaires.map((l) => l.id);
    return [];
  });

  /** Гизмо ресайза: id + разрешённые края из якоря (угловые — без ручек). */
  const resizeSpecs = $derived.by((): { id: string; edges: ResizeEdge[] }[] => {
    if (previewing) return [];
    if (stage === 'openings')
      return openings.map((o) => ({
        id: o.id,
        edges: ['start', 'end'] as ResizeEdge[],
      }));
    if (stage === 'floorObjects')
      return floorObjects.flatMap((o) => {
        if (o.anchor.type === 'corner') return [];
        if (o.anchor.type === 'wall') {
          return o.anchor.rotationDeg === 90 || o.anchor.rotationDeg === 270
            ? []
            : [{ id: o.id, edges: ['w', 'e'] as ResizeEdge[] }];
        }
        return [{ id: o.id, edges: ['e', 'w', 'n', 's'] as ResizeEdge[] }];
      });
    if (stage === 'wallObjects')
      return wallObjects.map((o) => ({
        id: o.id,
        edges: ['start', 'end'] as ResizeEdge[],
      }));
    return [];
  });

  /** Гост-превью из конфига инструмента. */
  const placeTool = $derived.by((): PlaceToolSpec | null => {
    if (!toolOn || previewing) return null;
    if (stage === 'openings') {
      return {
        layer: 'opening',
        wMm: opWidth,
        dMm: 200,
        hMm: opHeight,
        zMm: opKind === 'door' ? 0 : opSill,
        rotDeg: 0,
      };
    }
    if (stage === 'floorObjects') {
      const e = findCatalogEntry(flKind) ?? FLOOR_CATALOG[0];
      return {
        layer: 'floorObject',
        wMm: e.defW,
        dMm: e.defD,
        hMm: e.defH,
        zMm: 0,
        rotDeg: flRot,
      };
    }
    if (stage === 'wallObjects') {
      const e = findCatalogEntry(woKind) ?? WALL_CATALOG[0];
      return {
        layer: 'wallObject',
        wMm: e.defW,
        dMm: e.defD,
        hMm: e.defH,
        zMm: woHeight,
        rotDeg: 0,
      };
    }
    if (stage === 'sockets') {
      const h = elKind === 'socket' ? SOCKET_STD_H_MM : SWITCH_STD_H_MM;
      return { layer: 'elec', wMm: 90, dMm: 30, hMm: 90, zMm: h, rotDeg: 0 };
    }
    if (stage === 'lighting') {
      return {
        layer: 'light',
        wMm: 180,
        dMm: 180,
        hMm: 180,
        zMm: 0,
        rotDeg: 0,
      };
    }
    return null;
  });

  /** Клик по канвасу → операция из конфига + dry-run → stage или ошибка. */
  function handlePlace(hit: PlaceHit) {
    const res =
      stage === 'openings'
        ? placeOpening(base, hit, {
            kind: opKind,
            widthMm: opWidth,
            heightMm: opHeight,
            sillMm: opKind === 'door' ? 0 : opSill,
            id: uniqueId(base, opKind === 'door' ? 'd' : 'win'),
          })
        : stage === 'floorObjects'
          ? placeFloorObject(base, hit, {
              kind: flKind,
              rotationDeg: flRot,
              id: uniqueId(base, 'f'),
            })
          : stage === 'wallObjects'
            ? placeWallObject(base, hit, {
                kind: woKind,
                heightMm: woHeight,
                id: uniqueId(base, 'm'),
              })
            : stage === 'sockets'
              ? placeElecPoint(base, hit, {
                  kind: elKind,
                  heightMm: defaultElecHeight(elKind),
                  purpose: elPurpose,
                  groupId: elGroup || null,
                  id: uniqueId(base, elKind === 'socket' ? 'sk' : 'sw'),
                })
              : placeLuminaire(base, hit, {
                  kind: liKind,
                  groupId: liGroup || null,
                  id: uniqueId(base, 'lt'),
                });
    if (!res.ok) {
      onError(res.error);
      return;
    }
    const dry = applyOperation(base, res.op);
    if (!dry.ok) {
      onError(dry.error.message);
      return;
    }
    onOp(res.op);
    selectedId = res.id;
  }

  function handleMove(id: string, hit: PlaceHit) {
    const res = moveObject(base, id, hit);
    if (!res.ok) {
      onError(res.error);
      return;
    }
    const dry = applyOperation(base, res.op);
    if (!dry.ok) {
      onError(dry.error.message);
      return;
    }
    onOp(res.op);
    selectedId = id;
  }

  /** Финал гизмо ресайза: край + точка → операция обновления габаритов. */
  function handleResize(id: string, hit: PlaceHit, edge: ResizeEdge) {
    const res = resizeObject(base, id, hit.plan, edge);
    if (!res.ok) {
      onError(res.error);
      return;
    }
    const dry = applyOperation(base, res.op);
    if (!dry.ok) {
      onError(dry.error.message);
      return;
    }
    onOp(res.op);
    selectedId = id;
  }

  const HINTS: Record<StageKind, string> = {
    layout: '',
    openings:
      'Клик по стене — проём по центру клика. Drag вдоль стены — двигать.',
    floorObjects:
      'Клик по полу — в помещение, клик по стене — вплотную к ней. Drag — двигать.',
    wallObjects: 'Клик по стене — повесить. Drag вдоль стены — двигать.',
    sockets: 'Клик по стене — точка (высота по стандарту). Drag — двигать.',
    lighting: 'Клик по помещению — светильник. Drag — двигать.',
  };

  const ISO_CORNERS = [
    { label: 'ЮВ', title: 'Вид с юго-востока' },
    { label: 'ЮЗ', title: 'Вид с юго-запада' },
    { label: 'СВ', title: 'Вид с северо-востока' },
    { label: 'СЗ', title: 'Вид с северо-запада' },
  ];
</script>

<div class="relative h-screen w-full overflow-hidden bg-base-100">
  <div class="absolute inset-0">
    <PlanViewer
      {scene}
      selectedIds={selectedId ? [selectedId] : []}
      {cameraMode}
      {isoPreset}
      reframeNonce={viewNonce}
      sketch={null}
      {showGrid}
      gridStepMm={100}
      {placeTool}
      {draggableIds}
      {resizeSpecs}
      onSelect={(id) => (selectedId = id)}
      onPlace={handlePlace}
      onObjectMove={handleMove}
      onResizeObject={handleResize}
      onToolCancel={() => (toolOn = false)}
    />
  </div>

  <div class="absolute left-3 top-3 z-10 max-w-[calc(100%-22rem)]">
    <div
      class="flex flex-col gap-2 rounded-box bg-base-100/95 p-2 shadow-xl backdrop-blur"
    >
      <div
        class="flex items-center gap-2"
        role="toolbar"
        aria-label="Инструмент"
      >
        <button
          class="btn btn-sm shrink-0"
          class:btn-primary={toolOn}
          data-testid="place-toggle"
          title="Клик по канвасу ставит объект (Esc — выкл)"
          onclick={() => (toolOn = !toolOn)}
        >
          {toolOn ? 'Ставить: вкл' : 'Ставить: выкл'}
        </button>
        {#if toolOn}
          <p class="text-xs opacity-70" data-testid="place-hint">
            {HINTS[stage]} Снаппинг 1 см.
          </p>
        {/if}
      </div>
      <EditorToolbar
        {cameraMode}
        snapStepMm={10}
        {showGrid}
        {previewIndex}
        showSnap={false}
        onCameraMode={(m) => (cameraMode = m)}
        onSnapStep={() => {}}
        onShowGrid={(v) => (showGrid = v)}
        {onBackToHead}
      />
      {#if cameraMode === 'iso'}
        <div
          class="join"
          role="group"
          aria-label="Угол изометрии"
          title="Угол обзора: ближние стены гасятся"
        >
          {#each ISO_CORNERS as corner, i (corner.label)}
            <button
              class="btn btn-xs join-item"
              class:btn-primary={isoPreset === i}
              data-testid="iso-corner"
              data-index={i}
              title={`${corner.title}. Повторный клик возвращает вид`}
              onclick={() => {
                isoPreset = i;
                viewNonce += 1;
              }}
            >
              {corner.label}
            </button>
          {/each}
        </div>
      {/if}
      {#if previewing && previewFeature}
        <div
          class="alert alert-warning alert-sm py-2 text-xs"
          data-testid="preview-banner"
        >
          <span>
            Просмотр Feature #{previewFeature.index + 1} ({stageLabel(
              previewFeature.stage
            )}) — история не изменяется.
            {#if previewConflictCount > 0}
              Конфликтов: {previewConflictCount}.
            {/if}
          </span>
        </div>
      {/if}
      {#if editing && editingIndex !== null}
        <div
          class="alert alert-info alert-sm py-2 text-xs"
          data-testid="edit-banner"
        >
          <span>
            Редактирование Feature #{editingIndex + 1} — Commit пересчитает зависимые
            этапы.
          </span>
        </div>
      {/if}
    </div>
  </div>

  <div
    class="absolute bottom-3 right-3 top-3 z-10 flex w-80 max-w-[85vw] flex-col gap-3 overflow-y-auto"
  >
    {#if !previewing}
      <section
        class="rounded-box bg-base-200 p-3 text-sm shadow-xl"
        data-testid="tool-card"
      >
        <h2 class="mb-1 font-semibold">Параметры</h2>
        {#if stage === 'openings'}
          <div class="mb-2 flex gap-1">
            <button
              class="btn btn-xs"
              class:btn-primary={opKind === 'door'}
              data-testid="opening-kind-door"
              onclick={() => setOpKind('door')}
            >
              <DoorOpen size={12} /> Дверь
            </button>
            <button
              class="btn btn-xs"
              class:btn-primary={opKind === 'window'}
              data-testid="opening-kind-window"
              onclick={() => setOpKind('window')}
            >
              <AppWindow size={12} /> Окно
            </button>
          </div>
          <div class="grid grid-cols-3 gap-1">
            <label class="flex flex-col text-xs">
              Ширина
              <input
                type="number"
                class="input input-xs input-bordered"
                step="10"
                min={opKind === 'door'
                  ? DOOR_LIMITS.widthMin
                  : WINDOW_LIMITS.widthMin}
                max={opKind === 'door'
                  ? DOOR_LIMITS.widthMax
                  : WINDOW_LIMITS.widthMax}
                bind:value={opWidth}
                data-testid="opening-width"
              />
            </label>
            <label class="flex flex-col text-xs">
              Высота
              <input
                type="number"
                class="input input-xs input-bordered"
                step="10"
                bind:value={opHeight}
                data-testid="opening-height"
              />
            </label>
            {#if opKind === 'window'}
              <label class="flex flex-col text-xs">
                Sill
                <input
                  type="number"
                  class="input input-xs input-bordered"
                  step="10"
                  min={WINDOW_LIMITS.sillMin}
                  max={WINDOW_LIMITS.sillMax}
                  bind:value={opSill}
                  data-testid="opening-sill"
                />
              </label>
            {/if}
          </div>
        {:else if stage === 'floorObjects'}
          <div class="grid grid-cols-[1fr_auto] gap-1">
            <label class="flex flex-col text-xs">
              Тип из каталога
              <select
                class="select select-xs select-bordered"
                bind:value={flKind}
                data-testid="floor-kind"
              >
                {#each FLOOR_CATALOG as e (e.kind)}
                  <option value={e.kind}
                    >{e.label} · {e.defW}×{e.defD}×{e.defH}</option
                  >
                {/each}
              </select>
            </label>
            <button
              class="btn btn-xs self-end"
              data-testid="place-rotate"
              title="Повернуть на 90°"
              onclick={cycleRot}>∠ {flRot}°</button
            >
          </div>
        {:else if stage === 'wallObjects'}
          <div class="grid grid-cols-2 gap-1">
            <label class="col-span-2 flex flex-col text-xs">
              Тип
              <select
                class="select select-xs select-bordered"
                bind:value={woKind}
                data-testid="wallobj-kind"
              >
                {#each WALL_CATALOG as e (e.kind)}
                  <option value={e.kind}>{e.label} · {e.defW}×{e.defH}</option>
                {/each}
              </select>
            </label>
            <label class="col-span-2 flex flex-col text-xs">
              Высота низа от пола, мм
              <input
                type="number"
                class="input input-xs input-bordered"
                step="10"
                min="0"
                bind:value={woHeight}
                data-testid="wallobj-height"
              />
            </label>
          </div>
        {:else if stage === 'sockets'}
          <div class="mb-2 flex gap-1">
            <button
              class="btn btn-xs"
              class:btn-primary={elKind === 'socket'}
              data-testid="elec-kind-socket"
              onclick={() => setElKind('socket')}>Розетка · 300</button
            >
            <button
              class="btn btn-xs"
              class:btn-primary={elKind === 'switch'}
              data-testid="elec-kind-switch"
              onclick={() => setElKind('switch')}>Выключатель · 900</button
            >
          </div>
          <div class="grid grid-cols-2 gap-1">
            <label class="flex flex-col text-xs">
              Назначение
              <input
                class="input input-xs input-bordered"
                bind:value={elPurpose}
                data-testid="elec-purpose"
              />
            </label>
            <label class="flex flex-col text-xs">
              Группа
              <select
                class="select select-xs select-bordered"
                bind:value={elGroup}
                data-testid="elec-group"
              >
                <option value="">—</option>
                {#each elecGroups as g (g.id)}<option value={g.id}
                    >{g.label}</option
                  >{/each}
              </select>
            </label>
          </div>
          <div class="mt-1 flex gap-1">
            <input
              class="input input-xs input-bordered flex-1"
              placeholder="Новая группа…"
              bind:value={elNewGroup}
              data-testid="elec-newgroup"
            />
            <button
              class="btn btn-xs"
              data-testid="elec-newgroup-add"
              onclick={() => {
                if (!elNewGroup.trim()) return;
                const ids = new Set(elecGroups.map((g) => g.id));
                const id = freshGroupId('g', ids);
                onOp({
                  type: 'upsertElecGroup',
                  groupId: id,
                  label: elNewGroup.trim(),
                });
                elGroup = id;
                elNewGroup = '';
              }}>+ группа</button
            >
          </div>
        {:else if stage === 'lighting'}
          <label class="flex flex-col text-xs">
            Тип
            <select
              class="select select-xs select-bordered"
              bind:value={liKind}
              data-testid="light-kind"
            >
              <option value="ceilingLamp">Потолочный светильник</option>
              <option value="spot">Точечный</option>
              <option value="ledStrip">LED-лента</option>
              <option value="wallLamp">Бра</option>
            </select>
          </label>
          <label class="mt-1 flex flex-col text-xs">
            Группа
            <select
              class="select select-xs select-bordered"
              bind:value={liGroup}
              data-testid="light-group"
            >
              <option value="">—</option>
              {#each lightGroups as g (g.id)}<option value={g.id}
                  >{g.label}</option
                >{/each}
            </select>
          </label>
          <div class="mt-1 flex gap-1">
            <input
              class="input input-xs input-bordered flex-1"
              placeholder="Новая группа света…"
              bind:value={liNewGroup}
              data-testid="light-newgroup"
            />
            <button
              class="btn btn-xs"
              data-testid="light-newgroup-add"
              onclick={() => {
                if (!liNewGroup.trim()) return;
                const ids = new Set(lightGroups.map((g) => g.id));
                const id = freshGroupId('lg', ids);
                onOp({
                  type: 'upsertLightGroup',
                  groupId: id,
                  label: liNewGroup.trim(),
                });
                liGroup = id;
                liNewGroup = '';
              }}>+ группа</button
            >
          </div>
        {/if}
      </section>
    {/if}
    <FeatureTreePanel
      {features}
      {previewIndex}
      {onTogglePreview}
      {onEditFeature}
      {draftStage}
    >
      {#snippet footer()}
        {#if previewing}
          <div class="flex items-center gap-2">
            <button
              class="btn btn-sm flex-1"
              data-testid="back-to-head"
              onclick={onBackToHead}
            >
              К голове
            </button>
            <button
              class="btn btn-sm btn-primary flex-1"
              data-testid="edit-stage"
              onclick={onEditStage}
            >
              Редактировать этап
            </button>
          </div>
        {:else}
          {#if commitSpec}
            <button
              class="btn btn-sm btn-primary w-full"
              data-testid={commitSpec.testId}
              data-draft-count={draftCount}
              disabled={commitSpec.disabled}
              onclick={commitSpec.onCommit}
            >
              {commitSpec.label}
            </button>
          {/if}
          {#if editing || draftCount > 0 || stage === 'lighting'}
            <div class="flex items-center gap-2">
              {#if editing}
                <button
                  class="btn btn-sm btn-ghost flex-1"
                  data-testid="discard-draft"
                  onclick={onDiscard}
                >
                  Отмена
                </button>
              {:else if draftCount > 0}
                <button
                  class="btn btn-sm btn-ghost flex-1"
                  data-testid="discard-draft"
                  onclick={onDiscard}
                >
                  Сбросить
                </button>
              {:else}
                <button
                  class="btn btn-sm btn-ghost flex-1"
                  data-testid="to-viewer"
                  onclick={onToViewer}
                >
                  К просмотру →
                </button>
              {/if}
            </div>
          {/if}
        {/if}
      {/snippet}
    </FeatureTreePanel>
    {#if !previewing}
      {#if stage === 'openings'}
        <OpeningsPanel {openings} {onOp} />
      {:else if stage === 'floorObjects'}
        <FloorObjectsPanel objects={floorObjects} {onOp} />
      {:else if stage === 'wallObjects'}
        <WallObjectsPanel objects={wallObjects} {onOp} />
      {:else if stage === 'sockets'}
        <ElecPanel points={elecPoints} {onOp} onSuggest={onSuggestElec} />
      {:else if stage === 'lighting'}
        <LightsPanel lights={luminaires} {onOp} onSuggest={onSuggestLights} />
      {/if}
      <ConflictsPanel
        live={liveConflicts}
        {historyConflicts}
        {draftErrors}
        {onOp}
      />
    {/if}
    <StructurePanel
      {scene}
      {selectedId}
      onSelectEntity={(id) => (selectedId = toggleEntity(selectedId, id))}
      onDeleteWall={previewing ? undefined : onDeleteWall}
    />
  </div>
</div>
