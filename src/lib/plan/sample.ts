/**
 * Тестовая квартира 6×4 м для Renderer foundation и будущих этапов:
 * 4 стены, помещение, пол и потолок. Строится через операции домена —
 * заодно доказывает, что модель собирается без UI.
 */

import { applyOperation, type Operation } from './operations';
import { createEmptyApartment, type ApartmentState } from './model';

const FLAT_OPS: Operation[] = [
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
  {
    type: 'addWall',
    wallId: 'w3',
    a: { x: 6000, y: 4000 },
    b: { x: 0, y: 4000 },
    thicknessMm: 200,
    heightMm: 2700,
  },
  {
    type: 'addWall',
    wallId: 'w4',
    a: { x: 0, y: 4000 },
    b: { x: 0, y: 0 },
    thicknessMm: 200,
    heightMm: 2700,
  },
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
    wallIds: ['w1', 'w2', 'w3', 'w4'],
  },
  {
    type: 'upsertSlab',
    slabId: 'floor1',
    kind: 'floor',
    levelMm: 0,
    thicknessMm: 200,
    outline: [
      { x: 0, y: 0 },
      { x: 6000, y: 0 },
      { x: 6000, y: 4000 },
      { x: 0, y: 4000 },
    ],
  },
  {
    type: 'upsertSlab',
    slabId: 'ceil1',
    kind: 'ceiling',
    levelMm: 2700,
    thicknessMm: 200,
    outline: [
      { x: 0, y: 0 },
      { x: 6000, y: 0 },
      { x: 6000, y: 4000 },
      { x: 0, y: 4000 },
    ],
  },
];

export function buildSampleFlat(): ApartmentState {
  let state = createEmptyApartment();
  for (const op of FLAT_OPS) {
    const res = applyOperation(state, op);
    if (!res.ok) {
      throw new Error(
        `Тестовая квартира не собралась: ${res.error.code} ${res.error.message}`
      );
    }
    state = res.state;
  }
  return state;
}
