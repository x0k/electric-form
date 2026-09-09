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
      // Проходные вытесняют обычные один к одному из общего числа групп.
      const pass = p.lighting.passThroughQty ?? 0;
      const out = [];
      if (pass > 0) out.push({ materialId: 'switch-pass', qty: pass });
      const plain = Math.max(p.lighting.groups - pass, 0);
      if (plain > 0) out.push({ materialId: 'switch-1', qty: plain });
      return out;
    },
  },
  {
    id: 'dimmers',
    label: 'Диммеры',
    category: 'lighting',
    stage: 'finish',
    apply: (p) => [
      {
        materialId: 'switch-dim',
        qty: p.lighting.dimmerQty ?? 0,
      },
    ],
  },
  {
    id: 'led',
    label: 'Подсветка',
    category: 'lighting',
    stage: 'finish',
    apply: (p) => {
      const out = [];
      const kitchen = p.lighting.ledKitchenQty ?? 0;
      if (kitchen > 0) out.push({ materialId: 'led-kitchen', qty: kitchen });
      const mirror = p.lighting.ledMirrorQty ?? 0;
      if (mirror > 0) out.push({ materialId: 'led-mirror', qty: mirror });
      const decor = p.lighting.ledDecorQty ?? 0;
      if (decor > 0) out.push({ materialId: 'led-decor', qty: decor });
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
