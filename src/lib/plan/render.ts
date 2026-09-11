/**
 * Преобразование Domain Model → нейтральное описание сцены (Renderer Adapter, §7 ТЗ).
 *
 * Чистые данные без three.js: рендерер позже переводит миллиметры в свои
 * единицы и строит меши. Id сущностей сохраняются 1-в-1 — по ним работает
 * выбор объектов и будущая подсветка конфликтов.
 *
 * Этапы 5a–11 добавляют к стенам/плитам: проёмы (вырезы в стенах),
 * напольную мебель (боксы на полу), навесные объекты, электрику и свет.
 * Все позиции — производные от параметрических якорей, в сцене только
 * готовые миллиметры для отрисовки.
 */

import { openRing, pointInPolygon, wallLengthMm } from './geometry';
import type { Vec2 } from './geometry';
import type { ApartmentState, Wall } from './model';
import { openingCenterMm, openingEndsMm, type Opening } from './openings';
import { floorAngleRad, floorCenterMm, wallMountMm } from './furnish';
import {
  rectInFrame,
  subtractOpenings,
  wallDir,
  wallFootprint,
  wallNormal,
} from './polygon';

/**
 * Стена как бокс. ВАЖНО: контур скетча — ВНУТРЕННЯЯ грань стен:
 * центр бокса сдвинут наружу на полтолщины, а длина lengthMm —
 * внутренняя (по контуру). Концы продлены на miter-стыки (extA/extB),
 * чтобы внешние грани сходились чисто.
 */
export interface RenderWallBox {
  kind: 'wall';
  id: string;
  cxMm: number;
  cyMm: number;
  lengthMm: number;
  angleRad: number;
  thicknessMm: number;
  heightMm: number;
  /**
   * Удлинения бокса за концы a/b для miter-стыков, мм.
   * Внешние грани соседей сходятся чисто, без новых углов и выбоин;
   * 0 — стыка нет (стена вне помещений).
   */
  extAMm: number;
  extBMm: number;
  /** Истинные концы внутренней грани (для стыков углов, без офсета). */
  axMm: number;
  ayMm: number;
  bxMm: number;
  byMm: number;
}

/** Плита пола/потолка как плоский полигон на своём уровне. */
export interface RenderSlabPoly {
  kind: 'floor' | 'ceiling';
  id: string;
  levelMm: number;
  points: Vec2[];
}

/**
 * Кусок стены между проёмами — готовый бокс для честных дыр.
 * Стена с N проёмами даёт N+1 сегмент (проёмы сквозные, на всю толщину):
 * вместо бокса с тёмной накладкой рендерятся только куски, проём пуст.
 * lengthMm уже включает miter-расширения крайних кусков.
 */
export interface RenderWallSeg {
  kind: 'wallSeg';
  wallId: string;
  segIndex: number;
  cxMm: number;
  cyMm: number;
  lengthMm: number;
  angleRad: number;
  thicknessMm: number;
  heightMm: number;
}

export interface RenderBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Проём как вырез в стене: центр + концы на оси стены. */
export interface RenderOpening {
  kind: 'opening';
  id: string;
  wallId: string;
  openingKind: Opening['kind'];
  cxMm: number;
  cyMm: number;
  angleRad: number;
  widthMm: number;
  heightMm: number;
  sillMm: number;
  p0: Vec2;
  p1: Vec2;
}

/** Напольный объект как бокс на полу. */
export interface RenderFloorBox {
  kind: 'floorObject';
  id: string;
  cxMm: number;
  cyMm: number;
  angleRad: number;
  wMm: number;
  dMm: number;
  hMm: number;
  label: string;
}

/** Навесной объект: точка на стене + высота. */
export interface RenderWallMount {
  kind: 'wallObject';
  id: string;
  xMm: number;
  yMm: number;
  zMm: number;
  angleRad: number;
  wMm: number;
  hMm: number;
  depthMm: number;
  label: string;
}

/** Электроточка: точка на стене + высота. */
export interface RenderElec {
  kind: 'elec';
  id: string;
  elecKind: 'socket' | 'switch';
  xMm: number;
  yMm: number;
  zMm: number;
  label: string;
}

