import { test, expect } from '@playwright/test';

/**
 * Сквозной флоу Этапа 1: контур polyline → commit → стены → изометрия.
 * Координаты кликов — долями канваса (устойчиво к размеру вьюпорта);
 * прямоугольник ~2×1.5 м заведомо валиден (≥0.5 м², сегменты ≥10 см).
 * Замыкание — пятым кликом по первой точке, без кнопок.
 */
test('правая кнопка прерывает штрих, но не инструмент', async ({ page }) => {
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

  // Штрих в работе: цепочка тянется, полилиния активна.
  await click(0.3, 0.3);
  await click(0.5, 0.3);
  await expect(viewer).toHaveAttribute('data-gizmo', '2:1');
  await expect(page.getByTestId('tool-draw')).toHaveClass(/btn-primary/);

  // ПКМ прерывает штрих (резинка гаснет), инструмент остаётся включённым.
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(
    box!.x + box!.width * 0.7,
    box!.y + box!.height * 0.6,
    { button: 'right' }
  );
  await expect(page.getByTestId('tool-draw')).toHaveClass(/btn-primary/);
  await expect(viewer).toHaveAttribute('data-rubber', '');
  await expect(viewer).toHaveAttribute('data-sketch-points', '2');
  await expect(viewer).toHaveAttribute('data-sketch-segments', '1');

  // Рисование продолжается новым штрихом без переключения инструмента.
  await click(0.5, 0.5);
  await expect(viewer).toHaveAttribute('data-sketch-points', '3');
  await expect(viewer).toHaveAttribute('data-sketch-segments', '1');

  // А без активного штриха ПКМ всё-таки гасит инструмент.
  await page.keyboard.press('Escape');
  await page.getByTestId('tool-draw').click();
  await expect(page.getByTestId('tool-draw')).toHaveClass(/btn-primary/);
  await page.mouse.click(
    box!.x + box!.width * 0.7,
    box!.y + box!.height * 0.5,
    { button: 'right' }
  );
  await expect(page.getByTestId('tool-draw')).not.toHaveClass(/btn-primary/);
});

test('constraints применяются к выбранному без повторного клика', async ({
  page,
}) => {
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

  // Два диагональных штриха без авто-фиксации.
  await click(0.3, 0.3);
  await click(0.52, 0.41);
  await page.keyboard.press('Escape');
  await page.getByTestId('tool-draw').click();
  await click(0.3, 0.6);
  await click(0.52, 0.71);
  await page.keyboard.press('Escape');
  await expect(viewer).toHaveAttribute('data-sketch-points', '4');

  // Выбираем точку и жмём совпадение: точка вооружается без клика по канвасу.
  await click(0.3, 0.3);
  await expect(viewer).toHaveAttribute('data-selected', 'p1');
  await page.getByTestId('apply-coincident').click();
  await expect(page.getByRole('status')).toHaveText(
    'Совпадение: кликните вторую точку.'
  );
  // Вторая точка — кликом: склейка, без лишних граней.
  await click(0.3, 0.6);
  await expect(viewer).toHaveAttribute('data-selected', 'p1,p3');
  await expect(viewer).toHaveAttribute('data-sketch-points', '4');

  // Снимаем инструмент совпадения, выбираем грань и жмём ось:
  // фиксируется без клика по канвасу.
  await page.keyboard.press('Escape');
  await click(0.41, 0.355);
  await expect(viewer).toHaveAttribute('data-selected', 's1');
  await page.getByTestId('apply-axis').click();
  await expect(viewer).toHaveAttribute('data-dims', 's1:H');
});

test('правка контура возвращает constraints', async ({ page }) => {
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

  // Прямоугольник с авто-фиксацией граней.
  for (const [fx, fy] of [
    [0.35, 0.35],
    [0.65, 0.35],
    [0.65, 0.65],
    [0.35, 0.65],
    [0.35, 0.35],
  ] as const) {
    await click(fx, fy);
  }
  await expect(viewer).toHaveAttribute('data-dims', 's1:H;s2:V;s3:H;s4:V');
  await page.getByTestId('commit-layout').click();
  await expect(page.getByTestId('feature-item')).toHaveCount(1);
  await expect(viewer).toHaveAttribute('data-entity-count', '6');

  // Возврат в правку контура: constraints на месте, а не голый контур.
  await page.locator('[data-testid="feature-item"][data-index="0"]').dblclick();
  await expect(page.getByTestId('sketch-editor')).toBeVisible();
  await expect(viewer).toHaveAttribute('data-sketch-points', '4');
  await expect(viewer).toHaveAttribute('data-dims', 's1:H;s2:V;s3:H;s4:V');

  // Commit без изменений пересчитывает зависимые и возвращает обратно.
  await page.getByTestId('commit-layout').click();
  await expect(page.getByTestId('feature-item')).toHaveCount(1);
  await expect(viewer).toHaveAttribute('data-entity-count', '6');
});

