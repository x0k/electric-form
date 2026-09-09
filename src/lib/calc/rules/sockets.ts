import { estimateLedZones, estimateSockets, isPushLed } from '../estimate';
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
      if (p.lighting.decorLed) out.push({ materialId: 'led-decor', qty: 1 });
      const zones = estimateLedZones(p);
      if (isPushLed(p)) {
        out.push({ materialId: 'led-driver-push', qty: zones });
        out.push({ materialId: 'push-button', qty: zones });
      } else if (p.lighting.ledSoftstart && zones > 0) {
        out.push({ materialId: 'led-softstart', qty: zones });
      }
      return out;
    },
  },
  {
    id: 'led-power-cable',
    label: 'Линии до LED-щита',
    category: 'cable',
    stage: 'rough',
    when: (p) => p.lighting.ledPanel && estimateLedZones(p) > 0,
    apply: (p) => [
      { materialId: 'cable-vvg-3x1.5', qty: estimateLedZones(p) * 12 },
    ],
  },
  {
    id: 'led-power-box',
    label: 'Щиток под БП ленты',
    category: 'lighting',
    stage: 'rough',
    when: (p) => p.lighting.ledPanel && estimateLedZones(p) > 0,
    apply: () => [{ materialId: 'led-box', qty: 1 }],
  },
];
