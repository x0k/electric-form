/**
 * Sketch-домен для Этапа 1 «Планировка помещения» (задел из Этапа 3).
 *
 * Идея: замкнутый контур строится как polyline (точки + сегменты по порядку)
 * с минимальным набором constraints:
 * - coincident (совпадение двух точек, в т.ч. замыкание);
 * - horizontal / vertical (сегмент строго горизонтален / вертикален);
 * - length (фиксированная длина сегмента).
 *
 * Всё чистое, без UI и рендера. Единицы — целые мм, базовая сетка 1 см
 * (см. geometry.ts). Solver — детерминированный, best-effort: неприменимые
 * constraints не роняют скетч, а возвращаются как конфликты.
 */

import {
  BASE_GRID_MM,
  MIN_WALL_LENGTH_MM,
  axisAngleClean,
  isPointOnGrid,
  openRing,
  polygonAreaMm2,
  snapMm,
  snapPoint,
  type Vec2,
} from './geometry';
import type { Operation } from './operations';
import { solveWithGcs } from './gcs';

export interface SketchPoint {
  id: string;
  x: number;
  y: number;
}

export interface SketchSegment {
  id: string;
  /** Точки в порядке polyline: a → b. */
  a: string;
  b: string;
  /**
   * Штрих (stroke) — независимая цепочка, как отдельный объект
   * в Sketcher. Старые сегменты без номера считаются штрихом 0.
   */
  stroke: number;
}

export type SketchConstraint =
  | { id: string; type: 'coincident'; points: [string, string] }
  | { id: string; type: 'horizontal'; segment: string }
  | { id: string; type: 'vertical'; segment: string }
  | { id: string; type: 'length'; segment: string; lengthMm: number };

export interface Sketch {
  points: Record<string, SketchPoint>;
  /** Порядок массива = порядок polyline. */
  segments: SketchSegment[];
  constraints: SketchConstraint[];
}

export type SketchErrorCode =
  'ID_TAKEN' | 'NOT_FOUND' | 'OFF_GRID' | 'BAD_GEOMETRY' | 'CONFLICT';

export interface SketchError {
  code: SketchErrorCode;
  message: string;
}

export type SketchResult<T> =
  { ok: true; value: T } | { ok: false; error: SketchError };

export interface SketchConflict {
  constraintId: string;
  message: string;
}

export interface SolvedSketch {
  sketch: Sketch;
  conflicts: SketchConflict[];
}

export function createSketch(): Sketch {
  return { points: {}, segments: [], constraints: [] };
}

function fail<T>(code: SketchErrorCode, message: string): SketchResult<T> {
  return { ok: false, error: { code, message } };
}

function cloneSketch(sketch: Sketch): Sketch {
  return {
    points: Object.fromEntries(
      Object.entries(sketch.points).map(([id, p]) => [id, { ...p }])
    ),
    segments: sketch.segments.map((s) => ({ ...s })),
    constraints: sketch.constraints.map((c) => ({ ...c }) as SketchConstraint),
  };
}

function checkOnGrid(p: Vec2, what: string): SketchError | null {
  if (!Number.isInteger(p.x) || !Number.isInteger(p.y)) {
    return {
      code: 'OFF_GRID',
      message: `${what}: координаты должны быть целыми мм, получено (${p.x}, ${p.y}).`,
    };
  }
  if (!isPointOnGrid(p)) {
    return {
      code: 'OFF_GRID',
      message: `${what}: точка (${p.x}, ${p.y}) не на сетке 1 см (кратно ${BASE_GRID_MM} мм).`,
    };
  }
  return null;
}

/** Добавить точку polyline (координаты привязываются к сетке 1 см). */
export function sketchAddPoint(
  sketch: Sketch,
  pointId: string,
  raw: Vec2
): SketchResult<Sketch> {
  if (!pointId) return fail('BAD_GEOMETRY', 'Пустой id точки запрещён.');
  if (sketch.points[pointId]) {
    return fail('BAD_GEOMETRY', `Точка "${pointId}" уже существует.`);
  }
  if (sketch.segments.some((s) => s.id === pointId)) {
    return fail('BAD_GEOMETRY', `Id "${pointId}" уже занят сегментом.`);
  }
  if (sketch.constraints.some((c) => c.id === pointId)) {
    return fail('BAD_GEOMETRY', `Id "${pointId}" уже занят constraint.`);
  }
  const gridError = checkOnGrid(raw, `Точка "${pointId}"`);
  if (gridError) return { ok: false, error: gridError };
  const next = cloneSketch(sketch);
  next.points[pointId] = { id: pointId, ...snapPoint(raw) };
  return { ok: true, value: next };
}

/**
 * Добавить сегмент polyline между двумя существующими точками.
 * Порядок массива segments задаёт порядок обхода контура.
 */
