<script lang="ts">
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
  let stepErrors = $state<string[]>([]);
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

  async function go(to: number) {
    if (to > step) {
      setInput(form, { input: $state.snapshot(draft) });
      await validate(form);
      const entries = getDeepErrorEntries(form);
      const paths = STEPS[step]?.paths ?? [];
      const mine = entries.filter((e) => {
        const segs = e.path as readonly (string | number)[];
        return paths.some((prefix) =>
          prefix.every((s, i) => String(segs[i]) === s)
        );
      });
      if (mine.length > 0) {
        stepErrors = mine.map((e) => {
          const segs = e.path as readonly (string | number)[];
          return `${segs.join('.')}: ${e.errors[0] ?? 'ошибка'}`;
        });
        return;
      }
    }
    stepErrors = [];
    step = to;
  }

  function copySummary() {
    const rows = COST_CATEGORIES.map(
      (c) => `${COST_CATEGORY_LABELS[c]}: ${fmt(result.categoryTotals[c])}`
    ).join('\n');
    const text = `${draft.meta.name}\nПлощадь: ${draft.general.areaM2} м², комнат: ${draft.general.rooms}, санузлов: ${draft.general.bathrooms}\n\nМатериалы\n${rows}\nИтого: ${fmt(result.totalRub)} (${fmt(result.rangeRub.min)}–${fmt(result.rangeRub.max)})\n\nСрок: ${result.daysMin}–${result.daysMax} раб. дн.\nПредварительная оценка.`;
    navigator.clipboard?.writeText(text).catch(() => {});
  }
</script>

<div class="mx-auto max-w-4xl p-4">
  <a class="link link-hover text-sm opacity-70" href="/">← Проекты</a>
  <div class="mt-1 flex items-center gap-3">
    <h1 class="text-xl font-bold">{draft.meta.name}</h1>
    <span class="badge badge-ghost badge-sm">{saved ? 'сохранено' : '…'}</span>
  </div>

  <ul class="steps steps-horizontal mt-4 w-full overflow-x-auto text-xs">
    {#each STEPS as s, i (s.id)}
      <li class="step" class:step-primary={i <= step}>
        <button class="cursor-pointer" onclick={() => go(i)}>{s.title}</button>
      </li>
    {/each}
  </ul>

  {#if stepErrors.length > 0}
    <div class="alert alert-error mt-3 text-sm">
      <ul>
        {#each stepErrors as e (e)}
          <li>{e}</li>
        {/each}
      </ul>
    </div>
  {/if}

  <div class="card mt-4 bg-base-200 p-4">
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
              <label class="flex items-center gap-1 text-sm"
                >шт
                <input
                  type="number"
                  class="input input-bordered input-sm w-20"
                  min="0"
                  max="10"
                  bind:value={c.qty}
                />
              </label>
              <label class="flex items-center gap-1 text-sm"
                >кВт
                <input
                  type="number"
                  class="input input-bordered input-sm w-24"
                  min="0"
                  max="15"
                  step="0.1"
                  bind:value={c.powerKw}
                />
              </label>
              <label class="label cursor-pointer gap-1 text-sm">
                <input
                  type="checkbox"
                  class="checkbox checkbox-sm"
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
        <ToggleField label="Домофон" bind:checked={draft.lowVoltage.intercom} />
        <ToggleField label="NAS/сервер" bind:checked={draft.lowVoltage.nas} />
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
        <ToggleField label="Протечки" bind:checked={draft.sensors.leakage} />
        <ToggleField label="Э/м клапаны" bind:checked={draft.sensors.valves} />
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
        <ToggleField label="Температура" bind:checked={draft.sensors.temp} />
        <ToggleField label="Умный дом" bind:checked={draft.sensors.smartHome} />
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
                <span>{COST_CATEGORY_LABELS[c]}</span><span class="font-medium"
                  >{fmt(sum)}</span
                >
              </summary>
              <ul class="mt-1 space-y-0.5 text-sm opacity-80">
                {#each result.lines.filter((l) => l.category === c) as l (l.materialId + l.ruleId)}
                  <li class="flex justify-between gap-2">
                    <span>{l.materialName} · {l.qtyWithWaste} {l.unit}</span>
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
        Предварительно: {fmt(result.rangeRub.min)}–{fmt(result.rangeRub.max)}
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
        <button class="btn btn-outline btn-sm" onclick={copySummary}
          >Скопировать смету текстом</button
        >
      </div>
    {/if}
  </div>

  <div class="mt-4 flex justify-between">
    <button class="btn" disabled={step === 0} onclick={() => go(step - 1)}
      >Назад</button
    >
    <button
      class="btn btn-primary"
      disabled={step === STEPS.length - 1}
      onclick={() => go(step + 1)}>Далее</button
    >
  </div>
</div>
