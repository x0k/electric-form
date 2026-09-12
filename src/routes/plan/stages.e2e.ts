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

/** Два кадра — приложение сбросило состояние в DOM (ребилд сцены синхронен).
 * Дешевле и точнее любых таймаутов: после settle чтение черновика истинно. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  );
}

/** Свип курсором: клик по стене, пока дверь не встанет (у торцов — простенок). */
async function placeDoorOnWall(
  page: Page
): Promise<{ fx: number; fy: number; wall: string }> {
  const viewer = page.getByTestId('plan-viewer');
  const draft = page.getByTestId('commit-stage');
  const draftCount = () =>
    draft.getAttribute('data-draft-count').then((v) => Number(v ?? 0));
  await settle(page);
  for (let gy = 0.08; gy <= 0.96; gy += 0.07) {
    for (let gx = 0.08; gx <= 0.96; gx += 0.07) {
      const p = await canvasPoint(page, gx, gy);
      // Мимо оверлеев (тулбар!): клик только по чистому канвасу,
      // иначе можно выключить инструмент вместо постановки.
      if (!(await onCanvasPoint(page, p.x, p.y))) continue;
      await page.mouse.move(p.x, p.y);
      const w = await viewer.getAttribute('data-ghost-wall');
      if (!w) continue;
      const before = await draftCount();
      await page.mouse.click(p.x, p.y);
      // Черновик вырос именно от этого клика: после settle чтение истинно.
      // Постановка центрирует дверь под курсором (точка стены, не пол),
      // так что точка заведомо на двери.
      await settle(page);
      if ((await draftCount()) === before + 1) {
        return { fx: gx, fy: gy, wall: w };
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
  // Текущий этап виден в дереве строкой черновика.
  await expect(page.getByTestId('draft-stage')).toHaveText(/Двери и окна/);
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
  await expect(viewer).toHaveAttribute('data-place', 'floorObject');
  const center = await canvasPoint(page, 0.5, 0.5);
  await page.mouse.click(center.x, center.y);
  await expect(page.getByTestId('commit-stage')).toHaveAttribute(
    'data-draft-count',
    '1'
  );
  await expect(page.getByTestId('conflicts-panel')).toHaveText(
    /перекрывает распах двери/
  );

  // Drag шкафа: черновик — добавление + обновление якоря.
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + 70, center.y + 40, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByTestId('commit-stage')).toHaveAttribute(
    'data-draft-count',
    '2'
  );

  // Шкаф в распахе не нужен: удаляем, черновик — 3 оп., конфликтов нет.
  await page.locator('[data-testid="floor-del"][data-id="f"]').click();
  await expect(page.getByTestId('commit-stage')).toHaveAttribute(
    'data-draft-count',
    '3'
  );
  await expect(page.getByTestId('conflicts-panel')).toHaveText(
    /Конфликтов нет/
  );
  await page.getByTestId('commit-stage').click();
  await expect(page.getByTestId('feature-item')).toHaveCount(3);
  await expect(viewer).toHaveAttribute('data-entity-count', '7');

  // Назад через Feature Tree: одиночный клик только выбирает строку...
  await page.locator('[data-testid="feature-item"][data-index="0"]').click();
  await expect(page.getByTestId('preview-banner')).not.toBeVisible();
  // ...а глаз открывает просмотр планировки на её состоянии.
  await page.locator('[data-testid="feature-preview"][data-index="0"]').click();
  await expect(page.getByTestId('preview-banner')).toBeVisible();
  await expect(viewer).toHaveAttribute('data-entity-count', '6');
  await page.getByTestId('back-to-head').click();
  await expect(page.getByTestId('wallobj-panel')).toBeVisible();

  // Правка прошлой Feature двойным кликом (как в FreeCAD).
  await page.locator('[data-testid="feature-item"][data-index="1"]').dblclick();
  await expect(page.getByTestId('edit-banner')).toBeVisible();
  await page.locator('[data-testid="opening-w"][data-id="d"]').fill('800');
  // change срабатывает на blur: уходим табом, Update уходит в черновик.
  await page.locator('[data-testid="opening-w"][data-id="d"]').press('Tab');
  await expect(page.getByTestId('commit-stage')).toHaveAttribute(
    'data-draft-count',
    '2'
  );
  await page.getByTestId('commit-stage').click();
  await expect(page.getByTestId('feature-item')).toHaveCount(3);
  await expect(viewer).toHaveAttribute('data-entity-count', '7');
});

test('дерево с грязным черновиком: автокоммит вместо запрета', async ({
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

  // Ставим дверь, но НЕ коммитим: черновик грязный.
  await placeDoorOnWall(page);
  await expect(page.getByTestId('commit-stage')).toHaveAttribute(
    'data-draft-count',
    '1'
  );

  // Глаз по первой фиче: черновик автокоммитится второй фичей,
  // открывается её просмотр — никакого «сначала закоммитьте».
  await page.locator('[data-testid="feature-preview"][data-index="0"]').click();
  await expect(page.getByTestId('feature-item')).toHaveCount(2);
  await expect(page.getByTestId('preview-banner')).toBeVisible();
  await expect(viewer).toHaveAttribute('data-entity-count', '6');
});

test('гизмо: торец двери тянет ширину', async ({ page }) => {
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

  // Дверь после постановки выбрана — гизмо с двумя торцами на стене.
  await placeDoorOnWall(page);
  await expect(viewer).toHaveAttribute('data-resize', /d:start/);
  await expect(viewer).toHaveAttribute('data-resize', /d:end/);
  const panel = page.getByTestId('openings-panel');
  const widthOf = (t: string) => Number(t.match(/(\d+)×(\d+)/)?.[1]);
  expect(widthOf(await panel.innerText())).toBe(900);

  // Тянем конец к началу на 15% ширины: сужение всегда валидно
  // (простенки растут, лимит двери 600 далеко).
  const raw = await viewer.getAttribute('data-handles');
  expect(raw).not.toBeNull();
  const pts: Record<string, { fx: number; fy: number }> = {};
  for (const t of raw!.split(' ')) {
    const [id, edge, xy] = t.split(':');
    const [fx, fy] = xy.split(',').map(Number);
    pts[`${id}:${edge}`] = { fx, fy };
  }
  const s = pts['d:start'];
  const e = pts['d:end'];
  if (!s || !e) throw new Error('нет ручек двери в data-handles');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const px = (f: { fx: number; fy: number }) => ({
    x: box!.x + box!.width * f.fx,
    y: box!.y + box!.height * f.fy,
  });
  const from = px(e);
  const to = px({
    fx: e.fx - (e.fx - s.fx) * 0.15,
    fy: e.fy - (e.fy - s.fy) * 0.15,
  });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();

  // Операция в черновике (постановка + ресайз), ширина в панели ужалась.
  await expect(page.getByTestId('commit-stage')).toHaveAttribute(
    'data-draft-count',
    '2'
  );
  const after = widthOf(await panel.innerText());
  expect(after).toBeLessThan(900);
  expect(after).toBeGreaterThanOrEqual(600);

  // Гост: на стене зелёный, в середине комнаты красный.
  // Стену ищем заново: в точке постановки теперь проём, а не стена.
  let wallPt: { x: number; y: number } | null = null;
  for (let gy = 0.08; gy <= 0.96 && !wallPt; gy += 0.07) {
    for (let gx = 0.08; gx <= 0.96; gx += 0.07) {
      const p = await canvasPoint(page, gx, gy);
      if (!(await onCanvasPoint(page, p.x, p.y))) continue;
      await page.mouse.move(p.x, p.y);
      if (await viewer.getAttribute('data-ghost-wall')) {
        wallPt = p;
        break;
      }
    }
  }
  expect(wallPt).not.toBeNull();
  await expect(viewer).toHaveAttribute('data-ghost-ok', 'true');
  const mid = await canvasPoint(page, 0.5, 0.5);
  await page.mouse.move(mid.x, mid.y);
  await expect(viewer).toHaveAttribute('data-ghost-ok', 'false');
  await expect(viewer).not.toHaveAttribute('data-ghost', '');

  // Touchpad без кнопок в изометрии: Alt крутит, Ctrl+Shift зумит.
  const camOf = async () => await viewer.getAttribute('data-cam');
  const thetaOf = (s: string | null) => Number(s!.split(',')[3].slice(2));
  const zoomOf = (s: string | null) => s!.split(',')[2];
  const box2 = await canvas.boundingBox();
  expect(box2).not.toBeNull();
  const cam0 = await camOf();
  await page.keyboard.down('Alt');
  await page.mouse.move(
    box2!.x + box2!.width * 0.4,
    box2!.y + box2!.height * 0.5
  );
  await page.mouse.move(
    box2!.x + box2!.width * 0.6,
    box2!.y + box2!.height * 0.5,
    { steps: 10 }
  );
  await page.keyboard.up('Alt');
  await expect
    .poll(async () => thetaOf(await camOf()), { timeout: 5000 })
    .not.toBe(thetaOf(cam0));
  const cam1 = await camOf();
  await page.keyboard.down('Control');
  await page.keyboard.down('Shift');
  await page.mouse.move(
    box2!.x + box2!.width * 0.5,
    box2!.y + box2!.height * 0.4
  );
  await page.mouse.move(
    box2!.x + box2!.width * 0.5,
    box2!.y + box2!.height * 0.6,
    { steps: 10 }
  );
  await page.keyboard.up('Shift');
  await page.keyboard.up('Control');
  await expect
    .poll(async () => zoomOf(await camOf()), { timeout: 5000 })
    .not.toBe(zoomOf(cam1));

  // Голая левая камеру не трогает (Touchpad style) и ничего не двигает.
  const camStill = await camOf();
  await page.mouse.move(
    box2!.x + box2!.width * 0.5,
    box2!.y + box2!.height * 0.85
  );
  await page.mouse.down();
  await page.mouse.move(
    box2!.x + box2!.width * 0.6,
    box2!.y + box2!.height * 0.75,
    {
      steps: 10,
    }
  );
  await page.mouse.up();
  await expect(viewer).toHaveAttribute('data-cam', camStill!);
  await expect(page.getByTestId('commit-stage')).toHaveAttribute(
    'data-draft-count',
    '2'
  );

  // Esc гасит инструмент и сбрасывает выбор (как в скетче):
  // ручки гизмо исчезают вместе с выбором.
  await page.keyboard.press('Escape');
  await expect(viewer).toHaveAttribute('data-place', '');
  await expect(viewer).toHaveAttribute('data-selected', '');
  await expect(viewer).toHaveAttribute('data-resize', '');

  // Delete по выбранному сносит проём: ставим вторую дверь (выбрана сразу)
  // и удаляем клавишей — без хрупких кликов по геометрии.
  await page.getByTestId('place-toggle').click();
  const door2 = await placeDoorOnWall(page);
  await expect(viewer).toHaveAttribute('data-selected', 'd-2');
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('commit-stage')).toHaveAttribute(
    'data-draft-count',
    '4'
  );
  await expect(
    page.locator('[data-testid="opening-del"][data-id="d-2"]')
  ).toHaveCount(0);
  await expect(
    page.locator('[data-testid="opening-del"][data-id="d"]')
  ).toHaveCount(1);
  await expect(viewer).toHaveAttribute('data-entity-count', '7');
});