export function sketchAddSegment(
  sketch: Sketch,
  segmentId: string,
  a: string,
  b: string,
  stroke = 0
): SketchResult<Sketch> {
  if (!segmentId) return fail('BAD_GEOMETRY', 'Пустой id сегмента запрещён.');
  if (sketch.segments.some((s) => s.id === segmentId)) {
    return fail('BAD_GEOMETRY', `Сегмент "${segmentId}" уже существует.`);
  }
  if (
    sketch.points[segmentId] ||
    sketch.constraints.some((c) => c.id === segmentId)
  ) {
    return fail('BAD_GEOMETRY', `Id "${segmentId}" уже занят.`);
  }
  if (!sketch.points[a]) return fail('NOT_FOUND', `Точка "${a}" не найдена.`);
  if (!sketch.points[b]) return fail('NOT_FOUND', `Точка "${b}" не найдена.`);
  if (a === b) {
    return fail('BAD_GEOMETRY', `Сегмент "${segmentId}": концы совпадают.`);
  }
  const next = cloneSketch(sketch);
  next.segments.push({ id: segmentId, a, b, stroke });
  return { ok: true, value: next };
}

/**
 * Один шаг polyline: новая точка + сегмент от предыдущей последней точки.
 * Для первой точки сегмент не создаётся (нужен prevPointId = null).
 * Возвращает обновлённый скетч и id созданного сегмента (если есть).
 */
export function sketchPolylineAdd(
  sketch: Sketch,
  pointId: string,
  raw: Vec2,
  segmentId: string | null,
  stroke?: number
): SketchResult<{ sketch: Sketch; segmentId: string | null }> {
  const last = lastPolylinePoint(sketch, stroke);
  const added = sketchAddPoint(sketch, pointId, raw);
  if (!added.ok) return added;
  let next = added.value;
  if (last === null || segmentId === null) {
    return { ok: true, value: { sketch: next, segmentId: null } };
  }
  const seg = sketchAddSegment(next, segmentId, last, pointId, stroke ?? 0);
  if (!seg.ok) return seg;
  next = seg.value;
  return { ok: true, value: { sketch: next, segmentId } };
}

/** Сегменты одного штриха в порядке массива. */
export function strokeSegments(
  sketch: Sketch,
  stroke: number
): SketchSegment[] {
  return sketch.segments.filter((s) => (s.stroke ?? 0) === stroke);
}

/** Номера штрихов в порядке первого появления. */
export function strokeIds(sketch: Sketch): number[] {
  const out: number[] = [];
  for (const s of sketch.segments) {
    const n = s.stroke ?? 0;
    if (!out.includes(n)) out.push(n);
  }
  return out;
}

/**
 * Последняя точка штриха (конец его последнего сегмента).
 * Без номера — legacy-поведение: конец всего массива либо
 * единственная точка (для пустого скетча).
 */
export function lastPolylinePoint(
  sketch: Sketch,
  stroke?: number
): string | null {
  const segs =
    stroke === undefined ? sketch.segments : strokeSegments(sketch, stroke);
  if (segs.length > 0) {
    return segs[segs.length - 1].b;
  }
  if (stroke !== undefined) return null;
  const ids = Object.keys(sketch.points).sort();
  return ids.length > 0 ? ids[ids.length - 1] : null;
}

/**
 * Первая точка штриха (начало его первого сегмента).
 * Без номера — legacy-поведение как раньше.
 */
export function firstPolylinePoint(
  sketch: Sketch,
  stroke?: number
): string | null {
  const segs =
    stroke === undefined ? sketch.segments : strokeSegments(sketch, stroke);
  if (segs.length > 0) {
    return segs[0].a;
  }
  if (stroke !== undefined) return null;
  const ids = Object.keys(sketch.points).sort();
  return ids.length > 0 ? ids[0] : null;
}

/**
 * Собрать скетч из готового контура (напр. загрузка outline головы
 * истории для правки). Точки именуются p1.., сегменты s1.., контур
 * замыкается. Constraints не восстанавливаются — их пользователь
 * задаёт заново поверх нового черновика.
 */
export function sketchFromOutline(outline: Vec2[]): SketchResult<Sketch> {
  const ring = openRing(outline);
  if (ring.length < 3) {
    return fail('BAD_GEOMETRY', 'Нужно минимум 3 точки контура.');
  }
  for (const p of ring) {
    const err = checkOnGrid(p, 'Контур');
    if (err) return { ok: false, error: err };
  }
  let s = createSketch();
  for (let i = 0; i < ring.length; i++) {
    const pid = `p${i + 1}`;
    const added = sketchAddPoint(s, pid, ring[i]);
    if (!added.ok) return added;
    s = added.value;
    if (i > 0) {
      const seg = sketchAddSegment(s, `s${i}`, `p${i}`, pid);
      if (!seg.ok) return seg;
      s = seg.value;
    }
  }
  return sketchClose(s, `s${ring.length}`);
}

