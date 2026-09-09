import type { CostCategory, Unit } from '#lib/catalog/types';

export interface BOMLine {
  materialId: string;
  materialName: string;
  category: CostCategory;
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
}

export interface CalcResult {
  lines: BOMLine[];
  categoryTotals: Record<CostCategory, number>;
  totalRub: number;
  /** Диапазон предварительной оценки (±10%). */
  rangeRub: { min: number; max: number };
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
  when?: (p: import('#lib/project/types').Project) => boolean;
  apply: (p: import('#lib/project/types').Project) => LineSpec[];
}
