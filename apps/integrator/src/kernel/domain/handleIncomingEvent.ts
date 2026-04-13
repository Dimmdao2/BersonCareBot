/**
 * Обработка входящего события бота: сбор контекста пользователя, выбор сценария и выполнение шагов.
 * Загружает из базы состояние пользователя (например «ожидает название симптома»), строит план
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

/** Превращает шаг плана в действие для исполнителя. */
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

function extractChannelId(event: IncomingEvent): string | null {
  const payload = event.payload as {
    channelId?: unknown;
    channelUserId?: unknown;
    incoming?: { channelId?: unknown; channelUserId?: unknown };
  };
  const fromIncoming = payload.incoming;
  const value = fromIncoming?.channelId
    ?? fromIncoming?.channelUserId
    ?? payload.channelId
    ?? payload.channelUserId
    ?? event.meta.userId;

  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(Math.trunc(value));
  return null;
}

function extractFacts(event: IncomingEvent): Record<string, unknown> {
  const payload = event.payload as { facts?: unknown };
  return typeof payload.facts === 'object' && payload.facts !== null
    ? payload.facts as Record<string, unknown>
    : {};
}

type ReadUserContext = {
  userState?: unknown;
  phoneNormalized?: unknown;
};

type ReadDraftContext = {
  state?: unknown;
  draft_text_current?: unknown;
  external_message_id?: unknown;
};

type ReadConversationContext = {
  id?: unknown;
  status?: unknown;
};

/** Загружает из базы состояние пользователя, черновик вопроса и открытый диалог по идентификатору канала. */
async function loadUserContext(
  event: IncomingEvent,
  readPort?: DbReadPort,
): Promise<Pick<
  BaseContext,
  | 'conversationState'
  | 'linkedPhone'
  | 'phoneNormalized'
  | 'hasActiveDraft'
  | 'draftState'
  | 'draftTextCurrent'
  | 'draftSourceMessageId'
  | 'hasOpenConversation'
  | 'activeConversationId'
  | 'activeConversationStatus'
  | 'replyMode'
  | 'replyConversationId'
>> {
  if (!readPort) return {};
  const externalId = extractChannelId(event);
  if (!externalId) return {};
  const resource = typeof event.meta.source === 'string' && event.meta.source.trim().length > 0
    ? event.meta.source.trim()
    : null;
  if (!resource) return {};

  const [user, draft, openConversation] = await Promise.all([
    readPort.readDb<ReadUserContext | null>({
      type: 'user.byIdentity',
      params: { resource, externalId },
    }),
    readPort.readDb<ReadDraftContext | null>({
      type: 'draft.activeByIdentity',
      params: { resource, externalId, source: event.meta.source },
    }),
    readPort.readDb<ReadConversationContext | null>({
      type: 'conversation.openByIdentity',
      params: { resource, externalId, source: event.meta.source },
    }),
  ]);

  const result: Pick<
    BaseContext,
    | 'conversationState'
    | 'linkedPhone'
    | 'phoneNormalized'
    | 'hasActiveDraft'
    | 'draftState'
    | 'draftTextCurrent'
    | 'draftSourceMessageId'
    | 'hasOpenConversation'
    | 'activeConversationId'
    | 'activeConversationStatus'
    | 'replyMode'
    | 'replyConversationId'
  > = {};

  if (!user || typeof user !== 'object') {
    if (draft && typeof draft === 'object') {
      const draftState = typeof draft.state === 'string' && draft.state.trim().length > 0 ? draft.state : undefined;
      const draftTextCurrent = typeof draft.draft_text_current === 'string' && draft.draft_text_current.trim().length > 0
        ? draft.draft_text_current
        : undefined;
      const draftSourceMessageId = typeof draft.external_message_id === 'string' && draft.external_message_id.trim().length > 0
        ? draft.external_message_id
        : undefined;
      result.hasActiveDraft = true;
      if (draftState) result.draftState = draftState;
      if (draftTextCurrent) result.draftTextCurrent = draftTextCurrent;
      if (draftSourceMessageId) result.draftSourceMessageId = draftSourceMessageId;
    }
    if (openConversation && typeof openConversation === 'object') {
      const conversationId = typeof openConversation.id === 'string' && openConversation.id.trim().length > 0
        ? openConversation.id
        : undefined;
      const conversationStatus = typeof openConversation.status === 'string' && openConversation.status.trim().length > 0
        ? openConversation.status
        : undefined;
      result.hasOpenConversation = !!conversationId;
      if (conversationId) result.activeConversationId = conversationId;
      if (conversationStatus) result.activeConversationStatus = conversationStatus;
    }
    if (result.hasOpenConversation === undefined) result.hasOpenConversation = false;
    result.linkedPhone = false;
    return result;
  }
  const conversationState = typeof user.userState === 'string' && user.userState.trim().length > 0
    ? user.userState
    : undefined;
  const phoneNormalized = typeof user.phoneNormalized === 'string' && user.phoneNormalized.trim().length > 0
    ? user.phoneNormalized.trim()
    : undefined;
  const linkedPhone = !!phoneNormalized;
  if (conversationState) result.conversationState = conversationState;
  result.linkedPhone = linkedPhone;
  if (phoneNormalized) result.phoneNormalized = phoneNormalized;

  if (conversationState?.startsWith('admin_reply:')) {
    const replyConversationId = conversationState.slice('admin_reply:'.length).trim();
    if (replyConversationId) {
      result.replyMode = true;
      result.replyConversationId = replyConversationId;
    }
  }

  if (draft && typeof draft === 'object') {
    const draftState = typeof draft.state === 'string' && draft.state.trim().length > 0 ? draft.state : undefined;
    const draftTextCurrent = typeof draft.draft_text_current === 'string' && draft.draft_text_current.trim().length > 0
      ? draft.draft_text_current
      : undefined;
    const draftSourceMessageId = typeof draft.external_message_id === 'string' && draft.external_message_id.trim().length > 0
      ? draft.external_message_id
      : undefined;
    result.hasActiveDraft = true;
    if (draftState) result.draftState = draftState;
    if (draftTextCurrent) result.draftTextCurrent = draftTextCurrent;
    if (draftSourceMessageId) result.draftSourceMessageId = draftSourceMessageId;
  }

  if (openConversation && typeof openConversation === 'object') {
    const conversationId = typeof openConversation.id === 'string' && openConversation.id.trim().length > 0
      ? openConversation.id
      : undefined;
    const conversationStatus = typeof openConversation.status === 'string' && openConversation.status.trim().length > 0
      ? openConversation.status
      : undefined;
    result.hasOpenConversation = !!conversationId;
    if (conversationId) result.activeConversationId = conversationId;
    if (conversationStatus) result.activeConversationStatus = conversationStatus;
  }
  if (result.hasOpenConversation === undefined) result.hasOpenConversation = false;

  return result;
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
