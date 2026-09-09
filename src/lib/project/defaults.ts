import {
  PANEL_DEFAULTS,
  SCHEMA_VERSION,
  type ConsumerKindSchema,
} from './schemas';
import type * as v from 'valibot';
import type { Project } from './types';

type ConsumerKind = v.InferOutput<typeof ConsumerKindSchema>;

const CONSUMER_KINDS: ConsumerKind[] = [
  'hob',
  'oven',
  'dishwasher',
  'washer',
  'dryer',
  'fridge',
  'boiler',
  'towelRail',
  'floorHeat',
  'conditioner',
  'grinder',
  'other',
];

const DEFAULT_POWER_KW: Record<ConsumerKind, number> = {
  hob: 7,
  oven: 3.5,
  dishwasher: 2.2,
  washer: 2.5,
  dryer: 2.5,
  fridge: 0.3,
  boiler: 2,
  towelRail: 0.5,
  floorHeat: 1.5,
  conditioner: 1.2,
  grinder: 0.6,
  other: 0,
};

export const CONSUMER_LABELS: Record<ConsumerKind, string> = {
  hob: 'Варочная панель',
  oven: 'Духовой шкаф',
  dishwasher: 'Посудомоечная машина',
  washer: 'Стиральная машина',
  dryer: 'Сушильная машина',
  fridge: 'Холодильник',
  boiler: 'Бойлер',
  towelRail: 'Полотенцесушитель',
  floorHeat: 'Тёплый пол',
  conditioner: 'Кондиционер',
  grinder: 'Измельчитель',
  other: 'Прочее',
};

export function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function createDefaultProject(name = 'Новая квартира'): Project {
  const ts = nowIso();
  return {
    schemaVersion: SCHEMA_VERSION,
    meta: { id: uid(), name, createdAt: ts, updatedAt: ts, comment: '' },
    general: {
      areaM2: 60,
      rooms: 2,
      bathrooms: 1,
      kitchenPresent: true,
      balcony: false,
      noLayoutMode: true,
      stage: 'whitebox',
      doorsCount: 5,
      socketsEstimate: 0,
    },
    power: {
      consumers: CONSUMER_KINDS.map((kind) => ({
        kind,
        present: false,
        qty: 0,
        // Отдельную линию включает пользователь явно — тихого присутствия нет.
        dedicatedLine: false,
        powerKw: DEFAULT_POWER_KW[kind],
      })),
    },
    ac: {
      count: 0,
      dedicatedLines: true,
      chaseNeeded: false,
      reserveFuture: false,
    },
    lowVoltage: {
      ethernetPoints: 0,
      tvOutlets: 0,
      wifiAP: 0,
      poe: false,
      intercom: false,
      cameras: 0,
      nas: false,
    },
    lighting: {
      groups: 0,
      passThrough: false,
      kitchenLed: false,
      mirrorLed: false,
      decorLed: false,
      dimming: false,
      smart: false,
    },
    bathrooms: {
      washerInBath: false,
      dryerInBath: false,
      boilerInBath: false,
      floorHeatInBath: false,
      electricTowel: false,
      supRequired: true,
    },
    sensors: {
      leakage: false,
      valves: false,
      smoke: false,
      motion: false,
      openSensor: false,
      temp: false,
      smartHome: false,
      curtains: false,
    },
    panel: {
      phases: '1',
      mainBreakerA: 40,
      grounding: 'unknown',
      inputA: 40,
      reserveModules: 0,
      options: { ...PANEL_DEFAULTS },
    },
    work: { electricians: 2, complexityK: 1, uncertaintyK: 1.15 },
    scope: { customerSockets: false },
  };
}

export { DEFAULT_POWER_KW };
