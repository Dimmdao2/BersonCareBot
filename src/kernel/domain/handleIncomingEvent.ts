import type { Action, ActionResult, DeliveryJob, DomainContext, IncomingEvent, OutgoingIntent } from '../contracts/index.js';
import type { DbWriteMutation } from '../contracts/index.js';
import { executeAction } from './executor/executeAction.js';
import { resolveScript as defaultResolveScript } from '../orchestrator/resolveScript.js';

type HandleIncomingEventDeps = {
  buildContext?: (event: IncomingEvent) => Promise<DomainContext>;
  resolveScript?: (input: { event: IncomingEvent; context: DomainContext }) => Promise<Array<{
    id: string;
    action: string;
    mode: 'sync' | 'async';
    params: Record<string, unknown>;
  }>>;
  executeAction?: (action: Action, context: DomainContext) => Promise<ActionResult>;
};

export type DomainHandleIncomingResult = {
  context: DomainContext;
  actions: Action[];
  results: ActionResult[];
  writes: DbWriteMutation[];
  intents: OutgoingIntent[];
  jobs: DeliveryJob[];
};

function toAction(step: { id: string; action: string; mode: 'sync' | 'async'; params: Record<string, unknown> }): Action {
  return {
    id: step.id,
    type: step.action,
    mode: step.mode,
    params: step.params,
  };
}

async function defaultBuildContext(event: IncomingEvent): Promise<DomainContext> {
  return {
    event,
    nowIso: new Date().toISOString(),
    values: {},
  };
}

/**
 * Domain V3 flow: build context -> resolve script -> execute actions.
 * Domain does not dispatch messages directly; it returns intents/jobs.
 */
export async function handleIncomingEvent(
  event: IncomingEvent,
  deps: HandleIncomingEventDeps = {},
): Promise<DomainHandleIncomingResult> {
  const context = deps.buildContext
    ? await deps.buildContext(event)
    : await defaultBuildContext(event);

  const steps = deps.resolveScript
    ? await deps.resolveScript({ event, context })
    : await defaultResolveScript({ event, context });

  const actions = steps.map(toAction);
  const execute = deps.executeAction
    ? deps.executeAction
    : (action: Action, ctx: DomainContext) => executeAction(action, ctx);

  const results: ActionResult[] = [];
  const writes: DbWriteMutation[] = [];
  const intents: OutgoingIntent[] = [];
  const jobs: DeliveryJob[] = [];

  for (const action of actions) {
    const result = await execute(action, context);
    results.push(result);
    if (result.writes) writes.push(...result.writes);
    if (result.intents) intents.push(...result.intents);
    if (result.jobs) jobs.push(...result.jobs);
    if (result.status === 'failed') break;
  }

  return { context, actions, results, writes, intents, jobs };
}
