import { describe, expect, it } from 'vitest';
import {
  deriveDoorsCount,
  deriveEthernetPoints,
  deriveLightingGroups,
  deriveSocketsEstimate,
  deriveTvOutlets,
  deriveWifiAP,
} from '#lib/forms/derived';
import type { General } from '#lib/project/types';

function general(over: Partial<General> = {}): General {
  return {
    areaM2: 60,
    rooms: 2,
    bathrooms: 1,
    kitchenPresent: true,
    balcony: false,
    noLayoutMode: true,
    stage: 'whitebox',
    doorsCount: 0,
    socketsEstimate: 0,
    corrugation: false,
    phases: '1',
    mainBreakerA: 40,
    grounding: 'unknown',
    inputA: 40,
    ...over,
  };
}

describe('derived', () => {
  it('типовая двушка: группы, двери, розетки, ТВ, Wi-Fi, ethernet', () => {
    const g = general();
    expect(deriveLightingGroups(g)).toBe(4); // 2 комнаты + кухня + коридор
    expect(deriveDoorsCount(g)).toBe(4); // 2 + 1 + входная
    expect(deriveSocketsEstimate(g)).toBe(30); // 2×8 + 6 + 4 + 4
    expect(deriveTvOutlets(g)).toBe(2);
    expect(deriveWifiAP(g)).toBe(1); // 60 м²
    expect(deriveEthernetPoints(2, 1)).toBe(4); // ТВ + Wi-Fi + рабочее место
  });

  it('крайние случаи не уходят в ноль/минус', () => {
    const studio = general({ rooms: 0, bathrooms: 0, kitchenPresent: false });
    expect(deriveLightingGroups(studio)).toBe(1);
    expect(deriveDoorsCount(studio)).toBe(1);
    expect(deriveTvOutlets(studio)).toBe(1);
    const big = general({ areaM2: 150 });
    expect(deriveWifiAP(big)).toBe(3);
  });

  it('типовые розетки считаются по комнатам/кухне/санузлам', () => {
    expect(deriveSocketsEstimate(general())).toBe(30);
    const studio = general({ rooms: 0, bathrooms: 0, kitchenPresent: false });
    expect(deriveSocketsEstimate(studio)).toBe(4);
  });
});
