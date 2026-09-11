import { beforeAll, describe, expect, it } from 'vitest';
import { ensureGcsLoaded } from '#lib/plan/gcs';
import {
  closedStrokes,
  closingStrokeAtPoint,
  createSketch,
  isSketchClosed,
  isStrokeClosed,
  sketchAddConstraint,
  sketchAddPoint,
  sketchAddSegment,
  sketchAutoAxis,
  sketchBadges,
  sketchClose,
  sketchDeletePoint,
  sketchDeleteSegment,
  sketchFromOutline,
  sketchMovePoint,
  sketchMoveSegment,
  sketchOutline,
  sketchPolylineAdd,
  sketchRemoveConstraint,
  sketchSolve,
  sketchToOutline,
  sketchToWallOps,
  strokeIds,
  validateSketchRoom,
} from '#lib/plan/sketch';

/** Прямоугольник 6×4 м как polyline: p1→p2→p3→p4→p1. */
function rectSketch() {
  let s = createSketch();
  const pts = [
    ['p1', 0, 0],
    ['p2', 6000, 0],
    ['p3', 6000, 4000],
    ['p4', 0, 4000],
  ] as const;
  let segN = 0;
  for (const [pid, x, y] of pts) {
    const isFirst = pid === 'p1';
    const r = sketchPolylineAdd(
      s,
      pid,
      { x, y },
      isFirst ? null : `s${(segN += 1)}`
    );
    expect(r.ok).toBe(true);
    if (r.ok) s = r.value.sketch;
  }
  const closed = sketchClose(s, 's4');
  expect(closed.ok).toBe(true);
  if (closed.ok) s = closed.value;
  return s;
}

// Численный solver грузится один раз на файл (WASM, ~десятки мс).
beforeAll(async () => {
  await ensureGcsLoaded();
});

