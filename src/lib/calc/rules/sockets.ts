import { estimateSockets } from '../estimate';
import type { Rule } from '../types';

export const socketsRules: Rule[] = [
  {
    id: 'sockets-220',
    label: 'Розетки 220В',
    category: 'sockets',
    stage: 'finish',
    apply: (p) => [{ materialId: 'socket-220', qty: estimateSockets(p) }],
  },
  {
    id: 'switches',
    label: 'Выключатели',
    category: 'sockets',
    stage: 'finish',
    apply: (p) => {
      if (p.lighting.passThrough) {
        return [
          { materialId: 'switch-pass', qty: Math.max(p.lighting.groups, 1) },
        ];
      }
      return [{ materialId: 'switch-1', qty: Math.max(p.lighting.groups, 1) }];
    },
  },
  {
    id: 'dimmers',
    label: 'Диммеры',
    category: 'lighting',
    stage: 'finish',
    when: (p) => p.lighting.dimming,
    apply: (p) => [
      {
        materialId: 'switch-dim',
        qty: Math.max(1, Math.ceil(p.lighting.groups / 3)),
      },
    ],
  },
  {
    id: 'led',
    label: 'Подсветка',
    category: 'lighting',
    stage: 'finish',
    when: (p) =>
      p.lighting.kitchenLed || p.lighting.mirrorLed || p.lighting.decorLed,
    apply: (p) => {
      const out = [];
      if (p.lighting.kitchenLed)
        out.push({ materialId: 'led-kitchen', qty: 1 });
      if (p.lighting.mirrorLed)
        out.push({
          materialId: 'led-mirror',
          qty: Math.max(p.general.bathrooms, 1),
        });
      return out;
    },
  },
];
