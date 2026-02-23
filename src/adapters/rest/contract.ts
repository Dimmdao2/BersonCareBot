/**
 * REST API contract — явные типы ответов эндпоинтов.
 */

export type HealthResponse = {
  ok: true;
  db: 'up' | 'down';
};
