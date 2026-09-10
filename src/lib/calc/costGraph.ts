import dagre from '@dagrejs/dagre';
import { Position, type Edge, type Node } from '@xyflow/svelte';
import {
  COST_CATEGORIES,
  COST_CATEGORY_LABELS,
  UNIT_LABELS,
  type CostCategory,
} from '#lib/catalog/types';
import type { BOMLine } from './types';

export interface CostNodeData extends Record<string, unknown> {
  title: string;
  sum: number;
  /** Доля от итога этапа (0–1); у корня всегда 1. */
  share: number;
  sub: string;
  depth: 0 | 1 | 2;
  /** Категория ветки (у корня null) — для цвета и иконки. */
  cat: CostCategory | null;
  /** Сколько дочерних узлов (0 — лист, клик ничего не делает). */
  childCount: number;
  expanded: boolean;
}

export type CostFlowNode = Node<CostNodeData, 'cost'>;

/** Полное статичное дерево этапа: корень → категории → позиции. */
export interface CostTree {
  nodes: CostFlowNode[];
  edges: Edge[];
  /** id → дочерние id (для сворачивания). */
  children: Map<string, string[]>;
}

export const COST_GRAPH_ROOT_ID = 'root';

/** Оценочные размеры нод для dagre (CSS: w-[240px], высота по глубине). */
const NODE_W = 240;
const NODE_H_BY_DEPTH = [110, 100, 88];

function fmt(n: number): string {
  return `${Math.round(n).toLocaleString('ru-RU')} ₽`;
}

function leafSub(l: BOMLine): string {
  // Как в таблице: запас показываем переходом, иначе количество загадочно.
  const qty =
    l.qtyWithWaste !== l.qty ? `${l.qty} → ${l.qtyWithWaste}` : `${l.qty}`;
  return `${qty} ${UNIT_LABELS[l.unit]} × ${fmt(l.priceRub)}`;
}

/**
 * Дерево этапа из строк сметы. Суммы родителей всегда равны сумме детей —
 * это проверяет спек (инвариант «родитель = сумма дочерних»).
 */
export function buildStageGraph(
  title: string,
  sub: string,
  lines: BOMLine[]
): CostTree {
  const total = lines.reduce((a, l) => a + l.sumRub, 0);
  const shareOf = (sum: number): number =>
    total > 0 ? Math.round((sum / total) * 1000) / 1000 : 0;
  const nodes: CostFlowNode[] = [
    {
      id: COST_GRAPH_ROOT_ID,
      type: 'cost',
      position: { x: 0, y: 0 },
      data: {
        title,
        sum: total,
        share: 1,
        sub,
        depth: 0,
        cat: null,
        childCount: 0,
        expanded: true,
      },
    },
  ];
  const edges: Edge[] = [];
  const children = new Map<string, string[]>();
  const catIds: string[] = [];

  // Крупнейшие траты — первыми: сверху видно, куда уходят деньги.
  const cats = COST_CATEGORIES.map((c) => ({
    c: c as CostCategory,
    catLines: lines
      .filter((l) => l.category === c)
      .sort((a, b) => b.sumRub - a.sumRub),
  })).filter((x) => x.catLines.length > 0);
  cats.sort(
    (a, b) =>
      b.catLines.reduce((s, l) => s + l.sumRub, 0) -
      a.catLines.reduce((s, l) => s + l.sumRub, 0)
  );

  for (const { c, catLines } of cats) {
    const catId = `cat:${c}`;
    const catSum = catLines.reduce((a, l) => a + l.sumRub, 0);
    const leafIds = catLines.map((l) => `leaf:${l.ruleId}:${l.materialId}`);
    catIds.push(catId);
    nodes.push({
      id: catId,
      type: 'cost',
      position: { x: 0, y: 0 },
      data: {
        title: COST_CATEGORY_LABELS[c as CostCategory],
        sum: catSum,
        share: shareOf(catSum),
        // Топ-позиция вместо счётчика: сразу видно главный драйвер.
        sub: `${catLines[0].materialName} — ${fmt(catLines[0].sumRub)}`,
        depth: 1,
        cat: c,
        childCount: leafIds.length,
        expanded: false,
      },
    });
    edges.push({
      id: `e:${COST_GRAPH_ROOT_ID}:${catId}`,
      source: COST_GRAPH_ROOT_ID,
      target: catId,
      style: `stroke-width:${edgeWidth(catSum, total)}`,
      data: { cat: c },
    });
    children.set(catId, leafIds);
    for (let i = 0; i < catLines.length; i++) {
      const l = catLines[i];
      nodes.push({
        id: leafIds[i],
        type: 'cost',
        position: { x: 0, y: 0 },
        data: {
          title: l.materialName,
          sum: l.sumRub,
          share: shareOf(l.sumRub),
          sub: leafSub(l),
          depth: 2,
          cat: c,
          childCount: 0,
          expanded: false,
        },
      });
      edges.push({
        id: `e:${catId}:${leafIds[i]}`,
        source: catId,
        target: leafIds[i],
        style: `stroke-width:${edgeWidth(l.sumRub, total)}`,
        data: { cat: c },
      });
    }
  }

  const root = nodes[0];
  root.data.childCount = catIds.length;
  children.set(COST_GRAPH_ROOT_ID, catIds);
  return { nodes, edges, children };
}

function edgeWidth(sum: number, total: number): number {
  if (total <= 0) return 1;
  return Math.round((1 + 7 * (sum / total)) * 10) / 10;
}

/**
 * Видимый подграф: корень и категории всегда, листья — только раскрытых
 * категорий. По умолчанию раскрыто пусто: листы свернуты.
 */
export function layoutStageGraph(
  tree: CostTree,
  expanded: ReadonlySet<string>
): { nodes: CostFlowNode[]; edges: Edge[] } {
  const visibleCats = tree.children.get(COST_GRAPH_ROOT_ID) ?? [];
  const visible = new Set<string>([COST_GRAPH_ROOT_ID, ...visibleCats]);
  for (const catId of visibleCats) {
    if (expanded.has(catId)) {
      for (const leafId of tree.children.get(catId) ?? []) {
        visible.add(leafId);
      }
    }
  }

  // Автораскладка иерархии по примеру dagre: слева направо.
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 30, ranksep: 90 });
  const byId = new Map(tree.nodes.map((n) => [n.id, n]));
  for (const id of visible) {
    const depth = byId.get(id)!.data.depth;
    g.setNode(id, { width: NODE_W, height: NODE_H_BY_DEPTH[depth] });
  }
  for (const e of tree.edges) {
    if (visible.has(e.source) && visible.has(e.target)) {
      g.setEdge(e.source, e.target);
    }
  }
  dagre.layout(g);

  const nodes: CostFlowNode[] = [];
  for (const id of visible) {
    const n = byId.get(id)!;
    const pos = g.node(id);
    const depth = n.data.depth;
    nodes.push({
      ...n,
      targetPosition: Position.Left,
      sourcePosition: Position.Right,
      // У dagre якорь по центру, у Svelte Flow — слева сверху.
      position: {
        x: pos.x - NODE_W / 2,
        y: pos.y - NODE_H_BY_DEPTH[depth] / 2,
      },
      data: {
        ...n.data,
        expanded: depth === 0 ? true : depth === 1 ? expanded.has(id) : false,
      },
    });
  }

  const edges = tree.edges
    .filter((e) => visible.has(e.source) && visible.has(e.target))
    .map((e) => ({ ...e, hidden: false }));
  return { nodes, edges };
}
