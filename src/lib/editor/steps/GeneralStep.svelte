<script lang="ts">
  import type { ProjectForm } from '#lib/forms/ctx';
  import NumberField from '#lib/forms/fields/NumberField.svelte';
  import SegmentedField from '#lib/forms/fields/SegmentedField.svelte';
  import TextField from '#lib/forms/fields/TextField.svelte';
  import TextareaField from '#lib/forms/fields/TextareaField.svelte';
  import ToggleField from '#lib/forms/fields/ToggleField.svelte';

  let { form }: { form: ProjectForm } = $props();
</script>

<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
  <TextField {form} path={['meta', 'name']} label="Название проекта" />
  <NumberField
    {form}
    path={['general', 'areaM2']}
    label="Площадь, м²"
    min={5}
    max={500}
  />
  <NumberField
    {form}
    path={['general', 'rooms']}
    label="Комнат"
    min={0}
    max={12}
  />
  <NumberField
    {form}
    path={['general', 'bathrooms']}
    label="Санузлов"
    min={0}
    max={5}
  />
  <SegmentedField
    {form}
    path={['general', 'stage']}
    label="Стадия объекта"
    options={[
      { value: 'rough', label: 'Черновой' },
      { value: 'whitebox', label: 'White box' },
      { value: 'lived', label: 'Жилая' },
    ]}
  />
  <div class="flex flex-col gap-1">
    <ToggleField {form} path={['general', 'kitchenPresent']} label="Кухня" />
    <ToggleField {form} path={['general', 'balcony']} label="Балкон/лоджия" />
    <ToggleField
      {form}
      path={['general', 'noLayoutMode']}
      label="Пока нет точной планировки"
      hint="Расчёт по типовым значениям"
    />
  </div>
</div>
<details class="collapse-arrow bg-base-100 collapse mt-3">
  <summary class="collapse-title font-medium"
    >Точное количество точек (необязательно)</summary
  >
  <div class="collapse-content grid grid-cols-1 gap-3 md:grid-cols-2">
    <NumberField
      {form}
      path={['general', 'doorsCount']}
      label="Дверей"
      hint="Влияет на проходные выключатели"
      min={0}
      max={30}
    />
    <NumberField
      {form}
      path={['general', 'socketsEstimate']}
      label="Точек"
      hint="0 — посчитаем сами по площади"
      min={0}
      max={300}
    />
  </div>
</details>
<div class="mt-3">
  <TextareaField {form} path={['meta', 'comment']} label="Комментарий" />
</div>
