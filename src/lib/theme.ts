export enum Theme {
  System = 'system',
  Light = 'light',
  Dark = 'dark',
}

export const THEME_TITLES: Record<Theme, string> = {
  [Theme.System]: 'Системная',
  [Theme.Light]: 'Светлая',
  [Theme.Dark]: 'Тёмная',
};

export const THEMES = Object.values(Theme);

export type DarkOrLight = Theme.Dark | Theme.Light;

/** Cookie хранит только resolved-значение; отсутствие cookie = системная тема. */
export function resolveTheme(value: string | undefined): Theme {
  if (value === Theme.Dark) return Theme.Dark;
  if (value === Theme.Light) return Theme.Light;
  return Theme.System;
}
