<script lang="ts">
  import {
    COST_CATEGORIES,
    COST_CATEGORY_LABELS,
    UNIT_LABELS,
    type CostCategory,
  } from '#lib/catalog/index';
  import type { ProjectForm } from '#lib/forms/ctx';
  import ToggleField from '#lib/forms/fields/ToggleField.svelte';
  import type { BOMLine, CalcResult, WorkStage } from '#lib/calc/types';
  import type { Saving } from '#lib/calc/savings';
  import { formatSummary } from '#lib/calc/summary';
  import type { Project } from '#lib/project/types';

  let {
    form,
    view,
    result,
    savings,
    overriddenCount,
  }: {
    form: ProjectForm;
    view: Project;
    result: CalcResult;
    savings: Saving[];
    overriddenCount: number;
  } = $props();

  function fmt(n: number): string {
    return `${Math.round(n).toLocaleString('ru-RU')} ₽`;
  }

  const STAGES: { id: WorkStage; title: string }[] = [
    { id: 'rough', title: 'Этап 1 — черновой монтаж' },
    { id: 'finish', title: 'Этап 2 — чистовая установка' },
  ];

  const finishCaption = $derived(
    view.general.stage === 'lived'
      ? 'Всё ставится сразу — деление для понимания структуры сметы.'
      : 'Закупка и монтаж этапа — после чистовой отделки.'
  );

  const linesByStageCat = $derived.by(() => {
    const m = new Map<string, BOMLine[]>();
    for (const l of result.lines) {
      const key = `${l.stage}:${l.category}`;
      const arr = m.get(key);
      if (arr) arr.push(l);
      else m.set(key, [l]);
    }
    return m;
  });
  const catsOf = (stage: WorkStage): CostCategory[] =>
    COST_CATEGORIES.filter(
      (c) => (linesByStageCat.get(`${stage}:${c}`) ?? []).length > 0
    );
  const laborOf = (stage: WorkStage) =>
    result.labor.filter((t) => t.stage === stage);

  // Раскрытые группы (категории + «своими силами»).
  let openGroups = $state<string[]>([]);
  function setAll(open: boolean) {
    if (!open) {
      openGroups = [];
      return;
    }
    const keys: string[] = [];
    for (const s of STAGES)
      for (const c of catsOf(s.id)) keys.push(`${s.id}:${c}`);
    if (result.excludedLines.length > 0) keys.push('excluded');
    openGroups = keys;
  }
  const allKeys = $derived.by(() => {
    const keys: string[] = [];
    for (const s of STAGES)
      for (const c of catsOf(s.id)) keys.push(`${s.id}:${c}`);
    if (result.excludedLines.length > 0) keys.push('excluded');
    return keys;
  });
  const allOpen = $derived(
    allKeys.length > 0 && allKeys.every((k) => openGroups.includes(k))
  );
  function onToggleGroup(key: string, open: boolean) {
    openGroups = open
      ? [...new Set([...openGroups, key])]
      : openGroups.filter((x) => x !== key);
  }

  function copySummary() {
    navigator.clipboard
      ?.writeText(formatSummary(view, result, savings))
      .catch(() => {});
  }
</script>

