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
  it('проходные: 0 по умолчанию, число фиксируется, Пересчитать перезаписывает', async () => {
    const form = await renderHarness();
    const path = ['lighting', 'passThroughQty'] as const;

    // Поле всегда видимо, изначально явный 0.
    await expect
      .element(page.getByText('Проходных выключателей, шт'))
      .toBeVisible();
    const qty = page.getByRole('spinbutton').nth(1);
    await expect.element(qty).toHaveValue(0);
    expect(getInput(form, { path: [...path] })).toBe(0);

    // Фиксируем 3 для закупки.
    await qty.fill('3');
    await expect.element(qty).toHaveValue(3);
    await vi.waitFor(() => {
      expect(getInput(form, { path: [...path] })).toBe(3);
    });

    // Кнопка «Пересчитать» перезаписывает формулой (группы=4).
    await page.getByRole('button', { name: 'Пересчитать количества' }).click();
    await expect.element(qty).toHaveValue(4);
    await vi.waitFor(() => {
      expect(getInput(form, { path: [...path] })).toBe(4);
    });
  });
});
