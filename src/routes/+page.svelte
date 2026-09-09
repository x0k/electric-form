<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { createDefaultProject } from '#lib/project/defaults';
  import type { Project } from '#lib/project/types';
  import { exportAll, importMany } from '#lib/storage/io';
  import { loadProjects, persistProjects } from '#lib/storage/repo';

  let projects = $state<Project[]>([]);
  let name = $state('');

  onMount(() => {
    projects = loadProjects();
  });

  function save() {
    persistProjects(projects);
  }

  function create() {
    const p = createDefaultProject(name.trim() || 'Новая квартира');
    projects = [...projects, p];
    save();
    name = '';
    goto(`/p/${p.meta.id}`);
  }

  function duplicate(id: string) {
    const src = projects.find((p) => p.meta.id === id);
    if (!src) return;
    const copy: Project = JSON.parse(JSON.stringify(src));
    copy.meta.id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    copy.meta.name = `${src.meta.name} (копия)`;
    projects = [...projects, copy];
    save();
  }

  function remove(id: string) {
    projects = projects.filter((p) => p.meta.id !== id);
    save();
  }

  function download() {
    const blob = new Blob([exportAll(projects)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'electric-projects.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function onImport(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const list = importMany(await file.text());
      projects = [...projects, ...list];
      save();
    } catch {
      alert('Не удалось импортировать файл');
    }
  }
</script>

<div class="mx-auto max-w-3xl p-4">
  <h1 class="text-2xl font-bold">Проекты электрики</h1>
  <p class="mt-1 opacity-70">
    Предварительная оценка материалов и сроков для квартир.
  </p>

  <div class="mt-4 flex gap-2">
    <input
      class="input input-bordered flex-1"
      placeholder="Название проекта"
      bind:value={name}
      onkeydown={(e) => e.key === 'Enter' && create()}
    />
    <button class="btn btn-primary" onclick={create}>Создать</button>
  </div>

  <div class="mt-4 flex gap-2">
    <button class="btn btn-ghost btn-sm" onclick={download}>Экспорт JSON</button
    >
    <label class="btn btn-ghost btn-sm">
      Импорт JSON
      <input
        type="file"
        accept="application/json"
        class="hidden"
        onchange={onImport}
      />
    </label>
  </div>

  {#if projects.length === 0}
    <div class="alert mt-6">
      <span>Пока нет проектов — создайте первый выше.</span>
    </div>
  {:else}
    <ul class="mt-4 space-y-2">
      {#each projects as p (p.meta.id)}
        <li class="card bg-base-200 p-3">
          <div class="flex items-center gap-2">
            <a class="link font-medium flex-1" href={`/p/${p.meta.id}`}
              >{p.meta.name}</a
            >
            <span class="badge badge-ghost"
              >{p.general.areaM2} м² · {p.general.rooms}к</span
            >
            <button
              class="btn btn-ghost btn-sm"
              onclick={() => duplicate(p.meta.id)}>Копия</button
            >
            <button
              class="btn btn-ghost btn-sm text-error"
              onclick={() => remove(p.meta.id)}>✕</button
            >
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>
