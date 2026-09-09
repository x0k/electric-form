import * as v from 'valibot';

/** Текущая версия схемы проекта. Инкрементировать при breaking-изменениях. */
export const SCHEMA_VERSION = 1 as const;

const int = (min: number, max: number) =>
  v.pipe(v.number(), v.integer(), v.minValue(min), v.maxValue(max));

const num = (min: number, max: number) =>
  v.pipe(v.number(), v.minValue(min), v.maxValue(max));

const optNum = (min: number, max: number, fallback: number) =>
  v.optional(num(min, max), fallback);

const optInt = (min: number, max: number, fallback: number) =>
  v.optional(int(min, max), fallback);

const optBool = (fallback: boolean) => v.optional(v.boolean(), fallback);

const optStr = (fallback = '') => v.optional(v.string(), fallback);

export const StageSchema = v.picklist(['rough', 'whitebox', 'lived'] as const);
export const PhasesSchema = v.picklist(['1', '3'] as const);
export const GroundingSchema = v.picklist([
  'TN-C-S',
  'TN-S',
  'TT',
  'unknown',
] as const);

export const ConsumerKindSchema = v.picklist([
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
] as const);

export const MetaSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
  name: v.pipe(v.string(), v.minLength(1)),
  createdAt: v.pipe(v.string(), v.minLength(1)),
  updatedAt: v.pipe(v.string(), v.minLength(1)),
  comment: optStr(),
});

export const GeneralSchema = v.object({
  areaM2: num(5, 500),
  rooms: int(0, 12),
  bathrooms: int(0, 5),
  kitchenPresent: optBool(true),
  balcony: optBool(false),
  /** Пока нет точной планировки — считаем по типовым значениям. */
  noLayoutMode: optBool(false),
  stage: v.optional(StageSchema, 'whitebox' as const),
  doorsCount: optInt(0, 30, 5),
  /** Ручная оценка точек; 0 = автооценка. */
  socketsEstimate: optInt(0, 300, 0),
});

export const PowerConsumerSchema = v.object({
  kind: ConsumerKindSchema,
  present: optBool(false),
  qty: optInt(0, 10, 0),
  dedicatedLine: optBool(false),
  powerKw: optNum(0, 15, 0),
});

export const PowerSchema = v.object({
  consumers: v.optional(v.array(PowerConsumerSchema), []),
});

export const AcSchema = v.object({
  count: optInt(0, 10, 0),
  dedicatedLines: optBool(true),
  chaseNeeded: optBool(false),
  reserveFuture: optBool(false),
});

export const LowVoltageSchema = v.object({
  ethernetPoints: optInt(0, 40, 0),
  tvOutlets: optInt(0, 20, 0),
  wifiAP: optInt(0, 10, 0),
  poe: optBool(false),
  intercom: optBool(false),
  cameras: optInt(0, 16, 0),
  nas: optBool(false),
});

export const LightingSchema = v.object({
  groups: optInt(0, 40, 0),
  passThrough: optBool(false),
  kitchenLed: optBool(false),
  mirrorLed: optBool(false),
  decorLed: optBool(false),
  dimming: optBool(false),
  smart: optBool(false),
});

export const BathroomsSchema = v.object({
  washerInBath: optBool(false),
  dryerInBath: optBool(false),
  boilerInBath: optBool(false),
  floorHeatInBath: optBool(false),
  electricTowel: optBool(false),
  /** Система уравнивания потенциалов */
  supRequired: optBool(true),
});

export const SensorsSchema = v.object({
  leakage: optBool(false),
  valves: optBool(false),
  smoke: optBool(false),
  motion: optBool(false),
  openSensor: optBool(false),
  temp: optBool(false),
  smartHome: optBool(false),
  curtains: optBool(false),
});

export const PANEL_OPTION_IDS = [
  'fireRcd',
  'voltageRelay',
  'phaseRelay',
  'spd',
  'selectiveRcd',
  'separateRcds',
  'rcbo',
  'nonDisconnect',
  'fridgeLine',
  'netLine',
  'contactor',
  'bypass',
  'voltIndication',
  'wattmeter',
  'powerLimit',
  'reserveBreakers',
  'extraPanel',
] as const;

export const PanelOptionsSchema = v.object(
  Object.fromEntries(
    PANEL_OPTION_IDS.map((id) => [id, optBool(false)])
  ) as Record<
    (typeof PANEL_OPTION_IDS)[number],
    v.OptionalSchema<v.BooleanSchema<undefined>, false>
  >
);

export const PANEL_DEFAULTS: Record<
  (typeof PANEL_OPTION_IDS)[number],
  boolean
> = Object.fromEntries(PANEL_OPTION_IDS.map((id) => [id, false])) as Record<
  (typeof PANEL_OPTION_IDS)[number],
  boolean
>;

export const PanelSchema = v.object({
  phases: v.optional(PhasesSchema, '1' as const),
  mainBreakerA: optInt(10, 100, 40),
  grounding: v.optional(GroundingSchema, 'unknown' as const),
  inputA: optInt(10, 100, 40),
  reserveModules: optInt(0, 24, 4),
  options: v.optional(PanelOptionsSchema, { ...PANEL_DEFAULTS }),
});

export const WorkSchema = v.object({
  electricians: optInt(1, 6, 2),
  complexityK: optNum(0.8, 1.6, 1),
  uncertaintyK: optNum(1, 1.6, 1.15),
});

export const ProjectSchema = v.object({
  schemaVersion: v.optional(v.literal(SCHEMA_VERSION), SCHEMA_VERSION),
  meta: MetaSchema,
  general: GeneralSchema,
  power: v.optional(PowerSchema, { consumers: [] }),
  ac: v.optional(AcSchema, {}),
  lowVoltage: v.optional(LowVoltageSchema, {}),
  lighting: v.optional(LightingSchema, {}),
  bathrooms: v.optional(BathroomsSchema, {}),
  sensors: v.optional(SensorsSchema, {}),
  panel: v.optional(PanelSchema, {}),
  work: v.optional(WorkSchema, {}),
});

export type PanelOptionId = (typeof PANEL_OPTION_IDS)[number];

export const PANEL_OPTION_LABELS: Record<PanelOptionId, string> = {
  fireRcd: 'Противопожарное УЗО',
  voltageRelay: 'Реле напряжения',
  phaseRelay: 'Реле контроля фаз',
  spd: 'УЗИП',
  selectiveRcd: 'Селективное УЗО',
  separateRcds: 'Отдельные УЗО на группы',
  rcbo: 'Дифавтоматы вместо УЗО+АВ',
  nonDisconnect: 'Неотключаемые линии',
  fridgeLine: 'Отдельная линия холодильника',
  netLine: 'Линия интернета/оборудования',
  contactor: 'Контактор',
  bypass: 'Ручной/авто байпас',
  voltIndication: 'Индикация напряжения',
  wattmeter: 'Модульный ваттметр',
  powerLimit: 'Ограничение мощности',
  reserveBreakers: 'Резервные автоматы',
  extraPanel: 'Доп. щит / слаботочный шкаф',
};
