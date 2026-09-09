<script lang="ts">
  import type { ProjectForm } from '#lib/forms/ctx';
  import NumberField from '#lib/forms/fields/NumberField.svelte';
  import ToggleField from '#lib/forms/fields/ToggleField.svelte';

  let { form }: { form: ProjectForm } = $props();
</script>

<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
  <NumberField
    {form}
    path={['lighting', 'groups']}
    label="Групп освещения"
    min={0}
    max={40}
  />
  <ToggleField
    {form}
    path={['lighting', 'passThrough']}
    label="Проходные выключатели"
  />
  <ToggleField
    {form}
    path={['lighting', 'kitchenLed']}
    label="Подсветка кухни"
  />
  <ToggleField
    {form}
    path={['lighting', 'mirrorLed']}
    label="Подсветка зеркал"
  />
  <ToggleField
    {form}
    path={['lighting', 'decorLed']}
    label="Декоративная подсветка"
  />
  <ToggleField {form} path={['lighting', 'dimming']} label="Диммирование" />
  <ToggleField {form} path={['lighting', 'smart']} label="Умный дом (свет)" />
</div>
