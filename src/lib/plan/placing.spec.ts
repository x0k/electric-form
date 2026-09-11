import { describe, expect, it } from 'vitest';
import { applyOperation } from '#lib/plan/operations';
import { buildSampleFlat } from '#lib/plan/sample';
import {
  depthFromWall,
  moveObject,
  placeElecPoint,
  placeFloorObject,
  placeLuminaire,
  placeOpening,
  placeWallObject,
  projectAlong,
  resizeObject,
  roomAt,
  uniqueId,
} from '#lib/plan/placing';

describe('placing: хит канваса → параметрический якорь', () => {
  it('проекция и глубина считаются от геометрии стены', () => {
    const s = buildSampleFlat();
    expect(projectAlong(s.walls['w1'], { x: 1234, y: 999 })).toBeCloseTo(1234);
    expect(projectAlong(s.walls['w2'], { x: 5999, y: 2500 })).toBeCloseTo(2500);
    // Точка в метре от внутренней грани w1 (толщина 200 → ось y=0).
    expect(depthFromWall(s, s.walls['w1'], { x: 3000, y: 1000 })).toBeCloseTo(
      900
    );
    expect(roomAt(s, { x: 3000, y: 2000 })?.id).toBe('r1');
    expect(roomAt(s, { x: 9000, y: 9000 })).toBeNull();
  });

  it('клик по полу — якорь к помещению, клик по стене — к стене', () => {
    const s = buildSampleFlat();
    const floor = placeFloorObject(
      s,
      { plan: { x: 3003, y: 2007 } },
      { kind: 'wardrobe' }
    );
    expect(floor.ok).toBe(true);
    if (!floor.ok) return;
    expect(floor.op).toMatchObject({
      type: 'addFloorObject',
      anchor: { type: 'room', roomId: 'r1', xMm: 3000, yMm: 2010 },
    });

    const wall = placeFloorObject(
      s,
      { plan: { x: 2997, y: 40 }, wallId: 'w1' },
      { kind: 'wardrobe' }
    );
    expect(wall.ok).toBe(true);
    if (!wall.ok) return;
    expect(wall.op).toMatchObject({
      type: 'addFloorObject',
      anchor: { type: 'wall', wallId: 'w1', alongMm: 3000, fromWallMm: 0 },
    });
  });

  it('мимо помещения и не тем слоем — честные ошибки', () => {
    const s = buildSampleFlat();
    const out = placeFloorObject(
      s,
      { plan: { x: 9000, y: 9000 } },
      { kind: 'wardrobe' }
    );
    expect(out.ok).toBe(false);
    const wallNeed = placeWallObject(
      s,
      { plan: { x: 3000, y: 2000 } },
      { kind: 'wallCabinet', heightMm: 1500 }
    );
    expect(wallNeed.ok).toBe(false);
    const lampOut = placeLuminaire(
      s,
      { plan: { x: -500, y: -500 } },
      { kind: 'ceilingLamp', groupId: null }
    );
    expect(lampOut.ok).toBe(false);
  });

  it('навесной, розетка, свет и проём выводятся из хита', () => {
    let s = buildSampleFlat();
    const cab = placeWallObject(
      s,
      { plan: { x: 6010, y: 2004 }, wallId: 'w2' },
      { kind: 'wallCabinet', heightMm: 1500 }
    );
    expect(cab.ok).toBe(true);
    if (cab.ok) {
      expect(cab.op).toMatchObject({
        type: 'addWallObject',
        anchor: { wallId: 'w2', alongMm: 2000, heightMm: 1500 },
      });
    }

    s = {
      ...s,
      elecGroups: { g1: { id: 'g1', label: 'Группа 1' } },
    };
    const sk = placeElecPoint(
      s,
      { plan: { x: 1502, y: 5 }, wallId: 'w1' },
      { kind: 'socket', heightMm: 300, purpose: 'ТВ', groupId: 'g1' }
    );
    expect(sk.ok).toBe(true);
    if (sk.ok) {
      expect(sk.op).toMatchObject({
        type: 'addElecPoint',
        wallId: 'w1',
        alongMm: 1500,
        heightMm: 300,
      });
    }
    const noGroup = placeElecPoint(
      s,
      { plan: { x: 1500, y: 5 }, wallId: 'w1' },
      { kind: 'socket', heightMm: 300, purpose: 'ТВ', groupId: 'ghost' }
    );
    expect(noGroup.ok).toBe(false);

    const lamp = placeLuminaire(
      s,
      { plan: { x: 3000, y: 2000 } },
      { kind: 'ceilingLamp', groupId: null }
    );
    expect(lamp.ok).toBe(true);

    const door = placeOpening(
      s,
      { plan: { x: 3000, y: 0 }, wallId: 'w1' },
      { kind: 'door', widthMm: 900, heightMm: 2000, sillMm: 0 }
    );
    expect(door.ok).toBe(true);
    if (door.ok) {
      expect(door.op).toMatchObject({
        type: 'addOpening',
        wallId: 'w1',
        offsetMm: 2550,
        widthMm: 900,
      });
    }
  });

  it('drag двигает якорь того же типа, высоты не трогает', () => {
    let s = buildSampleFlat();
    const placed = placeFloorObject(
      s,
      { plan: { x: 1000, y: 1000 } },
      { kind: 'table' }
    );
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    const r1 = applyOperation(s, placed.op);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    s = r1.state;

    const moved = moveObject(s, placed.id, { plan: { x: 2000, y: 2000 } });
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.op).toMatchObject({
      type: 'updateFloorObject',
      anchor: { type: 'room', xMm: 2000, yMm: 2000 },
    });

    const out = moveObject(s, placed.id, { plan: { x: 9000, y: 9000 } });
    expect(out.ok).toBe(false);
  });

  it('drag вдоль стены и перепривязка на соседнюю стену', () => {
    let s = buildSampleFlat();
    const placed = placeFloorObject(
      s,
      { plan: { x: 3000, y: 30 }, wallId: 'w1' },
      { kind: 'wardrobe' }
    );
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    const r1 = applyOperation(s, placed.op);
    if (!r1.ok) return;
    s = r1.state;

    // Тащим вглубь комнаты: fromWall растёт от глубины курсора.
    const deep = moveObject(s, placed.id, { plan: { x: 4000, y: 1000 } });
    expect(deep.ok).toBe(true);
    if (!deep.ok) return;
    // depth от внутренней грани 900, полглубины 300 → fromWall 600.
    expect(deep.op).toMatchObject({
      type: 'updateFloorObject',
      anchor: { wallId: 'w1', alongMm: 4000, fromWallMm: 600 },
    });

    // Тащим на другую стену — перепривязка вплотную.
    const re = moveObject(s, placed.id, {
      plan: { x: 6010, y: 2500 },
      wallId: 'w2',
    });
    expect(re.ok).toBe(true);
    if (!re.ok) return;
    expect(re.op).toMatchObject({
      type: 'updateFloorObject',
      anchor: { wallId: 'w2', alongMm: 2500, fromWallMm: 0 },
    });
  });

  it('проём таскается по стене, угловой якорь — только числами', () => {
    let s = buildSampleFlat();
    const door = placeOpening(
      s,
      { plan: { x: 3000, y: 0 }, wallId: 'w1' },
      { kind: 'door', widthMm: 900, heightMm: 2000, sillMm: 0 }
    );
    expect(door.ok).toBe(true);
    if (!door.ok) return;
    const r1 = applyOperation(s, door.op);
    if (!r1.ok) return;
    s = r1.state;
    const moved = moveObject(s, door.id, {
      plan: { x: 4000, y: 0 },
      wallId: 'w1',
    });
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.op).toMatchObject({ type: 'updateOpening', offsetMm: 3550 });

    const corner = applyOperation(s, {
      type: 'addFloorObject',
      objectId: 'c1',
      kind: 'bedSingle',
      anchor: {
        type: 'corner',
        roomId: 'r1',
        corner: 'SW',
        dxMm: 800,
        dyMm: 800,
        rotationDeg: 0,
      },
    });
    expect(corner.ok).toBe(true);
    if (!corner.ok) return;
    const cm = moveObject(corner.state, 'c1', { plan: { x: 2000, y: 2000 } });
    expect(cm.ok).toBe(false);

    expect(moveObject(s, 'ghost', { plan: { x: 1, y: 1 } }).ok).toBe(false);
  });

  it('id не сталкиваются с существующими', () => {
    const s = buildSampleFlat();
    expect(uniqueId(s, 'w1')).toBe('w1-2');
    expect(uniqueId(s, 'f')).toBe('f');
  });
});

