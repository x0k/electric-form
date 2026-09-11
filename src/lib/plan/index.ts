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
export * from './sketch';
export * from './camera';
export * from './viewport';
export * from './layout';
export * from './gcs';
export * from './openings';
export * from './catalog';
export * from './furnish';
export * from './electrics';
export * from './lighting';
export * from './conflicts';
export * from './autoplace';
export * from './placing';
export * from './polygon';
