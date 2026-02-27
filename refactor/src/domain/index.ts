/**
 * Публичный API доменного слоя для app/di и внешних адаптеров.
 * Импорты из домена во внешние слои должны идти через этот файл.
 */
export { createEventGateway } from './eventGateway.js';
export type { EventGateway } from './contracts/index.js';
export * from './contracts/index.js';
