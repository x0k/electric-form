<script lang="ts">
  import { page } from '$app/state';
  import PageHeader from '#lib/PageHeader.svelte';
  import { getProject } from '#lib/projects.remote';

  let { children } = $props();

  const id = $derived(page.params.id ?? 'new');
</script>

<svelte:boundary>
  {const project = $derived(await getProject(id))}
  <PageHeader title={project.meta.name || 'Проект'} backHref="/" />
  {@render children()}

  {#snippet pending()}
    <div class="mx-auto max-w-3xl p-4">
      <span class="loading loading-spinner"></span> Загрузка…
    </div>
  {/snippet}

  {#snippet failed(_, retry)}
    <div class="mx-auto max-w-3xl p-4">
      <div class="alert alert-error text-sm">
        <span>Не удалось загрузить проект.</span>
        <button class="btn btn-sm" onclick={retry}>Повторить</button>
      </div>
    </div>
  {/snippet}
</svelte:boundary>
