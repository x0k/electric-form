import {
  estimateAcLines,
  estimateDedicatedLines,
  estimatePanelLines,
} from '../estimate';
import type { Rule } from '../types';

/** Модули DIN на устройство — для подбора корпуса. */
export const MODULES: Record<string, number> = {
  'breaker-16': 1,
  'breaker-25': 1,
  'breaker-40': 2,
  'rcd-40-30': 2,
  'rcd-fire': 2,
  'rcbo-16': 2,
  'voltage-relay': 3,
  'phase-relay': 2,
  spd: 4,
  'relay-smart': 2,
  'contactor-40': 2,
  wattmeter: 3,
  'volt-ind': 1,
};

export function panelModuleCount(
  specs: { materialId: string; qty: number }[]
): number {
  return specs.reduce(
    (acc, s) => acc + (MODULES[s.materialId] ?? 1) * s.qty,
    0
  );
}

export function pickBoxId(modulesWithReserve: number): string {
  if (modulesWithReserve <= 24) return 'box-24';
  if (modulesWithReserve <= 36) return 'box-36';
  return 'box-54';
}

export const panelRules: Rule[] = [
  {
    id: 'panel-breakers',
    stage: 'rough',
    label: 'Автоматы линий',
    category: 'panel',
    apply: (p) => {
      const lines = estimatePanelLines(p);
      const dedicated = estimateDedicatedLines(p) + estimateAcLines(p);
      const small = Math.max(lines - dedicated, 2);
      const big = dedicated;
      const out = [{ materialId: 'breaker-16', qty: small }];
      if (big > 0) out.push({ materialId: 'breaker-25', qty: big });
      out.push({
        materialId: 'breaker-40',
        qty: p.panel.phases === '3' ? 1 : 1,
      });
      return out;
    },
  },
  {
    id: 'panel-rcd',
    stage: 'rough',
    label: 'УЗО',
    category: 'panel',
    apply: (p) => {
      if (p.panel.options.rcbo) {
        return [
          {
            materialId: 'rcbo-16',
            qty: Math.max(2, Math.ceil(estimatePanelLines(p) / 3)),
          },
        ];
      }
      const step = p.panel.options.separateRcds ? 2 : 4;
      return [
        {
          materialId: 'rcd-40-30',
          qty: Math.max(1, Math.ceil(estimatePanelLines(p) / step)),
        },
      ];
    },
  },
  {
    id: 'panel-fire-rcd',
    stage: 'rough',
    label: 'Противопожарное УЗО',
    category: 'panel',
    when: (p) => !!p.panel.options.fireRcd,
    apply: () => [{ materialId: 'rcd-fire', qty: 1 }],
  },
  {
    id: 'panel-voltage',
    stage: 'rough',
    label: 'Реле напряжения',
    category: 'panel',
    when: (p) => !!p.panel.options.voltageRelay,
    apply: (p) => [
      { materialId: 'voltage-relay', qty: p.panel.phases === '3' ? 1 : 1 },
    ],
  },
  {
    id: 'panel-spd',
    stage: 'rough',
    label: 'УЗИП',
    category: 'panel',
    when: (p) => !!p.panel.options.spd,
    apply: () => [{ materialId: 'spd', qty: 1 }],
  },
  {
    id: 'panel-phase',
    stage: 'rough',
    label: 'Реле контроля фаз',
    category: 'panel',
    when: (p) => !!p.panel.options.phaseRelay && p.panel.phases === '3',
    apply: () => [{ materialId: 'phase-relay', qty: 1 }],
  },
  {
    id: 'panel-reserve',
    stage: 'rough',
    label: 'Резервные автоматы',
    category: 'panel',
    when: (p) => !!p.panel.options.reserveBreakers,
    apply: () => [{ materialId: 'breaker-16', qty: 2 }],
  },
  {
    id: 'panel-extra',
    stage: 'rough',
    label: 'Доп. щит / слаботочный шкаф',
    category: 'panel',
    when: (p) => !!p.panel.options.extraPanel,
    apply: () => [
      { materialId: 'box-24', qty: 1 },
      { materialId: 'din-rail', qty: 1 },
    ],
  },
  {
    id: 'panel-contactor',
    stage: 'rough',
    label: 'Контактор',
    category: 'panel',
    when: (p) => !!p.panel.options.contactor,
    apply: () => [{ materialId: 'contactor-40', qty: 1 }],
  },
  {
    id: 'panel-meter',
    stage: 'rough',
    label: 'Учёт и индикация',
    category: 'panel',
    when: (p) =>
      !!p.panel.options.wattmeter || !!p.panel.options.voltIndication,
    apply: (p) => {
      const out = [];
      if (p.panel.options.wattmeter)
        out.push({ materialId: 'wattmeter', qty: 1 });
      if (p.panel.options.voltIndication)
        out.push({ materialId: 'volt-ind', qty: 1 });
      return out;
    },
  },
  {
    id: 'panel-smart-relay',
    stage: 'rough',
    label: 'Реле умного света',
    category: 'panel',
    when: (p) => p.lighting.smart,
    apply: (p) => [
      {
        materialId: 'relay-smart',
        qty: Math.max(1, Math.ceil(p.lighting.groups / 2)),
      },
    ],
  },
  {
    id: 'panel-box',
    stage: 'rough',
    label: 'Корпус щита',
    category: 'panel',
    apply: () => [],
  },
  {
    id: 'panel-din',
    stage: 'rough',
    label: 'Кросс-модуль и шины',
    category: 'panel',
    apply: () => [{ materialId: 'din-rail', qty: 1 }],
  },
];
