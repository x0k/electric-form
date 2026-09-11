import { describe, expect, it } from 'vitest';
import { isGcsLoaded, solveWithGcs } from '#lib/plan/gcs';

/**
 * Изоляция файла: сюда НЕ добавляем ensureGcsLoaded — проверяем,
 * что solve без загрузки громко падает, а не тихо врёт.
 * (Vitest изолирует файлы, синглтон здесь девственно пуст.)
 */
describe('gcs: без загрузки', () => {
  it('solve без ensureGcsLoaded бросает исключение', () => {
    expect(isGcsLoaded()).toBe(false);
    expect(() => solveWithGcs([{ id: 'p1', x: 0, y: 0 }], [])).toThrow(
      /не загружен/
    );
  });
});
