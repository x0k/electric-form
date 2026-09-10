import type { Component } from 'svelte';
import {
  Bot,
  Cable,
  CircuitBoard,
  Lightbulb,
  Package,
  Plug,
  ShieldCheck,
  Wallet,
  Wifi,
  Wrench,
} from '@lucide/svelte';
import type { CostCategory } from '#lib/catalog/types';

export interface CategoryStyle {
  color: string;
  Icon: Component;
}

/** Цвет + иконка категории для графа затрат. */
export const CATEGORY_STYLES: Record<CostCategory, CategoryStyle> = {
  cable: { color: '#f59e0b', Icon: Cable },
  mounting: { color: '#78716c', Icon: Wrench },
  sockets: { color: '#8b5cf6', Icon: Plug },
  panel: { color: '#0ea5e9', Icon: CircuitBoard },
  lowvoltage: { color: '#14b8a6', Icon: Wifi },
  lighting: { color: '#eab308', Icon: Lightbulb },
  grounding: { color: '#22c55e', Icon: ShieldCheck },
  automation: { color: '#f43f5e', Icon: Bot },
  other: { color: '#94a3b8', Icon: Package },
};

export const ROOT_STYLE: CategoryStyle = {
  color: '#6366f1',
  Icon: Wallet,
};
