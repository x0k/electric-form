import { describe, expect, it } from 'vitest';
import {
  commitDraft,
  createHistory,
  editFeature,
  headState,
  historyFromJSON,
  historyToJSON,
  stageOp,
  stateAt,
} from '#lib/plan/history';
import type { Operation } from '#lib/plan/operations';
import type { Sketch } from '#lib/plan/sketch';

const WALLS: Operation[] = [
  {
    type: 'addWall',
    wallId: 'w1',
    a: { x: 0, y: 0 },
    b: { x: 6000, y: 0 },
    thicknessMm: 200,
    heightMm: 2700,
  },
  {
    type: 'addWall',
    wallId: 'w2',
    a: { x: 6000, y: 0 },
    b: { x: 6000, y: 4000 },
    thicknessMm: 200,
    heightMm: 2700,
  },
];

const ROOM: Operation[] = [
  {
    type: 'addRoom',
    roomId: 'r1',
    name: 'Гостиная',
    outline: [
      { x: 0, y: 0 },
      { x: 6000, y: 0 },
      { x: 6000, y: 4000 },
      { x: 0, y: 4000 },
    ],
    wallIds: ['w1', 'w2'],
  },
];

function commitOps(
  ops: Operation[],
  label: string,
  stage: 'layout' = 'layout'
) {
  let h = createHistory();
  for (const op of ops) h = stageOp(h, op);
  const res = commitDraft(
    h,
    { stage, label },
    () => '2026-01-01T00:00:00.000Z'
  );
  expect(res.ok).toBe(true);
  if (!res.ok) throw new Error('commit failed');
  return res.history;
}

