import {
  COST_CATEGORIES,
  COST_CATEGORY_LABELS,
  UNIT_LABELS,
  type CostCategory,
} from '#lib/catalog/index';
import type { Saving } from './savings';
import type { CalcResult, WorkStage } from './types';
import type { Project } from '#lib/project/types';

function fmt(n: number): string {
  return `${Math.round(n).toLocaleString('ru-RU')} ₽`;
}

const STAGE_TITLES: Record<WorkStage, string> = {
  rough: 'Этап 1 — черновой монтаж',
  finish: 'Этап 2 — чистовая установка',
};

const STAGES: WorkStage[] = ['rough', 'finish'];

/**
 * Текстовая смета для копирования/пересылки заказчику:
 * этапы, категории с итогами + конкретные позиции (п.7–8 ТЗ).
 */
export function formatSummary(
  view: Project,
  result: CalcResult,
  savings: Saving[]
): string {
  const stageBlocks = STAGES.map((stage) => {
    const lines = result.lines.filter((l) => l.stage === stage);
    if (lines.length === 0) return '';
    const cats = COST_CATEGORIES.filter((c) =>
      lines.some((l) => l.category === c)
    );
    const body = cats
      .map((c: CostCategory) => {
        const catLines = lines.filter((l) => l.category === c);
        const sum = catLines.reduce((a, l) => a + l.sumRub, 0);
        const items = catLines
          .map(
            (l) =>
              `  • ${l.materialName} — ${l.qtyWithWaste} ${UNIT_LABELS[l.unit]} × ${fmt(l.priceRub)} = ${fmt(l.sumRub)}`
          )
          .join('\n');
        return `${COST_CATEGORY_LABELS[c]}: ${fmt(sum)}\n${items}`;
      })
      .join('\n');
    const days = result.stageDays[stage];
    return `${STAGE_TITLES[stage]}: ${fmt(result.stageTotals[stage])} (${days.min}–${days.max} дн.)\n${body}`;
  })
    .filter(Boolean)
    .join('\n\n');
  const excluded =
    result.excludedTotalRub > 0
      ? `\n\nСвоими силами (ставит заказчик): ${fmt(result.excludedTotalRub)}`
      : '';
  const savingRows =
    savings.length > 0
      ? `\n\nГде можно сэкономить\n${savings
          .map((s) => `  • ${s.label}: −${fmt(s.deltaRub)}`)
          .join('\n')}`
      : '';
  return (
    `${view.meta.name}\n` +
    `Площадь: ${view.general.areaM2} м², комнат: ${view.general.rooms}, санузлов: ${view.general.bathrooms}\n\n` +
    `${stageBlocks}` +
    `\n\nИтого к закупке: ${fmt(result.totalRub)} (${fmt(result.rangeRub.min)}–${fmt(result.rangeRub.max)})` +
    excluded +
    savingRows +
    `\n\nСрок: ${result.daysMin}–${result.daysMax} раб. дн.\nПредварительная оценка.`
  );
}
