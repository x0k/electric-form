<script lang="ts">
  import type { ProjectForm } from '#lib/forms/ctx';
  import NumberField from '#lib/forms/fields/NumberField.svelte';
  import ToggleField from '#lib/forms/fields/ToggleField.svelte';

  let { form }: { form: ProjectForm } = $props();
</script>

<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
  <NumberField
    {form}
    path={['ac', 'count']}
    label="Кондиционеров"
    min={0}
    max={10}
  />
  <div class="flex flex-col gap-1">
    <ToggleField
      {form}
      path={['ac', 'dedicatedLines']}
      label="Отдельные линии"
    />
    <ToggleField
      {form}
      path={['ac', 'chaseNeeded']}
      label="Нужна закладка трасс"
    />
    <ToggleField
      {form}
      path={['ac', 'reserveFuture']}
      label="Резерв под будущие"
    />
  </div>
</div>
