import { test, expect, type Page } from '@playwright/test';

/**
 * Мастер этапов через ГРАФИЧЕСКИЙ канвас: клик ставит, drag двигает,
 * гост-превью со снаппингом 1 см. Числа — только конфиг инструмента.
 *
 * контур → commit(layout) → [экран 2: клик по стене = дверь] → commit →
 * [экран 3: клик по полу = шкаф, drag шкафа] → commit →
 * возврат через дерево → правка проёма перетаскиванием.
 */

async function canvasPoint(
  page: Page,
  fx: number,
  fy: number
): Promise<{ x: number; y: number }> {
  const box = await page.getByTestId('plan-canvas').boundingBox();
  expect(box).not.toBeNull();
  return { x: box!.x + box!.width * fx, y: box!.y + box!.height * fy };
}

/** Свип курсором: клик по стене, пока дверь не встанет (у торцов — простенок). */
async function placeDoorOnWall(
  page: Page
): Promise<{ fx: number; fy: number; wall: string }> {
  const viewer = page.getByTestId('plan-viewer');
  const draft = page.getByTestId('draft-count');
  for (let gy = 0.08; gy <= 0.96; gy += 0.07) {
    for (let gx = 0.08; gx <= 0.96; gx += 0.07) {
      const p = await canvasPoint(page, gx, gy);
      await page.mouse.move(p.x, p.y);
      const w = await viewer.getAttribute('data-ghost-wall');
      if (!w) continue;
      await page.mouse.click(p.x, p.y);
      try {
        await expect(draft).toHaveText(/1 оп/, { timeout: 800 });
        return { fx: gx, fy: gy, wall: w };
      } catch {
        continue;
      }
    }
  }
  throw new Error('дверь не встала ни на одну стену');
}

test('мастер: клик ставит, drag двигает, дерево возвращает', async ({
  page,
}) => {
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
  for (const [fx, fy] of [
    [0.35, 0.35],
    [0.65, 0.35],
    [0.65, 0.65],
    [0.35, 0.65],
    [0.35, 0.35],
  ] as const) {
    const p = await canvasPoint(page, fx, fy);
    await page.mouse.click(p.x, p.y);
  }
  await expect(viewer).toHaveAttribute('data-sketch-closed', 'true');
  await page.getByTestId('commit-layout').click();
  await expect(page.getByTestId('feature-item')).toHaveCount(1);

  // Экран 2 «Двери и окна»: инструмент активен, гост следует за курсором.
  await expect(page.getByTestId('openings-panel')).toBeVisible();
  await expect(page.getByTestId('step-title')).toHaveText(/Шаг 2 из 7/);
  await expect(viewer).toHaveAttribute('data-place', 'opening');
  await page.getByTestId('cam-top').click();
  await expect(viewer).toHaveAttribute('data-framed', 'top');

  // Esc гасит инструмент, тоггл возвращает.
  await page.keyboard.press('Escape');
  await expect(viewer).toHaveAttribute('data-place', '');
  await page.getByTestId('place-toggle').click();
  await expect(viewer).toHaveAttribute('data-place', 'opening');

  // Клик по стене = дверь по центру клика.
  await placeDoorOnWall(page);
  await page.getByTestId('commit-stage').click();
  await expect(page.getByTestId('feature-item')).toHaveCount(2);
  // 6 сущностей планировки + 1 проём.
  await expect(viewer).toHaveAttribute('data-entity-count', '7');

  // Экран 3 «Напольные»: клик по центру пола = шкаф в помещении.
  // Дверь достаёт свингом до центра: конфликт виден сразу, до коммита —
  // проверка габаритом, а не центром (старый код его бы пропустил).
  await expect(page.getByTestId('floor-panel')).toBeVisible();
  await expect(page.getByTestId('step-title')).toHaveText(/Шаг 3 из 7/);
  await expect(viewer).toHaveAttribute('data-place', 'floorObject');
  const center = await canvasPoint(page, 0.5, 0.5);
  await page.mouse.click(center.x, center.y);
  await expect(page.getByTestId('draft-count')).toHaveText(/1 оп/);
  await expect(page.getByTestId('conflicts-panel')).toHaveText(
    /перекрывает распах двери/
  );

  // Drag шкафа: черновик — добавление + обновление якоря.
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + 70, center.y + 40, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByTestId('draft-count')).toHaveText(/2 оп/);

  // Шкаф в распахе не нужен: удаляем, черновик — 3 оп., конфликтов нет.
  await page.locator('[data-testid="floor-del"][data-id="f"]').click();
  await expect(page.getByTestId('draft-count')).toHaveText(/3 оп/);
  await expect(page.getByTestId('conflicts-panel')).toHaveText(
    /Конфликтов нет/
  );
  await page.getByTestId('commit-stage').click();
  await expect(page.getByTestId('feature-item')).toHaveCount(3);
  await expect(viewer).toHaveAttribute('data-entity-count', '7');

  // Назад через Feature Tree: просмотр планировки на её состоянии.
  await page.locator('[data-testid="feature-item"][data-index="0"]').click();
  await expect(page.getByTestId('preview-banner')).toBeVisible();
  await expect(viewer).toHaveAttribute('data-entity-count', '6');
  await page.getByTestId('back-to-head').click();
  await expect(page.getByTestId('wallobj-panel')).toBeVisible();
  await expect(page.getByTestId('step-title')).toHaveText(/Шаг 4 из 7/);

  // Правка прошлой Feature: сужаем дверь числом (простенки растут —
  // валидно всегда), drag двери уже проверен staging-механикой выше.
  await page.locator('[data-testid="feature-item"][data-index="1"]').click();
  await expect(page.getByTestId('preview-banner')).toBeVisible();
  await page.getByTestId('cam-top').click();
  await expect(viewer).toHaveAttribute('data-framed', 'top');
  await page.getByTestId('edit-stage').click();
  await expect(page.getByTestId('edit-banner')).toBeVisible();
  await page.locator('[data-testid="opening-w"][data-id="d"]').fill('800');
  // change срабатывает на blur: уходим табом, Update уходит в черновик.
  await page.locator('[data-testid="opening-w"][data-id="d"]').press('Tab');
  await expect(page.getByTestId('draft-count')).toHaveText(/2 оп/);
  await page.getByTestId('commit-stage').click();
  await expect(page.getByTestId('feature-item')).toHaveCount(3);
  await expect(viewer).toHaveAttribute('data-entity-count', '7');
});
