import { test, expect, type Page } from '@playwright/test';

/**
 * Тач-путь (планшет): те же pointer-хендлеры, указатель touch.
 * Hover'а на таче нет, поэтому стену для постановки ищем наведением
 * мыши (это не тестируется), а ставят и выбирают — только тапы.
 */
test.use({ hasTouch: true });

async function canvasPoint(
  page: Page,
  fx: number,
  fy: number
): Promise<{ x: number; y: number }> {
  const box = await page.getByTestId('plan-canvas').boundingBox();
  expect(box).not.toBeNull();
  return { x: box!.x + box!.width * fx, y: box!.y + box!.height * fy };
}

/** Два кадра — приложение сбросило состояние в DOM.
 * После settle чтение черновика истинно, гонки медленного рендера нет. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  );
}

/** Точка лежит на чистом канвасе, а не на оверлее (тулбар, панели). */
async function onCanvasPoint(
  page: Page,
  x: number,
  y: number
): Promise<boolean> {
  return page.evaluate(
    ([px, py]) =>
      document.elementFromPoint(px, py)?.getAttribute('data-testid') ===
      'plan-canvas',
    [x, y]
  );
}

test('тач: тап ставит контур, дверь и выбирает', async ({ page }) => {
  await page.goto('/plan');
  const viewer = page.getByTestId('plan-viewer');

  await expect(viewer).toHaveAttribute('data-framed', 'top', {
    timeout: 15000,
  });
  await expect(page.getByTestId('sketch-editor')).toHaveAttribute(
    'data-gcs',
    'ready',
    { timeout: 15000 }
  );
  // Тапы строят контур как клики.
  for (const [fx, fy] of [
    [0.35, 0.35],
    [0.65, 0.35],
    [0.65, 0.65],
    [0.35, 0.65],
    [0.35, 0.35],
  ] as const) {
    const p = await canvasPoint(page, fx, fy);
    await page.touchscreen.tap(p.x, p.y);
  }
  await expect(viewer).toHaveAttribute('data-sketch-closed', 'true');
  await page.getByTestId('commit-layout').tap();
  await expect(page.getByTestId('feature-item')).toHaveCount(1);

  // touch-action выключен — жесты идут в канвас, а не в скролл страницы.
  const touchAction = await page
    .getByTestId('plan-canvas')
    .evaluate((el) => getComputedStyle(el).touchAction);
  expect(touchAction).toBe('none');

  // Тап по стене ставит дверь (стену находим наведением, ставим тапом).
  // Только по чистому канвасу; успех — черновик вырос именно от этого тапа.
  const draft = page.getByTestId('commit-stage');
  const draftCount = () =>
    draft.getAttribute('data-draft-count').then((v) => Number(v ?? 0));
  let doorTap: { x: number; y: number } | null = null;
  await settle(page);
  for (let gy = 0.08; gy <= 0.96 && !doorTap; gy += 0.07) {
    for (let gx = 0.08; gx <= 0.96; gx += 0.07) {
      const p = await canvasPoint(page, gx, gy);
      if (!(await onCanvasPoint(page, p.x, p.y))) continue;
      await page.mouse.move(p.x, p.y);
      const w = await viewer.getAttribute('data-ghost-wall');
      if (!w) continue;
      const before = await draftCount();
      await page.touchscreen.tap(p.x, p.y);
      // Черновик вырос именно от этого тапа: после settle чтение истинно.
      // Постановка центрирует дверь под курсором (точка стены, не пол).
      await settle(page);
      if ((await draftCount()) === before + 1) {
        doorTap = p;
        break;
      }
    }
  }
  expect(doorTap).not.toBeNull();
  // Поставленная дверь сразу выбрана.
  await expect(viewer).toHaveAttribute('data-selected', 'd');

  // Esc гасит инструмент и сбрасывает выбор (как в скетче).
  // Повторный тап по точке свипа осмысленно бьёт в перемычку над дверью
  // (стена выше проёма), поэтому выбор тапом покрыт в dump-тесте.
  await page.keyboard.press('Escape');
  await expect(viewer).toHaveAttribute('data-place', '');
  await expect(viewer).toHaveAttribute('data-selected', '');
});
