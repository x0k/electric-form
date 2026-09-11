/**
 * Публичный фасад модуля «Планировка», Этап 1 (Domain Model).
 *
 * Намеренно без Svelte и без 3D-движка: чистый домен, который рендерер
 * позже будет только отображать (Renderer Adapter, §7 ТЗ).
 */

export * from './geometry';
export * from './model';
export * from './operations';
export * from './history';
