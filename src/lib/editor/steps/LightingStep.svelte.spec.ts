import { page } from 'vitest/browser';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from 'vitest-browser-svelte';
import LightingStepHarness from './LightingStepHarness.svelte';

afterEach(() => cleanup());

async function subgroup() {
  return page.getByText('Лента: питание и управление');
}

describe('LightingStep лента', () => {
  it('подгруппа появляется с первой подсветкой, push прячет плавный пуск', async () => {
    await render(LightingStepHarness);

    // Ленты нет: только число групп и подсказка.
    expect((await (await subgroup()).elements()).length).toBe(0);

    // Включаем подсветку кухни и диммирование (группы: 0 → 1 степпером).
    await page.getByRole('checkbox', { name: 'Подсветка кухни' }).click();
    await page.getByRole('button', { name: 'Групп освещения: больше' }).click();

    await expect.element(await subgroup()).toBeVisible();
    await expect
      .element(page.getByText('Отдельный щит под ленту'))
      .toBeVisible();
    await expect.element(page.getByText('Плавный пуск')).toBeVisible();

    // Управления лентой ещё нет — диммирование выключено.
    expect((await page.getByText('Управление лентой').elements()).length).toBe(
      0
    );

    await page.getByRole('checkbox', { name: 'Диммирование' }).click();
    await expect.element(page.getByText('Управление лентой')).toBeVisible();

    await page.getByRole('radio', { name: 'Push-кнопка' }).click();
    // При push плавный пуск не предлагается.
    expect((await page.getByText('Плавный пуск').elements()).length).toBe(0);
  });
});
