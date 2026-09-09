import { estimatePanelLines, estimateSockets } from '../estimate';
import type { Rule } from '../types';

export const mountingRules: Rule[] = [
  {
    id: 'mount-boxes',
    label: 'Подрозетники',
    category: 'mounting',
    apply: (p) => {
      const qty = estimateSockets(p) + p.lighting.groups;
      return [{ materialId: 'box-socket', qty }];
    },
  },
  {
    id: 'mount-junction',
    label: 'Распячные коробки',
    category: 'mounting',
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
    apply: (p) => [
      {
        materialId: 'terminals',
        qty: Math.max(1, Math.ceil(estimatePanelLines(p) / 8)),
      },
    ],
  },
];
