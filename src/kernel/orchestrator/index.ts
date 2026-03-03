import type { IncomingEvent, Orchestrator, OrchestratorResult } from '../contracts/index.js';
import { resolveScript } from './resolver.js';
import { runScript } from './runner.js';

/**
 * Создает оркестратор событий.
 * На текущем шаге это каркас: resolver + runner без полной бизнес-реализации.
 */
export function createOrchestrator(): Orchestrator {
  return {
    async orchestrate(event: IncomingEvent): Promise<OrchestratorResult> {
      const script = resolveScript(event);
      return runScript(script, { event, values: {} });
    },
  };
}
