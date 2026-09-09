<script lang="ts">
  import type { ProjectForm } from '#lib/forms/ctx';
  import {
    deriveLightingGroups,
    fillProcurementBlanks,
  } from '#lib/forms/derived';
  import NumberField from '#lib/forms/fields/NumberField.svelte';
  import SegmentedField from '#lib/forms/fields/SegmentedField.svelte';
  import ToggleField from '#lib/forms/fields/ToggleField.svelte';
  import type { Project } from '#lib/project/types';

  let { form, view }: { form: ProjectForm; view: Project } = $props();

  const anyLed = $derived(
    (view.lighting.ledKitchenQty ?? 0) > 0 ||
      (view.lighting.ledMirrorQty ?? 0) > 0 ||
      (view.lighting.ledDecorQty ?? 0) > 0
  );
  const pushActive = $derived(anyLed && view.lighting.ledControl === 'push');
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
  <NumberField
    {form}
    path={['lighting', 'passThroughQty']}
    label="Проходных выключателей, шт"
    hint="Остальные посчитаются обычными (всего групп: {view.lighting.groups})"
    min={0}
    max={40}
  />
  <NumberField
    {form}
    path={['lighting', 'dimmerQty']}
    label="Диммеров, шт"
    hint="Для закупки"
    min={0}
    max={40}
  />
  {#if view.general.kitchenPresent}
    <NumberField
      {form}
      path={['lighting', 'ledKitchenQty']}
      label="Кухонных комплектов, шт"
      min={0}
      max={10}
    />
  {/if}
  <NumberField
    {form}
    path={['lighting', 'ledMirrorQty']}
    label="Комплектов для зеркал, шт"
    min={0}
    max={20}
  />
  <NumberField
    {form}
    path={['lighting', 'ledDecorQty']}
    label="Декор-комплектов, шт"
    min={0}
    max={10}
  />
  <ToggleField {form} path={['lighting', 'smart']} label="Умный дом (свет)" />
  <button
    type="button"
    class="btn btn-outline w-full md:col-span-2"
    title="Пересчитает все количества раздела по формулам"
    onclick={() => fillProcurementBlanks(form, view, 'lighting')}
  >
    Пересчитать количества
  </button>
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
    <SegmentedField
      {form}
      path={['lighting', 'ledControl']}
      label="Управление лентой"
      options={[
        { value: 'triac', label: 'Обычный диммер' },
        { value: 'push', label: 'Push-кнопка' },
      ]}
    />
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
