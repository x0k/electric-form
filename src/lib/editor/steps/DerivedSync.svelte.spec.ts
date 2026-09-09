import { getInput } from '@formisch/svelte';
import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from 'vitest-browser-svelte';
import type { ProjectForm } from '#lib/forms/ctx';
import DerivedHarness from './DerivedHarness.svelte';

afterEach(() => cleanup());

async function autoBadges(): Promise<number> {
  return (await page.getByText('авто', { exact: true }).elements()).length;
}

async function renderHarness(): Promise<ProjectForm> {
  let form: ProjectForm | undefined;
  await render(DerivedHarness, {
    props: { onform: (f: ProjectForm) => (form = f) },
  });
  await vi.waitFor(() => {
    if (!form) throw new Error('форма не создана');
  });
  return form as ProjectForm;
}

describe('derived sync', () => {
  it('группы считаются из комнат, ручная правка останавливает синхр', async () => {
    const form = await renderHarness();
    // Видимые спинбуттоны: площадь, комнаты, санузлы, вводной автомат,
    // номинал ввода, группы, ... (двери/точки — в закрытом details).
    const roomsInput = page.getByRole('spinbutton').nth(1);
    const groupsInput = page.getByRole('spinbutton').nth(5);

    // Старт: rooms=2 → groups=4 с бейджем «авто» (группы + двери).
    await expect.element(groupsInput).toHaveValue(4);
    await vi.waitFor(async () => {
      expect(await autoBadges()).toBe(2);
    });

    // Комнат 2 → 3: группы 4 → 5, всё ещё авто.
    await page.getByRole('button', { name: 'Комнат: больше' }).click();
    await expect.element(groupsInput).toHaveValue(5);
    await vi.waitFor(async () => {
      expect(await autoBadges()).toBe(2);
    });

    // Ручная правка групп: бейдж уходит, синхр останавливается.
    await groupsInput.fill('7');
    await expect.element(groupsInput).toHaveValue(7);
    await vi.waitFor(async () => {
      expect(await autoBadges()).toBe(1);
    });

    // Комнат 3 → 4: группы остаются 7, двери едут дальше (4 → 6).
    await page.getByRole('button', { name: 'Комнат: больше' }).click();
    await expect.element(roomsInput).toHaveValue(4);
    await expect.element(groupsInput).toHaveValue(7);
    await vi.waitFor(() => {
      expect(getInput(form, { path: ['general', 'doorsCount'] })).toBe(6);
    });
    await vi.waitFor(async () => {
      expect(await autoBadges()).toBe(1);
    });
  });
});