test('магнитное замыкание: клик рядом с началом замыкает', async ({ page }) => {
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

  await click(0.3, 0.3);
  await click(0.5, 0.3);
  await click(0.5, 0.5);
  await expect(viewer).toHaveAttribute('data-gizmo', '3:2');
  // Мимо ручки (~85мм: дальше порога грани 60мм, ближе магнита 120мм),
  // строго с внешней стороны угла: замыкание без новой точки.
  await click(0.3, 0.283);
  await expect(viewer).toHaveAttribute('data-sketch-closed', 'true');
  await expect(viewer).toHaveAttribute('data-sketch-points', '3');
  await expect(viewer).toHaveAttribute('data-sketch-segments', '3');
});

test('непрямоугольник гасится в изометрии', async ({ page }) => {
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

  // Параллелограмм: ни одна грань не параллельна осям.
  for (const [fx, fy] of [
    [0.3, 0.3],
    [0.62, 0.45],
    [0.5, 0.7],
    [0.25, 0.55],
    [0.3, 0.3],
  ] as const) {
    await click(fx, fy);
  }
  await expect(viewer).toHaveAttribute('data-sketch-closed', 'true');
  await page.getByTestId('commit-layout').click();
  await expect(viewer).toHaveAttribute('data-entity-count', '6');
  // Изометрия: ближние к камере стены погашены, хотя угол ни с чем не совпал.
  await expect(viewer).toHaveAttribute('data-framed', 'iso', {
    timeout: 15000,
  });
  await expect(viewer).not.toHaveAttribute('data-faded', '');
});

test('контур → commit → стены и переход в изометрию', async ({ page }) => {
  await page.goto('/plan');
  const viewer = page.getByTestId('plan-viewer');
  const canvas = page.getByTestId('plan-canvas');

  // Дерево с текущим этапом видно сразу, до commit.
  await expect(page.getByTestId('stage-tree')).toHaveText(/черновик/);

  await expect(viewer).toHaveAttribute('data-framed', 'top', {
    timeout: 15000,
  });
  // Численный решатель готов — клики не пропадут.
  await expect(page.getByTestId('sketch-editor')).toHaveAttribute(
    'data-gcs',
    'ready',
    { timeout: 15000 }
  );
  // Бокс меряем свежо перед каждым кликом: сообщения в потоке
  // могут сдвигать канвас между кликами.
  const click = async (fx: number, fy: number) => {
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(box!.x + box!.width * fx, box!.y + box!.height * fy);
  };

  for (const [fx, fy] of [
    [0.35, 0.35],
    [0.65, 0.35],
    [0.65, 0.65],
    [0.35, 0.65],
    // Возврат к первой точке замыкает polyline.
    [0.35, 0.35],
  ] as const) {
    await click(fx, fy);
  }
  await expect(viewer).toHaveAttribute('data-sketch-points', '4');
  await expect(viewer).toHaveAttribute('data-sketch-closed', 'true');

  await page.getByTestId('commit-layout').click();
  // Первый шаг Feature Tree завершён: 4 стены + пол + потолок.
  await expect(page.getByTestId('feature-item')).toHaveCount(1);
  await expect(viewer).toHaveAttribute('data-entity-count', '6');
  // Стены возведены — редактор сам перешёл в изометрию.
  await expect(viewer).toHaveAttribute('data-framed', 'iso', {
    timeout: 15000,
  });
  // Ближний угол по умолчанию: гасятся две стены на его осях
  // (юго-восточный угол прямоугольника: w2+w3).
  await expect(viewer).toHaveAttribute('data-faded', 'w2,w3');
  // Переключение угла меняет погашенные стены.
  await page.locator('[data-testid="iso-corner"][data-index="1"]').click();
  await expect(viewer).toHaveAttribute('data-iso-corner', '1');
  await expect(viewer).toHaveAttribute('data-faded', 'w3,w4');

  // Инфо стены — в отдельном блоке объектов, не в дереве.
  await page.locator('[data-testid="object-item"][data-id="w1"]').click();
  await expect(page.getByTestId('wall-info')).toHaveText(/2\.7/);
});

