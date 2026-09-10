import { describe, expect, it } from 'vitest';
import { createDefaultProject } from '#lib/project/defaults';
import { createMemoryDb } from './client';
import { getCatalog, setOverride, resetAllOverrides } from './catalog';
import {
  createProject,
  deleteProject,
  duplicateProject,
  ensureProject,
  exportProjects,
  getProject,
  importProjects,
  listProjects,
  saveProject,
} from './projects';

describe('sqlite projects repo', () => {
  it('создаёт, читает, сохраняет и удаляет проект', async () => {
    expect.assertions(7);
    const db = createMemoryDb();
    const p = await createProject(db, 'Двушка 72');
    expect(p.meta.name).toBe('Двушка 72');

    const list = await listProjects(db);
    expect(list).toHaveLength(1);
    expect(list[0].rooms).toBe(2);

    const loaded = await getProject(db, p.meta.id);
    expect(loaded?.meta.name).toBe('Двушка 72');

    const updated = { ...p, general: { ...p.general, areaM2: 72 } };
    const saved = await saveProject(db, updated);
    expect(saved.general.areaM2).toBe(72);

    await deleteProject(db, p.meta.id);
    expect(await listProjects(db)).toHaveLength(0);
    expect(await getProject(db, p.meta.id)).toBeNull();
  });

  it('ensureProject создаёт с заданным id, дублирование копирует', async () => {
    expect.assertions(4);
    const db = createMemoryDb();
    const p = await ensureProject(db, 'custom-id');
    expect(p.meta.id).toBe('custom-id');
    const again = await ensureProject(db, 'custom-id');
    expect(again.meta.id).toBe('custom-id');

    const copy = await duplicateProject(db, 'custom-id');
    expect(copy?.meta.name).toBe('Новая квартира (копия)');
    expect(await listProjects(db)).toHaveLength(2);
  });

  it('импорт/экспорт: битые записи пропускаются', async () => {
    expect.assertions(3);
    const db = createMemoryDb();
    const valid = createDefaultProject('Импорт');
    const n = await importProjects(db, [valid, { nope: true }]);
    expect(n).toBe(1);
    const exported = await exportProjects(db);
    expect(exported).toHaveLength(1);
    await expect(importProjects(db, [{ nope: true }])).rejects.toThrow(
      'нет валидных'
    );
  });
});

describe('sqlite catalog repo', () => {
  it('сид из 53 позиций, overrides мержатся', async () => {
    expect.assertions(5);
    const db = createMemoryDb();
    const { materials, overrides } = await getCatalog(db);
    expect(materials).toHaveLength(53);
    expect(overrides).toEqual({});

    const first = materials[0];
    await setOverride(db, first.id, { priceRub: first.priceRub + 10 });
    const after = await getCatalog(db);
    expect(after.materials[0].priceRub).toBe(first.priceRub + 10);
    expect(Object.keys(after.overrides)).toEqual([first.id]);

    await resetAllOverrides(db);
    const reset = await getCatalog(db);
    expect(reset.overrides).toEqual({});
  });

  it('значение, равное базе, стирает override', async () => {
    expect.assertions(2);
    const db = createMemoryDb();
    const { materials } = await getCatalog(db);
    const first = materials[0];
    await setOverride(db, first.id, { priceRub: first.priceRub + 5 });
    await setOverride(db, first.id, { priceRub: first.priceRub });
    const { overrides } = await getCatalog(db);
    expect(overrides).toEqual({});
    await setOverride(db, 'no-such-id', { priceRub: 1 }).catch((e: Error) => {
      expect(e.message).toMatch('Неизвестный материал');
    });
  });
});
