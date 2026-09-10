/** Категории стоимости по п.8 ТЗ. */
export const COST_CATEGORIES = [
  'cable',
  'mounting',
  'sockets',
  'panel',
  'lowvoltage',
  'lighting',
  'grounding',
  'automation',
  'other',
] as const;

export type CostCategory = (typeof COST_CATEGORIES)[number];

export const COST_CATEGORY_LABELS: Record<CostCategory, string> = {
  cable: 'Кабель',
  mounting: 'Монтажные материалы',
  sockets: 'Розетки/выключатели',
  panel: 'Щит и аппаратура',
  lowvoltage: 'Слаботочка',
  lighting: 'Освещение',
  grounding: 'Заземление/СУП',
  automation: 'Автоматика',
  other: 'Прочее',
};

export type Unit = 'm' | 'pcs' | 'set' | 'box';

/** Подписи единиц для сметы. */
export const UNIT_LABELS: Record<Unit, string> = {
  m: 'м',
  pcs: 'шт',
  set: 'компл',
  box: 'кор',
};

export interface Material {
  id: string;
  category: CostCategory;
  name: string;
  unit: Unit;
  /** Цена в рублях за единицу. */
  priceRub: number;
  article?: string;
  /** Запас в % поверх расчёта (переопределяет дефолт категории). */
  wastePct?: number;
}

/** Дефолтные коэффициенты запаса по категориям (п.6 ТЗ). */
export const DEFAULT_WASTE_PCT: Record<CostCategory, number> = {
  cable: 10,
  mounting: 10,
  sockets: 5,
  panel: 0,
  lowvoltage: 10,
  lighting: 5,
  grounding: 10,
  automation: 5,
  other: 15,
};

export type CatalogOverride = Partial<Pick<Material, 'priceRub' | 'wastePct'>>;

export function resolveMaterial(
  base: Material,
  override?: CatalogOverride
): Material & { wastePctResolved: number } {
  const priceRub = override?.priceRub ?? base.priceRub;
  const wastePctResolved =
    override?.wastePct ?? base.wastePct ?? DEFAULT_WASTE_PCT[base.category];
  return { ...base, priceRub, wastePctResolved };
}
