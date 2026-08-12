/**
 * Обработка входящего события бота: сбор контекста пользователя, выбор сценария и выполнение шагов.
 * Загружает из базы состояние пользователя, строит план
 * действий по сценариям контента, выполняет каждый шаг (отправка сообщения, запись в БД и т.д.)
 * и возвращает список исходящих сообщений и заданий на доставку.
 */

import type {
  Action,
  ActionResult,
  BaseContext,
  DbReadPort,
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
import { buildScriptInterpolationVars } from '../orchestrator/scriptVars.js';
import { interpolateTemplate } from '../orchestrator/templateInterpolation.js';

type HandleIncomingEventDeps = {
  readPort?: DbReadPort;
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

/** Превращает шаг плана в действие; подставляет `values.*` из накопленных результатов шагов. */
function toAction(step: Step, context: DomainContext): Action {
  const vars = {
    event: context.event,
    context: context.base,
    ...buildScriptInterpolationVars({ event: context.event, context: context.base }),
    values: context.values,
  };
  const params = interpolateTemplate(step.payload, vars) as Record<string, unknown>;
  return {
    id: step.id,
    type: step.kind,
    mode: step.mode,
    params,
  };
}

function extractPhone(event: IncomingEvent): string | null {
  const payload = event.payload as {
    phoneNormalized?: unknown;
    phone?: unknown;
    body?: { data?: { phone?: unknown } };
  };
  const directPhone =
    typeof payload.phoneNormalized === 'string'
      ? payload.phoneNormalized
      : typeof payload.phone === 'string'
        ? payload.phone
        : null;
  if (directPhone && directPhone.trim().length > 0) return directPhone.trim();
  const nestedPhone = payload.body?.data?.phone;
  return typeof nestedPhone === 'string' && nestedPhone.trim().length > 0
    ? nestedPhone.trim()
    : null;
}

function extractChannelId(event: IncomingEvent): string | null {
  const payload = event.payload as {
    channelId?: unknown;
    channelUserId?: unknown;
    incoming?: { channelId?: unknown; channelUserId?: unknown };
  };
  const fromIncoming = payload.incoming;
  const value =
    fromIncoming?.channelId ??
    fromIncoming?.channelUserId ??
    payload.channelId ??
    payload.channelUserId ??
    event.meta.userId;

  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(Math.trunc(value));
  return null;
}

function extractFacts(event: IncomingEvent): Record<string, unknown> {
  const payload = event.payload as { facts?: unknown };
  return typeof payload.facts === 'object' && payload.facts !== null
    ? (payload.facts as Record<string, unknown>)
    : {};
}

type ReadUserContext = {
  phoneNormalized?: unknown;
};

/** Загружает каноническую привязку канала и телефон по идентификатору канала. */
async function loadUserContext(
  event: IncomingEvent,
  readPort?: DbReadPort,
): Promise<Pick<BaseContext, 'linkedPhone' | 'phoneNormalized'>> {
  if (!readPort) return {};
  const externalId = extractChannelId(event);
  if (!externalId) return {};
  const resource =
    typeof event.meta.source === 'string' && event.meta.source.trim().length > 0
      ? event.meta.source.trim()
      : null;
  if (!resource) return {};

  const user = await readPort.readDb<ReadUserContext | null>({
    type: 'user.byIdentity',
    params: { resource, externalId },
  });
  if (!user || typeof user !== 'object') return { linkedPhone: false };

  const phoneNormalized =
    typeof user.phoneNormalized === 'string' && user.phoneNormalized.trim().length > 0
      ? user.phoneNormalized.trim()
      : undefined;
  return phoneNormalized ? { linkedPhone: true, phoneNormalized } : { linkedPhone: false };
}

/** Собирает базовый контекст: связки пользователя (телефон, идентификатор), состояние из БД, признак админа. */
async function buildBaseContext(event: IncomingEvent, readPort?: DbReadPort): Promise<BaseContext> {
  const identityLinks: BaseContext['identityLinks'] = [];
  const phone = extractPhone(event);
  if (phone) identityLinks.push({ kind: 'phone', value: phone });
  if (event.meta.userId) identityLinks.push({ kind: 'userId', value: event.meta.userId });
  const userContext = await loadUserContext(event, readPort);
  const facts = extractFacts(event);
  const isAdmin = facts.isAdmin === true;

  const base: BaseContext = {
    actor: {
      isAdmin,
    },
    identityLinks,
    ...(Object.keys(facts).length > 0 ? { facts } : {}),
    ...userContext,
  };
  if (base.linkedPhone === undefined) {
    base.linkedPhone = false;
  }
  return base;
}

/** Строит контекст, план по сценариям и выполняет шаги; возвращает записи в БД, исходящие сообщения и задания (сама рассылка не здесь). */
export async function handleIncomingEvent(
  event: IncomingEvent,
  deps: HandleIncomingEventDeps = {},
): Promise<DomainHandleIncomingResult> {
  const base = deps.buildBaseContext
    ? await deps.buildBaseContext(event)
    : await buildBaseContext(event, deps.readPort);

  const context: DomainContext = {
    event,
    nowIso: new Date().toISOString(),
    values: {},
    base,
  };

  const steps = deps.buildPlan ? await deps.buildPlan({ event, context: base }) : [];

  const actions: Action[] = [];
  const execute = deps.executeAction
    ? deps.executeAction
    : (action: Action, ctx: DomainContext) => executeAction(action, ctx);

  const results: ActionResult[] = [];
  const writes: DbWriteMutation[] = [];
  const intents: OutgoingIntent[] = [];
  const jobs: DeliveryJob[] = [];

  for (const step of steps) {
    const action = toAction(step, context);
    actions.push(action);
    const result = await execute(action, context);
    results.push(result);
    if (result.values) {
      context.values = {
        ...context.values,
        ...result.values,
      };
    }
    if (result.writes) writes.push(...result.writes);
    if (result.intents) intents.push(...result.intents);
    if (result.jobs) jobs.push(...result.jobs);
    if (result.status === 'failed') break;
    if (result.abortPlan) break;
  }

  return { context, actions, results, writes, intents, jobs };
}
