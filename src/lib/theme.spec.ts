import { describe, expect, it } from 'vitest';
import { THEMES, THEME_TITLES, Theme, resolveTheme } from '#lib/theme';

describe('theme', () => {
  it('резолвит cookie в тему', () => {
    expect(resolveTheme('dark')).toBe(Theme.Dark);
    expect(resolveTheme('light')).toBe(Theme.Light);
  });

  it('отсутствие и мусор = системная тема', () => {
    expect(resolveTheme(undefined)).toBe(Theme.System);
    expect(resolveTheme('')).toBe(Theme.System);
    expect(resolveTheme('system')).toBe(Theme.System);
    expect(resolveTheme('DARK')).toBe(Theme.System);
  });

  it('у каждой темы есть подпись', () => {
    for (const t of THEMES) {
      expect(THEME_TITLES[t]).toBeTruthy();
    }
  });
});
