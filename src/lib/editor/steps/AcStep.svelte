<script lang="ts">
  import type { ProjectForm } from '#lib/forms/ctx';
  import NumberField from '#lib/forms/fields/NumberField.svelte';
  import ToggleField from '#lib/forms/fields/ToggleField.svelte';
  import type { Project } from '#lib/project/types';

  let { form, view }: { form: ProjectForm; view: Project } = $props();

  const hasAc = $derived(view.ac.count > 0 || view.ac.reserveFuture);
</script>

<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
  <NumberField
    {form}
    path={['ac', 'count']}
    label="Кондиционеров"
    hint="Сколько планируется ставить"
    min={0}
    max={10}
  />
  <div class="flex flex-col gap-1">
    <ToggleField
      {form}
      path={['ac', 'reserveFuture']}
      label="Резерв под будущие"
      hint="Заложим трассу и место в щите"
    />
    {#if hasAc}
      <ToggleField
        {form}
        path={['ac', 'dedicatedLines']}
        label="Отдельные линии"
      />
      <ToggleField
        {form}
        path={['ac', 'chaseNeeded']}
        label="Нужна закладка трасс"
        hint="Штробы и дренаж до ремонта"
      />
    {:else}
      <p class="text-sm opacity-60">
        Укажите количество или резерв — появятся вопросы про линии и трассы.
      </p>
    {/if}
  </div>
</div>
