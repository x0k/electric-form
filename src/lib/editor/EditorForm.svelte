<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';
  import { getDeepErrorEntries, setInput, validate } from '@formisch/svelte';
  import * as v from 'valibot';
  import { calculate } from '#lib/calc/engine';
  import { calcSavings } from '#lib/calc/savings';
  import {
    SEED_CATALOG,
    COST_CATEGORY_LABELS,
    COST_CATEGORIES,
  } from '#lib/catalog/index';
  import { createProjectForm } from '#lib/forms/ctx';
  import { STEPS } from '#lib/forms/steps';
  import NumberField from '#lib/forms/fields/NumberField.svelte';
  import SelectField from '#lib/forms/fields/SelectField.svelte';
  import TextField from '#lib/forms/fields/TextField.svelte';
  import ToggleField from '#lib/forms/fields/ToggleField.svelte';
  import { CONSUMER_LABELS } from '#lib/project/defaults';
  import {
    PANEL_OPTION_IDS,
    PANEL_OPTION_LABELS,
    ProjectSchema,
  } from '#lib/project/schemas';
  import type { Project } from '#lib/project/types';

  let { project, onsave }: { project: Project; onsave: (p: Project) => void } =
    $props();

  // Локальный редактируемый черновик (привязка напрямую, без friction типов).
  // Валидация и грязное состояние — через Formisch-стор ниже (methods API:
  // setInput/validate/getDeepErrorEntries). Field/FieldArray-компоненты —
  // следующим шагом, после проверки number-coercion в браузере.
  let draft = $state<Project>(project);
  const form = createProjectForm(project);

  let step = $state(0);
  // Свободная навигация: этапы не блокируются, состояние видно по бейджам.
  let visited = new SvelteSet<number>([0]);
  let stepErrCounts = $state<number[]>(STEPS.map(() => 0));
  let allErrors = $state<{ path: string; message: string }[]>([]);
  let validatedOnce = $state(false);
  let saved = $state(true);

  // Синхронизация черновика в стор + автосейв (дебаунс).
  let timer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const snapshot = $state.snapshot(draft);
    saved = false;
    clearTimeout(timer);
    timer = setTimeout(() => {
      setInput(form, { input: snapshot });
      const parsed = v.safeParse(ProjectSchema, snapshot);
      if (parsed.success) {
        onsave(parsed.output);
        saved = true;
      }
    }, 600);
    return () => clearTimeout(timer);
  });

  const result = $derived(calculate(draft, SEED_CATALOG));
  const savings = $derived(calcSavings(draft, SEED_CATALOG));

  function fmt(n: number): string {
    return `${Math.round(n).toLocaleString('ru-RU')} ₽`;
  }

  function entriesFor(stepIdx: number, entries: { path: unknown }[]): number {
    const paths = STEPS[stepIdx]?.paths ?? [];
    return entries.filter((e) => {
      const segs = e.path as readonly (string | number)[];
      return paths.some((prefix) =>
        prefix.every((s, i) => String(segs[i]) === s)
      );
    }).length;
  }

  async function refreshValidation() {
    setInput(form, { input: $state.snapshot(draft) });
    await validate(form);
    const entries = getDeepErrorEntries(form);
    stepErrCounts = STEPS.map((_, i) => entriesFor(i, entries));
    allErrors = entries.map((e) => {
      const segs = e.path as readonly (string | number)[];
      return { path: segs.join('.') || '—', message: e.errors[0] ?? 'ошибка' };
    });
    validatedOnce = true;
  }

  /** Свободный переход; на «Итоге» всегда обновляем статусы валидации. */
  async function go(to: number) {
    const clamped = Math.max(0, Math.min(STEPS.length - 1, to));
    step = clamped;
    visited.add(clamped);
    if (STEPS[clamped]?.id === 'result') await refreshValidation();
  }

  function status(i: number): 'current' | 'error' | 'done' | 'todo' {
    if (i === step) return 'current';
    if (validatedOnce && stepErrCounts[i] > 0) return 'error';
    if (visited.has(i)) return 'done';
    return 'todo';
  }

  function hasErrors(i: number): boolean {
    return validatedOnce && stepErrCounts[i] > 0;
  }

  const doneCount = $derived(
    STEPS.filter(
      (_, i) => visited.has(i) && !(validatedOnce && stepErrCounts[i] > 0)
    ).length
  );
  const totalErrors = $derived(stepErrCounts.reduce((a, n) => a + n, 0));

  /** Первый незаполненный этап; если все посещены — «Итог». */
  const nextTodo = $derived(STEPS.findIndex((_, i) => !visited.has(i)));
  const nextTarget = $derived(nextTodo === -1 ? STEPS.length - 1 : nextTodo);

  let menuOpen = $state(false);

  async function goAndClose(to: number) {
    menuOpen = false;
    await go(to);
  }

  function copySummary() {
    const rows = COST_CATEGORIES.map(
      (c) => `${COST_CATEGORY_LABELS[c]}: ${fmt(result.categoryTotals[c])}`
    ).join('\n');
    const text = `${draft.meta.name}\nПлощадь: ${draft.general.areaM2} м², комнат: ${draft.general.rooms}, санузлов: ${draft.general.bathrooms}\n\nМатериалы\n${rows}\nИтого: ${fmt(result.totalRub)} (${fmt(result.rangeRub.min)}–${fmt(result.rangeRub.max)})\n\nСрок: ${result.daysMin}–${result.daysMax} раб. дн.\nПредварительная оценка.`;
    navigator.clipboard?.writeText(text).catch(() => {});
  }
