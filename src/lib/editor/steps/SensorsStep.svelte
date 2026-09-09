<script lang="ts">
  import type { ProjectForm } from '#lib/forms/ctx';
  import ToggleField from '#lib/forms/fields/ToggleField.svelte';
  import type { Project } from '#lib/project/types';

  let { form, view }: { form: ProjectForm; view: Project } = $props();
</script>

<p class="mb-2 text-sm opacity-70">
  Защита и автоматика. Нужное включайте — лишнее пропускайте.
</p>
<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
  <ToggleField
    {form}
    path={['sensors', 'leakage']}
    label="Защита от протечек"
    hint="Датчики на пол в санузле и кухне"
  />
  {#if view.sensors.leakage}
    <ToggleField
      {form}
      path={['sensors', 'valves']}
      label="Э/м клапаны"
      hint="Сами перекроют воду при протечке"
    />
  {/if}
  <ToggleField {form} path={['sensors', 'smoke']} label="Дымовые датчики" />
  <ToggleField
    {form}
    path={['sensors', 'motion']}
    label="Датчики движения"
    hint="Для света в коридоре и санузле"
  />
  <ToggleField {form} path={['sensors', 'temp']} label="Датчики температуры" />
  <ToggleField
    {form}
    path={['sensors', 'curtains']}
    label="Электрокарнизы"
    hint="Нужно заложить питание у окон"
  />
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