/**
 * Удалить узел: уходят точка, все инцидентные сегменты и constraints,
 * ссылающиеся на них. Замкнутый контур при этом размыкается —
 * его можно замкнуть заново кликом по первой точке.
 */
export function sketchDeletePoint(
  sketch: Sketch,
  pointId: string
): SketchResult<Sketch> {
  if (!sketch.points[pointId]) {
    return fail('NOT_FOUND', `Точка "${pointId}" не найдена.`);
  }
  const deadSegments = new Set(
    sketch.segments
      .filter((s) => s.a === pointId || s.b === pointId)
      .map((s) => s.id)
  );
  const next = cloneSketch(sketch);
  delete next.points[pointId];
  next.segments = next.segments.filter((s) => !deadSegments.has(s.id));
  next.constraints = next.constraints.filter((c) => {
    if (c.type === 'coincident') return !c.points.includes(pointId);
    return !deadSegments.has(c.segment);
  });
  return { ok: true, value: next };
}

/**
 * Удалить грань: уходят сегмент, его constraints и точки, которые
 * висели ТОЛЬКО на нём. Явно построенные одиночные точки не трогаем.
 */
export function sketchDeleteSegment(
  sketch: Sketch,
  segmentId: string
): SketchResult<Sketch> {
  const seg = sketch.segments.find((s) => s.id === segmentId);
  if (!seg) {
    return fail('NOT_FOUND', `Сегмент "${segmentId}" не найден.`);
  }
  const next = cloneSketch(sketch);
  next.segments = next.segments.filter((s) => s.id !== segmentId);
  next.constraints = next.constraints.filter(
    (c) => c.type === 'coincident' || c.segment !== segmentId
  );
  // Висячие концы удалённой грани тоже уходят (если нигде не используются),
  // вместе с их coincident-ограничениями.
  for (const pid of [seg.a, seg.b]) {
    const used = next.segments.some((s) => s.a === pid || s.b === pid);
    if (!used) {
      delete next.points[pid];
      next.constraints = next.constraints.filter(
        (c) => c.type !== 'coincident' || !c.points.includes(pid)
      );
    }
  }
  return { ok: true, value: next };
}

/** Замкнуть штрих сегментом от его последней точки к первой. */
export function sketchClose(
  sketch: Sketch,
  segmentId: string,
  stroke = 0
): SketchResult<Sketch> {
  if (isStrokeClosed(sketch, stroke)) {
    return fail('CONFLICT', 'Контур уже замкнут.');
  }
  const segs = strokeSegments(sketch, stroke);
  if (segs.length < 2) {
    return fail(
      'BAD_GEOMETRY',
      'Для замыкания нужно минимум 2 сегмента (3 точки).'
    );
  }
  const first = firstPolylinePoint(sketch, stroke);
  const last = lastPolylinePoint(sketch, stroke);
  if (first === null || last === null || first === last) {
    return fail('BAD_GEOMETRY', 'Некорректная цепочка polyline.');
  }
  return sketchAddSegment(sketch, segmentId, last, first, stroke);
}

/** Замкнут ли штрих топологически: ≥3 сегментов в цепочку с возвратом. */
export function isStrokeClosed(sketch: Sketch, stroke: number): boolean {
  const segs = strokeSegments(sketch, stroke);
  if (segs.length < 3) return false;
  for (const s of segs) {
    if (!sketch.points[s.a] || !sketch.points[s.b]) return false;
  }
  for (let i = 0; i < segs.length; i++) {
    const cur = segs[i];
    const nxt = segs[(i + 1) % segs.length];
    if (cur.b !== nxt.a) return false;
  }
  return segs[0].a === segs[segs.length - 1].b;
}

/**
 * Замкнут ли контур. Без номера штриха — legacy: замкнут хоть один.
 * (Старые тесты и оверлей опираются на это для одноштриховых скетчей.)
 */
export function isSketchClosed(sketch: Sketch, stroke?: number): boolean {
  if (stroke !== undefined) return isStrokeClosed(sketch, stroke);
  return strokeIds(sketch).some((n) => isStrokeClosed(sketch, n));
}

/** Номера замкнутых штрихов. */
export function closedStrokes(sketch: Sketch): number[] {
  return strokeIds(sketch).filter((n) => isStrokeClosed(sketch, n));
}

/**
 * Какой штрих замыкает клик по точке: точка — начало штриха
 * с ≥2 сегментами. Замкнутость проверяет вызыватель
 * (клик по замкнутому — уже не замыкание, а выбор).
 * (Нормальный polyline: закрыться можно по началу ЛЮБОГО штриха.)
 */