test('кнопки тулбара: готово паркует штрих, корзина удаляет', async ({
  page,
}) => {
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

  await click(0.3, 0.3);
  await click(0.5, 0.3);
  await expect(viewer).toHaveAttribute('data-gizmo', '2:1');
  // Клик выбирает последнюю точку — корзина доступна.
  await expect(page.getByTestId('delete-selection')).toBeEnabled();

  // Резинка тянется, Готово паркует штрих: резинка гаснет, геометрия цела.
  const tip = async (fx: number, fy: number) => {
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width * fx, box!.y + box!.height * fy);
  };
  await tip(0.7, 0.5);
  await expect(viewer).not.toHaveAttribute('data-rubber', '');
  await page.getByTestId('stroke-done').click();
  await expect(viewer).toHaveAttribute('data-rubber', '');
  await expect(viewer).toHaveAttribute('data-sketch-points', '2');
  await expect(viewer).toHaveAttribute('data-sketch-segments', '1');

  // В выбор, клик по узлу, корзина сносит узел вместе с гранью.
  await page.keyboard.press('Escape');
  await click(0.5, 0.3);
  await expect(viewer).toHaveAttribute('data-selected', 'p2');
  await expect(page.getByTestId('delete-selection')).toBeEnabled();
  await page.getByTestId('delete-selection').click();
  await expect(viewer).toHaveAttribute('data-sketch-points', '1');
  await expect(viewer).toHaveAttribute('data-sketch-segments', '0');
  // Выбор сброшен — корзина снова недоступна.
  await expect(page.getByTestId('delete-selection')).toBeDisabled();
});

test('навигация: стрелки, PgUp и Shift+pan двигают камеру', async ({
  page,
}) => {
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
  const cam = async () => {
    const raw = await viewer.getAttribute('data-cam');
    expect(raw).not.toBeNull();
    return raw!.split(',').map(Number);
  };

  // Стрелка вправо двигает цель строго по +X плана.
  const [x1] = await cam();
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(async () => (await cam())[0], { timeout: 5000 })
    .toBeGreaterThan(x1);

  // PgUp приближает (орто-зум растёт).
  await page.keyboard.press('PageUp');
  await expect(viewer).toHaveAttribute('data-cam', /z1\.25/);

  // Shift+левая по пустому (чистый канвас, мимо тулбара и панели) —
  // панорама без рамки и новых точек.
  const before = await viewer.getAttribute('data-cam');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await page.keyboard.down('Shift');
  await page.mouse.move(
    box!.x + box!.width * 0.45,
    box!.y + box!.height * 0.45
  );
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width * 0.6, box!.y + box!.height * 0.6, {
    steps: 10,
  });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect(viewer).not.toHaveAttribute('data-cam', before!);
  await expect(page.getByTestId('box-rect')).toHaveCount(0);
  await expect(viewer).toHaveAttribute('data-sketch-points', '0');
});

test('touchpad-навигация: Shift ведёт панораму без кнопок', async ({
  page,
}) => {
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
  const camX = async () => {
    const raw = await viewer.getAttribute('data-cam');
    expect(raw).not.toBeNull();
    return Number(raw!.split(',')[0]);
  };

  // Shift + ведение мышью без кнопок: мир едет за курсором (цель влево).
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const x1 = await camX();
  await page.keyboard.down('Shift');
  await page.mouse.move(box!.x + box!.width * 0.3, box!.y + box!.height * 0.5);
  await page.mouse.move(box!.x + box!.width * 0.6, box!.y + box!.height * 0.5, {
    steps: 10,
  });
  await page.keyboard.up('Shift');
  await expect.poll(camX, { timeout: 5000 }).toBeLessThan(x1);

  // Без модификатора наведение камеру не трогает и ничего не строит.
  const still = await viewer.getAttribute('data-cam');
  await page.mouse.move(box!.x + box!.width * 0.5, box!.y + box!.height * 0.6);
  await expect(viewer).toHaveAttribute('data-cam', still!);
  await expect(viewer).toHaveAttribute('data-sketch-points', '0');
});

