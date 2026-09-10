<script lang="ts">
  import { page } from '$app/state';
  import EditorForm from '#lib/editor/EditorForm.svelte';
  import { getProject, persistProject } from '#lib/projects.remote';

  const id = $derived(page.params.id ?? 'new');
  // Тот же задедуплицированный инстанс query, что в layout выше:
  // отдельного boundary здесь не нужно, покрывает boundary layout'а.
  const project = $derived(await getProject(id));
</script>

<EditorForm {project} onsave={(p) => persistProject(p)} />