export function closingStrokeAtPoint(
  sketch: Sketch,
  pointId: string
): number | null {
  for (const n of strokeIds(sketch)) {
    if (strokeSegments(sketch, n).length < 2) continue;
    if (firstPolylinePoint(sketch, n) === pointId) return n;
  }
  return null;
}

/** Упорядоченный контур: ровно один замкнутый штрих, иначе null. */
export function sketchOutline(sketch: Sketch): Vec2[] | null {
  const closed = closedStrokes(sketch);
  if (closed.length !== 1) return null;
  return strokeSegments(sketch, closed[0]).map((s) => {
    const p = sketch.points[s.a];
    return { x: p.x, y: p.y };
  });
}

export type SketchConstraintInput =
  | { id: string; type: 'coincident'; points: [string, string] }
  | { id: string; type: 'horizontal'; segment: string }
  | { id: string; type: 'vertical'; segment: string }
  | { id: string; type: 'length'; segment: string; lengthMm: number };

/** Добавить constraint и сразу пересчитать скетч; при конфликте — отказ. */
export function sketchAddConstraint(
  sketch: Sketch,
  input: SketchConstraintInput
): SketchResult<Sketch> {
  if (!input.id) return fail('BAD_GEOMETRY', 'Пустой id constraint запрещён.');
  if (
    sketch.constraints.some((c) => c.id === input.id) ||
    sketch.points[input.id] ||
    sketch.segments.some((s) => s.id === input.id)
  ) {
    return fail('BAD_GEOMETRY', `Id "${input.id}" уже занят.`);
  }
  const checkPoint = (pid: string): SketchError | null =>
    sketch.points[pid]
      ? null
      : { code: 'NOT_FOUND', message: `Точка "${pid}" не найдена.` };
  const checkSegment = (sid: string): SketchError | null =>
    sketch.segments.some((s) => s.id === sid)
      ? null
      : { code: 'NOT_FOUND', message: `Сегмент "${sid}" не найден.` };

  if (input.type === 'coincident') {
    for (const pid of input.points) {
      const err = checkPoint(pid);
      if (err) return { ok: false, error: err };
    }
    if (input.points[0] === input.points[1]) {
      return fail('BAD_GEOMETRY', 'Coincident требует две разные точки.');
    }
  } else if (input.type === 'horizontal' || input.type === 'vertical') {
    const err = checkSegment(input.segment);
    if (err) return { ok: false, error: err };
    const opposite = input.type === 'horizontal' ? 'vertical' : 'horizontal';
    const clash = sketch.constraints.find(
      (c) =>
        (c.type === opposite || c.type === input.type) &&
        (c as { segment: string }).segment === input.segment
    );
    if (clash && clash.type === opposite) {
      return fail(
        'CONFLICT',
        `Сегмент "${input.segment}": ${input.type} конфликтует с ${opposite} (${clash.id}).`
      );
    }
    if (clash) {
      return fail(
        'CONFLICT',
        `Сегмент "${input.segment}" уже имеет ${input.type} (${clash.id}).`
      );
    }
  } else {
    const err = checkSegment(input.segment);
    if (err) return { ok: false, error: err };
    if (
      !Number.isInteger(input.lengthMm) ||
      input.lengthMm < MIN_WALL_LENGTH_MM
    ) {
      return fail(
        'BAD_GEOMETRY',
        `Длина сегмента должна быть целым ≥ ${MIN_WALL_LENGTH_MM} мм.`
      );
    }
    if (input.lengthMm % BASE_GRID_MM !== 0) {
      return fail(
        'OFF_GRID',
        `Длина ${input.lengthMm} мм не кратна сетке ${BASE_GRID_MM} мм — концы не лягут на сетку.`
      );
    }
    const dup = sketch.constraints.find(
      (c) =>
        c.type === 'length' &&
        (c as { segment: string }).segment === input.segment
    );
    if (dup) {
      return fail(
        'CONFLICT',
        `Сегмент "${input.segment}" уже имеет длину (${dup.id}).`
      );
    }
  }

  const next = cloneSketch(sketch);
  next.constraints.push({ ...input } as SketchConstraint);
  // Coincident сразу сводим вторую точку к первой: solver стартует
  // из склеенного состояния и там остаётся (как раньше).
  if (input.type === 'coincident') {
    const [p1id, p2id] = input.points;
    const p1 = next.points[p1id];
    const p2 = next.points[p2id];
    if (p1 && p2) {
      next.points[p2id] = { ...p2, x: p1.x, y: p1.y };
    }
  }
  const solved = sketchSolve(next);
  if (solved.conflicts.length > 0) {
    return {
      ok: false,
      error: {
        code: 'CONFLICT',
        message: solved.conflicts.map((c) => c.message).join('; '),
      },
    };
  }
  return { ok: true, value: solved.sketch };
}

