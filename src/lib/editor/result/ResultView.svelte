<script lang="ts">
  import { COST_CATEGORIES, COST_CATEGORY_LABELS } from '#lib/catalog/index';
  import type { CalcResult } from '#lib/calc/types';
  import type { Saving } from '#lib/calc/savings';
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

  function copySummary() {
    const rows = COST_CATEGORIES.map(
      (c) => `${COST_CATEGORY_LABELS[c]}: ${fmt(result.categoryTotals[c])}`
    ).join('\n');
    const text = `${view.meta.name}\nПлощадь: ${view.general.areaM2} м², комнат: ${view.general.rooms}, санузлов: ${view.general.bathrooms}\n\nМатериалы\n${rows}\nИтого: ${fmt(result.totalRub)} (${fmt(result.rangeRub.min)}–${fmt(result.rangeRub.max)})\n\nСрок: ${result.daysMin}–${result.daysMax} раб. дн.\nПредварительная оценка.`;
    navigator.clipboard?.writeText(text).catch(() => {});
  }
</script>

<div class="text-sm opacity-70">
  Площадь: {view.general.areaM2} м² · Комнат: {view.general.rooms} · Санузлов:
  {view.general.bathrooms}
</div>
<h3 class="mt-3 font-semibold">Материалы</h3>
{#if overriddenCount > 0}
  <p class="mt-1 text-xs opacity-60">
    Цены изменены вручную ({overriddenCount}).
    <a class="link" href="/catalog">Редактировать каталог</a>
  </p>
{/if}
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
