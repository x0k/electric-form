<script lang="ts">
  import type { ProjectForm } from '#lib/forms/ctx';
  import NumberField from '#lib/forms/fields/NumberField.svelte';
  import ToggleField from '#lib/forms/fields/ToggleField.svelte';
  import type { Project } from '#lib/project/types';

  let { form, view }: { form: ProjectForm; view: Project } = $props();
</script>

<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
  <NumberField
    {form}
    path={['lighting', 'groups']}
    label="Групп освещения"
    hint="Обычно = числу комнат + кухня и коридор"
    min={0}
    max={40}
  />
  {#if view.general.kitchenPresent}
    <ToggleField
      {form}
      path={['lighting', 'kitchenLed']}
      label="Подсветка кухни"
    />
  {/if}
  {#if view.lighting.groups > 0}
    <ToggleField
      {form}
      path={['lighting', 'passThrough']}
      label="Проходные выключатели"
      hint="Управление из двух мест (коридор, спальня)"
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
    <ToggleField
      {form}
      path={['lighting', 'dimming']}
      label="Диммирование"
      hint="Плавная регулировка яркости"
    />
    <ToggleField {form} path={['lighting', 'smart']} label="Умный дом (свет)" />
  {:else}
    <p class="text-sm opacity-60">
      Укажите число групп — появятся варианты подсветки и управления.
    </p>
  {/if}
</div>
