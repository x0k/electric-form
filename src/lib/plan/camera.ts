/**
 * Камеры редактора (Этап 3, чистая логика без three.js).
 *
 * Режимы по ТЗ §2:
 * - top: вид сверху, основной; ортографическая проекция;
 * - iso: изометрия для высоты/навесных; ортографическая проекция;
 * - orbit: свободная перспективная камера (унаследована от Этапа 2).
 *
 * Модуль считает только числа в мм: фрустумы для OrthographicCamera
 * и направления взгляда. Сам three.js живёт в PlanViewer.svelte.
 */

import type { RenderBounds } from './render';

/** Режимы камеры редактора. */
export type EditorCameraMode = 'top' | 'iso' | 'orbit';

export const EDITOR_CAMERA_MODES: EditorCameraMode[] = ['top', 'iso', 'orbit'];

export function cameraModeLabel(mode: EditorCameraMode): string {
  switch (mode) {
    case 'top':
      return 'Сверху';
    case 'iso':
      return 'Изометрия';
    case 'orbit':
      return 'Орбита';
  }
}

/** Ортографический фрустум в мм (для three OrthographicCamera с переводом в м). */
export interface OrthoFrustumMm {
  left: number;
  right: number;
  top: number;
  bottom: number;
  near: number;
  far: number;
}

/** Отступ вокруг модели при наведении камеры, мм. */
export const CAMERA_PADDING_MM = 500;

/** Направление взгляда сверху (мир: +Y вверх). */
export const TOP_VIEW_DIR = { x: 0, y: 1, z: 0 } as const;

/**
 * Классическая изометрия: азимут 45°, высота atan(1/√2) ≈ 35.264°.
 * Смещение от цели = dist * (1,1,1)/√3.
 */
export const ISO_VIEW_DIR = {
  x: 1 / Math.sqrt(3),
  y: 1 / Math.sqrt(3),
  z: 1 / Math.sqrt(3),
} as const;

/**
 * Четыре диагонали изометрии (угол обзора). Индекс пресета 0..3.
 * Угол пресета = угол плана, ближайший к камере: стены на исходящих
 * из него осях гасятся (прозрачность), чтобы видеть интерьер.
 */
export const ISO_PRESET_COUNT = 4;

export function isoPresetDir(preset: number): {
  x: number;
  y: number;
  z: number;
} {
  const sx = preset % 2 === 0 ? 1 : -1;
  const sz = preset < 2 ? 1 : -1;
  return { x: sx / Math.sqrt(3), y: 1 / Math.sqrt(3), z: sz / Math.sqrt(3) };
}

/** Угол плана (мм), ближайший к камере при пресете. */
export function isoPresetCorner(
  bounds: RenderBounds,
  preset: number
): { x: number; y: number } {
  const dir = isoPresetDir(preset);
  return {
    // Мир z = −y плана: знак инвертируется.
    x: dir.x > 0 ? bounds.maxX : bounds.minX,
    y: dir.z > 0 ? bounds.minY : bounds.maxY,
  };
}

export interface FrustumFit {
  halfW: number;
  halfH: number;
}

function fitHalves(
  contentW: number,
  contentH: number,
  aspect: number,
  paddingMm: number
): FrustumFit {
  const w = Math.max(contentW, 1) + paddingMm * 2;
  const h = Math.max(contentH, 1) + paddingMm * 2;
  let halfW = w / 2;
  let halfH = h / 2;
  // Расширяем короткую сторону под aspect, чтобы контент влезал целиком.
  if (aspect > 0 && Number.isFinite(aspect)) {
    if (halfW / halfH > aspect) {
      halfH = halfW / aspect;
    } else {
      halfW = halfH * aspect;
    }
  }
  return { halfW, halfH };
}

/**
 * Фрустум вида сверху: оси экрана совпадают с планом (X → X, Y → +Y плана).
 * Экранный «верх» — +Y плана (север сверху), см. viewport.orthoTopNdcToPlan.
 */
export function topFrustumForBounds(
  bounds: RenderBounds,
  aspect: number,
  paddingMm: number = CAMERA_PADDING_MM
): OrthoFrustumMm {
  const { halfW, halfH } = fitHalves(
    bounds.maxX - bounds.minX,
    bounds.maxY - bounds.minY,
    aspect,
    paddingMm
  );
  const depth = 100_000;
  return {
    left: -halfW,
    right: halfW,
    top: halfH,
    bottom: -halfH,
    near: -depth,
    far: depth,
  };
}

/**
 * Фрустум изометрии: модель видна под углом, проекция занимает больше места.
 * Консервативно вписываем описанную сферу плана — гарантированно влезает.
 */
export function isoFrustumForBounds(
  bounds: RenderBounds,
  aspect: number,
  paddingMm: number = CAMERA_PADDING_MM
): OrthoFrustumMm {
  const w = bounds.maxX - bounds.minX;
  const h = bounds.maxY - bounds.minY;
  const radius = Math.hypot(Math.max(w, 1), Math.max(h, 1)) / 2;
  const { halfW, halfH } = fitHalves(radius * 2, radius * 2, aspect, paddingMm);
  const depth = 200_000;
  return {
    left: -halfW,
    right: halfW,
    top: halfH,
    bottom: -halfH,
    near: -depth,
    far: depth,
  };
}

/** Центр bounds в мм (цель камеры). */
export function boundsCenterMm(bounds: RenderBounds): { x: number; y: number } {
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  };
}

/**
 * Позиция камеры в мм (мировые координаты three: x → x, y → вверх, z → −y плана).
 * distMm — удаление от цели вдоль направления взгляда.
 */
export function cameraPositionMm(
  mode: EditorCameraMode,
  bounds: RenderBounds,
  distMm: number,
  isoPreset = 0
): { x: number; y: number; z: number } {
  const c = boundsCenterMm(bounds);
  const cx = c.x;
  const cz = -c.y;
  if (mode === 'top') {
    return { x: cx, y: distMm, z: cz };
  }
  if (mode === 'iso') {
    const dir = isoPresetDir(isoPreset);
    return {
      x: cx + dir.x * distMm,
      y: dir.y * distMm,
      z: cz + dir.z * distMm,
    };
  }
  // orbit: стартовая позиция Этапа 2 (дигональ, перспектива).
  return {
    x: cx + distMm * 0.45,
    y: distMm * 0.85,
    z: cz + distMm * 0.55,
  };
}

/** Удаление камеры, при котором модель влезает в кадр (для dist). */
export function fitDistanceMm(bounds: RenderBounds): number {
  const span = Math.max(
    bounds.maxX - bounds.minX,
    bounds.maxY - bounds.minY,
    1000
  );
  return span * 1.6;
}