/** Светильник: точка потолка в плане. */
export interface RenderLight {
  kind: 'light';
  id: string;
  lightKind: string;
  xMm: number;
  yMm: number;
  label: string;
}

export interface RenderScene {
  walls: RenderWallBox[];
  slabs: RenderSlabPoly[];
  openings: RenderOpening[];
  floorObjects: RenderFloorBox[];
  wallObjects: RenderWallMount[];
  elec: RenderElec[];
  lights: RenderLight[];
  /**
   * Куски стен между проёмами (честные дыры). Рендерятся вместо
   * цельных боксов + тёмных накладок; выбор/подсветка — по wallId.
   */
  wallSegs: RenderWallSeg[];
  /** Габариты всего содержимого в мм — для наведения камеры. */
  bounds: RenderBounds;
}

/** Габариты пустой сцены: комната 6×4 м по умолчанию. */
export const EMPTY_SCENE_BOUNDS: RenderBounds = {
  minX: 0,
  minY: 0,
  maxX: 6000,
  maxY: 4000,
};

const roundUm = (v: number): number => Math.round(v * 1000) / 1000 + 0;

/**
 * Куски стен между проёмами через Clipper-вычитание.
 *
 * Фрейм расширен miter-концами ([-extA, len+extB]), проёмы вырезаются
 * прямоугольниками на всю толщину. Сквозной вырез корректно даёт два
 * куска (ручная интервальная математика здесь не нужна — Clipper сам
 * режет по касающимся границам). Куски < 1 мм отбрасываются как пыль.
 */
export function wallSegs(state: ApartmentState): RenderWallSeg[] {
  const out: RenderWallSeg[] = [];
  const walls = Object.values(state.walls).sort((a, b) =>
    a.id < b.id ? -1 : 1
  );
  for (const wall of walls) {
    const len = wallLengthMm(wall.a, wall.b);
    const angleRad = Math.atan2(wall.b.y - wall.a.y, wall.b.x - wall.a.x);
    const outward = outwardNormalMm(state, wall);
    const { extA, extB } = miterExtensions(state, wall);
    const ox = outward ? (outward.x * wall.thicknessMm) / 2 : 0;
    const oy = outward ? (outward.y * wall.thicknessMm) / 2 : 0;
    const dir = wallDir(wall);
    const n = wallNormal(dir);
    const h = wall.thicknessMm / 2;
    const origin = { x: wall.a.x - dir.x * extA, y: wall.a.y - dir.y * extA };
    const fullLen = len + extA + extB;
    const fp = wallFootprint(
      {
        ...wall,
        a: origin,
        b: { x: origin.x + dir.x * fullLen, y: origin.y + dir.y * fullLen },
      },
      wall.thicknessMm
    );
    const holes = Object.values(state.openings ?? {})
      .filter((o) => o.wallId === wall.id)
      .sort((a, b) => a.offsetMm - b.offsetMm)
      .map((o) =>
        rectInFrame(
          origin,
          dir,
          n,
          extA + o.offsetMm,
          -h,
          extA + o.offsetMm + o.widthMm,
          h
        )
      );
    const spans = subtractOpenings(fp, holes)
      .map((p) => {
        const dots = p.map(
          (q) => (q.x - origin.x) * dir.x + (q.y - origin.y) * dir.y
        );
        return [Math.min(...dots), Math.max(...dots)];
      })
      .filter(([s0, s1]) => s1 - s0 >= 1)
      .sort((a, b) => a[0] - b[0]);
    spans.forEach(([s0, s1], i) => {
      const mid = (s0 + s1) / 2;
      out.push({
        kind: 'wallSeg',
        wallId: wall.id,
        segIndex: i,
        cxMm: roundUm(origin.x + dir.x * mid + ox),
        cyMm: roundUm(origin.y + dir.y * mid + oy),
        lengthMm: roundUm(s1 - s0),
        angleRad,
        thicknessMm: wall.thicknessMm,
        heightMm: wall.heightMm,
      });
    });
  }
  return out;
}

