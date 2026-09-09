<script lang="ts">
  import type { ProjectForm } from '#lib/forms/ctx';
  import { deriveLightingGroups } from '#lib/forms/derived';
  import NumberField from '#lib/forms/fields/NumberField.svelte';
  import SegmentedField from '#lib/forms/fields/SegmentedField.svelte';
  import ToggleField from '#lib/forms/fields/ToggleField.svelte';
  import type { Project } from '#lib/project/types';

  let { form, view }: { form: ProjectForm; view: Project } = $props();
  const anyLed = $derived(
    view.lighting.kitchenLed ||
      view.lighting.mirrorLed ||
      view.lighting.decorLed
  );
  const pushActive = $derived(
    view.lighting.dimming && anyLed && view.lighting.ledControl === 'push'
  );
</script>

<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
  <NumberField
    {form}
    path={['lighting', 'groups']}
    label="Групп освещения"
    hint="Комнаты + кухня + коридор; поправьте при нужде"
    min={0}
    max={40}
    auto
    autoValue={deriveLightingGroups(view.general)}
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

{#if anyLed}
  <h3 class="mt-4 font-semibold">Лента: питание и управление</h3>
  <div class="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
    <ToggleField
      {form}
      path={['lighting', 'ledPanel']}
      label="Отдельный щит под ленту"
      hint="От него тянем отдельные линии — больше кабеля; без него — от общей фазы света"
    />
    {#if view.lighting.dimming}
      <SegmentedField
        {form}
        path={['lighting', 'ledControl']}
        label="Управление лентой"
        options={[
          { value: 'triac', label: 'Обычный диммер' },
          { value: 'push', label: 'Push-кнопка' },
        ]}
      />
    {/if}
    {#if !pushActive}
      <ToggleField
        {form}
        path={['lighting', 'ledSoftstart']}
        label="Плавный пуск"
        hint="Для обычной установки через выключатель/диммер"
      />
    {/if}
  </div>
{/if}
