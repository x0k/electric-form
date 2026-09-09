<script lang="ts">
  import { getInput } from '@formisch/svelte';
  import * as v from 'valibot';
  import { createProjectForm } from '#lib/forms/ctx';
  import { createDefaultProject } from '#lib/project/defaults';
  import { ProjectSchema } from '#lib/project/schemas';
  import LightingStep from './LightingStep.svelte';

  const form = createProjectForm(createDefaultProject('Тест'));
  const liveInput = $derived(getInput(form));
  const parsed = $derived(v.safeParse(ProjectSchema, liveInput));
  const view = $derived(
    parsed.success ? parsed.output : createDefaultProject('Тест')
  );
</script>

<LightingStep {form} {view} />
