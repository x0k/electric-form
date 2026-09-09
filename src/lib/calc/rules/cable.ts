import { METHOD } from '../method';
import {
  estimateDedicatedLines,
  estimateLightPoints,
  estimateSockets,
} from '../estimate';
import type { Rule } from '../types';

export const cableRules: Rule[] = [
  {
    id: 'cable-power',
    label: 'Силовой кабель',
    category: 'cable',
    stage: 'rough',
    apply: (p) => {
      const sockets = estimateSockets(p);
      const extraLines =
        (p.panel.options.fridgeLine ? 1 : 0) +
        (p.panel.options.netLine ? 1 : 0);
      const qty =
        sockets * METHOD.cablePerSocketM +
        estimateDedicatedLines(p) * METHOD.cablePerDedicatedLineM +
        extraLines * METHOD.cablePerDedicatedLineM;
      return [{ materialId: 'cable-vvg-3x2.5', qty: Math.ceil(qty) }];
    },
  },
  {
    id: 'cable-light',
    label: 'Кабель освещения',
    category: 'cable',
    stage: 'rough',
    apply: (p) => {
      const qty =
        estimateLightPoints(p) * METHOD.cablePerLightPointM +
        p.general.areaM2 * METHOD.cablePerAreaM;
      return [{ materialId: 'cable-vvg-3x1.5', qty: Math.ceil(qty) }];
    },
  },
  {
    id: 'cable-input',
    label: 'Ввод в квартиру',
    category: 'cable',
    stage: 'rough',
    apply: (p) => [
      {
        materialId:
          p.general.phases === '3' ? 'cable-vvg-5x6' : 'cable-vvg-3x2.5',
        qty: METHOD.inputCableM,
      },
    ],
  },
  {
    id: 'cable-corrugation',
    label: 'Гофра под кабель',
    category: 'mounting',
    stage: 'rough',
    apply: (p) => {
      const sockets = estimateSockets(p);
      const qty =
        (sockets * METHOD.cablePerSocketM +
          estimateLightPoints(p) * METHOD.cablePerLightPointM) *
        0.8;
      return [{ materialId: 'corr-20', qty: Math.ceil(qty) }];
    },
  },
];