test('инструменты как в Sketcher: соединение, выбор, Esc, правая кнопка', async ({
  page,
}) => {
  await page.goto('/plan');
  const viewer = page.getByTestId('plan-viewer');
  const canvas = page.getByTestId('plan-canvas');

  await expect(viewer).toHaveAttribute('data-framed', 'top', {
    timeout: 15000,
  });
  // Численный решатель готов — клики не пропадут.
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

  // Ломаная p1-p2-p3: авто-constraints H на s1 и V на s2.
  await click(0.3, 0.3);
  await click(0.5, 0.3);
  await click(0.5, 0.5);
  await expect(viewer).toHaveAttribute('data-sketch-points', '3');
  await expect(viewer).toHaveAttribute('data-dims', 's1:H;s2:V');
  // Значки ограничений видны прямо на геометрии.
  await expect(viewer).toHaveAttribute('data-badges', '2');

  // Четвёртая точка + соединение её со средней: грань s4.
  await click(0.3, 0.5);
  await expect(viewer).toHaveAttribute('data-gizmo', '4:3');
  await click(0.5, 0.3);
  await expect(viewer).toHaveAttribute('data-sketch-segments', '4');
  await expect(viewer).toHaveAttribute('data-sketch-points', '4');

  // Esc прерывает полилинию и возвращает в выбор по умолчанию
  // (отдельной кнопки выбора нет — полилиния просто гаснет).
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('tool-draw')).not.toHaveClass(/btn-primary/);

  // В режиме выбора пустой клик ничего не строит...
  await click(0.7, 0.7);
  await expect(viewer).toHaveAttribute('data-sketch-points', '4');
  // ...а клик по узлу только выбирает его.
  await click(0.5, 0.5);
  await expect(viewer).toHaveAttribute('data-selected', 'p3');
  await expect(viewer).toHaveAttribute('data-sketch-points', '4');

  // Возврат в контур и выход правой кнопкой, как в Sketcher.
  await page.getByTestId('tool-draw').click();
  await expect(page.getByTestId('tool-draw')).toHaveClass(/btn-primary/);
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(
    box!.x + box!.width * 0.7,
    box!.y + box!.height * 0.6,
    {
      button: 'right',
    }
  );
  await expect(page.getByTestId('tool-draw')).not.toHaveClass(/btn-primary/);
  await expect(viewer).toHaveAttribute('data-sketch-points', '4');
});

test('курсор: резинка превью и preselect под курсором', async ({ page }) => {
  await page.goto('/plan');
  const viewer = page.getByTestId('plan-viewer');
  const canvas = page.getByTestId('plan-canvas');

  await expect(viewer).toHaveAttribute('data-framed', 'top', {
    timeout: 15000,
  });
  // Численный решатель готов — клики не пропадут.
  await expect(page.getByTestId('sketch-editor')).toHaveAttribute(
    'data-gcs',
    'ready',
    { timeout: 15000 }
  );
  const at = async (fx: number, fy: number) => {
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    return { x: box!.x + box!.width * fx, y: box!.y + box!.height * fy };
  };

  const p1 = await at(0.3, 0.3);
  await page.mouse.click(p1.x, p1.y);
  const p2 = await at(0.5, 0.3);
  await page.mouse.click(p2.x, p2.y);
  await expect(viewer).toHaveAttribute('data-gizmo', '2:1');

  // Резинка тянется от конца цепочки за курсором, со снаппингом 1 см.
  // Фрустум пустой сцены 6×4 м при 16:9: (0.7, 0.5) → ≈ (4780, 2000).
  const tip = await at(0.7, 0.5);
  await page.mouse.move(tip.x, tip.y);
  const rubber = await viewer.getAttribute('data-rubber');
  expect(rubber).not.toBeNull();
  const [rx, ry] = rubber!.split(',').map(Number);
  expect(Math.abs(rx - 4780)).toBeLessThanOrEqual(25);
  expect(Math.abs(ry - 2000)).toBeLessThanOrEqual(25);
  expect(rx % 10).toBe(0);
  expect(ry % 10).toBe(0);

  // Preselect: наведение на узел подсвечивает его.
  const back = await at(0.3, 0.3);
  await page.mouse.move(back.x, back.y);
  await expect(viewer).toHaveAttribute('data-hover', 'p1');
  const away = await at(0.05, 0.05);
  await page.mouse.move(away.x, away.y);
  await expect(viewer).toHaveAttribute('data-hover', '');
});

