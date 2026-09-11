/**
 * Feature History в духе FreeCAD Part Design (§4–§5 ТЗ).
 *
 * - Черновик (draft): произвольные изменения текущего этапа до Commit.
 * - Commit: черновик атомарно превращается в одну Feature.
 * - stateAt(i): состояние модели на коммите i (replay с нуля).
 * - editFeature(i, ops): замена ops у Feature i + пересчёт последующих;
 *   неприменимые операции downstream не роняют историю, а фиксируются
 *   как конфликты для разрешения пользователем.
 *
 * Всё чистое и независимое от рендера.
 */

import { applyOperation, type ApplyError, type Operation } from './operations';
import { createEmptyApartment, type ApartmentState } from './model';

export type StageKind =
  'layout' | 'floorObjects' | 'wallObjects' | 'sockets' | 'lighting';

export interface Feature {
  id: string;
  /** Порядковый номер (0-based), стабилен внутри истории. */
  index: number;
  stage: StageKind;
  label: string;
  ops: Operation[];
  createdAt: string;
}

export interface FeatureConflict {
  /** Feature, чья операция не применилась после пересчёта. */
  featureId: string;
  featureIndex: number;
  opIndex: number;
  op: Operation;
  error: ApplyError;
}

export interface PlanHistory {
  features: Feature[];
  /** Незакоммиченные изменения текущего этапа. */
  draft: Operation[];
}

export function createHistory(): PlanHistory {
  return { features: [], draft: [] };
}

let featureSeq = 0;

export function makeFeatureId(): string {
  featureSeq += 1;
  return `f${Date.now().toString(36)}-${featureSeq.toString(36)}`;
}

/** Положить операцию в черновик (без валидации — проверка на Commit). */
export function stageOp(history: PlanHistory, op: Operation): PlanHistory {
  return { ...history, draft: [...history.draft, op] };
}

export function discardDraft(history: PlanHistory): PlanHistory {
  return { ...history, draft: [] };
}

export type CommitResult =
  | { ok: true; history: PlanHistory; feature: Feature }
  | { ok: false; error: ApplyError; opIndex: number };

/**
 * Атомарный Commit: весь draft либо применяется целиком как одна Feature,
 * либо отклоняется без изменения истории.
 */
export function commitDraft(
  history: PlanHistory,
  opts: { stage: StageKind; label: string },
  nowIso: () => string = () => new Date().toISOString()
): CommitResult {
  if (history.draft.length === 0) {
    return {
      ok: false,
      error: {
        code: 'BAD_GEOMETRY',
        message: 'Черновик пуст — нечего коммитить.',
      },
      opIndex: -1,
    };
  }
  let probe = stateAt(history, history.features.length - 1).state;
  for (let i = 0; i < history.draft.length; i++) {
    const res = applyOperation(probe, history.draft[i]);
    if (!res.ok) return { ok: false, error: res.error, opIndex: i };
    probe = res.state;
  }
  const feature: Feature = {
    id: makeFeatureId(),
    index: history.features.length,
    stage: opts.stage,
    label: opts.label,
    ops: [...history.draft],
    createdAt: nowIso(),
  };
  return {
    ok: true,
    history: { features: [...history.features, feature], draft: [] },
    feature,
  };
}

/** Состояние на коммите index (index < 0 → пустая квартира). */
export function stateAt(
  history: PlanHistory,
  index: number
): { state: ApartmentState; conflicts: FeatureConflict[] } {
  let state = createEmptyApartment();
  const conflicts: FeatureConflict[] = [];
  if (index < 0) return { state, conflicts };
  const last = Math.min(index, history.features.length - 1);
  for (let fi = 0; fi <= last; fi++) {
    const feature = history.features[fi];
    for (let oi = 0; oi < feature.ops.length; oi++) {
      const res = applyOperation(state, feature.ops[oi]);
      if (res.ok) {
        state = res.state;
      } else {
        conflicts.push({
          featureId: feature.id,
          featureIndex: fi,
          opIndex: oi,
          op: feature.ops[oi],
          error: res.error,
        });
      }
    }
  }
  return { state, conflicts };
}

/** Текущее закоммиченное состояние (без черновика). */
export function headState(history: PlanHistory): ApartmentState {
  return stateAt(history, history.features.length - 1).state;
}

export interface EditResult {
  history: PlanHistory;
  /** Конфликты downstream-Features после пересчёта. */
  conflicts: FeatureConflict[];
  /** Копия состояния на голове после пересчёта. */
  state: ApartmentState;
}

/**
 * Изменение прошлой Feature с пересчётом последующих (§5 ТЗ).
 * Новые ops должны сами применяться на своём базовом состоянии,
 * иначе edit отклоняется и история не меняется.
 */
export function editFeature(
  history: PlanHistory,
  index: number,
  newOps: Operation[]
): { ok: true; result: EditResult } | { ok: false; error: ApplyError } {
  const target = history.features[index];
  if (!target) {
    return {
      ok: false,
      error: { code: 'NOT_FOUND', message: `Feature #${index} не найдена.` },
    };
  }
  // Проверка базы: newOps обязаны лечь на состояние до index.
  const base = stateAt(history, index - 1).state;
  let probe = base;
  for (const op of newOps) {
    const res = applyOperation(probe, op);
    if (!res.ok) return { ok: false, error: res.error };
    probe = res.state;
  }
  const features = history.features.map((f, i) =>
    i === index ? { ...f, ops: [...newOps] } : f
  );
  const next: PlanHistory = { ...history, features };
  const { state, conflicts } = stateAt(next, next.features.length - 1);
  return { ok: true, result: { history: next, conflicts, state } };
}

/** Сериализация истории (для будущего хранения в БД/localStorage). */
export function historyToJSON(history: PlanHistory): string {
  return JSON.stringify(history);
}

export function historyFromJSON(raw: string): PlanHistory {
  const parsed = JSON.parse(raw) as PlanHistory;
  const features = Array.isArray(parsed.features) ? parsed.features : [];
  const draft = Array.isArray(parsed.draft) ? parsed.draft : [];
  // Нормализуем индексы на случай ручного редактирования JSON.
  return {
    features: features.map((f, i) => ({ ...cloneFeature(f), index: i })),
    draft: [...draft],
  };
}

function cloneFeature(f: Feature): Feature {
  return {
    ...f,
    ops: f.ops.map((op) => ({ ...op }) as Operation),
  };
}

export function cloneHistory(history: PlanHistory): PlanHistory {
  return {
    features: history.features.map((f) => ({
      ...f,
      index: f.index,
      ops: [...f.ops],
    })),
    draft: [...history.draft],
  };
}