describe('sketch: polyline', () => {
  it('строит замкнутый контур из 4 точек', () => {
    const s = rectSketch();
    expect(isSketchClosed(s)).toBe(true);
    expect(sketchOutline(s)).toEqual([
      { x: 0, y: 0 },
      { x: 6000, y: 0 },
      { x: 6000, y: 4000 },
      { x: 0, y: 4000 },
    ]);
  });

  it('незакнутый контур не даёт outline', () => {
    let s = createSketch();
    for (const [pid, x] of [
      ['p1', 0],
      ['p2', 6000],
    ] as const) {
      const r = sketchPolylineAdd(
        s,
        pid,
        { x, y: 0 },
        pid === 'p1' ? null : 's1'
      );
      expect(r.ok).toBe(true);
      if (r.ok) s = r.value.sketch;
    }
    expect(isSketchClosed(s)).toBe(false);
    expect(sketchOutline(s)).toBeNull();
  });

  it('точка вне сетки 1 см отклоняется', () => {
    const r = sketchAddPoint(createSketch(), 'p1', { x: 6005, y: 0 });
    expect(r.ok).toBe(false);
  });

  it('повторное замыкание — конфликт', () => {
    const s = rectSketch();
    expect(sketchClose(s, 's5').ok).toBe(false);
  });

  it('sketchMoveSegment едет жёстко, сохраняя ограничения', () => {
    let s = rectSketch();
    const h = sketchAddConstraint(s, {
      id: 'h',
      type: 'horizontal',
      segment: 's1',
    });
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    s = h.value;
    const l = sketchAddConstraint(s, {
      id: 'l',
      type: 'length',
      segment: 's1',
      lengthMm: 6000,
    });
    expect(l.ok).toBe(true);
    if (!l.ok) return;
    s = l.value;
    // Перенос s1 (p1→p2, низ) на +1000 по x: H и длина целы, конфликтов нет.
    const r = sketchMoveSegment(s, 's1', { x: 1000, y: 0 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.conflicts).toEqual([]);
    expect(r.value.sketch.points['p1']).toMatchObject({ x: 1000, y: 0 });
    expect(r.value.sketch.points['p2']).toMatchObject({ x: 7000, y: 0 });
  });

  it('sketchMoveSegment тянет приклеенного соседа за собой', () => {
    let s = createSketch();
    for (const [pid, x] of [
      ['p1', 0],
      ['p2', 2000],
    ] as const) {
      const r = sketchAddPoint(s, pid, { x, y: 0 });
      expect(r.ok).toBe(true);
      if (r.ok) s = r.value;
    }
    const seg = sketchAddSegment(s, 's1', 'p1', 'p2');
    expect(seg.ok).toBe(true);
    if (seg.ok) s = seg.value;
    // p3 приклеена к p2 (вторая в паре — следует).
    const p3 = sketchAddPoint(s, 'p3', { x: 2000, y: 0 });
    expect(p3.ok).toBe(true);
    if (p3.ok) s = p3.value;
    const c = sketchAddConstraint(s, {
      id: 'c1',
      type: 'coincident',
      points: ['p2', 'p3'],
    });
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    s = c.value;
    const r = sketchMoveSegment(s, 's1', { x: 500, y: 0 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.sketch.points['p2']).toMatchObject({ x: 2500, y: 0 });
    expect(r.value.sketch.points['p3']).toMatchObject({ x: 2500, y: 0 });
  });

  it('sketchMoveSegment отклоняет мусор', () => {
    const s = rectSketch();
    expect(sketchMoveSegment(s, 'ghost', { x: 10, y: 0 }).ok).toBe(false);
    expect(sketchMoveSegment(s, 's1', { x: 0.5, y: 0 }).ok).toBe(false);
  });
});

describe('sketch: constraints', () => {
  it('horizontal держит сегмент горизонтально при drag', () => {
    let s = rectSketch();
    const c = sketchAddConstraint(s, {
      id: 'c1',
      type: 'horizontal',
      segment: 's1',
    });
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    s = c.value;
    // Тянем p2 вверх на 500 мм: точка стоит, начало едет следом,
    // горизонталь держится.
    const moved = sketchMovePoint(s, 'p2', { x: 6000, y: 500 });
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.value.conflicts).toEqual([]);
    expect(moved.value.sketch.points['p2']).toMatchObject({ x: 6000, y: 500 });
    expect(moved.value.sketch.points['p1'].y).toBe(500);
  });

  it('vertical держит сегмент вертикально при drag', () => {
    let s = rectSketch();
    const c = sketchAddConstraint(s, {
      id: 'c1',
      type: 'vertical',
      segment: 's2',
    });
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    s = c.value;
    const moved = sketchMovePoint(s, 'p3', { x: 6500, y: 4000 });
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.value.sketch.points['p3']).toMatchObject({
      x: 6500,
      y: 4000,
    });
    expect(moved.value.sketch.points['p2'].x).toBe(6500);
  });

  it('length держит длину сегмента', () => {
    let s = createSketch();
    for (const [pid, x] of [
      ['p1', 0],
      ['p2', 6000],
    ] as const) {
      const r = sketchPolylineAdd(
        s,
        pid,
        { x, y: 0 },
        pid === 'p1' ? null : 's1'
      );
      expect(r.ok).toBe(true);
      if (r.ok) s = r.value.sketch;
    }
    const c = sketchAddConstraint(s, {
      id: 'c1',
      type: 'length',
      segment: 's1',
      lengthMm: 6000,
    });
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    s = c.value;
    // Тянем конец ближе — перетаскиваемая точка стоит,
    // второй конец отъезжает, длина держится.
    const moved = sketchMovePoint(s, 'p2', { x: 5000, y: 0 });
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.value.sketch.points['p2']).toMatchObject({ x: 5000, y: 0 });
    expect(moved.value.sketch.points['p1']).toMatchObject({ x: -1000, y: 0 });
  });

  it('coincident склеивает две точки', () => {
    let s = createSketch();
    const r1 = sketchAddPoint(s, 'p1', { x: 0, y: 0 });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    s = r1.value;
    const r2 = sketchAddPoint(s, 'p2', { x: 1000, y: 0 });
    expect(r2.ok).toBe(true);
    if (r2.ok) s = r2.value;
    const c = sketchAddConstraint(s, {
      id: 'c1',
      type: 'coincident',
      points: ['p1', 'p2'],
    });
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(c.value.points['p2']).toMatchObject({ x: 0, y: 0 });
  });

  it('horizontal + vertical на одном сегменте — конфликт', () => {
    let s = rectSketch();
    const h = sketchAddConstraint(s, {
      id: 'h',
      type: 'horizontal',
      segment: 's1',
    });
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    s = h.value;
    const v = sketchAddConstraint(s, {
      id: 'v',
      type: 'vertical',
      segment: 's1',
    });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error.code).toBe('CONFLICT');
  });

  it('длина не кратная сетке отклоняется', () => {
    const s = rectSketch();
    const r = sketchAddConstraint(s, {
      id: 'c',
      type: 'length',
      segment: 's1',
      lengthMm: 6005,
    });
    expect(r.ok).toBe(false);
  });

  it('solver возвращает конфликты, а не роняет скетч', () => {
    // Вручную собираем H+V через solve (минуя guard addConstraint).
    let s = rectSketch();
    const withH = sketchAddConstraint(s, {
      id: 'h',
      type: 'horizontal',
      segment: 's1',
    });
    expect(withH.ok).toBe(true);
    if (!withH.ok) return;
    s = {
      ...withH.value,
      constraints: [
        ...withH.value.constraints,
        { id: 'v', type: 'vertical', segment: 's1' },
      ],
    };
    const solved = sketchSolve(s);
    expect(solved.conflicts.length).toBeGreaterThanOrEqual(1);
    // Скетч при этом цел.
    expect(Object.keys(solved.sketch.points)).toHaveLength(4);
  });

  it('segment с несуществующей точкой отклоняется', () => {
    let s = createSketch();
    const r = sketchAddPoint(s, 'p1', { x: 0, y: 0 });
    expect(r.ok).toBe(true);
    if (r.ok) s = r.value;
    expect(sketchAddSegment(s, 's1', 'p1', 'ghost').ok).toBe(false);
  });
});

