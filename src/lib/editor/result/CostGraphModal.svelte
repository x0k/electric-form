<script lang="ts">
  import {
    SvelteFlow,
    Controls,
    Background,
    BackgroundVariant,
  } from '@xyflow/svelte';
  import '@xyflow/svelte/dist/style.css';
  import type { BOMLine, WorkStage } from '#lib/calc/types';
  import {
    COST_GRAPH_ROOT_ID,
    buildStageGraph,
    layoutStageGraph,
  } from '#lib/calc/costGraph';
  import CostNode from './CostNode.svelte';
  import FitOnReady from './FitOnReady.svelte';
  import { CATEGORY_STYLES } from './costStyle';
  import type { CostCategory } from '#lib/catalog/types';

  let {
    stage,
    title,
    sub,
    lines,
    onclose,
  }: {
    stage: WorkStage;
    title: string;
    sub: string;
    lines: BOMLine[];
    onclose: () => void;
  } = $props();

  const tree = $derived(buildStageGraph(title, sub, lines));
  // Раскрытые категории; по умолчанию пусто — листы свернуты.
  let expanded = $state<string[]>([]);
  const laid = $derived(layoutStageGraph(tree, new Set(expanded)));
  // Рёбра красим в цвет категории-цели.
  const edges = $derived(
    laid.edges.map((e) => {
      const cat = (e.data as { cat?: CostCategory } | undefined)?.cat;
      const color = cat ? CATEGORY_STYLES[cat].color : '#94a3b8';
      return { ...e, style: `${e.style ?? ''};stroke:${color}` };
    })
  );
  const nodeTypes = { cost: CostNode };
  // Перемонтирование подгоняет вьюпорт под раскрытое дерево.
  const viewKey = $derived(`${stage}:${expanded.join(',')}`);

  function toggle(id: string) {
    const kids = tree.children.get(id);
    if (!kids || kids.length === 0) return;
    if (id === COST_GRAPH_ROOT_ID) return;
    expanded = expanded.includes(id)
      ? expanded.filter((x) => x !== id)
      : [...expanded, id];
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div
  class="fixed inset-0 z-50 flex flex-col bg-base-100"
  style="display:flex;flex-direction:column;height:100dvh;"
  role="dialog"
  aria-modal="true"
  aria-label={title}
>
  <div
    class="flex items-center gap-2 border-b border-base-300 px-3 py-2"
    style="flex:0 0 auto;"
  >
    <div class="min-w-0 flex-1">
      <h2 class="truncate font-bold">{title}</h2>
      <p class="text-xs opacity-60 tabular-nums">
        {sub}
      </p>
    </div>
    <span class="badge badge-ghost badge-sm hidden shrink-0 sm:inline-block"
      >Нажмите на категорию, чтобы развернуть</span
    >
    <button
      type="button"
      class="btn btn-ghost btn-sm shrink-0"
      aria-label="Закрыть схему"
      onclick={onclose}>✕</button
    >
  </div>
  <div class="min-h-[400px] flex-1" style="flex:1 1 auto;min-height:0;">
    {#key viewKey}
      <SvelteFlow
        nodes={laid.nodes}
        {edges}
        {nodeTypes}
        onnodeclick={(e) => toggle(e.node.id)}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        colorMode="system"
      >
        <FitOnReady sig={viewKey} />
        <Controls />
        <Background variant={BackgroundVariant.Dots} />
      </SvelteFlow>
    {/key}
  </div>
</div>
