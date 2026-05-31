import type { BaseContext, IncomingEvent } from '../contracts/index.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isTruthyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Собирает переменные для match/interpolation из события и base context. */
export function buildScriptInterpolationVars(input: {
  event: IncomingEvent;
  context: BaseContext;
  queries?: Record<string, unknown>;
}): Record<string, unknown> {
  const eventPayload = isRecord(input.event.payload) ? input.event.payload : {};
  const normalizedInput = isRecord(eventPayload.incoming) ? eventPayload.incoming : eventPayload;
  const facts = isRecord(input.context.facts) ? input.context.facts : {};
  const ctx = input.context as Record<string, unknown>;
  const conversationState = isTruthyString(normalizedInput.userState)
    ? normalizedInput.userState
    : (isTruthyString(ctx.conversationState) ? ctx.conversationState : undefined);
  const actor = {
    ...(isRecord(input.context.actor) ? input.context.actor : {}),
    ...(typeof normalizedInput.channelUserId === 'number' || isTruthyString(normalizedInput.channelUserId)
      ? { channelUserId: normalizedInput.channelUserId }
      : {}),
    ...(typeof normalizedInput.channelId === 'string' ? { channelUserId: normalizedInput.channelId } : {}),
    ...(typeof normalizedInput.chatId === 'number' ? { chatId: normalizedInput.chatId } : {}),
    ...(typeof normalizedInput.channelUsername === 'string' ? { username: normalizedInput.channelUsername } : {}),
    ...(conversationState ? { userState: conversationState } : {}),
  };
  const context = {
    ...input.context,
    ...(conversationState ? { conversationState } : {}),
    ...(typeof normalizedInput.hasLinkedPhone === 'boolean' ? { linkedPhone: normalizedInput.hasLinkedPhone } : {}),
  };

  return {
    source: input.event.meta.source,
    event: input.event.type,
    meta: input.event.meta,
    payload: input.event.payload,
    input: normalizedInput,
    actor,
    context,
    facts,
    ...(input.queries ? { queries: input.queries } : {}),
  };
}