/**
 * Переместить точку (сырые координаты привязываются к сетке 1 см),
 * затем пересчитать constraints. Конфликты solver не роняют результат,
 * а возвращаются списком — редактор показывает их пользователю.
 */
export function sketchMovePoint(
  sketch: Sketch,
  pointId: string,
  raw: Vec2
): SketchResult<SolvedSketch> {
  const pt = sketch.points[pointId];
  if (!pt) return fail('NOT_FOUND', `Точка "${pointId}" не найдена.`);
  const gridError = checkOnGrid(raw, `Точка "${pointId}"`);
  if (gridError) return { ok: false, error: gridError };
  const next = cloneSketch(sketch);
  const snapped = snapPoint(raw);
  next.points[pointId] = {
    ...next.points[pointId],
    x: snapped.x,
    y: snapped.y,
  };
  // Перетаскиваемая точка зафиксирована — остальное следует за ней.
  return { ok: true, value: sketchSolve(next, { fixedIds: [pointId] }) };
}

/**
 * Перенос грани целиком (как перетаскивание ребра в Sketcher):
 * оба конца сдвигаются на delta, затем работает solver.
 * Жёсткий перенос сохраняет H/V/д длину сам по себе; приклеенные
 * coincident-соседи либо едут следом, либо фиксируются конфликтом.
 */
export function sketchMoveSegment(
  sketch: Sketch,
  segmentId: string,
  delta: Vec2
): SketchResult<SolvedSketch> {
  const seg = segmentById(sketch, segmentId);
  if (!seg) return fail('NOT_FOUND', `Сегмент "${segmentId}" не найден.`);
  if (!Number.isInteger(delta.x) || !Number.isInteger(delta.y)) {
    return fail(
      'OFF_GRID',
      `Сдвиг должен быть целыми мм, получено (${delta.x}, ${delta.y}).`
    );
  }
  const next = cloneSketch(sketch);
  for (const pid of [seg.a, seg.b]) {
    const p = next.points[pid];
    if (!p) return fail('NOT_FOUND', `Точка "${pid}" не найдена.`);
    next.points[pid] = { ...p, x: p.x + delta.x, y: p.y + delta.y };
  }
  // Жёсткий перенос: оба конца стоят, остальное следует.
  return { ok: true, value: sketchSolve(next, { fixedIds: [seg.a, seg.b] }) };
}

function segmentById(sketch: Sketch, id: string) {
  return sketch.segments.find((s) => s.id === id);
}

/**
 * Solver скетча на FreeCAD PlanGCS (см. gcs.ts).
 *
 * Инварианты домена сохраняются: целые мм, сетка 1 см, явные конфликты.
 * fixedIds — точки, стоящие на месте (перетаскиваемая и т.п.):
 * остальное следует за ними, как в Sketcher. H+V на одном сегменте
 * отлавливаем заранее своей проверкой (ясное сообщение + детерминизм).
 */
