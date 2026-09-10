<script lang="ts">
  import { Field, setInput } from '@formisch/svelte';
  import type { ProjectForm } from '#lib/forms/ctx';
  import { deriveSocketsEstimate } from '#lib/forms/derived';
  import NumberField from '#lib/forms/fields/NumberField.svelte';
  import { CONSUMER_LABELS } from '#lib/project/defaults';
  import type { Project } from '#lib/project/types';

  let { form, view }: { form: ProjectForm; view: Project } = $props();

  // Панель настроек потребителя — поверх списка, место в потоке не занимает.
  let openKind = $state<string | null>(null);

  type QtyField = { onInput: (value: number | undefined) => void };

  // Единая точка изменения количества: переход 0 → >0 сам ставит отдельную
  // линию. Снятую вручную галку не трогаем — сюда попадаем только из
  // обработчиков ввода, циклов реактивности нет.
  function applyQty(
    f: QtyField,
    idx: number,
    prev: number,
    next: number | undefined
  ): void {
    f.onInput(next);
    if (typeof next !== 'number' || Number.isNaN(next)) return;
    if (prev <= 0 && next > 0) {
      if (view.power.consumers[idx]?.dedicatedLine === false) {
        setInput(form, {
          path: ['power', 'consumers', idx, 'dedicatedLine'] as const,
          input: true,
        });
      }
    }
    // Панель была открыта, количество сбросили в 0 — закрыть (кнопка теперь
    // disabled, сам себя пользователь уже не закроет). У кондиционера заодно
    // снять закладку трасс, чтобы не висел мусор без UI.
    if (next <= 0 && view.power.consumers[idx]?.kind === openKind) {
      openKind = null;
    }
    if (
      next <= 0 &&
      view.power.consumers[idx]?.kind === 'conditioner' &&
      view.power.conditionerChase
    ) {
      setInput(form, {
        path: ['power', 'conditionerChase'] as const,
        input: false,
      });
    }
  }

  function nudgeQty(f: QtyField, idx: number, prev: number, dir: 1 | -1): void {
    applyQty(f, idx, prev, Math.min(10, Math.max(0, prev + dir)));
  }
</script>

<div class="mb-3">
  <NumberField
    {form}
    path={['general', 'socketsEstimate']}
    label="Розеток 220В, шт"
    hint="Бытовые розетки по квартире; 0 — не надо"
    min={0}
    max={300}
  />
  <button
    type="button"
    class="btn btn-outline mt-2 w-full"
    title="Проставит типовые для этой планировки как явный ввод"
    onclick={() =>
      setInput(form, {
        path: ['general', 'socketsEstimate'] as const,
        input: deriveSocketsEstimate(view.general),
      })}
  >
    Подставить типовые ({deriveSocketsEstimate(view.general)} шт)
  </button>
</div>
<p class="mb-2 text-sm opacity-70">
  Количество каждого потребителя ниже, 0 — значит нет. Включая технику санузла и
  кондиционеры. Нужен резерв под будущий кондиционер — просто добавьте +1 к
  количеству.
