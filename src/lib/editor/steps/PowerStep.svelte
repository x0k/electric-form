<script lang="ts">
  import { Field } from '@formisch/svelte';
  import type { ProjectForm } from '#lib/forms/ctx';
  import { CONSUMER_LABELS } from '#lib/project/defaults';
  import ToggleField from '#lib/forms/fields/ToggleField.svelte';
  import type { Project } from '#lib/project/types';

  let { form, view }: { form: ProjectForm; view: Project } = $props();

  const conditioner = $derived(
    view.power.consumers.find((c) => c.kind === 'conditioner')
  );
  const hasConditioner = $derived(
    !!conditioner?.present && Math.max(conditioner.qty, 1) > 0
  );
</script>

<p class="mb-2 text-sm opacity-70">
  Отметьте, что есть в квартире, включая технику санузла и кондиционеры. Нужен
  резерв под будущий кондиционер — просто добавьте +1 к количеству.
</p>
<div class="space-y-2">
  {#each view.power.consumers as c, i (c.kind)}
    <div class="flex flex-wrap items-center gap-2 rounded bg-base-100 p-2">
      <Field of={form} path={['power', 'consumers', i, 'present']}>
        {#snippet children(f)}
          <label
            class="label min-h-12 flex-1 cursor-pointer justify-start gap-2"
          >
            <input
              {...f.props}
              type="checkbox"
              class="checkbox checkbox-primary checkbox-lg"
              checked={!!f.input}
            />
            <span class="font-medium">{CONSUMER_LABELS[c.kind]}</span>
          </label>
        {/snippet}
      </Field>
      {#if c.present}
        <Field of={form} path={['power', 'consumers', i, 'qty']}>
          {#snippet children(f)}
            {@const qErr =
              (f.isEdited || form.isSubmitted) && f.errors ? f.errors[0] : null}
            <label class="flex items-center gap-1.5 text-sm"
              >шт
              <input
                {...f.props}
                type="number"
                class="input input-bordered h-11 w-20"
                class:input-error={!!qErr}
                title={qErr ?? 'Количество'}
                value={typeof f.input === 'number' && Number.isNaN(f.input)
                  ? undefined
                  : (f.input as number | undefined)}
                min="0"
                max="10"
                inputmode="numeric"
                oninput={(e) =>
                  f.onInput(
                    e.currentTarget.value === ''
                      ? undefined
                      : (e.currentTarget.valueAsNumber as never)
                  )}
              />
            </label>
          {/snippet}
        </Field>
        <Field of={form} path={['power', 'consumers', i, 'dedicatedLine']}>
          {#snippet children(f)}
            <label
              class="label min-h-11 cursor-pointer gap-1.5 text-sm"
              title="Свой кабель и автомат от щита — не грузит общие розетки"
            >
              <input
                {...f.props}
                type="checkbox"
                class="checkbox checkbox-lg"
                checked={!!f.input}
              />
              отд. линия
            </label>
          {/snippet}
        </Field>
        <details class="w-full text-sm">
          <summary
            class="cursor-pointer py-1 opacity-60"
            title="Справочно для электрика; на расчёт не влияет"
            >Мощность (кВт) — необязательно</summary
          >
          <Field of={form} path={['power', 'consumers', i, 'powerKw']}>
            {#snippet children(f)}
              {@const pErr =
                (f.isEdited || form.isSubmitted) && f.errors
                  ? f.errors[0]
                  : null}
              <label class="flex items-center gap-1.5">
                <input
                  {...f.props}
                  type="number"
                  class="input input-bordered h-11 w-28"
                  class:input-error={!!pErr}
                  title={pErr ?? 'Мощность, кВт'}
                  value={typeof f.input === 'number' && Number.isNaN(f.input)
                    ? undefined
                    : (f.input as number | undefined)}
                  min="0"
                  max="15"
                  step="0.1"
                  inputmode="decimal"
                  oninput={(e) =>
                    f.onInput(
                      e.currentTarget.value === ''
                        ? undefined
                        : (e.currentTarget.valueAsNumber as never)
                    )}
                />
                <span class="opacity-60">кВт</span>
              </label>
            {/snippet}
          </Field>
        </details>
      {/if}
    </div>
  {/each}
</div>
{#if hasConditioner}
  <div class="mt-3">
    <ToggleField
      {form}
      path={['power', 'conditionerChase']}
      label="Закладка трасс под кондиционеры"
      hint="Штробы и дренаж до ремонта"
    />
  </div>
{/if}
