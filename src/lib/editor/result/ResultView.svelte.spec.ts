import { page } from 'vitest/browser';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from 'vitest-browser-svelte';
import { SEED_CATALOG } from '#lib/catalog/index';
import { calculate } from '#lib/calc/engine';
import { createDefaultProject } from '#lib/project/defaults';
import ResultViewHarness from './ResultViewHarness.svelte';

afterEach(() => cleanup());

function fixture() {
  const view = createDefaultProject('Тест');
  return { view, result: calculate(view, SEED_CATALOG) };
}

describe('ResultView категории', () => {
  it('категория раскрывается до конкретных позиций', async () => {
    await render(ResultViewHarness);
    const { result } = fixture();
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
    await render(ResultViewHarness);
    const { result } = fixture();
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

  it('тоггл заказчика убирает розетки из итога в «своими силами»', async () => {
    await render(ResultViewHarness);
    const { result } = fixture();
    const socketsSum = result.lines
      .filter((l) => l.category === 'sockets')
      .reduce((a, l) => a + l.sumRub, 0);
    expect(socketsSum).toBeGreaterThan(0);

    const total = page.getByText('Итого к закупке');
    await expect.element(total).toBeVisible();

    await page.getByRole('checkbox', { name: /ставит заказчик/ }).click();

    await expect.element(page.getByText('Своими силами')).toBeVisible();
    // Розеточная позиция ушла из сметы в блок «своими силами»:
    // в списке материалов её больше не видно раскрытой? Проверяем сумму.
    await expect.element(page.getByText('Итого к закупке')).toBeVisible();
    // Точное значение итога проверять хрупко (формат), достаточно факта
    // переключения блоков и отсутствия категории розеток в этапах.
    await page.getByRole('button', { name: 'Развернуть всё' }).click();
    const socketName = result.lines.find(
      (l) => l.category === 'sockets'
    )?.materialName;
    if (socketName) {
      const occurrences = page.getByText(socketName, { exact: false });
      // Осталось единственное вхождение — в «Своими силами».
      expect((await occurrences.elements()).length).toBe(1);
    }
  });
});

describe('ResultView граф затрат', () => {
  it('кнопка открывает полноэкранную схему, листы свернуты', async () => {
    await render(ResultViewHarness);
    const { result } = fixture();
    // Топ-позиция категории «Кабель» — она же превью в подписи узла.
    const topCable = result.lines
      .filter((l) => l.stage === 'rough' && l.category === 'cable')
      .sort((a, b) => b.sumRub - a.sumRub)[0];
    const roughName = topCable?.materialName;
    expect(roughName).toBeTruthy();

    await page.getByRole('button', { name: 'Схема' }).first().click();
    const dialog = page.getByRole('dialog');
    await expect.element(dialog).toBeVisible();
    await expect
      .element(
        dialog.getByRole('heading', { name: 'Этап 1 — черновой монтаж' })
      )
      .toBeVisible();

    // Категория видна; лист-узел скрыт (свернут), но имя топ-позиции
    // уже есть в подписи категории — ровно одно вхождение.
    // Подпись листа (кол-во → запас) уникальна — её пока нет.
    const leafSub = `${topCable.qty} → ${topCable.qtyWithWaste} м × ${topCable.priceRub} ₽`;
    await expect
      .element(dialog.getByText('Кабель', { exact: true }))
      .toBeVisible();
    expect(
      (await dialog.getByText(roughName!, { exact: false }).elements()).length
    ).toBe(1);
    expect(
      (await dialog.getByText(leafSub, { exact: false }).elements()).length
    ).toBe(0);

    // Клик по категории раскрывает листы — подпись листа появляется.
    await dialog.getByText('Кабель', { exact: true }).click();
    await expect
      .element(dialog.getByText(leafSub, { exact: false }).first())
      .toBeVisible();

    // ✕ закрывает.
    await dialog.getByRole('button', { name: 'Закрыть схему' }).click();
    expect((await page.getByRole('dialog').elements()).length).toBe(0);
  });
});
