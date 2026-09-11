import { page } from 'vitest/browser';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from 'vitest-browser-svelte';
import PlanViewerHarness from './PlanViewerHarness.svelte';

afterEach(() => cleanup());

describe('PlanViewer', () => {
  it('отображает тестовую модель: 4 стены + пол + потолок', async () => {
    await render(PlanViewerHarness);

    await expect.element(page.getByTestId('plan-canvas')).toBeVisible();
    const viewer = page.getByTestId('plan-viewer');
    await expect.element(viewer).toHaveAttribute('data-webgl', 'ok');
    await expect.element(viewer).toHaveAttribute('data-entity-count', '6');
  });

  it('программный выбор подсвечивает стену', async () => {
    await render(PlanViewerHarness);

    await page.getByTestId('pick-w1').click();
    await expect
      .element(page.getByTestId('selected-label'))
      .toHaveTextContent('w1');
    await expect
      .element(page.getByTestId('plan-viewer'))
      .toHaveAttribute('data-selected', 'w1');
  });

  it('клик по центру сцены выбирает пол (потолок не загораживает)', async () => {
    await render(PlanViewerHarness);

    const canvas = page.getByTestId('plan-canvas');
    await expect.element(canvas).toBeVisible();
    // Центр кадра смотрит в центр комнаты — луч упирается в пол.
    // force: canvas перерисовывается каждый кадр (rAF), Playwright считает
    // его «нестабильным» для обычного клика.
    await canvas.click({ force: true });
    await expect
      .element(page.getByTestId('notified-label'))
      .toHaveTextContent('floor1');
    await expect
      .element(page.getByTestId('selected-label'))
      .toHaveTextContent('floor1');
  });
});
