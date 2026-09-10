import { getInput } from '@formisch/svelte';
import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from 'vitest-browser-svelte';
import NumberFieldHarness from './NumberFieldHarness.svelte';
import type { ProjectForm } from '#lib/forms/ctx';

afterEach(() => cleanup());

async function renderRooms(): Promise<ProjectForm> {
  let form: ProjectForm | undefined;
  await render(NumberFieldHarness, {
    props: {
      path: ['general', 'rooms'],
      label: 'Комнат',
      onform: (f: ProjectForm) => (form = f),
    },
  });
  await vi.waitFor(() => {
    if (!form) throw new Error('форма не создана');
  });
  return form as ProjectForm;
}

describe('NumberField stepper', () => {
  it('кнопки −/+ меняют значение в сторе', async () => {
    const form = await renderRooms(); // rooms = 2

    const input = page.getByRole('spinbutton');
    const plus = page.getByRole('button', { name: 'Комнат: больше' });
    const minus = page.getByRole('button', { name: 'Комнат: меньше' });

    await expect.element(input).toHaveValue(2);

    await plus.click();
    await expect.element(input).toHaveValue(3);
    expect(getInput(form, { path: ['general', 'rooms'] })).toBe(3);

    await minus.click();
    await minus.click();
    await expect.element(input).toHaveValue(1);
    expect(getInput(form, { path: ['general', 'rooms'] })).toBe(1);
  });

  it('не уходит ниже минимума', async () => {
    let form: ProjectForm | undefined;
    await render(NumberFieldHarness, {
      props: {
        path: ['general', 'bathrooms'],
        label: 'Санузлов',
        min: 0,
        max: 5,
        onform: (f: ProjectForm) => (form = f),
      },
    });
    await vi.waitFor(() => {
      if (!form) throw new Error('форма не создана');
    });

    const minus = page.getByRole('button', { name: 'Санузлов: меньше' });
    // bathrooms = 1 → 0 → остаётся 0
    await minus.click();
    await minus.click();
    await minus.click();
    expect(
      getInput(form as ProjectForm, { path: ['general', 'bathrooms'] })
    ).toBe(0);
  });
});
