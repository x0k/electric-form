<script lang="ts">
  import { Field } from '@formisch/svelte';
  import type { ProjectForm } from '#lib/forms/ctx';
  import { CONSUMER_LABELS } from '#lib/project/defaults';
  import type { Project } from '#lib/project/types';

  let { form, view }: { form: ProjectForm; view: Project } = $props();
</script>

<p class="mb-2 text-sm opacity-70">
  Отметьте, что есть в квартире. Количество и отдельные линии подставятся
  автоматически — поправить можно ниже.
</p>
{#if view.ac.count > 0}
  <div class="alert alert-info mb-2 text-sm">
    Кондиционеры уже учтены на этапе «Кондиционеры» ({view.ac.count} шт.) — здесь
    дублировать не нужно.
  </div>
{/if}
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
            <label class="label min-h-11 cursor-pointer gap-1.5 text-sm">
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
          <summary class="cursor-pointer py-1 opacity-60"
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
