<script lang="ts">
  import PlanViewer from '#lib/plan/PlanViewer.svelte';
  import { buildSampleFlat } from '#lib/plan/sample';
  import { modelToScene, selectableIds } from '#lib/plan/render';
  import { toggleEntity } from '#lib/plan/selection';

  const scene = modelToScene(buildSampleFlat());
  const ids = selectableIds(scene);
  let selectedId: string | null = $state(null);

  function describe(id: string): string {
    const wall = scene.walls.find((w) => w.id === id);
    if (wall) {
      return `Стена ${(wall.lengthMm / 1000).toFixed(1)} м`;
    }
    const slab = scene.slabs.find((s) => s.id === id);
    if (slab) return slab.kind === 'floor' ? 'Пол' : 'Потолок';
    return id;
  }
</script>

<svelte:head>
  <title>Планировка — 3D-просмотр</title>
</svelte:head>

<main class="mx-auto flex min-h-screen max-w-6xl flex-col gap-4 p-4">
  <header class="flex items-baseline justify-between">
    <h1 class="text-2xl font-bold">Планировка — тестовая модель</h1>
    <a href="/" class="link link-primary">← Проекты</a>
  </header>
  <p class="text-sm opacity-70">
    Этап 2: сцена из Domain Model, свободная орбитальная камера, выбор объектов
    кликом по сцене или по списку.
  </p>

  <div class="flex flex-col gap-4 md:flex-row">
    <div class="h-[60vh] min-h-96 flex-1 rounded-box border border-base-300">
      <PlanViewer {scene} {selectedId} onSelect={(id) => (selectedId = id)} />
    </div>

    <aside class="w-full shrink-0 md:w-64">
      <h2 class="mb-2 font-semibold">Объекты ({ids.length})</h2>
      <ul class="menu w-full rounded-box bg-base-200">
        {#each ids as id (id)}
          <li>
            <button
              class:active={selectedId === id}
              onclick={() => (selectedId = toggleEntity(selectedId, id))}
            >
              <span class="font-mono text-xs">{id}</span>
              <span class="text-xs opacity-70">{describe(id)}</span>
            </button>
          </li>
        {/each}
      </ul>
      <p class="mt-2 text-sm">
        Выбрано: <strong>{selectedId ?? '—'}</strong>
      </p>
    </aside>
  </div>
</main>