export function sketchSolve(
  sketch: Sketch,
  opts?: { fixedIds?: string[] }
): SolvedSketch {
  const next = cloneSketch(sketch);
  const conflicts: SketchConflict[] = [];

  const coincident = next.constraints.filter((c) => c.type === 'coincident');
  const hv = next.constraints.filter(
    (c) => c.type === 'horizontal' || c.type === 'vertical'
  );
  const lengths = next.constraints.filter((c) => c.type === 'length');

  // H+V на одном сегменте невыполнимы (кроме вырожденной точки) — фиксируем заранее.
  const hvBySegment = new Map<string, { h?: string; v?: string }>();
  for (const c of hv) {
    const seg = (c as { segment: string }).segment;
    const entry = hvBySegment.get(seg) ?? {};
    if (c.type === 'horizontal') entry.h = c.id;
    else entry.v = c.id;
    hvBySegment.set(seg, entry);
  }
  const skippedV = new Set<string>();
  for (const [segId, entry] of hvBySegment) {
    if (entry.h && entry.v) {
      const seg = segmentById(next, segId);
      const a = seg ? next.points[seg.a] : undefined;
      const b = seg ? next.points[seg.b] : undefined;
      if (a && b && (a.x !== b.x || a.y !== b.y)) {
        conflicts.push({
          constraintId: entry.v,
          message: `Сегмент "${segId}": vertical (${entry.v}) конфликтует с horizontal (${entry.h}).`,
        });
        skippedV.add(entry.v);
      }
    }
  }

  // Вход GCS: только связанные точки (остальные стоят бит-в-бит),
  // битые ссылки и снятый V пропускаем.
  const fixed = new Set(opts?.fixedIds ?? []);
  const usedPoints = new Set<string>(fixed);
  type GcsC =
    | { id: string; type: 'coincident'; a: string; b: string }
    | { id: string; type: 'horizontal'; a: string; b: string }
    | { id: string; type: 'vertical'; a: string; b: string }
    | { id: string; type: 'length'; a: string; b: string; lengthMm: number };
  const gcsConstraints: GcsC[] = [];
  const takeSegment = (sid: string): { a: string; b: string } | null => {
    const seg = segmentById(next, sid);
    if (!seg || !next.points[seg.a] || !next.points[seg.b]) return null;
    usedPoints.add(seg.a);
    usedPoints.add(seg.b);
    return { a: seg.a, b: seg.b };
  };
  for (const c of coincident) {
    const [a, b] = (c as { points: [string, string] }).points;
    if (!next.points[a] || !next.points[b]) continue;
    usedPoints.add(a);
    usedPoints.add(b);
    gcsConstraints.push({ id: c.id, type: 'coincident', a, b });
  }
  for (const c of hv) {
    if (skippedV.has(c.id)) continue;
    const ends = takeSegment((c as { segment: string }).segment);
    if (!ends) continue;
    gcsConstraints.push({
      id: c.id,
      type: c.type as 'horizontal' | 'vertical',
      ...ends,
    });
  }
  for (const c of lengths) {
    const { segment: segId, lengthMm } = c as {
      segment: string;
      lengthMm: number;
    };
    const ends = takeSegment(segId);
    if (!ends) continue;
    gcsConstraints.push({ id: c.id, type: 'length', ...ends, lengthMm });
  }

  if (usedPoints.size > 0 && gcsConstraints.length > 0) {
    let out;
    try {
      out = solveWithGcs(
        [...usedPoints].map((pid) => ({
          id: pid,
          x: next.points[pid].x,
          y: next.points[pid].y,
          fixed: fixed.has(pid),
        })),
        gcsConstraints
      );
    } catch (e) {
      return {
        sketch: next,
        conflicts: [
          ...conflicts,
          {
            constraintId: 'solver',
            message: `Решатель недоступен: ${e instanceof Error ? e.message : String(e)}`,
          },
        ],
      };
    }
    if (!out.ok) {
      for (const cid of out.conflictingIds) {
        conflicts.push({
          constraintId: cid,
          message: conflictMessage(next, cid),
        });
      }
      if (out.conflictingIds.length === 0) {
        conflicts.push({
          constraintId: 'solver',
          message: 'Система ограничений невыполнима.',
        });
      }
      return { sketch: next, conflicts };
    }
    // Применить: целые мм + сетка 1 см (режем float-хвосты, нормируем -0).
    for (const [pid, p] of Object.entries(out.points)) {
      const target = next.points[pid];
      if (!target) continue;
      next.points[pid] = { ...target, x: qi(p.x), y: qi(p.y) };
    }
  }

  // H/V/coincident — точное соблюдение после снапа (сетка детерминирована).
  // Двигаем только нефиксированные концы: перетаскиваемая точка стоит.
  for (const c of coincident) {
    const [p1id, p2id] = (c as { points: [string, string] }).points;
    const p1 = next.points[p1id];
    const p2 = next.points[p2id];
    if (!p1 || !p2) continue;
    if (p1.x === p2.x && p1.y === p2.y) continue;
    if (!fixed.has(p2id)) {
      next.points[p2id] = { ...p2, x: p1.x, y: p1.y };
    } else if (!fixed.has(p1id)) {
      next.points[p1id] = { ...p1, x: p2.x, y: p2.y };
    }
  }
  for (const c of hv) {
    if (skippedV.has(c.id)) continue;
    const seg = segmentById(next, (c as { segment: string }).segment);
    if (!seg) continue;
    const a = next.points[seg.a];
    const b = next.points[seg.b];
    if (!a || !b) continue;
    if (c.type === 'horizontal' && b.y !== a.y) {
      if (!fixed.has(seg.b)) next.points[seg.b] = { ...b, y: a.y };
      else if (!fixed.has(seg.a)) next.points[seg.a] = { ...a, y: b.y };
    }
    if (c.type === 'vertical' && b.x !== a.x) {
      if (!fixed.has(seg.b)) next.points[seg.b] = { ...b, x: a.x };
      else if (!fixed.has(seg.a)) next.points[seg.a] = { ...a, x: b.x };
    }
  }
  // Что не сошлось даже после доводки (оба конца зафиксированы
  // врозь и т.п.) — честные конфликты, как раньше.
  for (const c of coincident) {
    const [p1id, p2id] = (c as { points: [string, string] }).points;
    const p1 = next.points[p1id];
    const p2 = next.points[p2id];
    if (p1 && p2 && (p1.x !== p2.x || p1.y !== p2.y)) {
      conflicts.push({
        constraintId: c.id,
        message: `Coincident (${c.id}): точки "${p1id}" и "${p2id}" разошлись.`,
      });
    }
  }
  for (const c of hv) {
    if (skippedV.has(c.id)) continue;
    const seg = segmentById(next, (c as { segment: string }).segment);
    if (!seg) continue;
    const a = next.points[seg.a];
    const b = next.points[seg.b];
    if (!a || !b) continue;
    if (c.type === 'horizontal' && b.y !== a.y) {
      conflicts.push({
        constraintId: c.id,
        message: `Horizontal (${c.id}): сегмент "${seg.id}" не горизонтален.`,
      });
    }
    if (c.type === 'vertical' && b.x !== a.x) {
      conflicts.push({
        constraintId: c.id,
        message: `Vertical (${c.id}): сегмент "${seg.id}" не вертикален.`,
      });
    }
  }

  // Финальная проверка длин с допуском сетки (как раньше).
  for (const c of lengths) {
    const { segment: segId, lengthMm } = c as {
      segment: string;
      lengthMm: number;
    };
    const seg = segmentById(next, segId);
    if (!seg) continue;
    const a = next.points[seg.a];
    const b = next.points[seg.b];
    if (!a || !b) continue;
    const actual = Math.hypot(b.x - a.x, b.y - a.y);
    if (Math.abs(actual - lengthMm) > BASE_GRID_MM) {
      conflicts.push({
        constraintId: c.id,
        message: `Length (${c.id}): сегмент "${segId}" длиной ${Math.round(actual)} мм вместо ${lengthMm} мм.`,
      });
    }
  }

  return { sketch: next, conflicts };
}