{#snippet group(
  key: string,
  title: string,
  badge: string,
  sum: number,
  lines: BOMLine[]
)}
  {@const open = openGroups.includes(key)}
  <details
    class="p-2"
    {open}
    ontoggle={(e) => onToggleGroup(key, e.currentTarget.open)}
  >
    <summary class="flex cursor-pointer items-center justify-between gap-2">
      <span class="min-w-0 flex-1 truncate"
        >{title}
        <span class="badge badge-ghost badge-xs ml-1 align-middle">{badge}</span
        ></span
      ><span class="shrink-0 font-medium tabular-nums">{fmt(sum)}</span>
    </summary>
    <ul class="mt-1 space-y-1.5 text-sm">
      {#each lines as l (l.materialId + l.ruleId)}
        <li class="flex items-baseline justify-between gap-2">
          <span class="min-w-0">
            <span class="block truncate">{l.materialName}</span>
            <span class="block text-xs opacity-60 tabular-nums">
              {#if l.qtyWithWaste !== l.qty}
                {l.qty} → {l.qtyWithWaste}
              {:else}
                {l.qtyWithWaste}
              {/if}
              {UNIT_LABELS[l.unit]} · {fmt(l.priceRub)}/{UNIT_LABELS[l.unit]}
            </span>
          </span>
          <span class="shrink-0 font-medium tabular-nums">{fmt(l.sumRub)}</span>
        </li>
      {/each}
    </ul>
  </details>
{/snippet}

<div class="text-sm opacity-70">
  Площадь: {view.general.areaM2} м² · Комнат: {view.general.rooms} · Санузлов:
  {view.general.bathrooms}
</div>
<div class="mt-3 flex items-center justify-between">
  <h3 class="font-semibold">Материалы по этапам</h3>
  {#if allKeys.length > 1}
    <button
      type="button"
      class="btn btn-ghost btn-xs"
      onclick={() => setAll(!allOpen)}
    >
      {allOpen ? 'Свернуть всё' : 'Развернуть всё'}
    </button>
  {/if}
</div>
{#if overriddenCount > 0}
  <p class="mt-1 text-xs opacity-60">
    Цены изменены вручную ({overriddenCount}).
    <a class="link" href="/catalog">Редактировать каталог</a>
  </p>
{/if}

{#each STAGES as s (s.id)}
  {@const days = result.stageDays[s.id]}
  <div class="card mt-2 bg-base-100 p-3">
    <div class="flex items-baseline justify-between gap-2">
      <h4 class="font-semibold">{s.title}</h4>
      <span class="shrink-0 font-bold tabular-nums"
        >{fmt(result.stageTotals[s.id])}</span
      >
    </div>
    <p class="text-xs opacity-60">
      {days.min}–{days.max} раб. дн.{#if s.id === 'finish'}
        {finishCaption}{/if}
    </p>
    {#if s.id === 'finish'}
      <div class="mt-1">
        <ToggleField
          {form}
          path={['scope', 'customerSockets']}
          label="Розетки и выключатели ставит заказчик"
          hint="Уберём их из закупки ниже"
        />
      </div>
    {/if}
    <div class="mt-1 divide-y rounded bg-base-200">
      {#each catsOf(s.id) as c (c)}
        {@const lines = linesByStageCat.get(`${s.id}:${c}`) ?? []}
        {@const sum = lines.reduce((a, l) => a + l.sumRub, 0)}
        {@render group(
          `${s.id}:${c}`,
          COST_CATEGORY_LABELS[c],
          String(lines.length),
          sum,
          lines
        )}
      {/each}
    </div>
    {#if laborOf(s.id).length > 0}
      <ul class="mt-2 space-y-0.5 text-sm opacity-70">
        {#each laborOf(s.id) as t (t.label)}
          <li class="flex justify-between gap-2">
            <span>{t.label}</span><span>{t.hours} ч</span>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/each}

{#if result.excludedTotalRub > 0}
  <div class="card mt-2 bg-base-100 p-3">
    {@render group(
      'excluded',
      'Своими силами (ставит заказчик)',
      String(result.excludedLines.length),
      result.excludedTotalRub,
      result.excludedLines
    )}
  </div>
{/if}

<div
  class="mt-3 flex items-center justify-between border-t pt-2 text-lg font-bold"
>
  <span>Итого к закупке</span><span>{fmt(result.totalRub)}</span>
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
  ({result.laborHours} ч · {view.work.electricians} эл.)
</div>
{#if view.general.noLayoutMode}
  <div class="alert alert-warning mt-3 text-sm">
    Планировки нет — оценка грубая, по типовым значениям.
  </div>
{/if}

<div class="mt-3 flex gap-2">
  <button class="btn btn-outline w-full" onclick={copySummary}
    >Скопировать смету текстом</button
  >
</div>
