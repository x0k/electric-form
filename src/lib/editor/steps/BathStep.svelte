<script lang="ts">
  import type { ProjectForm } from '#lib/forms/ctx';
  import ToggleField from '#lib/forms/fields/ToggleField.svelte';
  import type { Project } from '#lib/project/types';

  let { form, view }: { form: ProjectForm; view: Project } = $props();
</script>

{#if view.general.bathrooms === 0}
  <div class="alert text-sm">
    Санузлов нет (см. «Общее и планировка») — этот раздел можно пропустить.
  </div>
{:else}
  <p class="mb-2 text-sm opacity-70">
    Что будет стоять в санузле — под это заложим розетки и линии.
  </p>
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
      hint="Уравнивание потенциалов — норма для санузлов"
    />
  </div>
{/if}