test('второй штрих с свободного места и Shift-лок оси', async ({ page }) => {
  await page.goto('/plan');
  const viewer = page.getByTestId('plan-viewer');
  const canvas = page.getByTestId('plan-canvas');

  await expect(viewer).toHaveAttribute('data-framed', 'top', {
    timeout: 15000,
  });
  // Численный решатель готов — клики не пропадут.
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

  // Штрих 1: открытая цепочка из двух точек.
  await click(0.3, 0.3);
  await click(0.5, 0.3);
  await expect(viewer).toHaveAttribute('data-sketch-points', '2');
  await expect(viewer).toHaveAttribute('data-sketch-segments', '1');

  // Esc заканчивает штрих; новый начинается с свободного места,
  // а не продолжается от старого конца.
  await page.keyboard.press('Escape');
  await page.getByTestId('tool-draw').click();
  await click(0.3, 0.6);
  await expect(viewer).toHaveAttribute('data-sketch-points', '3');
  await expect(viewer).toHaveAttribute('data-sketch-segments', '1');
  await click(0.5, 0.6);
  await expect(viewer).toHaveAttribute('data-sketch-points', '4');
  await expect(viewer).toHaveAttribute('data-sketch-segments', '2');

  // Shift тянет строго по оси и сразу фиксирует грань.
  // Shift жмём ПОСЛЕ наведения: ховер с Shift панорамирует (тачпад),
  // а нам нужен Shift-клик в точку.
  const box5 = await canvas.boundingBox();
  expect(box5).not.toBeNull();
  await page.mouse.move(
    box5!.x + box5!.width * 0.56,
    box5!.y + box5!.height * 0.78
  );
  await page.keyboard.down('Shift');
  await page.mouse.down();
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect(viewer).toHaveAttribute('data-sketch-points', '5');
  await expect(viewer).toHaveAttribute('data-sketch-segments', '3');
  await expect(viewer).toHaveAttribute('data-dims', 's1:H;s2:H;s3:V');

  // Commit без замкнутого контура отклоняется с объяснением.
  await page.getByTestId('commit-layout').click();
  await expect(page.getByRole('status')).toHaveText(
    'Commit невозможен: Нет замкнутого контура.'
  );
});

test('узел удаляется клавишей Delete', async ({ page }) => {
  await page.goto('/plan');
  const viewer = page.getByTestId('plan-viewer');
  const canvas = page.getByTestId('plan-canvas');

  await expect(viewer).toHaveAttribute('data-framed', 'top', {
    timeout: 15000,
  });
  // Численный решатель готов — клики не пропадут.
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

  // Открытая цепочка из трёх точек.
  for (const [fx, fy] of [
    [0.3, 0.3],
    [0.5, 0.3],
    [0.5, 0.5],
  ] as const) {
    await click(fx, fy);
  }
  await expect(viewer).toHaveAttribute('data-sketch-points', '3');

  // Ждём отрендеренные ручки (3 хендла + 2 ручки граней), иначе клик
  // по p2 придёт раньше гизмо и создаст точку вместо выбора.
  await expect(viewer).toHaveAttribute('data-gizmo', '3:2');

  // В режим выбора по умолчанию: иначе клик по p2 соединит её, а не выберет.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('tool-draw')).not.toHaveClass(/btn-primary/);

  // Клик по средней точке выбирает узел, Delete — удаляет.
  await click(0.5, 0.3);
  await expect(viewer).toHaveAttribute('data-selected', 'p2');
  await page.keyboard.press('Delete');
  await expect(viewer).toHaveAttribute('data-sketch-points', '2');
  await expect(viewer).toHaveAttribute('data-sketch-segments', '0');
});

test('рамка выбора выделяет точки и грани разом', async ({ page }) => {
  await page.goto('/plan');
  const viewer = page.getByTestId('plan-viewer');
  const canvas = page.getByTestId('plan-canvas');

  await expect(viewer).toHaveAttribute('data-framed', 'top', {
    timeout: 15000,
  });
  // Численный решатель готов — клики не пропадут.
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

  await click(0.3, 0.3);
  await click(0.5, 0.3);
  await click(0.5, 0.5);
  await expect(viewer).toHaveAttribute('data-sketch-points', '3');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('tool-draw')).not.toHaveClass(/btn-primary/);

  // Рамка вокруг p1, p2 и грани s1 (p3 и s2 снаружи).
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const px = (fx: number) => box!.x + box!.width * fx;
  const py = (fy: number) => box!.y + box!.height * fy;
  await page.mouse.move(px(0.25), py(0.2));
  await page.mouse.down();
  await page.mouse.move(px(0.55), py(0.35), { steps: 12 });
  await page.mouse.up();
  await expect(page.getByTestId('selection-count')).toHaveText('Выбрано: 3');

  // Delete сносит выбранное разом: остаются только p3 без граней.
  await page.keyboard.press('Delete');
  await expect(viewer).toHaveAttribute('data-sketch-points', '1');
  await expect(viewer).toHaveAttribute('data-sketch-segments', '0');
});