export function modelToScene(state: ApartmentState): RenderScene {
  const walls: RenderWallBox[] = Object.values(state.walls).map((w) => {
    const lengthMm = wallLengthMm(w.a, w.b);
    const outward = outwardNormalMm(state, w);
    const { extA, extB } = miterExtensions(state, w);
    const axX = lengthMm < 1e-9 ? 0 : (w.b.x - w.a.x) / lengthMm;
    const axY = lengthMm < 1e-9 ? 0 : (w.b.y - w.a.y) / lengthMm;
    return {
      kind: 'wall',
      id: w.id,
      cxMm:
        (w.a.x + w.b.x) / 2 +
        (outward ? (outward.x * w.thicknessMm) / 2 : 0) +
        ((extB - extA) / 2) * axX,
      cyMm:
        (w.a.y + w.b.y) / 2 +
        (outward ? (outward.y * w.thicknessMm) / 2 : 0) +
        ((extB - extA) / 2) * axY,
      lengthMm,
      angleRad: Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x),
      thicknessMm: w.thicknessMm,
      heightMm: w.heightMm,
      extAMm: extA,
      extBMm: extB,
      axMm: w.a.x,
      ayMm: w.a.y,
      bxMm: w.b.x,
      byMm: w.b.y,
    };
  });
  walls.sort((a, b) => (a.id < b.id ? -1 : 1));

  const slabs: RenderSlabPoly[] = Object.values(state.slabs).map((s) => ({
    kind: s.kind,
    id: s.id,
    levelMm: s.levelMm,
    points: s.outline.map((p) => ({ ...p })),
  }));
  slabs.sort((a, b) => (a.id < b.id ? -1 : 1));

  const openings: RenderOpening[] = Object.values(state.openings ?? {})
    .map((o) => {
      const wall = state.walls[o.wallId];
      if (!wall) return null;
      const c = openingCenterMm(wall, o);
      const { p0, p1 } = openingEndsMm(wall, o);
      return {
        kind: 'opening' as const,
        id: o.id,
        wallId: o.wallId,
        openingKind: o.kind,
        cxMm: Math.round(c.x),
        cyMm: Math.round(c.y),
        angleRad: Math.atan2(wall.b.y - wall.a.y, wall.b.x - wall.a.x),
        widthMm: o.widthMm,
        heightMm: o.heightMm,
        sillMm: o.sillMm,
        p0: { ...p0 },
        p1: { ...p1 },
      };
    })
    .filter((x): x is RenderOpening => x !== null)
    .sort((a, b) => (a.id < b.id ? -1 : 1));

  const floorObjects: RenderFloorBox[] = Object.values(state.floorObjects ?? {})
    .map((o) => {
      const c = floorCenterMm(state, o);
      if (!c) return null;
      return {
        kind: 'floorObject' as const,
        id: o.id,
        cxMm: Math.round(c.x),
        cyMm: Math.round(c.y),
        angleRad: floorAngleRad(state, o),
        wMm: o.wMm,
        dMm: o.dMm,
        hMm: o.hMm,
        label: o.label,
      };
    })
    .filter((x): x is RenderFloorBox => x !== null)
    .sort((a, b) => (a.id < b.id ? -1 : 1));

  const wallObjects: RenderWallMount[] = Object.values(state.wallObjects ?? {})
    .map((o) => {
      const m = wallMountMm(state.walls, o);
      if (!m) return null;
      const wall = state.walls[o.anchor.wallId];
      return {
        kind: 'wallObject' as const,
        id: o.id,
        xMm: Math.round(m.x),
        yMm: Math.round(m.y),
        zMm: m.zMm,
        angleRad: wall
          ? Math.atan2(wall.b.y - wall.a.y, wall.b.x - wall.a.x)
          : 0,
        wMm: o.wMm,
        hMm: o.hMm,
        depthMm: o.depthMm,
        label: o.label,
      };
    })
    .filter((x): x is RenderWallMount => x !== null)
    .sort((a, b) => (a.id < b.id ? -1 : 1));

  const elec: RenderElec[] = Object.values(state.elecPoints ?? {})
    .map((p) => {
      const wall = state.walls[p.wallId];
      if (!wall) return null;
      const len = wallLengthMm(wall.a, wall.b);
      if (len < 1e-9) return null;
      const t = p.alongMm / len;
      return {
        kind: 'elec' as const,
        id: p.id,
        elecKind: p.kind,
        xMm: Math.round(wall.a.x + (wall.b.x - wall.a.x) * t),
        yMm: Math.round(wall.a.y + (wall.b.y - wall.a.y) * t),
        zMm: p.heightMm,
        label: p.purpose,
      };
    })
    .filter((x): x is RenderElec => x !== null)
    .sort((a, b) => (a.id < b.id ? -1 : 1));

  const lights: RenderLight[] = Object.values(state.luminaires ?? {})
    .map((l) => ({
      kind: 'light' as const,
      id: l.id,
      lightKind: l.kind,
      xMm: l.xMm,
      yMm: l.yMm,
      label: l.id,
    }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));

  return {
    walls,
    slabs,
    openings,
    floorObjects,
    wallObjects,
    elec,
    lights,
    wallSegs: wallSegs(state),
    bounds: sceneBounds(walls, slabs, [
      ...floorObjects.map((f) => ({ x: f.cxMm, y: f.cyMm })),
      ...lights.map((l) => ({ x: l.xMm, y: l.yMm })),
    ]),
  };
}