describe('feature history', () => {
  it('черновик не меняет закоммиченное состояние до Commit', () => {
    let h = commitOps(WALLS, 'Контур и стены');
    expect(Object.keys(headState(h).walls)).toHaveLength(2);
    h = stageOp(h, {
      type: 'addWall',
      wallId: 'w3',
      a: { x: 0, y: 0 },
      b: { x: 1000, y: 0 },
      thicknessMm: 120,
      heightMm: 2700,
    });
    // Голова не двигается, пока нет Commit.
    expect(Object.keys(headState(h).walls)).toHaveLength(2);
    expect(h.draft).toHaveLength(1);
  });

  it('Commit превращает черновик в одну неделимую Feature', () => {
    let h = createHistory();
    for (const op of WALLS) h = stageOp(h, op);
    const res = commitDraft(
      h,
      { stage: 'layout', label: 'Планировка помещения' },
      () => '2026-01-01T00:00:00.000Z'
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.feature.index).toBe(0);
    expect(res.feature.ops).toHaveLength(2);
    expect(res.history.features).toHaveLength(1);
    expect(res.history.draft).toHaveLength(0);
  });

  it('битый черновик отклоняется целиком, история не меняется', () => {
    let h = commitOps(WALLS, 'Контур');
    h = stageOp(h, {
      type: 'addWall',
      wallId: 'w1',
      a: { x: 0, y: 0 },
      b: { x: 1000, y: 0 },
      thicknessMm: 120,
      heightMm: 2700,
    });
    const res = commitDraft(h, { stage: 'layout', label: 'Дубль' });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('ID_TAKEN');
      expect(res.opIndex).toBe(0);
    }
  });

  it('выбор Feature показывает состояние на этот коммит', () => {
    let h = commitOps(WALLS, 'Feature 1');
    // Вторая feature поверх первой.
    for (const op of ROOM) h = stageOp(h, op);
    const c2 = commitDraft(h, { stage: 'layout', label: 'Feature 2' });
    expect(c2.ok).toBe(true);
    if (!c2.ok) return;
    h = c2.history;
    expect(Object.keys(stateAt(h, 0).state.rooms)).toHaveLength(0);
    expect(Object.keys(stateAt(h, 1).state.rooms)).toHaveLength(1);
    expect(Object.keys(stateAt(h, 1).state.walls)).toHaveLength(2);
  });

  it('изменение Feature 2 пересчитывает Feature 3, конфликт фиксируется', () => {
    // F1: стены w1..w4. F2: комната на w1,w2. F3: окно на w2.
    const h = commitOps(
      [
        {
          type: 'addWall',
          wallId: 'w1',
          a: { x: 0, y: 0 },
          b: { x: 6000, y: 0 },
          thicknessMm: 200,
          heightMm: 2700,
        },
        {
          type: 'addWall',
          wallId: 'w2',
          a: { x: 6000, y: 0 },
          b: { x: 6000, y: 4000 },
          thicknessMm: 200,
          heightMm: 2700,
        },
      ],
      'Feature 1'
    );
    let h2 = h;
    for (const op of ROOM) h2 = stageOp(h2, op);
    const c2 = commitDraft(h2, { stage: 'layout', label: 'Feature 2' });
    expect(c2.ok).toBe(true);
    if (!c2.ok) return;
    h2 = c2.history;
    const c3 = commitDraft(
      stageOp(h2, {
        type: 'placeObject',
        objectId: 'win1',
        kind: 'window',
        label: 'Окно #1',
        hostId: 'w2',
      }),
      { stage: 'layout', label: 'Feature 3' }
    );
    expect(c3.ok).toBe(true);
    if (!c3.ok) return;
    h2 = c3.history;

    // Меняем Feature 2: комната теперь ссылается только на w1.
    // Окно из Feature 3 висит на w2 — само по себе живо, но проверим
    // конфликтный сценарий: удаляем w2 каскадом из Feature 1.
    const edited = editFeature(h2, 0, [
      {
        type: 'addWall',
        wallId: 'w1',
        a: { x: 0, y: 0 },
        b: { x: 6000, y: 0 },
        thicknessMm: 200,
        heightMm: 2700,
      },
      // w2 больше не создаётся → downstream посыпется.
    ]);
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    // F2 (комната на w1,w2) и F3 (окно на w2) конфликтуют.
    expect(edited.result.conflicts.length).toBeGreaterThanOrEqual(2);
    expect(edited.result.conflicts.some((c) => c.featureIndex === 1)).toBe(
      true
    );
    expect(edited.result.conflicts.some((c) => c.featureIndex === 2)).toBe(
      true
    );
    // История при этом не роняется: голова пересчитана best-effort.
    expect(edited.result.history.features).toHaveLength(3);
  });

  it('сериализация истории переживает round-trip', () => {
    const h = commitOps(WALLS, 'Контур');
    const json = historyToJSON(h);
    const restored = historyFromJSON(json);
    expect(restored.features).toHaveLength(1);
    expect(Object.keys(headState(restored).walls)).toHaveLength(2);
    // Пустые черновики тоже переживают round-trip.
    expect(restored.draft).toEqual([]);
  });

  it('снапшот скетча едет через commit/edit/JSON', () => {
    const sketch: Sketch = {
      points: {
        p1: { id: 'p1', x: 0, y: 0 },
        p2: { id: 'p2', x: 6000, y: 0 },
      },
      segments: [{ id: 's1', a: 'p1', b: 'p2', stroke: 1 }],
      constraints: [{ id: 'c1', type: 'horizontal', segment: 's1' }],
    };
    let h = createHistory();
    for (const op of WALLS) h = stageOp(h, op);
    const c = commitDraft(
      h,
      { stage: 'layout', label: 'Контур', sketch },
      () => '2026-01-01T00:00:00.000Z'
    );
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(c.history.features[0].sketch).toMatchObject({
      segments: [{ id: 's1' }],
      constraints: [{ id: 'c1' }],
    });

    // Правка без скетча снапшот не трогает, со скетчем — обновляет.
    const e1 = editFeature(c.history, 0, WALLS);
    expect(e1.ok).toBe(true);
    if (!e1.ok) return;
    expect(e1.result.history.features[0].sketch).toMatchObject({
      constraints: [{ id: 'c1' }],
    });
    const e2 = editFeature(c.history, 0, WALLS, null);
    expect(e2.ok).toBe(true);
    if (!e2.ok) return;
    expect(e2.result.history.features[0].sketch).toBeNull();

    // JSON round-trip снапшот не теряет.
    const restored = historyFromJSON(historyToJSON(c.history));
    expect(restored.features[0].sketch).toMatchObject({
      segments: [{ id: 's1' }],
    });
  });
});
