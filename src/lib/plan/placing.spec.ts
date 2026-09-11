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
