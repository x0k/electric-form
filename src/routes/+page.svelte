<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import {
    BookOpen,
    Calculator,
    Copy,
    Download,
    Trash2,
    Upload,
  } from '@lucide/svelte';
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
    const target = projects.find((p) => p.meta.id === id);
    if (target && !confirm(`Удалить проект «${target.meta.name}»?`)) return;
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

<div class="mx-auto w-full max-w-xl px-4 pt-4 pb-10">
  <section class="card bg-base-200 p-4" aria-label="Новый проект">
    <h1 class="text-base font-bold">Новый проект</h1>
    <p class="mt-0.5 text-sm opacity-60">
      Оценка материалов и сроков электромонтажа квартиры.
    </p>
    <input
      class="input input-bordered mt-3 h-12 w-full"
      placeholder="Название, например «Двушка 72 м²»"
      enterkeyhint="go"
      autocomplete="off"
      bind:value={name}
      onkeydown={(e) => e.key === 'Enter' && create()}
    />
    <button class="btn btn-primary mt-2 h-12 w-full" onclick={create}>
      Создать
    </button>
  </section>

  <a class="btn btn-outline mt-3 h-12 w-full" href="/catalog">
    <BookOpen size={18} />
    Каталог цен
  </a>

  <section class="mt-6" aria-label="Проекты">
    <div class="flex items-center">
      <h2 class="px-1 text-base font-bold">
        Проекты
        {#if projects.length > 0}
          <span
            class="badge badge-ghost badge-sm ml-1 align-middle tabular-nums"
            >{projects.length}</span
          >
        {/if}
      </h2>
      <div class="flex-1"></div>
      <button
        class="btn btn-ghost btn-sm btn-square"
        title="Экспорт JSON"
        aria-label="Экспорт всех проектов в JSON"
        onclick={download}
      >
        <Download size={18} />
      </button>
      <label
        class="btn btn-ghost btn-sm btn-square"
        title="Импорт JSON"
        aria-label="Импорт проектов из JSON"
      >
        <Upload size={18} />
        <input
          type="file"
          accept="application/json"
          class="hidden"
          onchange={onImport}
        />
      </label>
    </div>

    {#if projects.length === 0}
      <div
        class="mt-2 rounded-2xl border border-dashed border-base-300 px-4 py-8 text-center"
      >
        <div
          class="mx-auto grid size-12 place-items-center rounded-full bg-base-200"
        >
          <Calculator size={22} class="opacity-60" />
        </div>
        <p class="mt-3 font-medium">Пока нет проектов</p>
        <p class="mt-1 text-sm opacity-60">
          Введите название выше и нажмите «Создать»
        </p>
      </div>
    {:else}
      <ul class="mt-2 space-y-2">
        {#each projects as p (p.meta.id)}
          <li class="card bg-base-200">
            <div class="flex items-center gap-0.5 p-1.5">
              <a class="min-w-0 flex-1 px-2.5 py-2" href={`/p/${p.meta.id}`}>
                <span class="block truncate font-medium">{p.meta.name}</span>
                <span class="mt-0.5 block text-xs opacity-60 tabular-nums"
                  >{p.general.areaM2} м² · {p.general.rooms}к · {p.general
                    .bathrooms}с/у</span
                >
              </a>
              <button
                class="btn btn-ghost btn-square shrink-0"
                title="Дублировать"
                aria-label="Дублировать {p.meta.name}"
                onclick={() => duplicate(p.meta.id)}
              >
                <Copy size={19} />
              </button>
              <button
                class="btn btn-ghost btn-square shrink-0 text-error"
                title="Удалить"
                aria-label="Удалить {p.meta.name}"
                onclick={() => remove(p.meta.id)}
              >
                <Trash2 size={19} />
              </button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</div>
