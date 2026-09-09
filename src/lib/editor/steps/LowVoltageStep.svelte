<script lang="ts">
  import type { ProjectForm } from '#lib/forms/ctx';
  import NumberField from '#lib/forms/fields/NumberField.svelte';
  import ToggleField from '#lib/forms/fields/ToggleField.svelte';

  let { form }: { form: ProjectForm } = $props();
</script>

<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
  <NumberField
    {form}
    path={['lowVoltage', 'ethernetPoints']}
    label="Ethernet-точек"
    min={0}
    max={40}
  />
  <NumberField
    {form}
    path={['lowVoltage', 'tvOutlets']}
    label="ТВ-розеток"
    min={0}
    max={20}
  />
  <NumberField
    {form}
    path={['lowVoltage', 'wifiAP']}
    label="Wi-Fi точек"
    min={0}
    max={10}
  />
  <NumberField
    {form}
    path={['lowVoltage', 'cameras']}
    label="Камер"
    min={0}
    max={16}
  />
  <ToggleField {form} path={['lowVoltage', 'poe']} label="PoE" />
  <ToggleField {form} path={['lowVoltage', 'intercom']} label="Домофон" />
  <ToggleField {form} path={['lowVoltage', 'nas']} label="NAS/сервер" />
</div>
