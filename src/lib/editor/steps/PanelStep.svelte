<script lang="ts">
  import type { ProjectForm } from '#lib/forms/ctx';
  import NumberField from '#lib/forms/fields/NumberField.svelte';
  import SelectField from '#lib/forms/fields/SelectField.svelte';
  import ToggleField from '#lib/forms/fields/ToggleField.svelte';
  import { PANEL_OPTION_IDS, PANEL_OPTION_LABELS } from '#lib/project/schemas';

  let { form }: { form: ProjectForm } = $props();
</script>

<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
  <SelectField
    {form}
    path={['panel', 'phases']}
    label="Фазы"
    options={[
      { value: '1', label: '1 фаза' },
      { value: '3', label: '3 фазы' },
    ]}
  />
  <SelectField
    {form}
    path={['panel', 'grounding']}
    label="Заземление"
    options={[
      { value: 'TN-C-S', label: 'TN-C-S' },
      { value: 'TN-S', label: 'TN-S' },
      { value: 'TT', label: 'TT' },
      { value: 'unknown', label: 'Неизвестно' },
    ]}
  />
  <NumberField
    {form}
    path={['panel', 'mainBreakerA']}
    label="Вводной автомат, А"
    min={10}
    max={100}
  />
  <NumberField
    {form}
    path={['panel', 'inputA']}
    label="Номинал ввода, А"
    min={10}
    max={100}
  />
  <NumberField
    {form}
    path={['panel', 'reserveModules']}
    label="Резервных модулей"
    min={0}
    max={24}
  />
</div>
<h3 class="mt-4 font-semibold">Опции (необязательные)</h3>
<div class="mt-2 grid grid-cols-1 gap-x-4 md:grid-cols-2">
  {#each PANEL_OPTION_IDS as id (id)}
    <ToggleField
      {form}
      path={['panel', 'options', id]}
      label={PANEL_OPTION_LABELS[id]}
    />
  {/each}
</div>
