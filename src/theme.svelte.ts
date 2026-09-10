import { MediaQuery } from 'svelte/reactivity';

import { Theme, type DarkOrLight } from '#lib/theme.js';

export interface ThemeManager {
  theme: Theme;
  readonly darkOrLight: DarkOrLight;
  readonly isDark: boolean;
  sync: () => void;
}

const COOKIE_ATTRS = 'path=/; max-age=31536000; SameSite=Lax';

function createThemeManager(
  get: () => Theme | undefined,
  set: (manager: ThemeManager) => void,
  sync: (manager: ThemeManager) => void
) {
  const preferredColorSchemeQuery = new MediaQuery(
    '(prefers-color-scheme: dark)'
  );
  let theme = $state(get() ?? Theme.System);
  const darkOrLight = $derived(
    theme === Theme.System
      ? preferredColorSchemeQuery.current
        ? Theme.Dark
        : Theme.Light
      : theme
  );
  const isDark = $derived(darkOrLight === Theme.Dark);
  const manager = {
    sync() {
      sync(manager);
    },
    get theme() {
      return theme;
    },
    set theme(v) {
      theme = v;
      set(manager);
      sync(manager);
    },
    get darkOrLight() {
      return darkOrLight;
    },
    get isDark() {
      return isDark;
    },
  } satisfies ThemeManager;
  return manager;
}

export function createDumbThemeManager(theme: Theme): ThemeManager {
  const darkOrLight = theme === Theme.Dark ? Theme.Dark : Theme.Light;
  return {
    theme,
    darkOrLight,
    isDark: darkOrLight === Theme.Dark,
    sync() {},
  };
}

export let themeManager: ThemeManager = createDumbThemeManager(Theme.System);

$effect.root(() => {
  // Модуль импортируется и на сервере (hooks.server.ts) — document там нет.
  if (typeof document === 'undefined') return;
  themeManager = createThemeManager(
    () => {
      const t = document.documentElement.dataset.theme;
      return t === Theme.Dark || t === Theme.Light ? t : undefined;
    },
    (m) => {
      // System не персистим: без cookie сервер отдаёт HTML без data-theme
      // и daisyUI сам следует за ОС через --prefersdark.
      document.cookie =
        m.theme === Theme.System
          ? 'theme=; path=/; max-age=0; SameSite=Lax'
          : `theme=${m.darkOrLight}; ${COOKIE_ATTRS}`;
    },
    (m) => {
      if (m.theme === Theme.System) {
        delete document.documentElement.dataset.theme;
      } else {
        document.documentElement.dataset.theme = m.darkOrLight;
      }
    }
  );
});
