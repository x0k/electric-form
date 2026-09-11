import { describe, expect, it } from 'vitest';
import { applyOperation, type Operation } from '#lib/plan/operations';
import { createEmptyApartment, type ApartmentState } from '#lib/plan/model';
import { modelToScene, wallSegs } from '#lib/plan/render';
import { buildSampleFlat } from '#lib/plan/sample';

function applyAll(base: ApartmentState, ops: Operation[]): ApartmentState {
  let s = base;
  for (const op of ops) {
    const r = applyOperation(s, op);
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (r.ok) s = r.state;
  }
  return s;
}

describe('render: сегменты стен с честными проёмами', () => {
  it('без проёмов — по одному куску на стену, как цельный бокс', () => {
    const segs = wallSegs(buildSampleFlat());
    expect(segs).toHaveLength(4);
    const w1 = segs.filter((s) => s.wallId === 'w1');
    expect(w1).toHaveLength(1);
    // Длина 6000 + miter по 200 с каждого конца; центр как у бокса.
    expect(w1[0]).toMatchObject({
      segIndex: 0,
      cxMm: 3000,
      cyMm: -100,
      lengthMm: 6400,
      thicknessMm: 200,
      heightMm: 2700,
    });
  });

  it('дверь режет стену на два куска, сумма сходится', () => {
    let s = buildSampleFlat();
    s = applyAll(s, [
      {
        type: 'addOpening',
        openingId: 'd1',
        kind: 'door',
        wallId: 'w1',
        offsetMm: 1000,
        widthMm: 900,
        heightMm: 2000,
        sillMm: 0,
      },
    ]);
    const w1 = wallSegs(s).filter((x) => x.wallId === 'w1');
    expect(w1).toHaveLength(2);
    expect(w1[0].lengthMm).toBe(1200);
    expect(w1[1].lengthMm).toBe(4300);
    expect(w1[0].lengthMm + w1[1].lengthMm).toBe(6400 - 900);
    // Куски на оси стены со сдвигом наружу, индексы по порядку.
    expect(w1.map((x) => x.segIndex)).toEqual([0, 1]);
    expect(w1[0].cyMm).toBe(-100);
    expect(w1[0].cxMm).toBeLessThan(w1[1].cxMm);
    // Остальные стены целы.
    expect(wallSegs(s).filter((x) => x.wallId !== 'w1')).toHaveLength(3);
  });

  it('два окна — три куска; сцена несёт wallSegs', () => {
    let s = buildSampleFlat();
    s = applyAll(s, [
      {
        type: 'addOpening',
        openingId: 'w9a',
        kind: 'window',
        wallId: 'w3',
        offsetMm: 1000,
        widthMm: 1200,
        heightMm: 1400,
        sillMm: 900,
      },
      {
        type: 'addOpening',
        openingId: 'w9b',
        kind: 'window',
        wallId: 'w3',
        offsetMm: 3500,
        widthMm: 1200,
        heightMm: 1400,
        sillMm: 900,
      },
    ]);
    const w3 = wallSegs(s).filter((x) => x.wallId === 'w3');
    expect(w3).toHaveLength(3);
    const total = w3.reduce((sum, x) => sum + x.lengthMm, 0);
    expect(total).toBe(6400 - 2400);
    const scene = modelToScene(s);
    expect(scene.wallSegs.length).toBe(3 + 1 + 1 + 1);
  });

  it('пустая модель — пустые сегменты', () => {
    expect(wallSegs(createEmptyApartment())).toEqual([]);
  });
});
