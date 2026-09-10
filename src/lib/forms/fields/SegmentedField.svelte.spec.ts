import { getInput } from '@formisch/svelte';
import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from 'vitest-browser-svelte';
import SegmentedFieldHarness from './SegmentedFieldHarness.svelte';
import type { ProjectForm } from '#lib/forms/ctx';

afterEach(() => cleanup());

describe('SegmentedField', () => {
  it('выбор кнопки пишет значение в стор', async () => {
    let form: ProjectForm | undefined;
    await render(SegmentedFieldHarness, {
      props: {
        path: ['general', 'stage'],
        label: 'Стадия объекта',
        options: [
          { value: 'rough', label: 'Черновой' },
          { value: 'whitebox', label: 'White box' },
          {
            value: 'lived',
            label: 'Жилая',
            hint: 'Ремонт готов: минимум штроб и пыли',
          },
        ],
        onform: (f: ProjectForm) => (form = f),
      },
    });
    await vi.waitFor(() => {
      if (!form) throw new Error('форма не создана');
    });

    const lived = page.getByRole('radio', { name: 'Жилая' });
    await expect.element(lived).toHaveAttribute('aria-checked', 'false');

    await lived.click();
    expect(getInput(form as ProjectForm, { path: ['general', 'stage'] })).toBe(
      'lived'
    );
    await expect.element(lived).toHaveAttribute('aria-checked', 'true');
    // Пояснение выбранного варианта видно под кнопками.
    await expect
      .element(page.getByText('Ремонт готов: минимум штроб и пыли'))
      .toBeVisible();
  });
});
