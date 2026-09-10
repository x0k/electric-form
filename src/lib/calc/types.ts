import type { CostCategory, Unit } from '#lib/catalog/types';

export interface BOMLine {
  materialId: string;
  materialName: string;
  category: CostCategory;
  /** Этап сметы (от правила). */
  stage: WorkStage;
  unit: Unit;
  /** Чистое расчётное количество. */
  qty: number;
  /** Количество с учётом запаса. */
  qtyWithWaste: number;
  priceRub: number;
  sumRub: number;
  ruleId: string;
  label: string;
}

export interface CostDriver {
  label: string;
  amountRub: number;
}

export interface LaborTask {
  label: string;
  hours: number;
  /** Этап работ: черновой монтаж или чистовая установка. */
  stage: WorkStage;
}

/** Этап сметы: черновой монтаж или чистовая установка. */
export type WorkStage = 'rough' | 'finish';

export const WORK_STAGE_LABELS: Record<WorkStage, string> = {
  rough: 'Черновой монтаж',
  finish: 'Чистовая установка',
};

export interface CalcResult {
  lines: BOMLine[];
  categoryTotals: Record<CostCategory, number>;
  totalRub: number;
  /** Диапазон предварительной оценки (±10%). */
  rangeRub: { min: number; max: number };
  /** Итоги по этапам (без исключённого «своими силами»). */
  stageTotals: Record<WorkStage, number>;
  /** Дни по этапам (те же коэффициенты, что и общий срок). */
  stageDays: Record<WorkStage, { min: number; max: number }>;
  /** Позиции, исключённые флагом «ставит заказчик» (категория sockets). */
  excludedLines: BOMLine[];
  excludedTotalRub: number;
  panelModules: number;
  panelBoxId: string | null;
  labor: LaborTask[];
  laborHours: number;
  daysMin: number;
  daysMax: number;
  drivers: CostDriver[];
}

export interface LineSpec {
  materialId: string;
  qty: number;
  label?: string;
}

export interface Rule {
  id: string;
  label: string;
  category: CostCategory;
  /** Этап сметы, к которому относится правило. */
  stage: WorkStage;
  when?: (p: import('#lib/project/types').Project) => boolean;
  apply: (p: import('#lib/project/types').Project) => LineSpec[];
}
