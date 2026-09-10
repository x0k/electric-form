<script lang="ts">
  import { createProjectForm, type ProjectForm } from '#lib/forms/ctx';
  import type { NumberPath } from '#lib/forms/ctx';
  import { createDefaultProject } from '#lib/project/defaults';
  import NumberField from './NumberField.svelte';

  let {
    path,
    label,
    min,
    max,
    step,
    onform,
  }: {
    path: NumberPath;
    label: string;
    min?: number;
    max?: number;
    step?: number;
    onform: (form: ProjectForm) => void;
  } = $props();

  const form = createProjectForm(createDefaultProject());
  $effect(() => {
    onform(form);
  });
</script>

<NumberField {form} {path} {label} {min} {max} {step} />