test('возврат к штриху и его замыкание', async ({ page }) => {
  await page.goto('/plan');
  const viewer = page.getByTestId('plan-viewer');
  const canvas = page.getByTestId('plan-canvas');

  await expect(viewer).toHaveAttribute('data-framed', 'top', {
    timeout: 15000,
  });
  // Численный решатель готов — клики не пропадут.
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

  // Штрих 1: открытая цепочка p1-p2-p3.
  await click(0.3, 0.3);
  await click(0.5, 0.3);
  await click(0.5, 0.5);
  await page.keyboard.press('Escape');
  // Штрих 2 в другом месте.
  await page.getByTestId('tool-draw').click();
  await click(0.3, 0.6);
  await click(0.5, 0.6);
  await expect(viewer).toHaveAttribute('data-sketch-points', '5');
  await expect(viewer).toHaveAttribute('data-sketch-segments', '3');
  await page.keyboard.press('Escape');

  // Клик по началу первого штриха возобновляет его, а не замыкает:
  // продолжение строится с его конца.
  await page.getByTestId('tool-draw').click();
  await expect(viewer).toHaveAttribute('data-gizmo', '5:3');
  await click(0.3, 0.3);
  await expect(viewer).toHaveAttribute('data-selected', 'p1');
  await expect(viewer).toHaveAttribute('data-sketch-closed', 'false');
  await click(0.65, 0.45);
  await expect(viewer).toHaveAttribute('data-sketch-points', '6');
  await expect(viewer).toHaveAttribute('data-sketch-segments', '4');

  // Теперь начало принадлежит активному штриху — клик замыкает.
  await expect(viewer).toHaveAttribute('data-gizmo', '6:4');
  await click(0.3, 0.3);
  await expect(viewer).toHaveAttribute('data-sketch-closed', 'true');
  await expect(viewer).toHaveAttribute('data-sketch-segments', '5');
});

test('инструмент оси фиксирует грань кликом', async ({ page }) => {
  await page.goto('/plan');
  const viewer = page.getByTestId('plan-viewer');
  const canvas = page.getByTestId('plan-canvas');

  await expect(viewer).toHaveAttribute('data-framed', 'top', {
    timeout: 15000,
  });
  // Численный решатель готов — клики не пропадут.
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

  // Диагональ: авто-фиксация не срабатывает (угол > 10°),
  // но длина видна сразу серой табличкой.
  await click(0.3, 0.3);
  await click(0.5, 0.45);
  await expect(viewer).toHaveAttribute('data-sketch-segments', '1');
  await expect(viewer).toHaveAttribute('data-badges', '0');
  await expect(viewer).toHaveAttribute('data-lengths', '1');

  // Берём инструмент оси и кликаем середину грани: ось вычисляется.
  // Инструменты взаимоисключающие — полилиния гаснет.
  await page.getByTestId('apply-axis').click();
  await expect(page.getByTestId('tool-draw')).not.toHaveClass(/btn-primary/);
  await click(0.4, 0.375);
  await expect(viewer).toHaveAttribute('data-badges', '1');
  await expect(viewer).toHaveAttribute('data-dims', 's1:H');

  // Esc снимает инструмент, полилинию включаем обратно — пустой клик строит.
  await page.keyboard.press('Escape');
  await page.getByTestId('tool-draw').click();
  await expect(page.getByTestId('tool-draw')).toHaveClass(/btn-primary/);
  await click(0.7, 0.6);
  await expect(viewer).toHaveAttribute('data-sketch-points', '3');
  await expect(viewer).toHaveAttribute('data-badges', '1');
});

test('авто выпрямляет почти-прямую грань', async ({ page }) => {
  await page.goto('/plan');
  const viewer = page.getByTestId('plan-viewer');
  const canvas = page.getByTestId('plan-canvas');

  await expect(viewer).toHaveAttribute('data-framed', 'top', {
    timeout: 15000,
  });
  // Численный решатель готов — клики не пропадут.
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

  // Отрезок под ~3° к горизонтали: снапнутый конец НЕ на оси (dy=100),
  // но сырой угол чистый — грань выпрямляется и фиксируется.
  // Длина при этом видна сразу (H — не driving-размер).
  await click(0.3, 0.3);
  await click(0.525, 0.28);
  await expect(viewer).toHaveAttribute('data-sketch-segments', '1');
  await expect(viewer).toHaveAttribute('data-badges', '1');
  await expect(viewer).toHaveAttribute('data-dims', 's1:H');
  await expect(viewer).toHaveAttribute('data-lengths', '1');
});

