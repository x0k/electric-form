export interface WizardStep {
  id: string;
  title: string;
  /** Префиксы путей Valibot для фильтрации ошибок шага. */
  paths: string[][];
}

export const STEPS: WizardStep[] = [
  {
    id: 'general',
    title: 'Общее и планировка',
    paths: [['general'], ['meta']],
  },
  { id: 'power', title: 'Силовые потребители', paths: [['power']] },
  { id: 'ac', title: 'Кондиционеры', paths: [['ac']] },
  { id: 'lowvoltage', title: 'Слаботочка', paths: [['lowVoltage']] },
  { id: 'lighting', title: 'Освещение', paths: [['lighting']] },
  { id: 'bath', title: 'Санузлы / СУП', paths: [['bathrooms']] },
  { id: 'sensors', title: 'Датчики и автоматика', paths: [['sensors']] },
  { id: 'panel', title: 'Щит', paths: [['panel']] },
  { id: 'work', title: 'Работы и сроки', paths: [['work']] },
  { id: 'result', title: 'Итог', paths: [] },
];
