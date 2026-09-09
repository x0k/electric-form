import {
  COST_CATEGORIES,
  COST_CATEGORY_LABELS,
  UNIT_LABELS,
} from '#lib/catalog/index';
import type { Saving } from './savings';
import type { CalcResult } from './types';
import type { Project } from '#lib/project/types';

function fmt(n: number): string {
  return `${Math.round(n).toLocaleString('ru-RU')} ₽`;
}

/**
 * Текстовая смета для копирования/пересылки заказчику:
 * категории с итогами + конкретные позиции (п.7–8 ТЗ).
 */
export function formatSummary(
  view: Project,
  result: CalcResult,
  savings: Saving[]
): string {
  const blocks = COST_CATEGORIES.flatMap((c) => {
    const sum = result.categoryTotals[c];
    if (sum <= 0) return [];
    const lines = result.lines
      .filter((l) => l.category === c)
      .map(
        (l) =>
          `  • ${l.materialName} — ${l.qtyWithWaste} ${UNIT_LABELS[l.unit]} × ${fmt(l.priceRub)} = ${fmt(l.sumRub)}`
      );
    return [`${COST_CATEGORY_LABELS[c]}: ${fmt(sum)}`, ...lines];
  }).join('\n');
  const savingRows =
    savings.length > 0
      ? `\n\nГде можно сэкономить\n${savings
          .map((s) => `  • ${s.label}: −${fmt(s.deltaRub)}`)
          .join('\n')}`
      : '';
  return (
    `${view.meta.name}\n` +
    `Площадь: ${view.general.areaM2} м², комнат: ${view.general.rooms}, санузлов: ${view.general.bathrooms}\n\n` +
    `Материалы\n${blocks}\n` +
    `Итого: ${fmt(result.totalRub)} (${fmt(result.rangeRub.min)}–${fmt(result.rangeRub.max)})` +
    savingRows +
    `\n\nСрок: ${result.daysMin}–${result.daysMax} раб. дн.\nПредварительная оценка.`
  );
}