describe('resizeObject: гизмо меняет габариты, противоположный край зафиксирован', () => {
  function doorState() {
    let s = buildSampleFlat();
    const door = placeOpening(
      s,
      { plan: { x: 3000, y: 0 }, wallId: 'w1' },
      { kind: 'door', widthMm: 900, heightMm: 2000, sillMm: 0 }
    );
    expect(door.ok).toBe(true);
    if (!door.ok) throw new Error('дверь не встала');
    const r = applyOperation(s, door.op);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('дверь не применилась');
    // w1: offset 2550, ширина 900 (края 2550..3450).
    return { s: r.state, id: door.id };
  }

  function tableState(x = 2000, y = 2000) {
    let s = buildSampleFlat();
    const placed = placeFloorObject(s, { plan: { x, y } }, { kind: 'table' });
    expect(placed.ok).toBe(true);
    if (!placed.ok) throw new Error('стол не встал');
    const r = applyOperation(s, placed.op);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('стол не применился');
    // Стол: defW 1200, defD 700, якорь к помещению.
    return { s: r.state, id: placed.id };
  }

  it('проём тянется за торцы вдоль стены', () => {
    const { s, id } = doorState();
    const grow = resizeObject(s, id, { x: 3600, y: 0 }, 'end');
    expect(grow.ok).toBe(true);
    if (!grow.ok) return;
    expect(grow.op).toMatchObject({
      type: 'updateOpening',
      offsetMm: 2550,
      widthMm: 1050,
    });

    const shrink = resizeObject(s, id, { x: 2500, y: 60 }, 'start');
    expect(shrink.ok).toBe(true);
    if (!shrink.ok) return;
    expect(shrink.op).toMatchObject({
      type: 'updateOpening',
      offsetMm: 2500,
      widthMm: 950,
    });
  });

  it('проём упирается в лимиты каталога, а не клампится молча', () => {
    const { s, id } = doorState();
    // 2450 мм при максимуме двери 1100 — честная ошибка ширины.
    const wide = resizeObject(s, id, { x: 5000, y: 0 }, 'end');
    expect(wide.ok).toBe(false);
    if (!wide.ok) expect(wide.error).toMatch(/ширина/);

    // Чужой край для проёма — честная ошибка.
    expect(resizeObject(s, id, { x: 3600, y: 0 }, 'e').ok).toBe(false);
  });

  it('напольный бокс тянется за стороны, центр едет за рукой', () => {
    const { s, id } = tableState();
    // Восточный край +204 → ширина 1400, центр едет на +100.
    const grown = resizeObject(s, id, { x: 2000 + 600 + 204, y: 2000 }, 'e');
    expect(grown.ok).toBe(true);
    if (!grown.ok) return;
    expect(grown.op).toMatchObject({
      type: 'updateFloorObject',
      anchor: { type: 'room', xMm: 2100, yMm: 2000 },
      wMm: 1400,
      dMm: 700,
    });
  });

  it('бокс не выходит из комнаты и каталога', () => {
    const { s, id } = tableState(5000, 2000);
    // Восток далеко: углы уйдут за x=6000 при валидной ширине 1900.
    const out = resizeObject(s, id, { x: 6300, y: 2000 }, 'e');
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/Вне помещения/);

    // Ширина сверх максимума стола 2400 — ошибка каталога.
    const huge = resizeObject(
      tableState().s,
      tableState().id,
      { x: 2000 + 600 + 2000, y: 2000 },
      'e'
    );
    expect(huge.ok).toBe(false);
  });

  it('навесной объект тянется вдоль стены', () => {
    let s = buildSampleFlat();
    const placed = placeWallObject(
      s,
      { plan: { x: 3000, y: 0 }, wallId: 'w1' },
      { kind: 'wallCabinet', heightMm: 800 }
    );
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    const r = applyOperation(s, placed.op);
    if (!r.ok) return;
    s = r.state;
    // Шкафчик 800 (края 2600..3400): конец до 3500 → ширина 900.
    const grown = resizeObject(s, placed.id, { x: 3500, y: 0 }, 'end');
    expect(grown.ok).toBe(true);
    if (!grown.ok) return;
    expect(grown.op).toMatchObject({
      type: 'updateWallObject',
      anchor: { alongMm: 3050 },
      wMm: 900,
    });

    // Сверх максимума 1800 — ошибка каталога.
    expect(resizeObject(s, placed.id, { x: 5000, y: 0 }, 'end').ok).toBe(false);
  });

  it('бокс у стены тянется вширь, боковой разворот — только числами', () => {
    let s = buildSampleFlat();
    const placed = placeFloorObject(
      s,
      { plan: { x: 3000, y: 30 }, wallId: 'w1' },
      { kind: 'wardrobe' }
    );
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;
    const r = applyOperation(s, placed.op);
    if (!r.ok) return;
    s = r.state;
    // Шкаф 1200×600 у w1, центр (3000, 400): восток +200 → ширина 1400.
    const grown = resizeObject(
      s,
      placed.id,
      { x: 3000 + 600 + 204, y: 400 },
      'e'
    );
    expect(grown.ok).toBe(true);
    if (!grown.ok) return;
    expect(grown.op).toMatchObject({
      type: 'updateFloorObject',
      anchor: { wallId: 'w1', alongMm: 3100, fromWallMm: 0 },
      wMm: 1400,
    });
    // Глубина у стены гизмо не тянется.
    expect(resizeObject(s, placed.id, { x: 3000, y: 1200 }, 'n').ok).toBe(
      false
    );

    const sideways = applyOperation(s, {
      type: 'updateFloorObject',
      objectId: placed.id,
      anchor: {
        type: 'wall',
        wallId: 'w1',
        alongMm: 3000,
        fromWallMm: 0,
        rotationDeg: 90,
      },
    });
    expect(sideways.ok).toBe(true);
    if (!sideways.ok) return;
    const denied = resizeObject(
      sideways.state,
      placed.id,
      { x: 3800, y: 400 },
      'e'
    );
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.error).toMatch(/числами/);
  });

  it('глубина тянется у свободного бокса', () => {
    const { s, id } = tableState();
    // Север (+v — вниз по плану при повороте 0): +200 → глубина 900.
    const grown = resizeObject(s, id, { x: 2000, y: 2000 - 350 - 204 }, 'n');
    expect(grown.ok).toBe(true);
    if (!grown.ok) return;
    expect(grown.op).toMatchObject({
      type: 'updateFloorObject',
      anchor: { type: 'room', xMm: 2000, yMm: 1900 },
      wMm: 1200,
      dMm: 900,
    });
  });

  it('угловой якорь и неизвестный id — честные ошибки', () => {
    const s = buildSampleFlat();
    const corner = applyOperation(s, {
      type: 'addFloorObject',
      objectId: 'c1',
      kind: 'bedSingle',
      anchor: {
        type: 'corner',
        roomId: 'r1',
        corner: 'SW',
        dxMm: 800,
        dyMm: 800,
        rotationDeg: 0,
      },
    });
    expect(corner.ok).toBe(true);
    if (!corner.ok) return;
    const cr = resizeObject(corner.state, 'c1', { x: 2000, y: 2000 }, 'e');
    expect(cr.ok).toBe(false);
    if (!cr.ok) expect(cr.error).toMatch(/числами/);

    expect(resizeObject(s, 'ghost', { x: 1, y: 1 }, 'e').ok).toBe(false);
  });
});
