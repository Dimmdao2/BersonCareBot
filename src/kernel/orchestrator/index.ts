import type { ContentPort, ContextQueryPort, Orchestrator } from '../contracts/index.js';
import { buildPlan } from './resolver.js';

/**
 * Создает оркестратор событий.
 * На текущем шаге это каркас: resolver + runner без полной бизнес-реализации.
 */
export function createOrchestrator(deps: {
  contentPort: ContentPort;
  contextQueryPort: ContextQueryPort;
}): Orchestrator {
  return {
    async buildPlan(input) {
      return buildPlan(input, deps);
    },
  };
}
