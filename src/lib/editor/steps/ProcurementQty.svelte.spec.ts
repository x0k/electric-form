import { getInput } from '@formisch/svelte';
import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from 'vitest-browser-svelte';
import type { ProjectForm } from '#lib/forms/ctx';
import LightingStepHarness from './LightingStepHarness.svelte';

afterEach(() => cleanup());

async function renderHarness(): Promise<ProjectForm> {
  let form: ProjectForm | undefined;
  await render(LightingStepHarness, {
    props: { onform: (f: ProjectForm) => (form = f) },
  });
  await vi.waitFor(() => {
    if (!form) throw new Error('форма не создана');
  });
  return form as ProjectForm;
}

describe('procurement qty', () => {
  it('проходные: пусто = 0, число фиксируется, Заполнить проставляет расчёт', async () => {
    const form = await renderHarness();
    const path = ['lighting', 'passThroughQty'] as const;

    // Поле всегда видимо, изначально пусто (= 0 в смете).
    await expect
      .element(page.getByText('Проходных выключателей, шт'))
      .toBeVisible();
    expect(getInput(form, { path: [...path] })).toBeUndefined();

    // Фиксируем 3 для закупки (второй спинбуттон после групп).
    const qty = page.getByRole('spinbutton').nth(1);
    await qty.fill('3');
    await expect.element(qty).toHaveValue(3);
    await vi.waitFor(() => {
      expect(getInput(form, { path: [...path] })).toBe(3);
    });

    // Очистка → снова пусто (= 0 в смете).
    await qty.fill('');
    await vi.waitFor(() => {
      expect(getInput(form, { path: [...path] })).toBeUndefined();
    });

    // Кнопка «Заполнить» проставляет расчёт (4) явно.
    await page
      .getByRole('button', { name: 'Заполнить количества по расчёту' })
      .click();
    await expect.element(qty).toHaveValue(4);
    await vi.waitFor(() => {
      expect(getInput(form, { path: [...path] })).toBe(4);
    });
  });
});
