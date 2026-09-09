import type { Material } from '#lib/catalog/types';
import type { Project } from '#lib/project/types';
import { calculate } from './engine';

/**
 * What-if для блока «Что влияет / где сэкономить» (п.8 ТЗ).
 * Для каждой отключаемой опции считаем дельту пересчётом движка.
 */
export interface SavingOption {
  id: string;
  label: string;
  /** Применить «выключенное» состояние к копии проекта. */
  disable: (p: Project) => void;
}

export const SAVING_OPTIONS: SavingOption[] = [
  {
    id: 'voltageRelay',
    label: 'Отказаться от реле напряжения',
    disable: (p) => {
      p.panel.options.voltageRelay = false;
    },
  },
  {
    id: 'spd',
    label: 'Отказаться от УЗИП',
    disable: (p) => {
      p.panel.options.spd = false;
    },
  },
  {
    id: 'ledPanel',
    label: 'LED-щит → питание от общей фазы света',
    disable: (p) => {
      p.lighting.ledPanel = false;
    },
  },
  {
    id: 'fireRcd',
    label: 'Отказаться от противопожарного УЗО',
    disable: (p) => {
      p.panel.options.fireRcd = false;
    },
  },
  {
    id: 'rcbo',
    label: 'Дифавтоматы → обычные УЗО',
    disable: (p) => {
      p.panel.options.rcbo = false;
    },
  },
  {
    id: 'dimming',
    label: 'Отказаться от диммирования',
    disable: (p) => {
      p.lighting.dimming = false;
    },
  },
  {
    id: 'curtains',
    label: 'Отказаться от электрокарнизов',
    disable: (p) => {
      p.sensors.curtains = false;
    },
  },
];

export interface Saving {
  id: string;
  label: string;
  deltaRub: number;
}

function clone(p: Project): Project {
  return JSON.parse(JSON.stringify(p)) as Project;
}

export function calcSavings(base: Project, catalog: Material[]): Saving[] {
  const baseTotal = calculate(base, catalog).totalRub;
  const out: Saving[] = [];
  for (const opt of SAVING_OPTIONS) {
    const copy = clone(base);
    opt.disable(copy);
    const total = calculate(copy, catalog).totalRub;
    const delta = baseTotal - total;
    if (delta > 0)
      out.push({ id: opt.id, label: opt.label, deltaRub: Math.round(delta) });
  }
  return out.sort((a, b) => b.deltaRub - a.deltaRub);
}
