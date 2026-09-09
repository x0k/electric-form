import {
  deriveDoorsCount,
  deriveEthernetPoints,
  deriveLightingGroups,
  deriveTvOutlets,
  deriveWifiAP,
} from '#lib/forms/derived';
import { PANEL_DEFAULTS, type ConsumerKindSchema } from './schemas';
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
  'vent',
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
  vent: 0.2,
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
  vent: 'Вентиляция',
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
  // Производные считаем сразу теми же формулами, что и живая синхронизация,
  // чтобы новый проект открывался с осмысленными, а не нулевыми значениями.
  const generalBase = {
    areaM2: 60,
    rooms: 2,
    bathrooms: 1,
    kitchenPresent: true,
    balcony: false,
    noLayoutMode: true,
    stage: 'whitebox' as const,
    doorsCount: 0,
    socketsEstimate: 0,
  };
  const tv = deriveTvOutlets(generalBase);
  const wifi = deriveWifiAP(generalBase);
  const general = {
    ...generalBase,
    doorsCount: deriveDoorsCount(generalBase),
  };
  return {
    meta: { id: uid(), name, createdAt: ts, updatedAt: ts, comment: '' },
    general,
    power: {
      consumers: CONSUMER_KINDS.map((kind) => ({
        kind,
        present: false,
        qty: 0,
        // Отдельную линию включает пользователь явно — тихого присутствия нет.
        dedicatedLine: false,
        powerKw: DEFAULT_POWER_KW[kind],
      })),
      conditionerChase: false,
    },
    lowVoltage: {
      ethernetPoints: deriveEthernetPoints(tv, wifi),
      tvOutlets: tv,
      wifiAP: wifi,
      poe: false,
      intercom: false,
      cameras: 0,
      nas: false,
    },
    lighting: {
      groups: deriveLightingGroups(general),
      // Закупочные количества: явный 0 вместо пустого undefined —
      // что видишь, то и считается.
      passThroughQty: 0,
      ledKitchenQty: 0,
      ledMirrorQty: 0,
      ledDecorQty: 0,
      dimmerQty: 0,
      smart: false,
      ledPanel: false,
      ledControl: 'triac',
      ledSoftstart: false,
    },
    sensors: {
      leakQty: 0,
      valveQty: 0,
      smokeQty: 0,
      motionQty: 0,
      curtainQty: 0,
      openSensor: false,
      temp: false,
      smartHome: false,
      supRequired: true,
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
