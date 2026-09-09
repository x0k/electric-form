import * as v from 'valibot';

/**
 * Строгая схема: все поля обязательные. Неполные данные отклоняются
 * парсером, а не дополняются фолбэками.
 */
const int = (min: number, max: number) =>
  v.pipe(v.number(), v.integer(), v.minValue(min), v.maxValue(max));

const num = (min: number, max: number) =>
  v.pipe(v.number(), v.minValue(min), v.maxValue(max));

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
  'vent',
  'conditioner',
  'grinder',
  'other',
] as const);

export const MetaSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
  name: v.pipe(v.string(), v.minLength(1)),
  createdAt: v.pipe(v.string(), v.minLength(1)),
  updatedAt: v.pipe(v.string(), v.minLength(1)),
  comment: v.string(),
});

export const GeneralSchema = v.object({
  areaM2: num(5, 500),
  rooms: int(0, 12),
  bathrooms: int(0, 5),
  kitchenPresent: v.boolean(),
  balcony: v.boolean(),
  /** Пока нет точной планировки — считаем по типовым значениям. */
  noLayoutMode: v.boolean(),
  stage: StageSchema,
  doorsCount: int(0, 30),
  /** Ручная оценка точек; 0 = автооценка. */
  socketsEstimate: int(0, 300),
  /** Ввод в квартиру: свойства сети здания, а не щита. */
  phases: PhasesSchema,
  mainBreakerA: int(10, 100),
  grounding: GroundingSchema,
  inputA: int(10, 100),
});

export const PowerConsumerSchema = v.object({
  kind: ConsumerKindSchema,
  present: v.boolean(),
  qty: int(0, 10),
  dedicatedLine: v.boolean(),
  powerKw: num(0, 15),
});

export const PowerSchema = v.object({
  consumers: v.array(PowerConsumerSchema),
  /** Штробы и дренаж под кондиционеры до ремонта. */
  conditionerChase: v.boolean(),
});

export const LowVoltageSchema = v.object({
  ethernetPoints: int(0, 40),
  tvOutlets: int(0, 20),
  wifiAP: int(0, 10),
  poe: v.boolean(),
  intercom: v.boolean(),
  cameras: int(0, 16),
  nas: v.boolean(),
});

export const LightingSchema = v.object({
  groups: int(0, 40),
  /** Проходных из общего числа выключателей; пусто/0 = все обычные. */
  passThroughQty: int(0, 40),
  /** Явные количества комплектов подсветки; пусто/0 = нет. */
  ledKitchenQty: int(0, 10),
  ledMirrorQty: int(0, 20),
  ledDecorQty: int(0, 10),
  /** Диммеров для комнатного света; пусто/0 = без диммирования. */
  dimmerQty: int(0, 40),
  smart: v.boolean(),
  /** Отдельный щит под ленту: от него тянутся отдельные линии (больше кабеля). */
  ledPanel: v.boolean(),
  /** Управление лентой: обычный диммер или push-кнопка. */
  ledControl: v.picklist(['triac', 'push'] as const),
  /** Плавный пуск ленты (для обычной установки через выключатель/диммер). */
  ledSoftstart: v.boolean(),
});

export const SensorsSchema = v.object({
  /** Явные количества; пусто/0 = нет. Степперы видны всегда. */
  leakQty: int(0, 30),
  valveQty: int(0, 20),
  smokeQty: int(0, 30),
  motionQty: int(0, 30),
  openSensor: v.boolean(),
  temp: v.boolean(),
  smartHome: v.boolean(),
  curtainQty: int(0, 20),
  /** Система уравнивания потенциалов */
  supRequired: v.boolean(),
});

export const PANEL_OPTION_IDS = [
  'fireRcd',
  'voltageRelay',
  'phaseRelay',
  'spd',
  'separateRcds',
  'rcbo',
  'fridgeLine',
  'netLine',
  'contactor',
  'voltIndication',
  'wattmeter',
  'reserveBreakers',
  'extraPanel',
] as const;

export const PanelOptionsSchema = v.object(
  Object.fromEntries(PANEL_OPTION_IDS.map((id) => [id, v.boolean()])) as Record<
    (typeof PANEL_OPTION_IDS)[number],
    v.BooleanSchema<undefined>
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
  reserveModules: int(0, 24),
  options: PanelOptionsSchema,
});

export const WorkSchema = v.object({
  electricians: int(1, 6),
  complexityK: num(0.8, 1.6),
  uncertaintyK: num(1, 1.6),
});

export const ScopeSchema = v.object({
  /** Розетки и выключатели покупает/ставит заказчик — исключаем из сметы. */
  customerSockets: v.boolean(),
});

export const ProjectSchema = v.object({
  meta: MetaSchema,
  general: GeneralSchema,
  power: PowerSchema,
  lowVoltage: LowVoltageSchema,
  lighting: LightingSchema,
  sensors: SensorsSchema,
  panel: PanelSchema,
  work: WorkSchema,
  scope: ScopeSchema,
});

export type PanelOptionId = (typeof PANEL_OPTION_IDS)[number];

export const PANEL_OPTION_LABELS: Record<PanelOptionId, string> = {
  fireRcd: 'Противопожарное УЗО',
  voltageRelay: 'Реле напряжения',
  phaseRelay: 'Реле контроля фаз',
  spd: 'УЗИП',
  separateRcds: 'Отдельные УЗО на группы',
  rcbo: 'Дифавтоматы вместо УЗО+АВ',
  fridgeLine: 'Отдельная линия холодильника',
  netLine: 'Линия интернета/оборудования',
  contactor: 'Контактор',
  voltIndication: 'Индикация напряжения',
  wattmeter: 'Модульный ваттметр',
  reserveBreakers: 'Резервные автоматы',
  extraPanel: 'Доп. щит / слаботочный шкаф',
};
