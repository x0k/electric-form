<script lang="ts">
  import type { ProjectForm } from '#lib/forms/ctx';
  import NumberField from '#lib/forms/fields/NumberField.svelte';
  import SegmentedField from '#lib/forms/fields/SegmentedField.svelte';
  import SelectField from '#lib/forms/fields/SelectField.svelte';
  import TextField from '#lib/forms/fields/TextField.svelte';
  import TextareaField from '#lib/forms/fields/TextareaField.svelte';
  import ToggleField from '#lib/forms/fields/ToggleField.svelte';
  import type { Project } from '#lib/project/types';

  let { form }: { form: ProjectForm; view: Project } = $props();
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
      {
        value: 'rough',
        label: 'Черновой',
        hint: 'Голые стены без отделки: штробим где угодно, кабель — до штукатурки',
      },
      {
        value: 'whitebox',
        label: 'White box',
        hint: 'Штукатурка и стяжка готовы: штробить можно, но ограниченно',
      },
      {
        value: 'lived',
        label: 'Жилая',
        hint: 'Ремонт готов: минимум штроб и пыли, больше открытого монтажа',
      },
    ]}
  />
  <div class="flex flex-col gap-1">
    <ToggleField {form} path={['general', 'kitchenPresent']} label="Кухня" />
    <ToggleField {form} path={['general', 'balcony']} label="Балкон/лоджия" />
    <ToggleField
      {form}
      path={['general', 'corrugation']}
      label="Кабель в гофре"
      hint="Гофра под кабель в штробах и перекрытиях"
    />
    <ToggleField
      {form}
      path={['general', 'noLayoutMode']}
      label="Пока нет точной планировки"
      hint="Расчёт по типовым значениям"
    />
  </div>
</div>

<h3 class="mt-4 font-semibold">Ввод в квартиру</h3>
<div class="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
  <SegmentedField
    {form}
    path={['general', 'phases']}
    label="Фазы"
    options={[
      { value: '1', label: '1 фаза' },
      { value: '3', label: '3 фазы' },
    ]}
  />
  <SelectField
    {form}
    path={['general', 'grounding']}
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
    path={['general', 'mainBreakerA']}
    label="Вводной автомат, А"
    hint="Спросите в УК или посмотрите на счётчике"
    min={10}
    max={100}
  />
  <NumberField
    {form}
    path={['general', 'inputA']}
    label="Номинал ввода, А"
    hint="Обычно совпадает с вводным автоматом"
    min={10}
    max={100}
  />
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
      hint="Межкомнатные + санузлы + входная"
      min={0}
      max={30}
    />
  </div>
</details>
<div class="mt-3">
  <TextareaField {form} path={['meta', 'comment']} label="Комментарий" />
</div>
