/**
 * Этап 1 «Планировка помещения» как одна неделимая Feature.
 *
 * sketchToLayoutOps превращает замкнутый скетч в полный набор операций:
 * стены по периметру + помещение + пол и потолок. Набор коммитится
 * целиком через commitDraft — это и есть завершение первого шага
 * Feature Tree, после которого стены возведены и редактор переходит
 * в изометрию для расстановки объектов.
 */

import type { Operation } from './operations';
import {
  sketchToOutline,
  sketchToWallOps,
  type Sketch,
  type SketchResult,
} from './sketch';

export interface LayoutOpts {
  roomName: string;
  wallPrefix?: string;
  roomId?: string;
  floorId?: string;
  ceilingId?: string;
  thicknessMm?: number;
  heightMm?: number;
  slabThicknessMm?: number;
}

export const DEFAULT_LAYOUT_OPTS = {
  wallPrefix: 'w',
  roomId: 'r1',
  floorId: 'floor1',
  ceilingId: 'ceil1',
  thicknessMm: 200,
  heightMm: 2700,
  slabThicknessMm: 200,
} as const;

export function sketchToLayoutOps(
  sketch: Sketch,
  opts: LayoutOpts
): SketchResult<Operation[]> {
  const o = { ...DEFAULT_LAYOUT_OPTS, ...opts };
  if (!o.roomName.trim()) {
    return {
      ok: false,
      error: { code: 'BAD_GEOMETRY', message: 'Имя помещения пустое.' },
    };
  }
  const walls = sketchToWallOps(sketch, {
    wallPrefix: o.wallPrefix,
    thicknessMm: o.thicknessMm,
    heightMm: o.heightMm,
  });
  if (!walls.ok) return walls;
  const outline = sketchToOutline(sketch);
  if (!outline.ok) return outline;

  const wallIds = walls.value.map((op) =>
    op.type === 'addWall' ? op.wallId : ''
  );
  const ops: Operation[] = [
    ...walls.value,
    {
      type: 'addRoom',
      roomId: o.roomId,
      name: o.roomName,
      outline: outline.value,
      wallIds,
    },
    {
      type: 'upsertSlab',
      slabId: o.floorId,
      kind: 'floor',
      levelMm: 0,
      thicknessMm: o.slabThicknessMm,
      outline: outline.value.map((p) => ({ ...p })),
    },
    {
      type: 'upsertSlab',
      slabId: o.ceilingId,
      kind: 'ceiling',
      levelMm: o.heightMm,
      thicknessMm: o.slabThicknessMm,
      outline: outline.value.map((p) => ({ ...p })),
    },
  ];
  return { ok: true, value: ops };
}
