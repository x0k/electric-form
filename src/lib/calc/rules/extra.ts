import { METHOD } from '../method';
import type { Rule } from '../types';

export const lowVoltageRules: Rule[] = [
  {
    id: 'lv-utp',
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
    label: 'Защита от протечек',
    category: 'automation',
    when: (p) => p.sensors.leakage,
    apply: (p) => [
      { materialId: 'leak-sensor', qty: Math.max(p.general.bathrooms + 1, 2) },
      ...(p.sensors.valves ? [{ materialId: 'leak-valve', qty: 2 }] : []),
    ],
  },
  {
    id: 'auto-smoke',
    label: 'Дымовые датчики',
    category: 'automation',
    when: (p) => p.sensors.smoke,
    apply: (p) => [
      { materialId: 'smoke-sensor', qty: Math.max(p.general.rooms, 1) },
    ],
  },
  {
    id: 'auto-motion',
    label: 'Датчики движения',
    category: 'automation',
    when: (p) => p.sensors.motion,
    apply: (p) => [
      {
        materialId: 'motion-sensor',
        qty: Math.max(1, Math.ceil(p.general.rooms / 2)),
      },
    ],
  },
  {
    id: 'auto-curtains',
    label: 'Электрокарнизы',
    category: 'automation',
    when: (p) => p.sensors.curtains,
    apply: (p) => [
      { materialId: 'curtain-motor', qty: Math.max(p.general.rooms, 1) },
    ],
  },
];

export const groundingRules: Rule[] = [
  {
    id: 'sup',
    label: 'СУП санузлов',
    category: 'grounding',
    when: (p) => p.bathrooms.supRequired,
    apply: (p) => [
      { materialId: 'sup-kit', qty: Math.max(p.general.bathrooms, 1) },
    ],
  },
];
