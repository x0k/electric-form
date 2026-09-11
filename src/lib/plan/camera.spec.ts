import { describe, expect, it } from 'vitest';
import {
  boundsCenterMm,
  cameraModeLabel,
  cameraPositionMm,
  fitDistanceMm,
  isoFrustumForBounds,
  isoPresetCorner,
  isoPresetDir,
  topFrustumForBounds,
  EDITOR_CAMERA_MODES,
  ISO_VIEW_DIR,
} from '#lib/plan/camera';
import type { RenderBounds } from '#lib/plan/render';

const FLAT: RenderBounds = { minX: 0, minY: 0, maxX: 6000, maxY: 4000 };

describe('editor camera', () => {
  it('три режима с русскими подписями', () => {
    expect(EDITOR_CAMERA_MODES).toEqual(['top', 'iso', 'orbit']);
    expect(cameraModeLabel('top')).toBe('Сверху');
    expect(cameraModeLabel('iso')).toBe('Изометрия');
    expect(cameraModeLabel('orbit')).toBe('Орбита');
  });

  it('центр bounds — центр квартиры', () => {
    expect(boundsCenterMm(FLAT)).toEqual({ x: 3000, y: 2000 });
  });

  it('top-фрустум покрывает контур с отступом и держит aspect', () => {
    const wide = topFrustumForBounds(FLAT, 16 / 9);
    // Фрустум центрирован: проверяем полную ширину/высоту.
    expect(wide.right - wide.left).toBeGreaterThanOrEqual(6000 + 2 * 500);
    expect(wide.top - wide.bottom).toBeGreaterThanOrEqual(4000 + 2 * 500);
    // Широкий экран: полуширина / полувысота = aspect.
    expect((wide.right - wide.left) / (wide.top - wide.bottom)).toBeCloseTo(
      16 / 9,
      9
    );
    const square = topFrustumForBounds(FLAT, 1);
    expect(square.right - square.left).toBeCloseTo(
      square.top - square.bottom,
      9
    );
  });

  it('iso-фрустум не меньше top (сфера вместо прямоугольника)', () => {
    const aspect = 16 / 9;
    const top = topFrustumForBounds(FLAT, aspect);
    const iso = isoFrustumForBounds(FLAT, aspect);
    expect(iso.right - iso.left).toBeGreaterThanOrEqual(
      top.right - top.left - 1
    );
  });

  it('направление изометрии нормировано', () => {
    const len = Math.hypot(ISO_VIEW_DIR.x, ISO_VIEW_DIR.y, ISO_VIEW_DIR.z);
    expect(len).toBeCloseTo(1, 12);
  });

  it('четыре угла изометрии смотрят в разные диагонали', () => {
    const dirs = [0, 1, 2, 3].map(isoPresetDir);
    for (const d of dirs) {
      expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 12);
      expect(d.y).toBeGreaterThan(0);
    }
    expect(new Set(dirs.map((d) => `${d.x},${d.z}`)).size).toBe(4);
    // Пресет 0 совпадает с классическим направлением.
    expect(dirs[0].x).toBeCloseTo(ISO_VIEW_DIR.x, 12);
  });

  it('угол пресета — ближний к камере угол плана', () => {
    expect(isoPresetCorner(FLAT, 0)).toEqual({ x: 6000, y: 0 });
    expect(isoPresetCorner(FLAT, 1)).toEqual({ x: 0, y: 0 });
    expect(isoPresetCorner(FLAT, 2)).toEqual({ x: 6000, y: 4000 });
    expect(isoPresetCorner(FLAT, 3)).toEqual({ x: 0, y: 4000 });
    const dist = fitDistanceMm(FLAT);
    const pos = cameraPositionMm('iso', FLAT, dist, 1);
    expect(pos.x).toBeLessThan(3000);
  });

  it('позиции камер: top строго над центром, iso по диагонали', () => {
    const dist = fitDistanceMm(FLAT);
    const top = cameraPositionMm('top', FLAT, dist);
    expect(top.x).toBe(3000);
    expect(top.z).toBe(-2000);
    expect(top.y).toBe(dist);

    const iso = cameraPositionMm('iso', FLAT, dist);
    expect(iso.x).toBeGreaterThan(3000);
    expect(iso.y).toBeGreaterThan(0);
    expect(iso.z).toBeGreaterThan(-2000);
    // Равные катеты классической изометрии.
    expect(iso.x - 3000).toBeCloseTo(iso.y, 9);
  });
});
