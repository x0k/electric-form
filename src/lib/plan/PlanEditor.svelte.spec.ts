import { page } from 'vitest/browser';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from 'vitest-browser-svelte';
import PlanEditorHarness from './PlanEditorHarness.svelte';

afterEach(() => cleanup());

describe('PlanViewer: editor foundation', () => {
  it('переключает камеры top/iso/orbit', async () => {
    await render(PlanEditorHarness);
    const viewer = page.getByTestId('plan-viewer');
    const canvas = page.getByTestId('plan-canvas');
    await expect.element(canvas).toBeVisible();

    await page.getByTestId('cam-top').click();
    await expect.element(viewer).toHaveAttribute('data-camera', 'top');
    await expect.element(canvas).toBeVisible();

    await page.getByTestId('cam-iso').click();
    await expect.element(viewer).toHaveAttribute('data-camera', 'iso');

    await page.getByTestId('cam-orbit').click();
    await expect.element(viewer).toHaveAttribute('data-camera', 'orbit');
  });

  it('показывает overlay скетча: 4 точки, контур замкнут', async () => {
    await render(PlanEditorHarness);
    const viewer = page.getByTestId('plan-viewer');
    await expect.element(viewer).toHaveAttribute('data-sketch-points', '4');
    await expect.element(viewer).toHaveAttribute('data-sketch-closed', 'true');
  });

  it('клик по пустому месту сверху отдаёт точку плана со снаппингом 1 см', async () => {
    await render(PlanEditorHarness);
    const viewer = page.getByTestId('plan-viewer');
    await page.getByTestId('cam-top').click();
    // Ждём реальное переключение three-камеры, а не только пропс.
    await expect.element(viewer).toHaveAttribute('data-framed', 'top');

    const canvas = page.getByTestId('plan-canvas');
    await expect.element(canvas).toBeVisible();
    // Левый верхний угол — мимо пола 6×4 м (вид покрывает контур + отступ).
    // Точное значение зависит от субпиксельного округления клика (1px ≈ 11мм),
    // поэтому допуск проверяет сам харнес (окрестность + сетка 1 см + мимо модели).
    await canvas.click({ position: { x: 5, y: 5 }, force: true });
    await expect
      .element(page.getByTestId('plan-label'))
      .toHaveAttribute('data-ok', 'true');
  });

  it('клик по хендлу вершины выбирает точку скетча', async () => {
    await render(PlanEditorHarness);
    const viewer = page.getByTestId('plan-viewer');
    await page.getByTestId('cam-top').click();
    await expect.element(viewer).toHaveAttribute('data-framed', 'top');

    // p1 (0,0) в top-фрустуме 640×480: NDC(-0.811, -0.721) → px ≈ (61, 413).
    // Радиус хендла ~4px — запас к субпиксельному джиттеру есть.
    const canvas = page.getByTestId('plan-canvas');
    await expect.element(canvas).toBeVisible();
    await canvas.click({ position: { x: 61, y: 413 }, force: true });
    await expect
      .element(page.getByTestId('selected-label'))
      .toHaveTextContent('p1');
  });

  it('клик по ручке грани выбирает сегмент', async () => {
    await render(PlanEditorHarness);
    const viewer = page.getByTestId('plan-viewer');
    await page.getByTestId('cam-top').click();
    await expect.element(viewer).toHaveAttribute('data-framed', 'top');

    // Середина s1 (3000,0): NDC(0, -0.721) → px ≈ (320, 413).
    const canvas = page.getByTestId('plan-canvas');
    await expect.element(canvas).toBeVisible();
    await canvas.click({ position: { x: 320, y: 413 }, force: true });
    await expect
      .element(page.getByTestId('selected-label'))
      .toHaveTextContent('s1');
  });
});
