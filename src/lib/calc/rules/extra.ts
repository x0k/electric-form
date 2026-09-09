import { METHOD } from '../method';
import type { Rule } from '../types';

export const lowVoltageRules: Rule[] = [
  {
    id: 'lv-utp',
    stage: 'rough',
    label: 'Витая пара',
    category: 'lowvoltage',
    when: (p) =>
      p.lowVoltage.ethernetPoints > 0 ||
      p.lowVoltage.wifiAP > 0 ||
      p.lowVoltage.cameras > 0,
    apply: (p) => [
      {
        materialId: 'cable-utp',
        qty: Math.ceil(
          p.lowVoltage.ethernetPoints * METHOD.utpPerPointM +
            p.lowVoltage.wifiAP * METHOD.utpPerPointM +
            p.lowVoltage.cameras * METHOD.utpPerCameraM
        ),
      },
    ],
  },
  {
    id: 'lv-tv',
    stage: 'rough',
    label: 'ТВ-кабель',
    category: 'lowvoltage',
    when: (p) => p.lowVoltage.tvOutlets > 0,
    apply: (p) => [
      {
        materialId: 'cable-tv',
        qty: p.lowVoltage.tvOutlets * METHOD.tvPerOutletM,
      },
    ],
  },
  {
    id: 'lv-outlets',
    stage: 'finish',
    label: 'Слаботочные розетки',
    category: 'lowvoltage',
    when: (p) => p.lowVoltage.ethernetPoints > 0 || p.lowVoltage.tvOutlets > 0,
    apply: (p) => {
      const out = [];
      if (p.lowVoltage.ethernetPoints > 0)
        out.push({
          materialId: 'socket-rj45',
          qty: p.lowVoltage.ethernetPoints,
        });
      if (p.lowVoltage.tvOutlets > 0)
        out.push({ materialId: 'socket-tv', qty: p.lowVoltage.tvOutlets });
      return out;
    },
  },
];

export const automationRules: Rule[] = [
  {
    id: 'auto-leak',
    stage: 'finish',
    label: 'Защита от протечек',
    category: 'automation',
    apply: (p) => [
      { materialId: 'leak-sensor', qty: p.sensors.leakQty },
      ...(p.sensors.valveQty > 0
        ? [{ materialId: 'leak-valve', qty: p.sensors.valveQty }]
        : []),
    ],
  },
  {
    id: 'auto-smoke',
    stage: 'finish',
    label: 'Дымовые датчики',
    category: 'automation',
    apply: (p) => [{ materialId: 'smoke-sensor', qty: p.sensors.smokeQty }],
  },
  {
    id: 'auto-motion',
    stage: 'finish',
    label: 'Датчики движения',
    category: 'automation',
    apply: (p) => [
      {
        materialId: 'motion-sensor',
        qty: p.sensors.motionQty,
      },
    ],
  },
  {
    id: 'auto-curtains',
    stage: 'finish',
    label: 'Электрокарнизы',
    category: 'automation',
    apply: (p) => [{ materialId: 'curtain-motor', qty: p.sensors.curtainQty }],
  },
];

export const groundingRules: Rule[] = [
  {
    id: 'sup',
    stage: 'rough',
    label: 'СУП санузлов',
    category: 'grounding',
    when: (p) => p.bathrooms.supRequired,
    apply: (p) => [
      { materialId: 'sup-kit', qty: Math.max(p.general.bathrooms, 1) },
    ],
  },
];