function sceneBounds(
  walls: RenderWallBox[],
  slabs: RenderSlabPoly[],
  extra: Vec2[] = []
): RenderBounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const w of walls) {
    const spanMm = w.lengthMm + (w.extAMm ?? 0) + (w.extBMm ?? 0);
    const c = Math.abs(Math.cos(w.angleRad));
    const s = Math.abs(Math.sin(w.angleRad));
    // Габарит бокса: длина вдоль оси + толщина поперёк.
    const dx = (c * spanMm + s * w.thicknessMm) / 2;
    const dy = (s * spanMm + c * w.thicknessMm) / 2;
    minX = Math.min(minX, w.cxMm - dx);
    maxX = Math.max(maxX, w.cxMm + dx);
    minY = Math.min(minY, w.cyMm - dy);
    maxY = Math.max(maxY, w.cyMm + dy);
  }
  for (const s of slabs) {
    for (const p of s.points) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
  }
  for (const p of extra) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }

  if (!Number.isFinite(minX)) return { ...EMPTY_SCENE_BOUNDS };
  // Тригонометрия даёт эпсилон-хвосты (cos 90° ≈ 6e-17) — режем до мкм.
  const q = (v: number) => Math.round(v * 1000) / 1000 + 0;
  return { minX: q(minX), minY: q(minY), maxX: q(maxX), maxY: q(maxY) };
}

/** Все выбираемые id сцены — для списков и тестов. */
export function selectableIds(scene: RenderScene): string[] {
  return [
    ...scene.walls.map((w) => w.id),
    ...scene.slabs.map((s) => s.id),
    ...scene.openings.map((o) => o.id),
    ...scene.floorObjects.map((o) => o.id),
    ...scene.wallObjects.map((o) => o.id),
    ...scene.elec.map((e) => e.id),
    ...scene.lights.map((l) => l.id),
  ];
}

/**
 * Внутренние углы полигона по вершинам (0..2π), с учётом обхода.
 * Вырожденные рёбра дают π (стык не нужен).
 */
export function interiorAngles(outline: Vec2[]): number[] {
  const ring = openRing(outline);
  const n = ring.length;
  let area2 = 0;
  for (let i = 0; i < n; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % n];
    area2 += p.x * q.y - q.x * p.y;
  }
  const ccw = area2 > 0;
  return ring.map((_, i) => {
    const prev = ring[(i - 1 + n) % n];
    const cur = ring[i];
    const next = ring[(i + 1) % n];
    const e1x = cur.x - prev.x;
    const e1y = cur.y - prev.y;
    const e2x = next.x - cur.x;
    const e2y = next.y - cur.y;
    const turn = Math.atan2(e1x * e2y - e1y * e2x, e1x * e2x + e1y * e2y);
    return ccw ? Math.PI - turn : Math.PI + turn;
  });
}

