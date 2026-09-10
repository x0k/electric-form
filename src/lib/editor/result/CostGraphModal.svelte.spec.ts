import { page } from 'vitest/browser';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from 'vitest-browser-svelte';
import { SEED_CATALOG } from '#lib/catalog/index';
import { calculate } from '#lib/calc/engine';
import { createDefaultProject } from '#lib/project/defaults';
import CostGraphModal from './CostGraphModal.svelte';

afterEach(() => cleanup());

describe('modal probe', () => {
  it('expand works in isolation', async () => {
    const view = createDefaultProject('Тест');
    const result = calculate(view, SEED_CATALOG);
    await render(CostGraphModal, {
      props: {
        stage: 'rough',
        title: 'Этап 1',
        sub: 'sub',
        lines: result.lines.filter((l) => l.stage === 'rough'),
        onclose: () => {},
      },
    });
    const dialog = page.getByRole('dialog');
    await expect.element(dialog).toBeVisible();
    const target = dialog.getByText('Кабель', { exact: true });
    await expect.element(target).toBeInViewport();
    await dialog.getByText('Кабель', { exact: true }).click();
    await expect
      .element(dialog.getByText('ВВГнг-LS 3×2.5', { exact: false }).first())
      .toBeVisible();
  });
});
