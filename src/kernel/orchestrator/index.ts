import type { IncomingEvent, Orchestrator, OrchestratorResult } from '../contracts/index.js';
import { resolveScript, type RubitimeRecipientContext } from './resolver.js';
import { runScript } from './runner.js';

export { resolveScript as resolveScriptV3 } from './resolveScript.js';

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
      // ARCH-V3 MOVE
      // подгрузка контекста должна идти из domain.handleIncomingEvent,
      // orchestrator должен получать уже собранный DomainContext
      const script = await resolveScript(
        event,
        input.resolveRubitimeRecipientContext
          ? { resolveRubitimeRecipientContext: input.resolveRubitimeRecipientContext }
          : {},
      );
      // ARCH-V3 MOVE
      // исполнение шагов должно быть в domain executor;
      // orchestrator здесь должен только resolveScript(...)
      return runScript(script, { event, values: {} });
    },
  };
}
