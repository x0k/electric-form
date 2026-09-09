<script lang="ts">
  import { getInput } from '@formisch/svelte';
  import * as v from 'valibot';
  import { createProjectForm, type ProjectForm } from '#lib/forms/ctx';
  import { applyDerivedFields, deriveKey } from '#lib/forms/derived';
  import { createDefaultProject } from '#lib/project/defaults';
  import { ProjectSchema } from '#lib/project/schemas';
  import GeneralStep from './GeneralStep.svelte';
  import LightingStep from './LightingStep.svelte';

  let { onform }: { onform: (form: ProjectForm) => void } = $props();

  // Та же связка, что в шелле EditorForm: стор + реактивный view + эффект.
  const form = createProjectForm(createDefaultProject('Тест'));
  const liveInput = $derived(getInput(form));
  const parsed = $derived(v.safeParse(ProjectSchema, liveInput));
  const view = $derived(
    parsed.success ? parsed.output : createDefaultProject('Тест')
  );

  let prevKey: string | null = $state(null);
  $effect(() => {
    const key = deriveKey(view.general);
    if (prevKey === null) {
      prevKey = key;
      return;
    }
    if (key === prevKey) return;
    prevKey = key;
    applyDerivedFields(form, view);
    onform(form);
  });
  $effect(() => {
    onform(form);
  });
</script>

<GeneralStep {form} {view} />
<LightingStep {form} {view} />