test('размер: клик значком открывает значение, Enter фиксирует', async ({
  page,
}) => {
  await page.goto('/plan');
  const viewer = page.getByTestId('plan-viewer');
  const canvas = page.getByTestId('plan-canvas');

  await expect(viewer).toHaveAttribute('data-framed', 'top', {
    timeout: 15000,
  });
  // Численный решатель готов — клики не пропадут.
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

  // Диагональ без авто-фиксации.
  await click(0.3, 0.3);
  await click(0.5, 0.45);
  await expect(viewer).toHaveAttribute('data-sketch-segments', '1');
  await expect(viewer).toHaveAttribute('data-badges', '0');

  // Инструмент длины: клик гранью открывает редактор со текущим значением
  // (то же работает кликом по серой табличке длины).
  await page.getByTestId('apply-length').click();
  await click(0.4, 0.375);
  await expect(page.getByTestId('dim-popup')).toBeVisible();
  await expect(page.getByTestId('dim-value')).toHaveValue('1930');

  // Подтверждаем как есть: геометрия уже точная, значок на месте,
  // серая табличка уступает место driving-размеру.
  await page.keyboard.press('Enter');
  await expect(viewer).toHaveAttribute('data-badges', '1');
  await expect(viewer).toHaveAttribute('data-dims', 's1:1930');
  await expect(viewer).toHaveAttribute('data-lengths', '0');

  // Повторный клик по значку открывает редактор с зафиксированным.
  await expect(viewer).toHaveAttribute('data-sprites', '1');
  await click(0.4, 0.375);
  await expect(page.getByTestId('dim-value')).toHaveValue('1930');

  // Снятие через редактор убирает и значок — длина видна снова.
  await page.getByRole('button', { name: /Снять ограничение/ }).click();
  await expect(viewer).toHaveAttribute('data-dims', '');
  await expect(viewer).toHaveAttribute('data-badges', '0');
  await expect(viewer).toHaveAttribute('data-lengths', '1');
});

test('совпадение склеивает две точки', async ({ page }) => {
  await page.goto('/plan');
  const viewer = page.getByTestId('plan-viewer');
  const canvas = page.getByTestId('plan-canvas');

  await expect(viewer).toHaveAttribute('data-framed', 'top', {
    timeout: 15000,
  });
  // Численный решатель готов — клики не пропадут.
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

  // Два коротких диагональных штриха (без авто-фиксации).
  // Одиночные точки Esc теперь удаляет, поэтому штрихи — с гранями.
  await click(0.3, 0.3);
  await click(0.52, 0.41);
  await page.keyboard.press('Escape');
  await page.getByTestId('tool-draw').click();
  await click(0.3, 0.6);
  await click(0.52, 0.71);
  await page.keyboard.press('Escape');
  await expect(viewer).toHaveAttribute('data-sketch-points', '4');
  await expect(viewer).toHaveAttribute('data-gizmo', '4:2');

  // Сбрасываем leftover-выбор от рисования: иначе инструмент совпадений
  // вооружится им, а не следующими кликами.
  await click(0.5, 0.95);
  await expect(viewer).toHaveAttribute('data-selected', '');

  // Инструмент совпадения: первая точка вооружает, вторая склеивает.
  await page.getByTestId('apply-coincident').click();
  await click(0.52, 0.41);
  await click(0.3, 0.6);
  await expect(viewer).toHaveAttribute('data-selected', 'p2,p3');
  await expect(viewer).toHaveAttribute('data-sketch-points', '4');
});

test('замыкание подтягивает конец на ось', async ({ page }) => {
  await page.goto('/plan');
  const viewer = page.getByTestId('plan-viewer');
  const canvas = page.getByTestId('plan-canvas');

  await expect(viewer).toHaveAttribute('data-framed', 'top', {
    timeout: 15000,
  });
  // Численный решатель готов — клики не пропадут.
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

  // Почти-прямоугольник: замыкающая грань p4→p1 отклонена на ~2°,
  // снапнутый dx=-50 (не точно). Клик ровно в ручку p1.
  await click(0.3, 0.3);
  await click(0.55, 0.3);
  await click(0.55, 0.55);
  await click(0.305, 0.55);
  await expect(viewer).toHaveAttribute('data-gizmo', '4:3');
  await click(0.3, 0.3);
  await expect(viewer).toHaveAttribute('data-sketch-closed', 'true');
  await expect(viewer).toHaveAttribute('data-sketch-segments', '4');
  // Конец подтянут и зафиксирован: s4 с Vertical.
  await expect(viewer).toHaveAttribute('data-dims', 's1:H;s2:V;s3:H;s4:V');
});

