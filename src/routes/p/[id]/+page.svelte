<script lang="ts">
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import EditorForm from '#lib/editor/EditorForm.svelte';
  import { createDefaultProject } from '#lib/project/defaults';
  import type { Project } from '#lib/project/types';
  import {
    loadProjects,
    persistProjects,
    upsertProject,
  } from '#lib/storage/repo';

  let project = $state<Project | null>(null);
  let list = $state<Project[]>([]);

  onMount(() => {
    list = loadProjects();
    const id = page.params.id ?? 'new';
    const found = list.find((p) => p.meta.id === id);
    if (found) {
      project = found;
    } else {
      const p = createDefaultProject('Новая квартира');
      p.meta.id = id;
      project = p;
      list = [...list, p];
      persistProjects(list);
    }
  });

  function onsave(p: Project) {
    list = upsertProject(list, p);
    persistProjects(list);
  }
</script>

{#if project}
  <EditorForm {project} {onsave} />
{:else}
  <div class="mx-auto max-w-3xl p-4">
    <span class="loading loading-spinner"></span> Загрузка…
  </div>
{/if}
