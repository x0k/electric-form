import { page } from 'vitest/browser';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from 'vitest-browser-svelte';
import { SEED_CATALOG } from '#lib/catalog/index';
import { calculate } from '#lib/calc/engine';
import { calcSavings } from '#lib/calc/savings';
import { createDefaultProject } from '#lib/project/defaults';
import ResultView from './ResultView.svelte';

afterEach(() => cleanup());

async function renderResult() {
  const view = createDefaultProject('Тест');
  const result = calculate(view, SEED_CATALOG);
  await render(ResultView, {
    props: {
      view,
      result,
      savings: calcSavings(view, SEED_CATALOG),
      overriddenCount: 0,
    },
  });
  return result;
}

describe('ResultView категории', () => {
  it('категория раскрывается до конкретных позиций', async () => {
    const result = await renderResult();
    const first = result.lines[0];

    // Позиция скрыта, пока категория не раскрыта (.first() — вхождение
    // в списке материалов; такое же имя есть ниже в «драйверах»).
    const line = page.getByText(first.materialName, { exact: false }).first();
    await expect.element(line).not.toBeVisible();

    await page.getByText('Кабель').first().click();
    await expect.element(line).toBeVisible();
    // Видна цена за единицу.
    await expect
      .element(page.getByText(`${first.priceRub} ₽/`, { exact: false }).first())
      .toBeVisible();
  });

  it('кнопка разворачивает все категории сразу', async () => {
    const result = await renderResult();
    await page.getByRole('button', { name: 'Развернуть всё' }).click();

    const names = [...new Set(result.lines.map((l) => l.materialName))].slice(
      0,
      5
    );
    for (const name of names) {
      await expect
        .element(page.getByText(name, { exact: false }).first())
        .toBeVisible();
    }

    await page.getByRole('button', { name: 'Свернуть всё' }).click();
    await expect
      .element(
        page.getByText(result.lines[0].materialName, { exact: false }).first()
      )
      .not.toBeVisible();
  });
});
