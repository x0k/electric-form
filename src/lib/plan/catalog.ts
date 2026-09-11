/**
 * Параметрический каталог объектов (этапы 6–7 ТЗ).
 *
 * Каждый объект задаётся типом из каталога + числовыми параметрами
 * (ширина/глубина/высота), а не свободной mesh-болванкой. Редактор
 * показывает маркеры изменения размеров; домен проверяет, что значения
 * лежат в допустимых диапазонах каталога и кратны сетке 1 см.
 */

export type CatalogGroup = 'floor' | 'wall';

export interface CatalogEntry {
  kind: string;
  label: string;
  group: CatalogGroup;
  /** Габариты по умолчанию, мм: ширина × глубина × высота. */
  defW: number;
  defD: number;
  defH: number;
  minW: number;
  maxW: number;
  minD: number;
  maxD: number;
  minH: number;
  maxH: number;
}

/** Напольные объекты: мебель, техника, радиаторы. */
export const FLOOR_CATALOG: CatalogEntry[] = [
  entry('wardrobe', 'Шкаф', 1200, 600, 2000, 400, 2400, 400, 800, 1800, 2400),
  entry(
    'bedSingle',
    'Кровать 1-сп.',
    900,
    2000,
    500,
    800,
    1200,
    1900,
    2200,
    300,
    700
  ),
  entry(
    'bedDouble',
    'Кровать 2-сп.',
    1600,
    2000,
    500,
    1400,
    2000,
    1900,
    2200,
    300,
    700
  ),
  entry('sofa', 'Диван', 2000, 900, 850, 1200, 3000, 800, 1100, 700, 1000),
  entry('armchair', 'Кресло', 800, 800, 850, 600, 1100, 600, 1100, 700, 1000),
  entry('table', 'Стол', 1200, 700, 750, 600, 2400, 500, 1200, 700, 800),
  entry('chair', 'Стул', 450, 450, 800, 400, 600, 400, 600, 750, 950),
  entry(
    'kitchenBase',
    'Кухонный блок',
    2400,
    600,
    900,
    600,
    4800,
    500,
    700,
    850,
    950
  ),
  entry('stove', 'Плита', 600, 600, 900, 500, 900, 500, 700, 850, 950),
  entry(
    'fridge',
    'Холодильник',
    600,
    650,
    1900,
    500,
    900,
    550,
    750,
    1600,
    2100
  ),
  entry(
    'washer',
    'Стиральная машина',
    600,
    600,
    850,
    500,
    700,
    500,
    700,
    800,
    900
  ),
  entry('radiator', 'Радиатор', 1000, 150, 500, 400, 2000, 100, 200, 300, 700),
  entry('tvStand', 'Тумба ТВ', 1400, 400, 500, 800, 2400, 300, 600, 350, 700),
];

/** Навесные объекты: крепятся на стену/потолок, хранят hostId стены. */
export const WALL_CATALOG: CatalogEntry[] = [
  wentry('mirror', 'Зеркало', 600, 50, 800, 300, 1500, 900),
  wentry('wallCabinet', 'Шкафчик', 800, 350, 700, 300, 1800, 1000),
  wentry('hood', 'Вытяжка', 600, 500, 600, 500, 900, 1200),
  wentry('conditioner', 'Кондиционер', 900, 250, 300, 700, 1200, 1800),
  wentry('boiler', 'Водонагреватель', 500, 450, 900, 300, 600, 400),
  wentry('elecShield', 'Электрощит', 400, 150, 600, 300, 800, 1000),
];

function entry(
  kind: string,
  label: string,
  defW: number,
  defD: number,
  defH: number,
  minW: number,
  maxW: number,
  minD: number,
  maxD: number,
  minH: number,
  maxH: number
): CatalogEntry {
  return {
    kind,
    label,
    group: 'floor',
    defW,
    defD,
    defH,
    minW,
    maxW,
    minD,
    maxD,
    minH,
    maxH,
  };
}

function wentry(
  kind: string,
  label: string,
  defW: number,
  defD: number,
  defH: number,
  minW: number,
  maxW: number,
  mountH: number
): CatalogEntry {
  return {
    kind,
    label,
    group: 'wall',
    defW,
    defD,
    defH,
    minW,
    maxW,
    minD: defD,
    maxD: defD,
    minH: 0,
    maxH: mountH,
  };
}

export function findCatalogEntry(kind: string): CatalogEntry | undefined {
  return [...FLOOR_CATALOG, ...WALL_CATALOG].find((e) => e.kind === kind);
}

export function catalogLabel(kind: string): string {
  return findCatalogEntry(kind)?.label ?? kind;
}

/** Проверка габаритов против каталога. null — валидно. */
export function validateDims(
  kind: string,
  wMm: number,
  dMm: number,
  hMm: number
): string | null {
  const e = findCatalogEntry(kind);
  if (!e) return `Неизвестный тип объекта "${kind}".`;
  for (const [v, name] of [
    [wMm, 'ширина'],
    [dMm, 'глубина'],
    [hMm, 'высота'],
  ] as const) {
    if (!Number.isInteger(v)) return `${e.label}: ${name} — целые мм.`;
    if (v % 10 !== 0) return `${e.label}: ${name} ${v} не кратна 1 см.`;
  }
  if (wMm < e.minW || wMm > e.maxW)
    return `${e.label}: ширина ${e.minW}..${e.maxW} мм.`;
  if (dMm < e.minD || dMm > e.maxD)
    return `${e.label}: глубина ${e.minD}..${e.maxD} мм.`;
  if (hMm < e.minH || hMm > e.maxH)
    return `${e.label}: высота ${e.minH}..${e.maxH} мм.`;
  return null;
}
