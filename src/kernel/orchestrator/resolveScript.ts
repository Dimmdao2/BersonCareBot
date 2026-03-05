import type { DomainContext, IncomingEvent, ScriptStep } from '../contracts/index.js';
import { resolveScript as legacyResolveScript, type RubitimeRecipientContext } from './resolver.js';

type ResolveScriptInput = {
  event: IncomingEvent;
  context: DomainContext;
};

function toScriptStep(input: { id: string; kind: string; mode: 'sync' | 'async'; payload: Record<string, unknown> }): ScriptStep {
  return {
    id: input.id,
    action: input.kind,
    mode: input.mode,
    params: input.payload,
  };
}

function readRubitimeRecipientContext(context: DomainContext): RubitimeRecipientContext | null {
  const value = context.values.rubitimeRecipientContext;
  if (typeof value !== 'object' || value === null) return null;
  return value as RubitimeRecipientContext;
}

/**
 * V3 orchestrator entrypoint.
 * Only resolves script steps by event+context and does not execute actions.
 */
export async function resolveScript(input: ResolveScriptInput): Promise<ScriptStep[]> {
  const preloadedContext = readRubitimeRecipientContext(input.context);
  const script = await legacyResolveScript(
    input.event,
    preloadedContext
      ? {
        async resolveRubitimeRecipientContext() {
          return preloadedContext;
        },
      }
      : {},
  );

  return script.steps.map((step) => toScriptStep({
    id: step.id,
    kind: step.kind,
    mode: step.mode,
    payload: step.payload,
  }));
}
