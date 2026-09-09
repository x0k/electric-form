import { describe, expect, it } from 'vitest';
import { COST_CATEGORY_LABELS, SEED_CATALOG } from '#lib/catalog/index';
import { calculate } from '#lib/calc/engine';
import { calcSavings } from '#lib/calc/savings';
import { formatSummary } from '#lib/calc/summary';
import { createDefaultProject } from '#lib/project/defaults';

describe('formatSummary', () => {
  it('включает категории, конкретные позиции и итог', () => {
    const view = createDefaultProject('Тест');
    const result = calculate(view, SEED_CATALOG);
    const text = formatSummary(view, result, calcSavings(view, SEED_CATALOG));

    expect(text).toContain('Тест');
    expect(text).toContain('Итого к закупке:');
    expect(text).toContain('Этап 1 — черновой монтаж');
    expect(text).toContain('Этап 2 — чистовая установка');
    expect(text).toContain('Кабель:');
    // Хотя бы одна конкретная позиция из движка попадает в текст.
    const first = result.lines[0];
    expect(text).toContain(first.materialName);
    expect(text).toContain(`${first.qtyWithWaste}`);
    // Нулевые категории не шумят.
    for (const [cat, sum] of Object.entries(result.categoryTotals)) {
      if (sum === 0) {
        const label =
          COST_CATEGORY_LABELS[cat as keyof typeof COST_CATEGORY_LABELS];
        expect(text).not.toContain(`\n${label}:`);
      }
    }
  });
});
