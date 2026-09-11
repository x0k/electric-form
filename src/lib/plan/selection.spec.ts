import { describe, expect, it } from 'vitest';
import {
  clearSelection,
  selectEntity,
  toggleEntity,
} from '#lib/plan/selection';

describe('selection', () => {
  it('клик выбирает объект, клик по пустому месту снимает выбор', () => {
    expect(selectEntity('w1')).toBe('w1');
    expect(selectEntity(null)).toBe(null);
  });

  it('тоггл: повторный клик снимает выбор', () => {
    expect(toggleEntity(null, 'w1')).toBe('w1');
    expect(toggleEntity('w1', 'w1')).toBe(null);
    expect(toggleEntity('w1', 'w2')).toBe('w2');
  });

  it('очистка снимает любой выбор', () => {
    expect(clearSelection()).toBe(null);
  });
});