/** Квантование float-результата solver: целые мм, сетка 1 см, без -0. */
function qi(value: number): number {
  return snapMm(Math.round(value)) + 0;
}

/** Человекочитаемое описание constraint для отчёта о конфликте. */
function describeSketchConstraint(sketch: Sketch, id: string): string {
  const c = sketch.constraints.find((x) => x.id === id);
  if (!c) return `ограничение "${id}"`;
  if (c.type === 'coincident') {
    return `совпадение "${c.points[0]}"="${c.points[1]}"`;
  }
  if (c.type === 'horizontal') return `горизонталь "${c.segment}"`;
  if (c.type === 'vertical') return `вертикаль "${c.segment}"`;
  return `длина ${c.lengthMm} на "${c.segment}"`;
}

function conflictMessage(sketch: Sketch, id: string): string {
  return `Невыполнимо: ${describeSketchConstraint(sketch, id)} (${id}).`;
}

/**
 * Авто-ось для свежего сегмента (как во FreeCAD): если сырой отрезок шёл
 * чисто вдоль оси — выпрямить конец на ось и вернуть тип фиксации.
 * Уже точный сегмент возвращается как есть. Диагонали и чужие (общие)
 * точки не трогаем: выпрямление двигает только свежую точку b,
 * если разрешено флагом moveB (рисование/замыкание, не соединение).
 * Чистая функция — решение о вкл/Shift принимает вызыватель.
 */
export function sketchAutoAxis(
  sketch: Sketch,
  segmentId: string,
  raw: Vec2,
  opts: { force: boolean; enabled: boolean; moveB: boolean; moveA?: boolean }
): { sketch: Sketch; type: 'horizontal' | 'vertical' } | null {
  if (!opts.force && !opts.enabled) return null;
  const seg = sketch.segments.find((s) => s.id === segmentId);
  const a = seg ? sketch.points[seg.a] : undefined;
  const b = seg ? sketch.points[seg.b] : undefined;
  if (!seg || !a || !b) return null;
  const exact = a.y === b.y ? 'horizontal' : a.x === b.x ? 'vertical' : null;
  if (exact) return { sketch, type: exact };
  // Выпрямление двигает только свежую точку: b при рисовании,
  // a при замыкании (узел, из которого идёт грань). Общие узлы
  // в остальных случаях не трогаем.
  const moveId = opts.moveB ? seg.b : opts.moveA ? seg.a : null;
  if (!moveId) return null;
  // Угол — всегда от начала ребра a к курсору: при замыкании курсор
  // стоит на конце b, и замер от b вырождается в шум.
  const anchor = moveId === seg.b ? a : b;
  const cleanRaw = axisAngleClean(raw, a);
  const clean =
    cleanRaw === 'h' ? 'horizontal' : cleanRaw === 'v' ? 'vertical' : null;
  if (!clean) return null;
  const next = cloneSketch(sketch);
  const nm = next.points[moveId];
  if (!nm) return null;
  if (clean === 'horizontal') nm.y = anchor.y;
  else nm.x = anchor.x;
  return { sketch: next, type: clean };
}

