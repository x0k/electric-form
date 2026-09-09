<script lang="ts">
  import type { ProjectForm } from '#lib/forms/ctx';
  import { fillProcurementBlanks } from '#lib/forms/derived';
  import NumberField from '#lib/forms/fields/NumberField.svelte';
  import ToggleField from '#lib/forms/fields/ToggleField.svelte';
  import type { Project } from '#lib/project/types';

  let { form, view }: { form: ProjectForm; view: Project } = $props();
</script>

<p class="mb-2 text-sm opacity-70">
  Защита и автоматика. Количество — для закупки, пусто значит 0.
</p>
<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
  <NumberField
    {form}
    path={['sensors', 'leakQty']}
    label="Датчиков протечки, шт"
    hint="На пол в санузле и кухне; пусто = 0"
    min={0}
    max={30}
  />
  <NumberField
    {form}
    path={['sensors', 'valveQty']}
    label="Клапанов, шт"
    hint="Сами перекроют воду; пусто = 0"
    min={0}
    max={20}
  />
  <NumberField
    {form}
    path={['sensors', 'smokeQty']}
    label="Дымовых датчиков, шт"
    hint="Количество для закупки (пусто = 0)"
    min={0}
    max={30}
  />
  <NumberField
    {form}
    path={['sensors', 'motionQty']}
    label="Датчиков движения, шт"
    hint="Для света в коридоре и санузле; пусто = 0"
    min={0}
    max={30}
  />
  <ToggleField {form} path={['sensors', 'temp']} label="Датчики температуры" />
  <NumberField
    {form}
    path={['sensors', 'curtainQty']}
    label="Электрокарнизов, шт"
    hint="Нужно заложить питание у окон; пусто = 0"
    min={0}
    max={20}
  />
  <button
    type="button"
    class="btn btn-outline w-full md:col-span-2"
    title="Проставит расчётные количества в пустые поля включённых позиций"
    onclick={() => fillProcurementBlanks(form, view, 'sensors')}
  >
    Заполнить количества по расчёту
  </button>
</div>
<details class="collapse-arrow bg-base-100 collapse mt-3">
  <summary class="collapse-title font-medium">Умный дом и редкое</summary>
  <div class="collapse-content grid grid-cols-1 gap-3 md:grid-cols-2">
    <ToggleField
      {form}
      path={['sensors', 'smartHome']}
      label="Умный дом"
      hint="Общая шина и резерв в щите"
    />
    <ToggleField
      {form}
      path={['sensors', 'openSensor']}
      label="Датчики открытия"
      hint="Окна и двери"
    />
  </div>
</details>
