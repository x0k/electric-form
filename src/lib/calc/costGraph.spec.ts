import { describe, expect, it } from 'vitest';
import { SEED_CATALOG } from '#lib/catalog/index';
import { calculate } from '#lib/calc/engine';
import {
  COST_GRAPH_ROOT_ID,
  buildStageGraph,
  layoutStageGraph,
} from '#lib/calc/costGraph';
import { createDefaultProject } from '#lib/project/defaults';

describe('cost graph', () => {
  it('родитель равен сумме детей на каждом уровне', () => {
    const p = createDefaultProject('g');
    p.sensors.leakQty = 2;
    p.sensors.valveQty = 2;
    const r = calculate(p, SEED_CATALOG);
    for (const stage of ['rough', 'finish'] as const) {
      const lines = r.lines.filter((l) => l.stage === stage);
      const tree = buildStageGraph('Этап', '', lines);
      const byId = new Map(tree.nodes.map((n) => [n.id, n]));
      // Корень = итог этапа.
      expect(byId.get(COST_GRAPH_ROOT_ID)!.data.sum).toBe(r.stageTotals[stage]);
      // Категории = сумма листьев.
      for (const [parent, kids] of tree.children) {
        const psum = byId.get(parent)!.data.sum;
        const ksum = kids.reduce((a, id) => a + byId.get(id)!.data.sum, 0);
        expect(ksum).toBe(psum);
      }
      // Все позиции представлены листьями.
      const leafCount = tree.nodes.filter((n) => n.data.depth === 2).length;
      expect(leafCount).toBe(lines.length);
    }
  });

  it('подпись листа показывает переход запаса как таблица', () => {
    const p = createDefaultProject('w');
    p.sensors.supRequired = true;
    const r = calculate(p, SEED_CATALOG);
    const lines = r.lines.filter((l) => l.stage === 'rough');
    const tree = buildStageGraph('Этап', '', lines);
    // Неделимые комплекты не дублируем: 1 СУП — это 1, без стрелки.
    const sup = tree.nodes.find((n) => n.id === 'leaf:sup:sup-kit');
    expect(sup).toBeDefined();
    expect(sup!.data.sub).not.toContain('→');
    // Расходники с запасом — переход виден (подрозетники 34 → 38).
    const box = tree.nodes.find((n) => n.id === 'leaf:mount-boxes:box-socket');
    expect(box!.data.sub).toContain('→');
  });

  it('категории и позиции отсортированы по убыванию суммы, доли сходятся', () => {
    const p = createDefaultProject('s');
    p.sensors.leakQty = 2;
    p.sensors.valveQty = 2;
    const r = calculate(p, SEED_CATALOG);
    const lines = r.lines.filter((l) => l.stage === 'finish');
    const tree = buildStageGraph('Этап', '', lines);
    const cats = (tree.children.get(COST_GRAPH_ROOT_ID) ?? []).map((id) =>
      tree.nodes.find((n) => n.id === id)!
    );
    const sums = cats.map((c) => c.data.sum);
    expect([...sums].sort((a, b) => b - a)).toEqual(sums);
    for (const cat of cats) {
      const leaves = (tree.children.get(cat.id) ?? []).map((id) =>
        tree.nodes.find((n) => n.id === id)!
      );
      const lsums = leaves.map((l) => l.data.sum);
      expect([...lsums].sort((a, b) => b - a)).toEqual(lsums);
    }
    // Доли категорий в сумме дают единицу.
    const shareSum = cats.reduce((a, c) => a + c.data.share, 0);
    expect(shareSum).toBeGreaterThan(0.999);
    expect(shareSum).toBeLessThan(1.001);
    // Подпись категории — топ-позиция, а не счётчик.
    for (const cat of cats) {
      const leaves = (tree.children.get(cat.id) ?? []).map((id) =>
        tree.nodes.find((n) => n.id === id)!
      );
      expect(cat.data.sub).toContain(leaves[0].data.title);
    }
  });

  it('по умолчанию листы свернуты, раскрытие показывает листья', () => {
    const p = createDefaultProject('c');
    const r = calculate(p, SEED_CATALOG);
    const lines = r.lines.filter((l) => l.stage === 'rough');
    const tree = buildStageGraph('Этап', '', lines);
    const collapsed = layoutStageGraph(tree, new Set());
    expect(collapsed.nodes.some((n) => n.data.depth === 2)).toBe(false);
    expect(collapsed.nodes.some((n) => n.data.depth === 1)).toBe(true);

    const firstCat = tree.children.get(COST_GRAPH_ROOT_ID)![0];
    const opened = layoutStageGraph(tree, new Set([firstCat]));
    const kids = tree.children.get(firstCat)!;
    expect(kids.length).toBeGreaterThan(0);
    for (const k of kids) {
      expect(opened.nodes.some((n) => n.id === k)).toBe(true);
    }
    // Чужие листья остаются скрыты.
    const otherLeaves = tree.nodes.filter(
      (n) => n.data.depth === 2 && !kids.includes(n.id)
    );
    for (const l of otherLeaves) {
      expect(opened.nodes.some((n) => n.id === l.id)).toBe(false);
    }
  });

  it('dagre раскладывает иерархию слева направо без NaN', () => {
    const p = createDefaultProject('l');
    const r = calculate(p, SEED_CATALOG);
    const lines = r.lines.filter((l) => l.stage === 'rough');
    const tree = buildStageGraph('Этап', '', lines);
    const all = new Set(tree.children.get(COST_GRAPH_ROOT_ID));
    const { nodes, edges } = layoutStageGraph(tree, all);
    const byDepth = (d: number) =>
      nodes.filter((n) => n.data.depth === d).map((n) => n.position.x);
    const maxX = (xs: number[]) => Math.max(...xs);
    const minX = (xs: number[]) => Math.min(...xs);
    // Колонки идут по глубине: корень левее категорий, категории левее листьев.
    expect(maxX(byDepth(0))).toBeLessThan(minX(byDepth(1)));
    expect(maxX(byDepth(1))).toBeLessThan(minX(byDepth(2)));
    for (const n of nodes) {
      expect(Number.isFinite(n.position.x)).toBe(true);
      expect(Number.isFinite(n.position.y)).toBe(true);
    }
    for (const e of edges) {
      expect(e.hidden).toBe(false);
    }
  });
});