/** Удаление constraint (напр. снятие фиксации перед правкой значения). */ export function sketchRemoveConstraint(
  sketch: Sketch,
  constraintId: string
): SketchResult<Sketch> {
  if (!sketch.constraints.some((c) => c.id === constraintId)) {
    return fail('NOT_FOUND', `Constraint "${constraintId}" не найден.`);
  }
  const next = cloneSketch(sketch);
  next.constraints = next.constraints.filter((c) => c.id !== constraintId);
  return { ok: true, value: next };
}

/** Значок ограничения на канвасе: сегмент + середина + подписи. */
export interface SketchBadge {
  segment: string;
  x: number;
  y: number;
  /** Например ['H'], ['V'], ['H', '6000']. Порядок — как заданы. */
  labels: string[];
}

/**
 * Раскладка значков для рендера (чистая функция — тестируется без three.js).
 * Значок есть у сегмента, на котором висит хоть один constraint.
 */
export function sketchBadges(sketch: Sketch): SketchBadge[] {
  const out: SketchBadge[] = [];
  for (const seg of sketch.segments) {
    const a = sketch.points[seg.a];
    const b = sketch.points[seg.b];
    if (!a || !b) continue;
    const labels: string[] = [];
    for (const c of sketch.constraints) {
      if (c.type === 'horizontal' && c.segment === seg.id) labels.push('H');
      else if (c.type === 'vertical' && c.segment === seg.id) labels.push('V');
      else if (c.type === 'length' && c.segment === seg.id) {
        labels.push(String(c.lengthMm));
      }
    }
    if (labels.length > 0) {
      out.push({
        segment: seg.id,
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
        labels,
      });
    }
  }
  return out;
}

/** Проверка замкнутого контура как будущего помещения/плиты. */
export function validateSketchRoom(sketch: Sketch): SketchError | null {
  const closed = closedStrokes(sketch);
  if (closed.length === 0) {
    return { code: 'BAD_GEOMETRY', message: 'Нет замкнутого контура.' };
  }
  if (closed.length > 1) {
    return {
      code: 'BAD_GEOMETRY',
      message: 'Несколько замкнутых контуров — оставьте один.',
    };
  }
  const outline = sketchOutline(sketch);
  if (!outline) {
    return { code: 'BAD_GEOMETRY', message: 'Нет замкнутого контура.' };
  }
  for (const p of outline) {
    const err = checkOnGrid(p, 'Контур');
    if (err) return err;
  }
  for (const s of sketch.segments) {
    const a = sketch.points[s.a];
    const b = sketch.points[s.b];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < MIN_WALL_LENGTH_MM) {
      return {
        code: 'BAD_GEOMETRY',
        message: `Сегмент "${s.id}" короче ${MIN_WALL_LENGTH_MM} мм.`,
      };
    }
  }
  const ring = openRing(outline);
  if (ring.length < 3) {
    return { code: 'BAD_GEOMETRY', message: 'Нужно минимум 3 точки контура.' };
  }
  if (polygonAreaMm2(ring) < 500_000) {
    return { code: 'BAD_GEOMETRY', message: 'Площадь меньше 0.5 м².' };
  }
  return null;
}

/**
 * Экспорт замкнутого контура в операции стен: по одной addWall на сегмент.
 * Имена стен: `${wallPrefix}1..N` в порядке polyline.
 */
export function sketchToWallOps(
  sketch: Sketch,
  opts: { wallPrefix: string; thicknessMm: number; heightMm: number }
): SketchResult<Operation[]> {
  const invalid = validateSketchRoom(sketch);
  if (invalid) return { ok: false, error: invalid };
  // Стены — только по замкнутому штриху; открытые цепочки в commit не входят.
  const contour = strokeSegments(sketch, closedStrokes(sketch)[0]);
  const ops: Operation[] = contour.map((s, i) => ({
    type: 'addWall',
    wallId: `${opts.wallPrefix}${i + 1}`,
    a: { x: sketch.points[s.a].x, y: sketch.points[s.a].y },
    b: { x: sketch.points[s.b].x, y: sketch.points[s.b].y },
    thicknessMm: opts.thicknessMm,
    heightMm: opts.heightMm,
  }));
  return { ok: true, value: ops };
}

/** Контур для addRoom / upsertSlab (копия точек). */
export function sketchToOutline(sketch: Sketch): SketchResult<Vec2[]> {
  const invalid = validateSketchRoom(sketch);
  if (invalid) return { ok: false, error: invalid };
  const outline = sketchOutline(sketch);
  if (!outline) return fail('BAD_GEOMETRY', 'Контур не замкнут.');
  return { ok: true, value: outline.map((p) => ({ ...p })) };
}
