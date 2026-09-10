import type { Handle } from '@sveltejs/kit/hooks';

import { Theme, resolveTheme } from '#lib/theme.js';

import { themeManager, createDumbThemeManager } from './theme.svelte';

export const handle: Handle = async ({ event, resolve }) => {
  const theme = resolveTheme(event.cookies.get('theme'));
  Object.assign(themeManager, createDumbThemeManager(theme));
  const response = await resolve(event, {
    transformPageChunk: ({ html }) =>
      // Без cookie отдаём HTML без data-theme: daisyUI следует за ОС через --prefersdark.
      theme === Theme.System
        ? html
        : html.replace('<html', `<html data-theme="${theme}"`),
  });
  return response;
};
