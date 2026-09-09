import { describe, expect, it } from 'vitest';
import {
  deriveDoorsCount,
  deriveEthernetPoints,
  deriveLightingGroups,
  deriveTargets,
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
    ...over,
  };
}

describe('derived', () => {
  it('типовая двушка: группы, двери, ТВ, Wi-Fi, ethernet', () => {
    const g = general();
    expect(deriveLightingGroups(g)).toBe(4); // 2 комнаты + кухня + коридор
    expect(deriveDoorsCount(g)).toBe(4); // 2 + 1 + входная
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

  it('цели идут в порядке зависимостей', () => {
    const paths = deriveTargets(general()).map((t) => t.path.join('.'));
    expect(paths).toEqual([
      'general.doorsCount',
      'lighting.groups',
      'lowVoltage.tvOutlets',
      'lowVoltage.wifiAP',
      'lowVoltage.ethernetPoints',
    ]);
  });
});
