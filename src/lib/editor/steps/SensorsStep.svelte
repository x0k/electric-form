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
    hint="На пол в санузле и кухне"
    min={0}
    max={30}
  />
  <NumberField
    {form}
    path={['sensors', 'valveQty']}
    label="Клапанов, шт"
    hint="Сами перекроют воду при протечке"
    min={0}
    max={20}
  />
  <ToggleField
    {form}
    path={['sensors', 'supRequired']}
    label="СУП обязателен"
    hint="Уравнивание потенциалов в санузле; можно выключить, если трубы пластиковые"
  />
  <NumberField
    {form}
    path={['sensors', 'smokeQty']}
    label="Дымовых датчиков, шт"
    min={0}
    max={30}
  />
  <NumberField
    {form}
    path={['sensors', 'motionQty']}
    label="Датчиков движения, шт"
    hint="Для света в коридоре и санузле"
    min={0}
    max={30}
  />
  <ToggleField
    {form}
    path={['sensors', 'temp']}
    label="Датчики температуры"
    hint="Для управления отоплением и кондиционером; по одному на комнату"
  />
  <NumberField
    {form}
    path={['sensors', 'curtainQty']}
    label="Электрокарнизов, шт"
    hint="Нужно заложить питание у окон"
    min={0}
    max={20}
  />
  <button
    type="button"
    class="btn btn-outline w-full md:col-span-2"
    title="Пересчитает все количества раздела по формулам"
    onclick={() => fillProcurementBlanks(form, view, 'sensors')}
  >
    Пересчитать количества
  </button>
</div>
<details class="collapse-arrow bg-base-100 collapse mt-3">
  <summary class="collapse-title font-medium">Умный дом и редкое</summary>
  <div class="collapse-content grid grid-cols-1 gap-3 md:grid-cols-2">
    <ToggleField
      {form}
      path={['sensors', 'smartHome']}
      label="Умный дом"
      hint="Контроллер в слаботочном щите + резерв под автоматику"
    />
    <ToggleField
      {form}
      path={['sensors', 'openSensor']}
      label="Датчики открытия"
      hint="На окна и двери; количество возьмём из числа дверей"
    />
  </div>
</details>
