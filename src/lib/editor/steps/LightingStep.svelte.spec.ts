import { page } from 'vitest/browser';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from 'vitest-browser-svelte';
import LightingStepHarness from './LightingStepHarness.svelte';

afterEach(() => cleanup());

async function subgroup() {
  return page.getByText('Лента: питание и управление');
}

describe('LightingStep лента', () => {
  it('подгруппа появляется с первым комплектом, push прячет плавный пуск', async () => {
    await render(LightingStepHarness);

    // Ленты нет: подгруппы нет.
    expect((await (await subgroup()).elements()).length).toBe(0);

    // Указываем кухонный комплект (4-й спинбуттон: группы, проходные,
    // диммеры, кухня) → появляется подгруппа с управлением.
    await page.getByRole('spinbutton').nth(3).fill('1');

    await expect.element(await subgroup()).toBeVisible();
    await expect
      .element(page.getByText('Отдельный щит под ленту'))
      .toBeVisible();
    await expect.element(page.getByText('Управление лентой')).toBeVisible();
    await expect.element(page.getByText('Плавный пуск')).toBeVisible();

    await page.getByRole('radio', { name: 'Push-кнопка' }).click();
    // При push плавный пуск не предлагается.
    expect((await page.getByText('Плавный пуск').elements()).length).toBe(0);
  });
});