test('грань едет целиком, точки не плодятся', async ({ page }) => {
  await page.goto('/plan');
  const viewer = page.getByTestId('plan-viewer');
  const canvas = page.getByTestId('plan-canvas');

  await expect(viewer).toHaveAttribute('data-framed', 'top', {
    timeout: 15000,
  });
  // Численный решатель готов — клики не пропадут.
  await expect(page.getByTestId('sketch-editor')).toHaveAttribute(
    'data-gcs',
    'ready',
    { timeout: 15000 }
  );
  const at = async (fx: number, fy: number) => {
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    return { x: box!.x + box!.width * fx, y: box!.y + box!.height * fy };
  };

  const p1 = await at(0.3, 0.3);
  await page.mouse.click(p1.x, p1.y);
  const p2 = await at(0.5, 0.3);
  await page.mouse.click(p2.x, p2.y);
  await expect(viewer).toHaveAttribute('data-gizmo', '2:1');
  await page.keyboard.press('Escape');

  // Тянем середину грани на +150/+40px: оба конца едут, дубликатов нет.
  const mid = await at(0.4, 0.3);
  await page.mouse.move(mid.x, mid.y);
  await page.mouse.down();
  await page.mouse.move(mid.x + 150, mid.y + 40, { steps: 15 });
  await page.mouse.up();
  await expect(viewer).toHaveAttribute('data-sketch-points', '2');
  await expect(viewer).toHaveAttribute('data-sketch-segments', '1');

  // Старое место p1 пусто — грань действительно уехала
  // (значки уехавшей грани кликабельны и пустотой не считаются).
  await page.mouse.click(p1.x, p1.y);
  await expect(viewer).toHaveAttribute('data-selected', '');
});

test('вертикальная грань не прыгает по Y при горизонтальном переносе', async ({
  page,
}) => {
  await page.goto('/plan');
  const viewer = page.getByTestId('plan-viewer');
  const canvas = page.getByTestId('plan-canvas');

  await expect(viewer).toHaveAttribute('data-framed', 'top', {
    timeout: 15000,
  });
  // Численный решатель готов — клики не пропадут.
  await expect(page.getByTestId('sketch-editor')).toHaveAttribute(
    'data-gcs',
    'ready',
    { timeout: 15000 }
  );
  const at = async (fx: number, fy: number) => {
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    return { x: box!.x + box!.width * fx, y: box!.y + box!.height * fy };
  };
  const pts = async () => {
    const raw = await viewer.getAttribute('data-pts');
    expect(raw).not.toBeNull();
    return Object.fromEntries(
      raw!.split(' ').map((t) => {
        const [id, xy] = t.split('=');
        const [x, y] = xy.split(',').map(Number);
        return [id, { x, y }];
      })
    );
  };

  // Замкнутый прямоугольник: s2 — правая вертикальная грань p2→p3.
  for (const [fx, fy] of [
    [0.3, 0.3],
    [0.55, 0.3],
    [0.55, 0.55],
    [0.305, 0.55],
  ] as const) {
    const p = await at(fx, fy);
    await page.mouse.click(p.x, p.y);
  }
  const p1 = await at(0.3, 0.3);
  await page.mouse.click(p1.x, p1.y);
  await expect(viewer).toHaveAttribute('data-sketch-closed', 'true');
  await expect(viewer).toHaveAttribute('data-dims', 's1:H;s2:V;s3:H;s4:V');
  await page.keyboard.press('Escape');

  const before = await pts();
  // Тянем середину правой грани строго по X: Y концов обязаны стоять.
  const mid = await at(0.55, 0.425);
  await page.mouse.move(mid.x, mid.y);
  await page.mouse.down();
  await page.mouse.move(mid.x + 80, mid.y, { steps: 5 });
  await page.mouse.up();

  const after = await pts();
  expect(after['p2'].y).toBe(before['p2'].y);
  expect(after['p3'].y).toBe(before['p3'].y);
  expect(after['p2'].x).toBeGreaterThan(before['p2'].x);
  expect(after['p3'].x).toBeGreaterThan(before['p3'].x);
});
