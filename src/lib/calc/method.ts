/**
 * Методика расчёта v1 — все коэффициенты в одном файле (п.7 ТЗ).
 * Меняем методику здесь, не трогая UI и правила по отдельности.
 */
export const METHOD = {
  /** Типовые точки при noLayoutMode / socketsEstimate=0 */
  socketsPerRoom: 8,
  socketsKitchen: 6,
  socketsPerBathroom: 4,
  socketsBase: 4,
  /** Метры кабеля */
  cablePerSocketM: 6,
  cablePerDedicatedLineM: 12,
  cablePerAcM: 15,
  cablePerLightPointM: 5,
  cablePerAreaM: 1.2,
  inputCableM: 10,
  /** Слаботочка */
  utpPerPointM: 12,
  utpPerCameraM: 20,
  tvPerOutletM: 10,
  /** Закладная под кондиционер */
  chasePerAcM: 10,
  intercomCableM: 15,
  /** Трудозатраты, часов */
  labor: {
    perSocketH: 0.7,
    perLightGroupH: 1.2,
    perLineH: 1.5,
    perPanelModuleH: 0.5,
    perLowVoltagePointH: 0.8,
    baseH: 8,
  },
  hoursPerDay: 8,
} as const;
