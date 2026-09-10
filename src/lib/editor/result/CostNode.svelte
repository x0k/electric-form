<script lang="ts">
  import { Handle, Position, type NodeProps } from '@xyflow/svelte';
  import type { CostNodeData } from '#lib/calc/costGraph';
  import { CATEGORY_STYLES, ROOT_STYLE } from './costStyle';

  let { data }: NodeProps = $props();
  const d = $derived(data as CostNodeData);

  function fmt(n: number): string {
    return `${Math.round(n).toLocaleString('ru-RU')} ₽`;
  }

  const style = $derived(d.cat ? CATEGORY_STYLES[d.cat] : ROOT_STYLE);
  const Icon = $derived(style.Icon);
  const pct = $derived(Math.round(d.share * 100));
</script>

<div
  class="w-[240px] rounded-xl border bg-base-100 px-3 py-2 text-left shadow-sm"
  style:border-left={`6px solid ${style.color}`}
  class:cursor-pointer={d.childCount > 0}
  class:hover:shadow-md={d.childCount > 0}
>
  <Handle type="target" position={Position.Left} />
  <div class="flex items-center gap-1.5">
    <span
      aria-hidden="true"
      class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
      style:background={`${style.color}22`}
      style:color={style.color}
    >
      <Icon size={15} />
    </span>
    <span class="min-w-0 flex-1 truncate text-sm font-semibold">{d.title}</span>
    {#if d.depth > 0}
      <span
        class="shrink-0 rounded-full px-1.5 text-xs font-bold tabular-nums"
        style:background={`${style.color}22`}
        style:color={style.color}
      >
        {pct}%
      </span>
    {/if}
    {#if d.childCount > 0}
      <span
        aria-hidden="true"
        class="shrink-0 rounded-full px-1.5 text-xs font-bold tabular-nums"
        class:bg-base-300={!d.expanded}
        class:opacity-70={!d.expanded}
        style:background={d.expanded ? `${style.color}22` : undefined}
        style:color={d.expanded ? style.color : undefined}
      >
        {d.expanded ? '−' : '+'}
      </span>
    {/if}
  </div>
  <div class="mt-0.5 text-sm font-bold tabular-nums">{fmt(d.sum)}</div>
  {#if d.sub}
    <div class="truncate text-xs opacity-60">{d.sub}</div>
  {/if}
  <Handle type="source" position={Position.Right} />
</div>