/** Удлинение конца стены на miter-стык: t/tan(θ/2), вогнутые — 0. */
export function miterExt(thicknessMm: number, interiorRad: number): number {
  if (interiorRad >= Math.PI) return 0;
  const tan = Math.tan(interiorRad / 2);
  if (!(tan > 1e-6)) return 0;
  // Целые мм: тригонометрические хвосты не нужны, глаз их не видит.
  return Math.round(Math.min(thicknessMm / tan, 5 * thicknessMm));
}

function samePoint(a: Vec2, b: Vec2): boolean {
  return a.x === b.x && a.y === b.y;
}

/**
 * Удлинения концов стены по стыкам помещения, чьё ребро она повторяет.
 * Нет совпадения с ребром — 0 (стена вне помещений ведёт себя как раньше).
 */
export function miterExtensions(
  state: ApartmentState,
  wall: Wall
): { extA: number; extB: number } {
  for (const room of Object.values(state.rooms)) {
    if (!room.wallIds.includes(wall.id)) continue;
    const ring = openRing(room.outline);
    const n = ring.length;
    if (n < 3) continue;
    const angles = interiorAngles(ring);
    for (let i = 0; i < n; i++) {
      const v0 = ring[i];
      const v1 = ring[(i + 1) % n];
      const fwd = samePoint(wall.a, v0) && samePoint(wall.b, v1);
      const rev = samePoint(wall.a, v1) && samePoint(wall.b, v0);
      if (!fwd && !rev) continue;
      const ia = fwd ? i : (i + 1) % n;
      const ib = fwd ? (i + 1) % n : i;
      return {
        extA: miterExt(wall.thicknessMm, angles[ia]),
        extB: miterExt(wall.thicknessMm, angles[ib]),
      };
    }
  }
  return { extA: 0, extB: 0 };
}
/**
 * Наружная нормаль стены (единичная, мм не важны) относительно помещения,
 * в чьих wallIds она числится. null — стена вне помещений (по центру).
 * Контур — внутренняя грань: точка середины ±1 мм ложится по разные
 * стороны границы, тест устойчив к направлению обхода.
 */
export function outwardNormalMm(
  state: ApartmentState,
  wall: Wall
): Vec2 | null {
  const len = wallLengthMm(wall.a, wall.b);
  if (len < 1e-9) return null;
  const nx = -(wall.b.y - wall.a.y) / len;
  const ny = (wall.b.x - wall.a.x) / len;
  const mx = (wall.a.x + wall.b.x) / 2;
  const my = (wall.a.y + wall.b.y) / 2;
  for (const room of Object.values(state.rooms)) {
    if (!room.wallIds.includes(wall.id)) continue;
    if (room.outline.length < 3) continue;
    const insidePlus = pointInPolygon({ x: mx + nx, y: my + ny }, room.outline);
    const insideMinus = pointInPolygon(
      { x: mx - nx, y: my - ny },
      room.outline
    );
    if (insidePlus === insideMinus) continue;
    const out = insidePlus ? { x: -nx, y: -ny } : { x: nx, y: ny };
    // Нормализуем -0, чтобы toEqual не спотыкался.
    return { x: out.x + 0, y: out.y + 0 };
  }
  return null;
}

/**
 * Стены, примыкающие к углу плана (конец в пределах 1 мм от угла).
 * В изометрии с этого угла они гасятся, чтобы видеть интерьер.
 */
export function cornerWallIds(state: ApartmentState, corner: Vec2): string[] {
  const out: string[] = [];
  for (const w of Object.values(state.walls)) {
    const near = (p: Vec2) => Math.hypot(p.x - corner.x, p.y - corner.y) <= 1;
    if (near(w.a) || near(w.b)) out.push(w.id);
  }
  return out.sort();
}
