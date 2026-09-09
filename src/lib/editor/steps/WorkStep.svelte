<script lang="ts">
  import type { ProjectForm } from '#lib/forms/ctx';
  import NumberField from '#lib/forms/fields/NumberField.svelte';

  let { form }: { form: ProjectForm } = $props();
</script>

<NumberField
  {form}
  path={['work', 'electricians']}
  label="Электриков"
  hint="Сколько человек будет работать"
  min={1}
  max={6}
/>
<details class="collapse-arrow bg-base-100 collapse mt-3">
  <summary class="collapse-title font-medium"
    >Поправки на сложность (можно не трогать)</summary
  >
  <div class="collapse-content grid grid-cols-1 gap-3 md:grid-cols-2">
    <NumberField
      {form}
      path={['work', 'complexityK']}
      label="Сложность"
      hint="1 — обычная квартира, выше — штробы по бетону, высокие потолки"
      min={0.8}
      max={1.6}
      step={0.05}
    />
    <NumberField
      {form}
      path={['work', 'uncertaintyK']}
      label="Неопределённость"
      hint="1,15 по умолчанию — запас на сюрпризы"
      min={1}
      max={1.6}
      step={0.05}
    />
  </div>
</details>
