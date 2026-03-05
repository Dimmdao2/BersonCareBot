import type {
  Action,
  ActionResult,
  BaseContext,
  DeliveryJob,
  DomainContext,
  IncomingEvent,
  OrchestratorInput,
  OrchestratorPlan,
  OutgoingIntent,
  Step,
} from '../contracts/index.js';
import type { DbWriteMutation } from '../contracts/index.js';
import { executeAction } from './executor/executeAction.js';

type HandleIncomingEventDeps = {
  buildBaseContext?: (event: IncomingEvent) => Promise<BaseContext>;
  buildPlan?: (input: OrchestratorInput) => Promise<OrchestratorPlan>;
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

function toAction(step: Step): Action {
  return {
    id: step.id,
    type: step.kind,
    mode: step.mode,
    params: step.payload,
  };
}

function extractPhone(event: IncomingEvent): string | null {
  const payload = event.payload as { phoneNormalized?: unknown; phone?: unknown; body?: { data?: { phone?: unknown } } };
  const directPhone = typeof payload.phoneNormalized === 'string'
    ? payload.phoneNormalized
    : (typeof payload.phone === 'string' ? payload.phone : null);
  if (directPhone && directPhone.trim().length > 0) return directPhone.trim();
  const nestedPhone = payload.body?.data?.phone;
  return typeof nestedPhone === 'string' && nestedPhone.trim().length > 0 ? nestedPhone.trim() : null;
}

async function buildBaseContext(event: IncomingEvent): Promise<BaseContext> {
  const identityLinks: BaseContext['identityLinks'] = [];
  const phone = extractPhone(event);
  if (phone) identityLinks.push({ kind: 'phone', value: phone });
  if (event.meta.userId) identityLinks.push({ kind: 'userId', value: event.meta.userId });

  return {
    actor: {
      isAdmin: false,
    },
    identityLinks,
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
  const base = deps.buildBaseContext
    ? await deps.buildBaseContext(event)
    : await buildBaseContext(event);

  const context: DomainContext = {
    event,
    nowIso: new Date().toISOString(),
    values: {},
    base,
  };

  const steps = deps.buildPlan
    ? await deps.buildPlan({ event, context: base })
    : [];

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
