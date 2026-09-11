<script lang="ts">
  import PlanViewer from './PlanViewer.svelte';
  import EditorToolbar from './EditorToolbar.svelte';
  import FeatureTreePanel from './FeatureTreePanel.svelte';
  import StructurePanel from './StructurePanel.svelte';
  import type { RenderScene } from './render';
  import type { Feature } from './history';
  import type { EditorCameraMode } from './camera';
  import { toggleEntity } from './selection';

  /**
   * Изометрический редактор модели: работает с закоммиченной историей
   * (стены уже возведены), готовит расстановку объектов следующих этапов.
   */

  interface Props {
    scene: RenderScene;
    features: Feature[];
    previewIndex: number | null;
    onTogglePreview: (index: number) => void;
    onBackToHead: () => void;
    onEditLayout: () => void;
  }

  let {
    scene,
    features,
    previewIndex,
    onTogglePreview,
    onBackToHead,
    onEditLayout,
  }: Props = $props();

  let cameraMode: EditorCameraMode = $state('iso');
  let isoPreset = $state(0);
  let viewNonce = $state(0);
  let showGrid = $state(true);
  let selectedId: string | null = $state(null);

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
      onSelect={(id) => (selectedId = id)}
    />
  </div>

  <div class="absolute left-3 top-3 z-10 max-w-[calc(100%-22rem)]">
    <div
      class="flex flex-col gap-2 rounded-box bg-base-100/95 p-2 shadow-xl backdrop-blur"
    >
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
    </div>
  </div>

  <div
    class="absolute bottom-3 right-3 top-3 z-10 flex w-72 max-w-[85vw] flex-col gap-3 overflow-y-auto"
  >
    <FeatureTreePanel
      {features}
      {previewIndex}
      {onTogglePreview}
      {onEditLayout}
    />
    <StructurePanel
      {scene}
      {selectedId}
      onSelectEntity={(id) => (selectedId = toggleEntity(selectedId, id))}
    />
    <section class="rounded-box bg-base-200 p-3 text-sm opacity-70">
      <h2 class="mb-1 font-semibold">Следующие этапы</h2>
      <p>Напольные и навесные объекты, электрика — в разработке.</p>
    </section>
  </div>
</div>
