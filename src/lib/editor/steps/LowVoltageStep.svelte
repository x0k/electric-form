<script lang="ts">
  import type { ProjectForm } from '#lib/forms/ctx';
  import {
    deriveEthernetPoints,
    deriveTvOutlets,
    deriveWifiAP,
    fillLowVoltageDefaults,
  } from '#lib/forms/derived';
  import NumberField from '#lib/forms/fields/NumberField.svelte';
  import ToggleField from '#lib/forms/fields/ToggleField.svelte';
  import type { Project } from '#lib/project/types';

  let { form, view }: { form: ProjectForm; view: Project } = $props();

  const tvAuto = $derived(deriveTvOutlets(view.general));
  const wifiAuto = $derived(deriveWifiAP(view.general));
  const ethAuto = $derived(deriveEthernetPoints(tvAuto, wifiAuto));

  const hasWiredPoints = $derived(
    view.lowVoltage.ethernetPoints +
      view.lowVoltage.wifiAP +
      view.lowVoltage.cameras >
      0
  );
</script>

<p class="mb-2 text-sm opacity-70">
  Интернет, ТВ и видеонаблюдение. По умолчанию нули — ничего не считаем, пока не
  попросите. Типовые для этой квартиры: Ethernet {ethAuto}, ТВ
  {tvAuto}, Wi-Fi {wifiAuto}.
</p>
<button
  type="button"
  class="btn btn-outline mb-3 w-full"
  title="Проставит типовые количества как явный ввод"
  onclick={() => fillLowVoltageDefaults(form, view)}
>
  Заполнить типовые
</button>
<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
  <NumberField
    {form}
    path={['lowVoltage', 'ethernetPoints']}
    label="Ethernet-точек"
    hint="Розетки для компьютера, ТВ, принтера"
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
    hint="Потолочные точки доступа"
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
  {#if hasWiredPoints}
    <ToggleField
      {form}
      path={['lowVoltage', 'poe']}
      label="PoE"
      hint="Питание камер и точек по витой паре"
    />
  {/if}
  <ToggleField {form} path={['lowVoltage', 'intercom']} label="Домофон" />
  <ToggleField {form} path={['lowVoltage', 'nas']} label="NAS/сервер" />
</div>
