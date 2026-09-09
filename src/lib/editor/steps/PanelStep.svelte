<script lang="ts">
  import type { ProjectForm } from '#lib/forms/ctx';
  import NumberField from '#lib/forms/fields/NumberField.svelte';
  import SegmentedField from '#lib/forms/fields/SegmentedField.svelte';
  import SelectField from '#lib/forms/fields/SelectField.svelte';
  import ToggleField from '#lib/forms/fields/ToggleField.svelte';
  import type { Project } from '#lib/project/types';

  let { form, view }: { form: ProjectForm; view: Project } = $props();

  const is3ph = $derived(view.panel.phases === '3');
  const useRcbo = $derived(view.panel.options.rcbo);
</script>

<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
  <SegmentedField
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
    hint="Не знаете — оставьте «Неизвестно»"
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
    hint="Спросите в УК или посмотрите на счётчике"
    min={10}
    max={100}
  />
  <NumberField
    {form}
    path={['panel', 'reserveModules']}
    label="Резервных модулей"
    hint="Свободное место в щите на будущее"
    min={0}
    max={24}
  />
</div>

<h3 class="mt-4 font-semibold">Защита</h3>
<div class="mt-2 grid grid-cols-1 gap-x-4 md:grid-cols-2">
  <ToggleField
    {form}
    path={['panel', 'options', 'voltageRelay']}
    label="Реле напряжения"
    hint="Спасает технику от скачков"
  />
  <ToggleField
    {form}
    path={['panel', 'options', 'fireRcd']}
    label="Противопожарное УЗО"
  />
  <ToggleField
    {form}
    path={['panel', 'options', 'spd']}
    label="УЗИП"
    hint="От грозовых перенапряжений"
  />
  {#if !useRcbo}
    <ToggleField
      {form}
      path={['panel', 'options', 'separateRcds']}
      label="Отдельные УЗО на группы"
      hint="Дороже, но надёжнее одного общего"
    />
  {/if}
  <ToggleField
    {form}
    path={['panel', 'options', 'rcbo']}
    label="Дифавтоматы вместо УЗО+АВ"
    hint="Компактнее, но дороже"
  />
  {#if useRcbo}
    <p class="text-sm opacity-60">
      Дифавтоматы уже включают защиту УЗО — отдельные УЗО не нужны.
    </p>
  {/if}
</div>

<h3 class="mt-4 font-semibold">Удобство</h3>
<div class="mt-2 grid grid-cols-1 gap-x-4 md:grid-cols-2">
  <ToggleField
    {form}
    path={['panel', 'options', 'nonDisconnect']}
    label="Неотключаемые линии"
    hint="Холодильник и интернет не гаснут"
  />
  <ToggleField
    {form}
    path={['panel', 'options', 'fridgeLine']}
    label="Отдельная линия холодильника"
    hint="Не обесточится вместе с остальной квартирой"
  />
  <ToggleField
    {form}
    path={['panel', 'options', 'netLine']}
    label="Линия интернета/оборудования"
    hint="Роутер и NAS переживут общее отключение"
  />
  <ToggleField
    {form}
    path={['panel', 'options', 'reserveBreakers']}
    label="Резервные автоматы"
    hint="Запасные автоматы уже стоят в щите"
  />
  <ToggleField
    {form}
    path={['panel', 'options', 'extraPanel']}
    label="Доп. щит / слаботочный шкаф"
    hint="Второй корпус: +место под автоматы и слаботочку"
  />
</div>

<details class="collapse-arrow bg-base-100 collapse mt-3">
  <summary class="collapse-title font-medium"
    >Редкие опции — для сложных случаев</summary
  >
  <div class="collapse-content">
    <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
      <NumberField
        {form}
        path={['panel', 'inputA']}
        label="Номинал ввода, А"
        hint="Обычно совпадает с вводным автоматом"
        min={10}
        max={100}
      />
    </div>
    <div class="mt-2 grid grid-cols-1 gap-x-4 md:grid-cols-2">
      {#if is3ph}
        <ToggleField
          {form}
          path={['panel', 'options', 'phaseRelay']}
          label="Реле контроля фаз"
          hint="Только для 3 фаз"
        />
      {/if}
      {#if !useRcbo}
        <ToggleField
          {form}
          path={['panel', 'options', 'selectiveRcd']}
          label="Селективное УЗО"
          hint="Отключает только аварийную линию"
        />
      {/if}
      <ToggleField
        {form}
        path={['panel', 'options', 'contactor']}
        label="Контактор"
        hint="Отключение групп по кнопке — например «выключить всё»"
      />
      <ToggleField
        {form}
        path={['panel', 'options', 'bypass']}
        label="Ручной/авто байпас"
        hint="Обход реле/стабилизатора на время ремонта"
      />
      <ToggleField
        {form}
        path={['panel', 'options', 'voltIndication']}
        label="Индикация напряжения"
        hint="Видите напряжение прямо на щите"
      />
      <ToggleField
        {form}
        path={['panel', 'options', 'wattmeter']}
        label="Модульный ваттметр"
        hint="Считает расход электроэнергии в щите"
      />
      <ToggleField
        {form}
        path={['panel', 'options', 'powerLimit']}
        label="Ограничение мощности"
        hint="Отключит нагрузку при превышении выделенной мощности"
      />
    </div>
  </div>
</details>
