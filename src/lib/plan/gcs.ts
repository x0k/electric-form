/**
 * Адаптер численного солвера FreeCAD PlanGCS (WASM) для скетч-домена.
 *
 * sketchSolve остаётся синхронным: WASM-модуль грузится один раз через
 * ensureGcsLoaded() (async), дальше solve() — синхронные вызовы.
 * Маппинг: точки скетча → GCS-точки, constraints → p2p_coincident /
 * horizontal_pp / vertical_pp / p2p_distance. Перетаскиваемая точка
 * фиксируется (fixed) — остальное следует за ней, как в Sketcher.
 */

import {
  make_gcs_wrapper,
  SolveStatus,
  type GcsWrapper,
  type SketchPrimitive,
} from '@salusoft89/planegcs';
import type { Vec2 } from './geometry';

export interface GcsPointInput {
  id: string;
  x: number;
  y: number;
  fixed?: boolean;
}

export type GcsConstraintInput =
  | { id: string; type: 'coincident'; a: string; b: string }
  | { id: string; type: 'horizontal'; a: string; b: string }
  | { id: string; type: 'vertical'; a: string; b: string }
  | { id: string; type: 'length'; a: string; b: string; lengthMm: number };

export interface GcsSolveOutput {
  ok: boolean;
  /** Решённые координаты по нашим id точек (float, мм). */
  points: Record<string, Vec2>;
  /** Наши id constraints-виновников (пусто при успехе). */
  conflictingIds: string[];
}

let wrapper: GcsWrapper | null = null;
let loadPromise: Promise<void> | null = null;

export function isGcsLoaded(): boolean {
  return wrapper !== null;
}

/**
 * Однократная загрузка WASM-модуля. В браузере Vite отдаёт .wasm
 * через ?url (в node резолвится сам, проверено спайком).
 */
export async function ensureGcsLoaded(): Promise<void> {
  if (wrapper) return;
  if (!loadPromise) {
    loadPromise = (async () => {
      if (typeof window === 'undefined') {
        wrapper = await make_gcs_wrapper();
      } else {
        const { default: wasmUrl } =
          await import('@salusoft89/planegcs/dist/planegcs_dist/planegcs.wasm?url');
        wrapper = await make_gcs_wrapper(wasmUrl);
      }
    })();
  }
  await loadPromise;
}

export function solveWithGcs(
  points: GcsPointInput[],
  constraints: GcsConstraintInput[]
): GcsSolveOutput {
  const w = wrapper;
  if (!w) {
    throw new Error('GCS не загружен: сначала await ensureGcsLoaded().');
  }
  w.clear_data();

  // Числовые id по порядку зависимости: сначала точки, затем constraints.
  const toGcs = new Map<string, string>();
  const toOurs = new Map<string, string>();
  let seq = 0;
  const prims: SketchPrimitive[] = [];
  for (const p of points) {
    seq += 1;
    const gid = String(seq);
    toGcs.set(p.id, gid);
    toOurs.set(gid, p.id);
    prims.push({ id: gid, type: 'point', x: p.x, y: p.y, fixed: !!p.fixed });
  }
  const back = new Map<string, string>();
  for (const c of constraints) {
    const a = toGcs.get(c.a);
    const b = toGcs.get(c.b);
    if (!a || !b) continue;
    seq += 1;
    const gid = String(seq);
    back.set(gid, c.id);
    if (c.type === 'coincident') {
      prims.push({ id: gid, type: 'p2p_coincident', p1_id: a, p2_id: b });
    } else if (c.type === 'horizontal') {
      prims.push({ id: gid, type: 'horizontal_pp', p1_id: a, p2_id: b });
    } else if (c.type === 'vertical') {
      prims.push({ id: gid, type: 'vertical_pp', p1_id: a, p2_id: b });
    } else {
      prims.push({
        id: gid,
        type: 'p2p_distance',
        p1_id: a,
        p2_id: b,
        distance: c.lengthMm,
      });
    }
  }

  w.push_primitives_and_params(prims);
  const status = w.solve();
  if (
    status === SolveStatus.Failed ||
    status === SolveStatus.SuccessfulSolutionInvalid
  ) {
    const bad = w.has_gcs_conflicting_constraints()
      ? w.get_gcs_conflicting_constraints()
      : [];
    return {
      ok: false,
      points: {},
      conflictingIds: bad.map((g) => back.get(g) ?? g),
    };
  }
  w.apply_solution();
  const out: Record<string, Vec2> = {};
  const rev = new Map<string, string>();
  for (const [ours, g] of toGcs) rev.set(g, ours);
  for (const p of w.sketch_index.get_primitives()) {
    if (p.type !== 'point') continue;
    const ours = rev.get(p.id);
    if (ours) out[ours] = { x: p.x, y: p.y };
  }
  return { ok: true, points: out, conflictingIds: [] };
}
