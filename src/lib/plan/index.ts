/**
 * Публичный фасад модуля «Планировка».
 *
 * Этап 1 (Domain Model) — чистый домен без Svelte и 3D-движка.
 * Этап 2 (Renderer foundation) — нейтральный маппинг Model → RenderScene
 * (по-прежнему без three.js) + состояние выбора; сам three.js живёт только
 * в PlanViewer.svelte и на демо-странице /plan.
 */

export * from './geometry';
export * from './model';
export * from './operations';
export * from './history';
export * from './render';
export * from './selection';
export * from './sample';
