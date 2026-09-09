<script lang="ts">
  import type { ProjectForm } from '#lib/forms/ctx';
  import ToggleField from '#lib/forms/fields/ToggleField.svelte';

  let { form }: { form: ProjectForm } = $props();
</script>

<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
  <ToggleField
    {form}
    path={['bathrooms', 'washerInBath']}
    label="Стиралка в санузле"
  />
  <ToggleField
    {form}
    path={['bathrooms', 'dryerInBath']}
    label="Сушилка в санузле"
  />
  <ToggleField
    {form}
    path={['bathrooms', 'boilerInBath']}
    label="Бойлер в санузле"
  />
  <ToggleField
    {form}
    path={['bathrooms', 'floorHeatInBath']}
    label="Тёплый пол в санузле"
  />
  <ToggleField
    {form}
    path={['bathrooms', 'electricTowel']}
    label="Эл. полотенцесушитель"
  />
  <ToggleField
    {form}
    path={['bathrooms', 'supRequired']}
    label="СУП обязателен"
  />
</div>
