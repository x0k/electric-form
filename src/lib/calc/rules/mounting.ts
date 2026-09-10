import { METHOD } from '../method';
import {
  estimateConditionerQty,
  estimatePanelLines,
  estimateSockets,
} from '../estimate';
import type { Rule } from '../types';

export const mountingRules: Rule[] = [
  {
    id: 'mount-boxes',
    label: 'Подрозетники',
    category: 'mounting',
    stage: 'rough',
    apply: (p) => {
      const qty = estimateSockets(p) + p.lighting.groups;
      return [{ materialId: 'box-socket', qty }];
    },
  },
  {
    id: 'mount-junction',
    label: 'Распячные коробки',
    category: 'mounting',
    stage: 'rough',
    apply: (p) => [
      {
        materialId: 'box-junction',
        qty: p.general.rooms + p.general.bathrooms + 1,
      },
    ],
  },
  {
    id: 'mount-fix',
    label: 'Крепёж',
    category: 'mounting',
    stage: 'rough',
    apply: (p) => [
      {
        materialId: 'fix-clips',
        qty: Math.max(1, Math.ceil(p.general.areaM2 / 60)),
      },
    ],
  },
  {
    id: 'mount-terminals',
    label: 'Клеммы',
    category: 'mounting',
    stage: 'rough',
    apply: (p) => [
      {
        materialId: 'terminals',
        qty: Math.max(1, Math.ceil(estimatePanelLines(p) / 8)),
      },
    ],
  },
  {
    id: 'mount-chase',
    label: 'Закладные под кондиционеры',
    category: 'mounting',
    stage: 'rough',
    when: (p) => p.power.conditionerChase && estimateConditionerQty(p) > 0,
    apply: (p) => [
      {
        materialId: 'corr-25',
        qty: estimateConditionerQty(p) * METHOD.chasePerAcM,
      },
    ],
  },
];