</p>
{#if openKind}
  <!-- Подложка под открытой панелью: клик мимо закрывает, ряд под пальцем на месте. -->
  <div
    class="fixed inset-0 z-10"
    role="presentation"
    onclick={() => (openKind = null)}
  ></div>
{/if}
<div class="space-y-1.5">
  {#each view.power.consumers as c, i (c.kind)}
    {@const active = (c.qty ?? 0) > 0}
    {@const open = openKind === c.kind}
    <div
      class="relative rounded bg-base-100 px-3 py-1.5"
      class:opacity-55={!active}
      class:z-20={open}
      class:rounded-b-none={open}
    >
      <div class="flex items-center gap-2">
        <span class="min-w-0 flex-1 truncate font-medium"
          >{CONSUMER_LABELS[c.kind]}</span
        >
        <Field of={form} path={['power', 'consumers', i, 'qty']}>
          {#snippet children(f)}
            {@const qErr =
              (f.isEdited || form.isSubmitted) && f.errors ? f.errors[0] : null}
            {@const cur =
              typeof f.input === 'number' && !Number.isNaN(f.input)
                ? f.input
                : 0}
            <div
              class="flex shrink-0 items-center gap-1"
              title={qErr ?? 'Количество, шт'}
            >
              <button
                type="button"
                class="btn btn-square h-10 w-10 shrink-0 text-xl"
                aria-label="{CONSUMER_LABELS[c.kind]}: меньше"
                disabled={cur <= 0}
                onclick={() => nudgeQty(f, i, cur, -1)}>−</button
              >
              <input
                {...f.props}
                type="number"
                class="input input-bordered h-10 w-16 shrink-0 text-center"
                class:input-error={!!qErr}
                value={typeof f.input === 'number' && Number.isNaN(f.input)
                  ? undefined
                  : f.input}
                min="0"
                max="10"
                inputmode="numeric"
                aria-label="{CONSUMER_LABELS[c.kind]}, шт"
                oninput={(e) =>
                  applyQty(
                    f,
                    i,
                    cur,
                    e.currentTarget.value === ''
                      ? undefined
                      : e.currentTarget.valueAsNumber
                  )}
              />
              <button
                type="button"
                class="btn btn-square h-10 w-10 shrink-0 text-xl"
                aria-label="{CONSUMER_LABELS[c.kind]}: больше"
                disabled={cur >= 10}
                onclick={() => nudgeQty(f, i, cur, 1)}>+</button
              >
            </div>
          {/snippet}
        </Field>
        <!-- Шеврон виден всегда: слот постоянный, ничего не скрывается.
          При 0 — disabled, место занимает, не работает. -->
        <button
          type="button"
          class="btn btn-square h-10 w-10 shrink-0 text-xl"
          aria-label="Настройки: {CONSUMER_LABELS[c.kind]}"
          aria-expanded={open}
          disabled={!active}
          onclick={() => (openKind = open ? null : c.kind)}
          >{open ? '▴' : '▾'}</button
        >
      </div>
      {#if open}
        <div
          class="absolute inset-x-0 top-full z-20 rounded-b bg-base-100 p-3 shadow-xl ring-1 ring-base-300"
        >
          <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
            {#if c.kind === 'conditioner'}
              <Field of={form} path={['power', 'conditionerChase']}>
                {#snippet children(f)}
                  <label
                    class="label cursor-pointer gap-1.5 text-sm"
                    title="Штробы и дренаж до ремонта"
                  >
                    <input
                      {...f.props}
                      type="checkbox"
                      class="checkbox"
                      checked={!!f.input}
                      oninput={(e) => f.onInput(e.currentTarget.checked)}
                    />
                    закладка трасс
                  </label>
                {/snippet}
              </Field>
            {/if}
            <Field of={form} path={['power', 'consumers', i, 'dedicatedLine']}>
              {#snippet children(f)}
                <label
                  class="label cursor-pointer gap-1.5 text-sm"
                  title="Свой кабель и автомат от щита — не грузит общие розетки"
                >
                  <input
                    {...f.props}
                    type="checkbox"
                    class="checkbox"
                    checked={!!f.input}
                  />
                  отд. линия
                </label>
              {/snippet}
            </Field>
            <Field of={form} path={['power', 'consumers', i, 'powerKw']}>
              {#snippet children(f)}
                {@const pErr =
                  (f.isEdited || form.isSubmitted) && f.errors
                    ? f.errors[0]
                    : null}
                <label
                  class="flex items-center gap-1.5 text-sm"
                  title={pErr ?? 'Мощность, кВт — справочно для электрика'}
                >
                  <input
                    {...f.props}
                    type="number"
                    class="input input-bordered h-10 w-20 text-center"
                    class:input-error={!!pErr}
                    value={typeof f.input === 'number' && Number.isNaN(f.input)
                      ? undefined
                      : f.input}
                    min="0"
                    max="15"
                    step="0.1"
                    inputmode="decimal"
                    aria-label="{CONSUMER_LABELS[c.kind]}: мощность, кВт"
                    oninput={(e) =>
                      f.onInput(
                        e.currentTarget.value === ''
                          ? undefined
                          : e.currentTarget.valueAsNumber
                      )}
                  />
                  <span class="opacity-60">кВт</span>
                </label>
              {/snippet}
            </Field>
          </div>
        </div>
      {/if}
    </div>
  {/each}
</div>
