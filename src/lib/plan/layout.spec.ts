import { describe, expect, it } from 'vitest';
import { sketchToLayoutOps } from '#lib/plan/layout';
import {
  createSketch,
  sketchClose,
  sketchPolylineAdd,
  type Sketch,
} from '#lib/plan/sketch';
import { applyOperation } from '#lib/plan/operations';
import {
  commitDraft,
  createHistory,
  editFeature,
  headState,
  stageOp,
  stateAt,
} from '#lib/plan/history';
import { createEmptyApartment } from '#lib/plan/model';

/** Замкнутый прямоугольник 6×4 м. */
function rectSketch(): Sketch {
  let s = createSketch();
  const pts = [
    ['p1', 0, 0],
    ['p2', 6000, 0],
    ['p3', 6000, 4000],
    ['p4', 0, 4000],
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
  return s;
}

function commitLayoutOps(ops: Parameters<typeof stageOp>[1][], label: string) {
  let h = createHistory();
  for (const op of ops) h = stageOp(h, op);
  const res = commitDraft(h, { stage: 'layout', label });
  expect(res.ok).toBe(true);
  if (!res.ok) throw new Error('commit failed');
  return res.history;
}

describe('layout: контур → одна Feature', () => {
  it('даёт стены + помещение + пол и потолок', () => {
    const r = sketchToLayoutOps(rectSketch(), { roomName: 'Гостиная' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const types = r.value.map((op) => op.type);
    expect(types.filter((t) => t === 'addWall')).toHaveLength(4);
    expect(types).toContain('addRoom');
    expect(types.filter((t) => t === 'upsertSlab')).toHaveLength(2);

    const room = r.value.find((op) => op.type === 'addRoom');
    expect(room).toMatchObject({
      roomId: 'r1',
      name: 'Гостиная',
      wallIds: ['w1', 'w2', 'w3', 'w4'],
    });
    const slabs = r.value.filter((op) => op.type === 'upsertSlab');
    expect(slabs).toMatchObject([
      { slabId: 'floor1', kind: 'floor', levelMm: 0 },
      { slabId: 'ceil1', kind: 'ceiling', levelMm: 2700 },
    ]);
  });

  it('применяется целиком и коммитится как Feature 1', () => {
    const r = sketchToLayoutOps(rectSketch(), { roomName: 'Гостиная' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const history = commitLayoutOps(r.value, 'Планировка: Гостиная');
    expect(history.features).toHaveLength(1);
    expect(history.features[0].stage).toBe('layout');

    const state = headState(history);
    expect(Object.keys(state.walls)).toHaveLength(4);
    expect(state.rooms['r1'].name).toBe('Гостиная');
    expect(state.slabs['floor1'].kind).toBe('floor');
    expect(state.slabs['ceil1'].levelMm).toBe(2700);
    // Стена знает хозяина? Нет — наоборот: комната ссылается на стены.
    expect(state.rooms['r1'].wallIds).toEqual(['w1', 'w2', 'w3', 'w4']);
  });

  it('пустое имя и незамкнутый контур отклоняются до commit', () => {
    expect(sketchToLayoutOps(rectSketch(), { roomName: '  ' }).ok).toBe(false);
    expect(sketchToLayoutOps(createSketch(), { roomName: 'Кладовка' }).ok).toBe(
      false
    );
  });

  it('изменение контура пересчитывает Feature через editFeature', () => {
    const first = sketchToLayoutOps(rectSketch(), { roomName: 'Гостиная' });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const history = commitLayoutOps(first.value, 'Планировка');

    // Новый контур 3×4 м — те же id, replay с нуля.
    let small = createSketch();
    const pts = [
      ['p1', 0, 0],
      ['p2', 3000, 0],
      ['p3', 3000, 4000],
      ['p4', 0, 4000],
    ] as const;
    let n = 0;
    for (const [pid, x, y] of pts) {
      const r = sketchPolylineAdd(
        small,
        pid,
        { x, y },
        pid === 'p1' ? null : `s${(n += 1)}`
      );
      expect(r.ok).toBe(true);
      if (r.ok) small = r.value.sketch;
    }
    const closed = sketchClose(small, 's4');
    expect(closed.ok).toBe(true);
    if (closed.ok) small = closed.value;

    const second = sketchToLayoutOps(small, { roomName: 'Гостиная' });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    const edited = editFeature(history, 0, second.value);
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    expect(edited.result.conflicts).toEqual([]);
    expect(edited.result.state.walls['w2'].b).toEqual({ x: 3000, y: 4000 });
    expect(stateAt(edited.result.history, 0).state.rooms['r1']).toBeDefined();
  });

  it('битый набор не портит историю (атомарность commit)', () => {
    let state = createEmptyApartment();
    const good = sketchToLayoutOps(rectSketch(), { roomName: 'Гостиная' });
    expect(good.ok).toBe(true);
    if (!good.ok) return;
    for (const op of good.value) {
      const res = applyOperation(state, op);
      expect(res.ok).toBe(true);
      if (res.ok) state = res.state;
    }
    // Дубль тех же id поверх — ID_TAKEN, состояние не мутировало.
    const dup = applyOperation(state, good.value[0]);
    expect(dup.ok).toBe(false);
    expect(Object.keys(state.walls)).toHaveLength(4);
  });
});
