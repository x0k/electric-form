import type { CostCategory, Material } from '#lib/catalog/types';
import { COST_CATEGORIES, DEFAULT_WASTE_PCT } from '#lib/catalog/types';
import type { Project } from '#lib/project/types';
import {
  estimateLedZones,
  estimatePanelLines,
  estimateSockets,
} from './estimate';
import { METHOD } from './method';
import {
  automationRules,
  groundingRules,
  lowVoltageRules,
} from './rules/extra';
import { cableRules } from './rules/cable';
import { mountingRules } from './rules/mounting';
import { panelModuleCount, panelRules, pickBoxId } from './rules/panel';
import { socketsRules } from './rules/sockets';
import type {
  BOMLine,
  CalcResult,
  CostDriver,
  LaborTask,
  Rule,
  WorkStage,
} from './types';

export const ALL_RULES: Rule[] = [
  ...cableRules,
  ...mountingRules,
  ...socketsRules,
  ...panelRules,
  ...lowVoltageRules,
  ...automationRules,
  ...groundingRules,
];

function roundQty(unit: Material['unit'], qty: number): number {
  if (unit === 'm') return Math.ceil(qty);
  if (unit === 'set' || unit === 'box') return Math.ceil(qty);
  return Math.round(qty);
}

/** Часы этапа — для разбивки сроков. */
function stageHours(labor: LaborTask[], stage: WorkStage): number {
  return labor
    .filter((t) => t.stage === stage)
    .reduce((a, t) => a + t.hours, 0);
}

/** Дни из эффективных часов (та же формула, что и общий срок). */
function daysFromHours(
  effHours: number,
  electricians: number
): { min: number; max: number } {
  const dayHours = METHOD.hoursPerDay * Math.max(electricians, 1);
  const daysExact = effHours / dayHours;
  const min = Math.max(1, Math.floor(daysExact));
  return { min, max: Math.max(min + 1, Math.ceil(daysExact + 1)) };
}

export function calculate(project: Project, catalog: Material[]): CalcResult {
  const byId = new Map(catalog.map((m) => [m.id, m]));
  const lines: BOMLine[] = [];

  for (const rule of ALL_RULES) {
    if (rule.when && !rule.when(project)) continue;
    if (rule.id === 'panel-box') continue; // корпус подбираем после подсчёта модулей
    const specs = rule.apply(project);
    for (const spec of specs) {
      const mat = byId.get(spec.materialId);
      if (!mat || spec.qty <= 0) continue;
      const wastePct = mat.wastePct ?? DEFAULT_WASTE_PCT[mat.category];
      const qty = roundQty(mat.unit, spec.qty);
      const qtyWithWaste =
        mat.unit === 'pcs' && qty < 5
          ? qty
          : Math.ceil(qty * (1 + wastePct / 100));
      const sumRub = qtyWithWaste * mat.priceRub;
      lines.push({
        materialId: mat.id,
        materialName: mat.name,
        category: rule.category,
        stage: rule.stage,
        unit: mat.unit,
        qty,
        qtyWithWaste,
        priceRub: mat.priceRub,
        sumRub,
        ruleId: rule.id,
        label: spec.label ?? rule.label,
      });
    }
  }

  // Подбор корпуса щита по модулям.
  const panelSpecs = lines
    .filter((l) => l.category === 'panel')
    .map((l) => ({ materialId: l.materialId, qty: l.qtyWithWaste }));
  const modules = panelModuleCount(panelSpecs) + project.panel.reserveModules;
  const boxId = pickBoxId(modules);
  const box = byId.get(boxId);
  if (box) {
    lines.push({
      materialId: box.id,
      materialName: box.name,
      category: 'panel',
      stage: 'rough',
      unit: box.unit,
      qty: 1,
      qtyWithWaste: 1,
      priceRub: box.priceRub,
      sumRub: box.priceRub,
      ruleId: 'panel-box',
      label: `Корпус на ${modules} мод.`,
    });
  }

  // «Ставит заказчик»: розетки/выключатели уходят из сметы в отдельную строку.
  const excludedLines = project.scope.customerSockets
    ? lines.filter((l) => l.category === 'sockets')
    : [];
  const kept = project.scope.customerSockets
    ? lines.filter((l) => l.category !== 'sockets')
    : lines;
  const excludedTotalRub = excludedLines.reduce((a, l) => a + l.sumRub, 0);

  const categoryTotals = Object.fromEntries(
    COST_CATEGORIES.map((c) => [c, 0])
  ) as Record<CostCategory, number>;
  for (const l of kept) categoryTotals[l.category] += l.sumRub;
  const totalRub = kept.reduce((a, l) => a + l.sumRub, 0);

  const stageTotals: Record<WorkStage, number> = { rough: 0, finish: 0 };
  for (const l of kept) stageTotals[l.stage] += l.sumRub;

  const drivers: CostDriver[] = [...kept]
    .sort((a, b) => b.sumRub - a.sumRub)
    .slice(0, 5)
    .map((l) => ({ label: l.materialName, amountRub: l.sumRub }));

  const labor = estimateLabor(project);
  const laborHours = labor.reduce((a, t) => a + t.hours, 0);
  const { min: daysMin, max: daysMax } = daysFromHours(
    laborHours * project.work.complexityK * project.work.uncertaintyK,
    project.work.electricians
  );
  const stageDays: Record<WorkStage, { min: number; max: number }> = {
    rough: daysFromHours(
      stageHours(labor, 'rough') *
        project.work.complexityK *
        project.work.uncertaintyK,
      project.work.electricians
    ),
    finish: daysFromHours(
      stageHours(labor, 'finish') *
        project.work.complexityK *
        project.work.uncertaintyK,
      project.work.electricians
    ),
  };

  return {
    lines: kept,
    categoryTotals,
    totalRub,
    rangeRub: {
      min: Math.round(totalRub * 0.9),
      max: Math.round(totalRub * 1.1),
    },
    stageTotals,
    stageDays,
    excludedLines,
    excludedTotalRub,
    panelModules: modules,
    panelBoxId: boxId,
    labor,
    laborHours: Math.round(laborHours),
    daysMin,
    daysMax,
    drivers,
  };
}

function estimateLabor(p: Project): LaborTask[] {
  const L = METHOD.labor;
  const sockets = estimateSockets(p);
  const lines = estimatePanelLines(p);
  const lvPoints =
    p.lowVoltage.ethernetPoints +
    p.lowVoltage.tvOutlets +
    p.lowVoltage.wifiAP +
    p.lowVoltage.cameras;
  return [
    {
      label: 'Укладка кабеля',
      hours: Math.round((sockets * 0.4 + lines * 0.5) * 10) / 10,
      stage: 'rough',
    },
    {
      label: 'Подрозетники и коробки',
      hours: Math.round(sockets * L.perSocketH * 0.5 * 10) / 10,
      stage: 'rough',
    },
    {
      label: 'Сборка щита',
      hours: Math.round(lines * L.perLineH * 0.6 * 10) / 10,
      stage: 'rough',
    },
    {
      label: 'Установка розеток/выключателей',
      hours: Math.round((sockets + p.lighting.groups) * 0.3 * 10) / 10,
      stage: 'finish',
    },
    {
      label: 'Слаботочка',
      hours: Math.round(lvPoints * L.perLowVoltagePointH * 10) / 10,
      stage: 'rough',
    },
    ...(p.lighting.ledPanel && estimateLedZones(p) > 0
      ? [{ label: 'Закладка LED-щита', hours: 1, stage: 'rough' as const }]
      : []),
    { label: 'Пусконаладка', hours: L.baseH / 4, stage: 'finish' },
  ];
}
