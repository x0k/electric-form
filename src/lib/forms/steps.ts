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
  { id: 'lighting', title: 'Освещение', paths: [['lighting']] },
  { id: 'lowvoltage', title: 'Слаботочка', paths: [['lowVoltage']] },
  {
    id: 'sensors',
    title: 'Безопасность и автоматика',
    paths: [['sensors']],
  },
  { id: 'panel', title: 'Щит', paths: [['panel']] },
  { id: 'result', title: 'Итог', paths: [['work']] },
];
