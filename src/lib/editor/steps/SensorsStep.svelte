<script lang="ts">
  import type { ProjectForm } from '#lib/forms/ctx';
  import ToggleField from '#lib/forms/fields/ToggleField.svelte';

  let { form }: { form: ProjectForm } = $props();
</script>

<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
  <ToggleField {form} path={['sensors', 'leakage']} label="Протечки" />
  <ToggleField {form} path={['sensors', 'valves']} label="Э/м клапаны" />
  <ToggleField {form} path={['sensors', 'smoke']} label="Дымовые датчики" />
  <ToggleField {form} path={['sensors', 'motion']} label="Датчики движения" />
  <ToggleField
    {form}
    path={['sensors', 'openSensor']}
    label="Датчики открытия"
  />
  <ToggleField {form} path={['sensors', 'temp']} label="Температура" />
  <ToggleField {form} path={['sensors', 'smartHome']} label="Умный дом" />
  <ToggleField {form} path={['sensors', 'curtains']} label="Электрокарнизы" />
</div>
