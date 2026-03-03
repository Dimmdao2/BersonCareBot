import type { IncomingEvent, Orchestrator, OrchestratorResult } from '../contracts/index.js';
import { resolveScript, type RubitimeRecipientContext } from './resolver.js';
import { runScript } from './runner.js';

type CreateOrchestratorInput = {
  resolveRubitimeRecipientContext?: (phoneNormalized: string) => Promise<RubitimeRecipientContext>;
};

/**
 * Создает оркестратор событий.
 * На текущем шаге это каркас: resolver + runner без полной бизнес-реализации.
 */
export function createOrchestrator(input: CreateOrchestratorInput = {}): Orchestrator {
  return {
    async orchestrate(event: IncomingEvent): Promise<OrchestratorResult> {
      const script = await resolveScript(
        event,
        input.resolveRubitimeRecipientContext
          ? { resolveRubitimeRecipientContext: input.resolveRubitimeRecipientContext }
          : {},
      );
      return runScript(script, { event, values: {} });
    },
  };
}