describe('sketch: экспорт в домен', () => {
  it('валидный контур проходит проверку помещения', () => {
    expect(validateSketchRoom(rectSketch())).toBeNull();
  });

  it('крошечный контур не проходит', () => {
    let s = createSketch();
    const pts = [
      ['p1', 0, 0],
      ['p2', 500, 0],
      ['p3', 500, 500],
      ['p4', 0, 500],
    ] as const;
    let n = 0;
    for (const [pid, x, y] of pts) {
      const r = sketchPolylineAdd(
        s,
        pid,
        { x, y },
        pid === 'p1' ? null : `s${(n += 1)}`
      );
      expect(r.ok).toBe(true);
      if (r.ok) s = r.value.sketch;
    }
    const closed = sketchClose(s, 's4');
    expect(closed.ok).toBe(true);
    if (closed.ok) s = closed.value;
    expect(validateSketchRoom(s)?.code).toBe('BAD_GEOMETRY');
    expect(sketchToOutline(s).ok).toBe(false);
  });

  it('экспорт в стены: 4 addWall по порядку', () => {
    const r = sketchToWallOps(rectSketch(), {
      wallPrefix: 'w',
      thicknessMm: 200,
      heightMm: 2700,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toHaveLength(4);
    expect(r.value[0]).toMatchObject({ type: 'addWall', wallId: 'w1' });
    expect(r.value[3]).toMatchObject({ type: 'addWall', wallId: 'w4' });
  });

  it('sketchFromOutline восстанавливает замкнутый черновик из контура', () => {
    const outline = [
      { x: 0, y: 0 },
      { x: 6000, y: 0 },
      { x: 6000, y: 4000 },
      { x: 0, y: 4000 },
    ];
    const r = sketchFromOutline(outline);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(isSketchClosed(r.value)).toBe(true);
    expect(Object.keys(r.value.points)).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(sketchOutline(r.value)).toEqual(outline);
  });

  it('sketchFromOutline отклоняет короткий и вне-сеточный контур', () => {
    expect(sketchFromOutline([{ x: 0, y: 0 }]).ok).toBe(false);
    expect(
      sketchFromOutline([
        { x: 0, y: 0 },
        { x: 6000, y: 0 },
        { x: 6005, y: 4000 },
      ]).ok
    ).toBe(false);
  });

  it('closingStrokeAtPoint: какой штрих замыкает клик по точке', () => {
    const s = rectSketch();
    expect(closingStrokeAtPoint(s, 'p1')).toBe(0);
    expect(closingStrokeAtPoint(s, 'p2')).toBeNull();
    expect(closingStrokeAtPoint(createSketch(), 'p1')).toBeNull();
  });

  it('второй штрих живёт независимо и не ломает первый', () => {
    let s = rectSketch();
    expect(isStrokeClosed(s, 0)).toBe(true);
    // Открытая цепочка в штрихе 1.
    for (const [pid, x, y] of [
      ['q1', 10000, 0],
      ['q2', 12000, 0],
      ['q3', 12000, 2000],
    ] as const) {
      const prev = pid === 'q1' ? null : pid === 'q2' ? 'q1' : 'q2';
      const r = sketchAddPoint(s, pid, { x, y });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      s = r.value;
      if (prev) {
        const seg = sketchAddSegment(s, `t${pid}`, prev, pid, 1);
        expect(seg.ok).toBe(true);
        if (!seg.ok) return;
        s = seg.value;
      }
    }
    expect(strokeIds(s)).toEqual([0, 1]);
    expect(isStrokeClosed(s, 1)).toBe(false);
    expect(isSketchClosed(s)).toBe(true);
    expect(closedStrokes(s)).toEqual([0]);
    // Замыкание второго штриха — по ЕГО первой точке.
    expect(closingStrokeAtPoint(s, 'q1')).toBe(1);
    const closed = sketchClose(s, 'tq', 1);
    expect(closed.ok).toBe(true);
    if (!closed.ok) return;
    s = closed.value;
    expect(closedStrokes(s)).toEqual([0, 1]);
    // Два замкнутых — outline не выбирает, commit требует один.
    expect(sketchOutline(s)).toBeNull();
    expect(sketchToOutline(s).ok).toBe(false);
  });

  it('удаление узла режет инцидентные грани и чистит constraints', () => {
    let s = rectSketch();
    const h = sketchAddConstraint(s, {
      id: 'h',
      type: 'horizontal',
      segment: 's1',
    });
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    s = h.value;
    const r = sketchDeletePoint(s, 'p2');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    s = r.value;
    expect(Object.keys(s.points).sort()).toEqual(['p1', 'p3', 'p4']);
    // s1 (p1-p2) и s2 (p2-p3) ушли вместе с horizontal на s1.
    expect(s.segments.map((x) => x.id).sort()).toEqual(['s3', 's4']);
    expect(s.constraints).toEqual([]);
    expect(isSketchClosed(s)).toBe(false);
  });

  it('удаление грани оставляет точки и режет только её constraints', () => {
    let s = rectSketch();
    const h = sketchAddConstraint(s, {
      id: 'h',
      type: 'horizontal',
      segment: 's1',
    });
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    s = h.value;
    const r = sketchDeleteSegment(s, 's1');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    s = r.value;
    expect(Object.keys(s.points)).toHaveLength(4);
    expect(s.segments.map((x) => x.id).sort()).toEqual(['s2', 's3', 's4']);
    expect(s.constraints).toEqual([]);
    expect(isSketchClosed(s)).toBe(false);
  });

  it('удаление грани уносит висячие концы, общие оставляет', () => {
    // Открытая цепочка p1-p2-p3: удаление s2 оставляет p1-p2 и сносит p3.
    let s = createSketch();
    for (const [pid, x] of [
      ['p1', 0],
      ['p2', 2000],
      ['p3', 4000],
    ] as const) {
      const prev = pid === 'p1' ? null : pid === 'p2' ? 'p1' : 'p2';
      const r = sketchAddPoint(s, pid, { x, y: 0 });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      s = r.value;
      if (prev) {
        const seg = sketchAddSegment(s, `s${pid}`, prev, pid);
        expect(seg.ok).toBe(true);
        if (!seg.ok) return;
        s = seg.value;
      }
    }
    const gone = sketchDeleteSegment(s, 'sp3');
    expect(gone.ok).toBe(true);
    if (!gone.ok) return;
    expect(Object.keys(gone.value.points).sort()).toEqual(['p1', 'p2']);
    expect(gone.value.segments.map((x) => x.id)).toEqual(['sp2']);
  });

  it('удаление грани чистит coincident висячих точек', () => {
    let s = createSketch();
    for (const pid of ['p1', 'p2']) {
      const r = sketchAddPoint(s, pid, { x: pid === 'p1' ? 0 : 1000, y: 0 });
      expect(r.ok).toBe(true);
      if (r.ok) s = r.value;
    }
    const seg = sketchAddSegment(s, 's1', 'p1', 'p2');
    expect(seg.ok).toBe(true);
    if (seg.ok) s = seg.value;
    const c = sketchAddConstraint(s, {
      id: 'c1',
      type: 'coincident',
      points: ['p1', 'p2'],
    });
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    const del = sketchDeleteSegment(c.value, 's1');
    expect(del.ok).toBe(true);
    if (!del.ok) return;
    // Обе точки висели только на s1: ушли вместе с ограничением.
    expect(Object.keys(del.value.points)).toEqual([]);
    expect(del.value.constraints).toEqual([]);
  });

  it('удаление несуществующего узла/грани — NOT_FOUND', () => {
    const s = rectSketch();
    expect(sketchDeletePoint(s, 'ghost').ok).toBe(false);
    expect(sketchDeleteSegment(s, 'ghost').ok).toBe(false);
  });

  it('sketchBadges: значки H/V/длина в серединах граней', () => {
    let s = rectSketch();
    expect(sketchBadges(s)).toEqual([]);
    const h = sketchAddConstraint(s, {
      id: 'h',
      type: 'horizontal',
      segment: 's1',
    });
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    s = h.value;
    const v = sketchAddConstraint(s, {
      id: 'v',
      type: 'vertical',
      segment: 's2',
    });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    s = v.value;
    const l = sketchAddConstraint(s, {
      id: 'l',
      type: 'length',
      segment: 's1',
      lengthMm: 6000,
    });
    expect(l.ok).toBe(true);
    if (!l.ok) return;
    s = l.value;
    expect(sketchBadges(s)).toEqual([
      { segment: 's1', x: 3000, y: 0, labels: ['H', '6000'] },
      { segment: 's2', x: 6000, y: 2000, labels: ['V'] },
    ]);
  });

  it('sketchRemoveConstraint снимает фиксацию', () => {
    let s = rectSketch();
    const h = sketchAddConstraint(s, {
      id: 'h',
      type: 'horizontal',
      segment: 's1',
    });
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    s = h.value;
    expect(sketchBadges(s)).toHaveLength(1);
    const r = sketchRemoveConstraint(s, 'h');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.constraints).toEqual([]);
    expect(sketchBadges(r.value)).toEqual([]);
    expect(sketchRemoveConstraint(s, 'ghost').ok).toBe(false);
  });

  it('sketchAutoAxis выпрямляет почти-прямую и возвращает ось', () => {
    // Диагональ 2000×100 (2.9°): сырая почти горизонталь.
    let s = createSketch();
    for (const [pid, x, y] of [
      ['p1', 0, 0],
      ['p2', 2000, 100],
    ] as const) {
      const prev = pid === 'p1' ? null : 'p1';
      const r = sketchAddPoint(s, pid, { x, y });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      s = r.value;
      if (prev) {
        const seg = sketchAddSegment(s, 's1', prev, pid);
        expect(seg.ok).toBe(true);
        if (!seg.ok) return;
        s = seg.value;
      }
    }
    const fixed = sketchAutoAxis(
      s,
      's1',
      { x: 2000, y: 100 },
      { force: false, enabled: true, moveB: true }
    );
    expect(fixed).not.toBeNull();
    expect(fixed!.type).toBe('horizontal');
    // Конец лёг на ось через начало, сетка цела.
    expect(fixed!.sketch.points['p2']).toEqual({ id: 'p2', x: 2000, y: 0 });
    expect(fixed!.sketch.points['p1']).toEqual({ id: 'p1', x: 0, y: 0 });
  });

  it('sketchAutoAxis не трогает диагонали, чужие точки и выкл', () => {
    let s = createSketch();
    for (const [pid, x, y] of [
      ['p1', 0, 0],
      ['p2', 2000, 2000],
    ] as const) {
      const prev = pid === 'p1' ? null : 'p1';
      const r = sketchAddPoint(s, pid, { x, y });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      s = r.value;
      if (prev) {
        const seg = sketchAddSegment(s, 's1', prev, pid);
        expect(seg.ok).toBe(true);
        if (!seg.ok) return;
        s = seg.value;
      }
    }
    const raw = { x: 2000, y: 2000 };
    // Диагональ 45° — мимо даже со straighten.
    expect(
      sketchAutoAxis(s, 's1', raw, { force: false, enabled: true, moveB: true })
    ).toBeNull();
    // Выключено — мимо всегда.
    expect(
      sketchAutoAxis(
        s,
        's1',
        { x: 2000, y: 10 },
        { force: false, enabled: false, moveB: true }
      )
    ).toBeNull();
    // Нет сегмента — null.
    expect(
      sketchAutoAxis(s, 'ghost', raw, {
        force: true,
        enabled: true,
        moveB: true,
      })
    ).toBeNull();
  });

  it('sketchAutoAxis отдаёт точный сегмент как есть', () => {
    const s = rectSketch();
    const r = sketchAutoAxis(
      s,
      's1',
      { x: 6000, y: 0 },
      { force: false, enabled: true, moveB: true }
    );
    expect(r).not.toBeNull();
    expect(r!.type).toBe('horizontal');
    expect(r!.sketch).toBe(s);
  });

  it('sketchAutoAxis тянет начало при замыкании (moveA)', () => {
    // Замыкающая грань p3(100,3000)→p1(0,0): клик стоит на p1,
    // поэтому угол меряем от p3 — иначе вырождение в шум.
    let s = createSketch();
    const pts = [
      ['p1', 0, 0],
      ['p2', 4000, 0],
      ['p3', 100, 3000],
    ] as const;
    for (const [pid, x, y] of pts) {
      const prev = pid === 'p1' ? null : pid === 'p2' ? 'p1' : 'p2';
      const r = sketchAddPoint(s, pid, { x, y });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      s = r.value;
      if (prev) {
        const seg = sketchAddSegment(s, `s${pid}`, prev, pid);
        expect(seg.ok).toBe(true);
        if (!seg.ok) return;
        s = seg.value;
      }
    }
    const closed = sketchClose(s, 's4');
    expect(closed.ok).toBe(true);
    if (!closed.ok) return;
    s = closed.value;
    // Без moveA — только точные: s4 диагональ, мимо.
    expect(
      sketchAutoAxis(
        s,
        's4',
        { x: 0, y: 0 },
        { force: false, enabled: true, moveB: false }
      )
    ).toBeNull();
    // Клик ровно в p1 (вырожденный raw): угол от p3 всё равно чистый.
    for (const raw of [
      { x: 0, y: 0 },
      { x: 3, y: -2 },
    ] as const) {
      const fixed = sketchAutoAxis(
        s,
        's4',
        { ...raw },
        { force: false, enabled: true, moveB: false, moveA: true }
      );
      expect(fixed).not.toBeNull();
      expect(fixed!.type).toBe('vertical');
      expect(fixed!.sketch.points['p3'].x).toBe(0);
      // Начало p1 не тронуто.
      expect(fixed!.sketch.points['p1']).toEqual({ id: 'p1', x: 0, y: 0 });
    }
  });
});
