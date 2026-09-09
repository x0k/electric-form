<script lang="ts">
  import {
    COST_CATEGORIES,
    COST_CATEGORY_LABELS,
    UNIT_LABELS,
    type CostCategory,
  } from '#lib/catalog/index';
  import type { CalcResult } from '#lib/calc/types';
  import type { Saving } from '#lib/calc/savings';
  import { formatSummary } from '#lib/calc/summary';
  import type { Project } from '#lib/project/types';

  let {
    view,
    result,
    savings,
    overriddenCount,
  }: {
    view: Project;
    result: CalcResult;
    savings: Saving[];
    overriddenCount: number;
  } = $props();

  function fmt(n: number): string {
    return `${Math.round(n).toLocaleString('ru-RU')} ₽`;
  }

  const linesByCat = $derived.by(() => {
    const m = new Map<CostCategory, CalcResult['lines']>();
    for (const l of result.lines) {
      const arr = m.get(l.category);
      if (arr) arr.push(l);
      else m.set(l.category, [l]);
    }
    return m;
  });
  const visibleCats = $derived(
    COST_CATEGORIES.filter((c) => (result.categoryTotals[c] ?? 0) > 0)
  );

  // Раскрытые категории (управляемый details для «развернуть всё»).
  let openCats = $state<CostCategory[]>([]);
  function setAll(open: boolean) {
    openCats = open ? [...visibleCats] : [];
  }
  function onToggleCat(c: CostCategory, open: boolean) {
    openCats = open
      ? [...new Set([...openCats, c])]
      : openCats.filter((x) => x !== c);
  }

  function copySummary() {
    navigator.clipboard
      ?.writeText(formatSummary(view, result, savings))
      .catch(() => {});
  }
</script>

<div class="text-sm opacity-70">
  Площадь: {view.general.areaM2} м² · Комнат: {view.general.rooms} · Санузлов:
  {view.general.bathrooms}
</div>
<div class="mt-3 flex items-center justify-between">
  <h3 class="font-semibold">Материалы</h3>
  {#if visibleCats.length > 1}
    <button
      type="button"
      class="btn btn-ghost btn-xs"
      onclick={() => setAll(openCats.length < visibleCats.length)}
    >
      {openCats.length < visibleCats.length ? 'Развернуть всё' : 'Свернуть всё'}
    </button>
  {/if}
</div>
{#if overriddenCount > 0}
  <p class="mt-1 text-xs opacity-60">
    Цены изменены вручную ({overriddenCount}).
    <a class="link" href="/catalog">Редактировать каталог</a>
  </p>
{/if}
<div class="mt-2 divide-y rounded bg-base-100">
  {#each visibleCats as c (c)}
    {@const sum = result.categoryTotals[c]}
    {@const lines = linesByCat.get(c) ?? []}
    <details
      class="p-2"
      open={openCats.includes(c)}
      ontoggle={(e) => onToggleCat(c, e.currentTarget.open)}
    >
      <summary class="flex cursor-pointer items-center justify-between gap-2">
        <span class="min-w-0 flex-1 truncate"
          >{COST_CATEGORY_LABELS[c]}
          <span class="badge badge-ghost badge-xs ml-1 align-middle"
            >{lines.length}</span
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
            <span class="shrink-0 font-medium tabular-nums"
              >{fmt(l.sumRub)}</span
            >
          </li>
        {/each}
      </ul>
    </details>
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
  ({result.laborHours} ч · {view.work.electricians} эл.)
</div>
<ul class="mt-1 space-y-0.5 text-sm opacity-70">
  {#each result.labor as t (t.label)}
    <li class="flex justify-between gap-2">
      <span>{t.label}</span><span>{t.hours} ч</span>
    </li>
  {/each}
</ul>
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
