<script lang="ts">
  import type { ProjectForm } from '#lib/forms/ctx';
  import NumberField from '#lib/forms/fields/NumberField.svelte';

  let { form }: { form: ProjectForm } = $props();
</script>

<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
  <NumberField
    {form}
    path={['work', 'electricians']}
    label="Электриков"
    min={1}
    max={6}
  />
  <NumberField
    {form}
    path={['work', 'complexityK']}
    label="Коэф. сложности"
    hint="0.8–1.6"
    min={0.8}
    max={1.6}
    step={0.05}
  />
  <NumberField
    {form}
    path={['work', 'uncertaintyK']}
    label="Коэф. неопределённости"
    hint="1–1.6"
    min={1}
    max={1.6}
    step={0.05}
  />
</div>
