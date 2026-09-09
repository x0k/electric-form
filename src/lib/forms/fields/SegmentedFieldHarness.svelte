<script lang="ts">
  import { createProjectForm, type ProjectForm } from '#lib/forms/ctx';
  import { createDefaultProject } from '#lib/project/defaults';
  import SegmentedField from './SegmentedField.svelte';

  let {
    path,
    label,
    options,
    onform,
  }: {
    path: any;
    label: string;
    options: readonly { value: string; label: string }[];
    onform: (form: ProjectForm) => void;
  } = $props();

  const form = createProjectForm(createDefaultProject());
  $effect(() => {
    onform(form);
  });
</script>

<SegmentedField {form} {path} {label} {options} />