</script>

<div class="drawer drawer-end">
  <input
    id="steps-drawer"
    type="checkbox"
    class="drawer-toggle"
    bind:checked={menuOpen}
  />
  <div class="drawer-content">
    <div class="mx-auto w-full max-w-xl px-3 pt-3 pb-28">
      <a class="link link-hover text-sm opacity-70" href="/">← Проекты</a>
      <div class="mt-1 flex items-center gap-2">
        <h1 class="min-w-0 flex-1 truncate text-lg font-bold">
          {draft.meta.name}
        </h1>
        <span class="badge badge-ghost badge-sm shrink-0"
          >{saved ? 'сохранено' : '…'}</span
        >
      </div>
      <div class="mt-1 flex items-center gap-2 text-xs opacity-60">
        <span class="tabular-nums"
          >{STEPS[step].title} · {step + 1}/{STEPS.length}</span
        >
        <progress
          class="progress progress-primary h-1 flex-1"
          value={doneCount}
          max={STEPS.length}
          aria-label="Заполнено этапов: {doneCount} из {STEPS.length}"
        ></progress>
      </div>

      {#if STEPS[step].id === 'result' && validatedOnce && totalErrors > 0}
        <div class="alert alert-error mt-3 text-sm">
          <ul>
            {#each allErrors as e (e.path + e.message)}
              <li><b>{e.path}</b>: {e.message}</li>
            {/each}
          </ul>
        </div>
      {/if}

      <div class="card mt-3 bg-base-200 p-3">
        {#if STEPS[step].id === 'general'}
          <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
            <TextField label="Название проекта" bind:value={draft.meta.name} />
            <NumberField
              label="Площадь, м²"
              bind:value={draft.general.areaM2}
              min={5}
              max={500}
            />
            <NumberField
              label="Комнат"
              bind:value={draft.general.rooms}
              min={0}
              max={12}
            />
            <NumberField
              label="Санузлов"
              bind:value={draft.general.bathrooms}
              min={0}
              max={5}
            />
            <NumberField
              label="Дверей"
              bind:value={draft.general.doorsCount}
              min={0}
              max={30}
            />
            <NumberField
              label="Точек (0 = авто)"
              bind:value={draft.general.socketsEstimate}
              min={0}
              max={300}
            />
            <SelectField
              label="Стадия объекта"
              bind:value={draft.general.stage}
              options={[
                { value: 'rough', label: 'Черновой' },
                { value: 'whitebox', label: 'White box' },
                { value: 'lived', label: 'Жилая' },
              ]}
            />
            <div class="flex flex-col gap-1">
              <ToggleField
                label="Кухня"
                bind:checked={draft.general.kitchenPresent}
              />
              <ToggleField
                label="Балкон/лоджия"
                bind:checked={draft.general.balcony}
              />
              <ToggleField
                label="Пока нет точной планировки"
                hint="Расчёт по типовым значениям"
                bind:checked={draft.general.noLayoutMode}
              />
            </div>
          </div>
          <label class="form-control mt-3 w-full">
            <span class="label-text py-1 font-medium">Комментарий</span>
            <textarea
              class="textarea textarea-bordered w-full"
              rows="2"
              bind:value={draft.meta.comment}></textarea>
          </label>
        {:else if STEPS[step].id === 'power'}
          <p class="mb-2 text-sm opacity-70">
            Отметьте потребители — под них заложатся отдельные линии.
          </p>
          <div class="space-y-2">
            {#each draft.power.consumers as c (c.kind)}
              <div
                class="flex flex-wrap items-center gap-2 rounded bg-base-100 p-2"
              >
                <label class="label flex-1 cursor-pointer justify-start gap-2">
                  <input
                    type="checkbox"
                    class="checkbox checkbox-primary"
                    bind:checked={c.present}
                  />
                  <span class="font-medium">{CONSUMER_LABELS[c.kind]}</span>
                </label>
                {#if c.present}
                  <label class="flex items-center gap-1.5 text-sm"
                    >шт
                    <input
                      type="number"
                      class="input input-bordered h-11 w-20"
                      min="0"
                      max="10"
                      inputmode="numeric"
                      bind:value={c.qty}
                    />
                  </label>
                  <label class="flex items-center gap-1.5 text-sm"
                    >кВт
                    <input
                      type="number"
                      class="input input-bordered h-11 w-24"
                      min="0"
                      max="15"
                      step="0.1"
                      inputmode="decimal"
                      bind:value={c.powerKw}
                    />
                  </label>
                  <label class="label cursor-pointer gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      class="checkbox"
                      bind:checked={c.dedicatedLine}
                    />
                    отд. линия
                  </label>
                {/if}
              </div>
            {/each}
          </div>
        {:else if STEPS[step].id === 'ac'}
          <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
            <NumberField
              label="Кондиционеров"
              bind:value={draft.ac.count}
              min={0}
              max={10}
            />
            <div class="flex flex-col gap-1">
              <ToggleField
                label="Отдельные линии"
                bind:checked={draft.ac.dedicatedLines}
              />
              <ToggleField
                label="Нужна закладка трасс"
                bind:checked={draft.ac.chaseNeeded}
              />
              <ToggleField
                label="Резерв под будущие"
                bind:checked={draft.ac.reserveFuture}
              />
            </div>
          </div>
        {:else if STEPS[step].id === 'lowvoltage'}
          <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
            <NumberField
              label="Ethernet-точек"
              bind:value={draft.lowVoltage.ethernetPoints}
              min={0}
              max={40}
            />
            <NumberField
              label="ТВ-розеток"
              bind:value={draft.lowVoltage.tvOutlets}
              min={0}
              max={20}
            />
            <NumberField
              label="Wi-Fi точек"
              bind:value={draft.lowVoltage.wifiAP}
              min={0}
              max={10}
            />
            <NumberField
              label="Камер"
              bind:value={draft.lowVoltage.cameras}
              min={0}
              max={16}
            />
            <ToggleField label="PoE" bind:checked={draft.lowVoltage.poe} />
            <ToggleField
              label="Домофон"
              bind:checked={draft.lowVoltage.intercom}
            />
            <ToggleField
              label="NAS/сервер"
              bind:checked={draft.lowVoltage.nas}
            />
          </div>
        {:else if STEPS[step].id === 'lighting'}
          <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
            <NumberField
              label="Групп освещения"
              bind:value={draft.lighting.groups}
              min={0}
              max={40}
            />
            <ToggleField
              label="Проходные выключатели"
              bind:checked={draft.lighting.passThrough}
            />
            <ToggleField
              label="Подсветка кухни"
              bind:checked={draft.lighting.kitchenLed}
            />
            <ToggleField
              label="Подсветка зеркал"
              bind:checked={draft.lighting.mirrorLed}
            />
            <ToggleField
              label="Декоративная подсветка"
              bind:checked={draft.lighting.decorLed}
            />
            <ToggleField
              label="Диммирование"
              bind:checked={draft.lighting.dimming}
            />
            <ToggleField
              label="Умный дом (свет)"
              bind:checked={draft.lighting.smart}
            />
          </div>
        {:else if STEPS[step].id === 'bath'}
          <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
            <ToggleField
              label="Стиралка в санузле"
              bind:checked={draft.bathrooms.washerInBath}
            />
            <ToggleField
              label="Сушилка в санузле"
              bind:checked={draft.bathrooms.dryerInBath}
            />
            <ToggleField
              label="Бойлер в санузле"
              bind:checked={draft.bathrooms.boilerInBath}
            />
            <ToggleField
              label="Тёплый пол в санузле"
              bind:checked={draft.bathrooms.floorHeatInBath}
            />
            <ToggleField
              label="Эл. полотенцесушитель"
              bind:checked={draft.bathrooms.electricTowel}
            />
            <ToggleField
              label="СУП обязателен"
              bind:checked={draft.bathrooms.supRequired}
            />
          </div>
        {:else if STEPS[step].id === 'sensors'}
          <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
            <ToggleField
              label="Протечки"
              bind:checked={draft.sensors.leakage}
            />
            <ToggleField
              label="Э/м клапаны"
              bind:checked={draft.sensors.valves}
            />
            <ToggleField
              label="Дымовые датчики"
              bind:checked={draft.sensors.smoke}
            />
            <ToggleField
              label="Датчики движения"
              bind:checked={draft.sensors.motion}
            />
            <ToggleField
              label="Датчики открытия"
              bind:checked={draft.sensors.openSensor}
            />
            <ToggleField
              label="Температура"
              bind:checked={draft.sensors.temp}
            />
            <ToggleField
              label="Умный дом"
              bind:checked={draft.sensors.smartHome}
            />
            <ToggleField
              label="Электрокарнизы"
              bind:checked={draft.sensors.curtains}
            />
          </div>
        {:else if STEPS[step].id === 'panel'}
          <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
            <SelectField
              label="Фазы"
              bind:value={draft.panel.phases}
              options={[
                { value: '1', label: '1 фаза' },
                { value: '3', label: '3 фазы' },
              ]}
            />
            <SelectField
              label="Заземление"
              bind:value={draft.panel.grounding}
              options={[
                { value: 'TN-C-S', label: 'TN-C-S' },
                { value: 'TN-S', label: 'TN-S' },
                { value: 'TT', label: 'TT' },
                { value: 'unknown', label: 'Неизвестно' },
              ]}
            />
            <NumberField
              label="Вводной автомат, А"
              bind:value={draft.panel.mainBreakerA}
              min={10}
              max={100}
            />
            <NumberField
              label="Номинал ввода, А"
              bind:value={draft.panel.inputA}
              min={10}
              max={100}
            />
            <NumberField
              label="Резервных модулей"
              bind:value={draft.panel.reserveModules}
              min={0}
              max={24}
            />
          </div>
          <h3 class="mt-4 font-semibold">Опции (необязательные)</h3>
          <div class="mt-2 grid grid-cols-1 gap-x-4 md:grid-cols-2">
            {#each PANEL_OPTION_IDS as id (id)}
              <ToggleField
                label={PANEL_OPTION_LABELS[id]}
                bind:checked={draft.panel.options[id]}
              />
            {/each}
          </div>
        {:else if STEPS[step].id === 'work'}
          <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
            <NumberField
              label="Электриков"
              bind:value={draft.work.electricians}
              min={1}
              max={6}
            />
            <NumberField
              label="Коэф. сложности"
              hint="0.8–1.6"
              bind:value={draft.work.complexityK}
              min={0.8}
              max={1.6}
              step={0.05}
            />
            <NumberField
              label="Коэф. неопределённости"
              hint="1–1.6"
              bind:value={draft.work.uncertaintyK}
              min={1}
              max={1.6}
              step={0.05}
            />
          </div>
        {:else}
          <div class="text-sm opacity-70">
            Площадь: {draft.general.areaM2} м² · Комнат: {draft.general.rooms} · Санузлов:
            {draft.general.bathrooms}
          </div>
          <h3 class="mt-3 font-semibold">Материалы</h3>
          <div class="mt-2 divide-y rounded bg-base-100">
            {#each COST_CATEGORIES as c (c)}
              {@const sum = result.categoryTotals[c]}
              {#if sum > 0}
                <details class="p-2">
                  <summary class="flex cursor-pointer justify-between">
                    <span>{COST_CATEGORY_LABELS[c]}</span><span
                      class="font-medium">{fmt(sum)}</span
                    >
                  </summary>
                  <ul class="mt-1 space-y-0.5 text-sm opacity-80">
                    {#each result.lines.filter((l) => l.category === c) as l (l.materialId + l.ruleId)}
                      <li class="flex justify-between gap-2">
                        <span>{l.materialName} · {l.qtyWithWaste} {l.unit}</span
                        >
                        <span>{fmt(l.sumRub)}</span>
                      </li>
                    {/each}
                  </ul>
                </details>
              {/if}
            {/each}
          </div>
          <div
            class="mt-3 flex items-center justify-between border-t pt-2 text-lg font-bold"
          >
            <span>Итого</span><span>{fmt(result.totalRub)}</span>
          </div>
          <div class="text-sm opacity-70">
            Предварительно: {fmt(result.rangeRub.min)}–{fmt(
              result.rangeRub.max
            )}
          </div>

          <h3 class="mt-4 font-semibold">Что сильнее всего влияет</h3>
          <ul class="mt-1 space-y-0.5 text-sm">
            {#each result.drivers as d (d.label)}
              <li class="flex justify-between gap-2">
                <span>{d.label}</span><span>{fmt(d.amountRub)}</span>
              </li>
            {/each}
          </ul>

          {#if savings.length > 0}
            <h3 class="mt-4 font-semibold">Где можно сэкономить</h3>
            <ul class="mt-1 space-y-0.5 text-sm">
              {#each savings as s (s.id)}
                <li class="flex justify-between gap-2">
                  <span>{s.label}</span><span>−{fmt(s.deltaRub)}</span>
                </li>
              {/each}
            </ul>
          {/if}

          <h3 class="mt-4 font-semibold">Сроки</h3>
          <div class="mt-1 text-sm">
            Ориентировочно: <b>{result.daysMin}–{result.daysMax} раб. дн.</b>
            ({result.laborHours} ч · {draft.work.electricians} эл.)
          </div>
          <ul class="mt-1 space-y-0.5 text-sm opacity-70">
            {#each result.labor as t (t.label)}
              <li class="flex justify-between gap-2">
                <span>{t.label}</span><span>{t.hours} ч</span>
              </li>
            {/each}
          </ul>
          {#if draft.general.noLayoutMode}
            <div class="alert alert-warning mt-3 text-sm">
              Планировки нет — оценка грубая, по типовым значениям.
            </div>
          {/if}

          <div class="mt-3 flex gap-2">
            <button class="btn btn-outline w-full" onclick={copySummary}
              >Скопировать смету текстом</button
            >
          </div>
        {/if}
      </div>
    </div>

    <!-- Компактная нижняя навигация: назад / следующий незаполненный / меню -->
    <div
      class="fixed inset-x-0 bottom-0 z-10 border-t border-base-300 bg-base-100/95 backdrop-blur"
    >
      <div
        class="mx-auto flex w-full max-w-xl items-center gap-2 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      >
        <button
          class="btn btn-square shrink-0"
          disabled={step === 0}
          aria-label="Предыдущий этап"
          onclick={() => go(step - 1)}>←</button
        >
        <button
          class="btn btn-primary h-12 min-w-0 flex-1 justify-between"
          onclick={() => go(nextTarget)}
        >
          <span class="min-w-0 flex-1 truncate text-left">
            {nextTodo === -1
              ? 'Показать итог'
              : `Далее: ${STEPS[nextTarget].title}`}
          </span>
          <span aria-hidden="true">→</span>
        </button>
        <label
          for="steps-drawer"
          class="btn btn-square shrink-0 tabular-nums"
          aria-label="Все этапы"
        >
          {step + 1}/{STEPS.length}
        </label>
      </div>
    </div>
  </div>

  <!-- Боковое меню этапов -->
  <div class="drawer-side z-30">
    <label
      for="steps-drawer"
      aria-label="Закрыть меню этапов"
      class="drawer-overlay"
    ></label>
    <div class="flex min-h-full w-80 max-w-[85vw] flex-col bg-base-200 p-3">
      <div class="flex items-center gap-2 px-1">
        <h2 class="flex-1 text-lg font-bold">Этапы</h2>
        <span class="text-xs opacity-60 tabular-nums"
          >{doneCount}/{STEPS.length}</span
        >
        <label
          for="steps-drawer"
          class="btn btn-ghost btn-sm"
          aria-label="Закрыть">✕</label
        >
      </div>
      <progress
        class="progress progress-primary mt-2 h-1 w-full"
        value={doneCount}
        max={STEPS.length}
      ></progress>
      <ul class="menu mt-2 flex-1 gap-1 p-0">
        {#each STEPS as s, i (s.id)}
          {@const st = status(i)}
          <li>
            <button
              class="min-h-14 items-center gap-3 rounded-xl px-3 py-2 text-left active:scale-[0.99]"
              class:bg-primary={st === 'current' && !hasErrors(i)}
              class:text-primary-content={st === 'current' && !hasErrors(i)}
              class:bg-error={st === 'current' && hasErrors(i)}
              class:text-error-content={st === 'current' && hasErrors(i)}
              class:border-error={st === 'error'}
              class:border={st === 'error'}
              aria-current={i === step ? 'step' : undefined}
              onclick={() => goAndClose(i)}
            >
              {#if hasErrors(i)}
                <span class="badge badge-error shrink-0"
                  >{stepErrCounts[i]}</span
                >
              {:else if st === 'done'}
                <span class="badge badge-success shrink-0">✓</span>
              {:else}
                <span class="badge badge-ghost shrink-0">{i + 1}</span>
              {/if}
              <span class="min-w-0 flex-1">
                <span class="block font-medium">{s.title}</span>
                <span class="block text-xs opacity-60">
                  {#if hasErrors(i)}
                    ошибок: {stepErrCounts[i]}
                  {:else if st === 'done'}
                    заполнен
                  {:else if st === 'current'}
                    текущий
                  {:else}
                    не заполнен
                  {/if}
                </span>
              </span>
              <span aria-hidden="true" class="shrink-0 opacity-50">›</span>
            </button>
          </li>
        {/each}
      </ul>
      <button
        class="btn btn-primary mt-2 w-full"
        onclick={() => goAndClose(STEPS.length - 1)}>Показать итог →</button
      >
    </div>
  </div>
</div>
