import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * Дамп скетча для репорта: кнопка скачивает JSON состояния.
 * Скачивание разрешено на уровне файла (остальной сюите не нужно).
 * Заодно проверяем выбор тапом (hasTouch): тап по ручке выбирает узел.
 */
test.use({ acceptDownloads: true, hasTouch: true });

test('дамп скетча скачивается с геометрией и статистикой', async ({ page }) => {
  await page.goto('/plan');
  const viewer = page.getByTestId('plan-viewer');
  const canvas = page.getByTestId('plan-canvas');

  await expect(viewer).toHaveAttribute('data-framed', 'top', {
    timeout: 15000,
  });
  await expect(page.getByTestId('sketch-editor')).toHaveAttribute(
    'data-gcs',
    'ready',
    { timeout: 15000 }
  );
  const click = async (fx: number, fy: number) => {
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(box!.x + box!.width * fx, box!.y + box!.height * fy);
  };
  const tap = async (fx: number, fy: number) => {
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    await page.touchscreen.tap(
      box!.x + box!.width * fx,
      box!.y + box!.height * fy
    );
  };

  await click(0.3, 0.3);
  await click(0.5, 0.3);
  await expect(viewer).toHaveAttribute('data-gizmo', '2:1');
  // Счётчик учитывает черновик в работе (не «0/6»).
  await expect(page.getByTestId('stage-tree')).toHaveText(/Этапы 1\/6/);

  // Выбор тапом: Esc в выбор, тап по ручке p1 выбирает узел.
  await page.keyboard.press('Escape');
  await tap(0.3, 0.3);
  await expect(viewer).toHaveAttribute('data-selected', 'p1');

  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('sketch-dump').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('sketch-dump.json');
  const path = await download.path();
  expect(path).not.toBeNull();
  const dump = JSON.parse(readFileSync(path!, 'utf-8')) as {
    app: string;
    exportedAt: string;
    sketch: {
      points: Record<string, { id: string; x: number; y: number }>;
      segments: { id: string }[];
      constraints: unknown[];
    };
    stats: { points: number; segments: number; constraints: number };
  };
  expect(dump.app).toBe('electric-form/plan');
  expect(dump.stats).toMatchObject({ points: 2, segments: 1 });
  expect(Object.keys(dump.sketch.points).sort()).toEqual(['p1', 'p2']);
  expect(dump.sketch.segments.map((s) => s.id)).toEqual(['s1']);
  // Подтверждение скачивания видно в статусе.
  await expect(page.getByRole('status')).toHaveText(/Дамп скетча скачан/);
});
