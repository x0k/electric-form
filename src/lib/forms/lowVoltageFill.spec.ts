import { getInput, isEdited } from '@formisch/svelte';
import { describe, expect, it } from 'vitest';
import { createProjectForm } from '#lib/forms/ctx';
import {
  deriveEthernetPoints,
  deriveTvOutlets,
  deriveWifiAP,
  fillLowVoltageDefaults,
} from '#lib/forms/derived';
import { createDefaultProject } from '#lib/project/defaults';
import { parseProject } from '#lib/project/validate';

describe('low voltage explicit fill', () => {
  it('дефолт нули, кнопка проставляет типовые как явный ввод', () => {
    const project = createDefaultProject('lv');
    const form = createProjectForm(project);
    expect(getInput(form, { path: ['lowVoltage', 'ethernetPoints'] })).toBe(0);

    expect(fillLowVoltageDefaults(form, project)).toBe(3);
    const tv = deriveTvOutlets(project.general);
    const wifi = deriveWifiAP(project.general);
    expect(getInput(form, { path: ['lowVoltage', 'tvOutlets'] })).toBe(tv);
    expect(getInput(form, { path: ['lowVoltage', 'wifiAP'] })).toBe(wifi);
    expect(getInput(form, { path: ['lowVoltage', 'ethernetPoints'] })).toBe(
      deriveEthernetPoints(tv, wifi)
    );
    // Явный ввод: поля помечены edited, живая синхронизация их не тронет.
    expect(isEdited(form, { path: ['lowVoltage', 'tvOutlets'] })).toBe(true);
    // Форма целиком остаётся валидной.
    const parsed = parseProject(getInput(form));
    expect(parsed.ok).toBe(true);
  });
});
