import type {
  DbWriteMutation,
  OutgoingIntent,
  ScriptContext,
  Step,
  StepResult,
} from '../../contracts/index.js';

type ActionEffects = {
  reads?: unknown[];
  writes?: DbWriteMutation[];
  outgoing?: OutgoingIntent[];
};

type ActionHandler = (step: Step, ctx: ScriptContext) => Promise<StepResult>;

type MessagePayload = {
  recipient?: {
    chatId?: unknown;
    phoneNormalized?: unknown;
  };
  delivery?: {
    channels?: unknown;
    maxAttempts?: unknown;
  };
} & Record<string, unknown>;

function success(stepId: string, effects: ActionEffects = {}): StepResult {
  return {
    stepId,
    status: 'success',
    data: {
      ...(effects.reads ? { reads: effects.reads } : {}),
      ...(effects.writes ? { writes: effects.writes } : {}),
      ...(effects.outgoing ? { outgoing: effects.outgoing } : {}),
    },
  };
}

async function handleEventLog(step: Step): Promise<StepResult> {
  return success(step.id, {
    writes: [{ type: 'event.log', params: step.payload }],
  });
}

async function handleBookingUpsert(step: Step): Promise<StepResult> {
  return success(step.id, {
    writes: [{ type: 'booking.upsert', params: step.payload }],
  });
}

async function handleRubitimeCreateRetryEnqueue(step: Step): Promise<StepResult> {
  return success(step.id, {
    writes: [{ type: 'rubitime.create_retry.enqueue', params: step.payload }],
  });
}

async function handleMessageSend(step: Step, ctx: ScriptContext): Promise<StepResult> {
  const payload = step.payload as MessagePayload;
  const hasChat = typeof payload.recipient?.chatId === 'number';
  const hasPhone = typeof payload.recipient?.phoneNormalized === 'string'
    && payload.recipient.phoneNormalized.trim().length > 0;
  const channelsFromStep = Array.isArray(payload.delivery?.channels)
    ? payload.delivery.channels.filter((item): item is string => typeof item === 'string')
    : [];
  // Fallback-policy is decided in domain: dispatch receives explicit channels order.
  const channels = channelsFromStep.length > 0
    ? channelsFromStep
    : hasChat && hasPhone
      ? ['telegram', 'smsc']
      : hasChat
        ? ['telegram']
        : ['smsc'];

  const intent: OutgoingIntent = {
    type: 'message.send',
    meta: {
      eventId: `${ctx.event.meta.eventId}:out:${step.id}`,
      occurredAt: new Date().toISOString(),
      source: ctx.event.meta.source,
      ...(ctx.event.meta.correlationId ? { correlationId: ctx.event.meta.correlationId } : {}),
      ...(ctx.event.meta.userId ? { userId: ctx.event.meta.userId } : {}),
    },
    payload: {
      ...payload,
      delivery: {
        channels,
        maxAttempts: typeof payload.delivery?.maxAttempts === 'number' ? payload.delivery.maxAttempts : 3,
      },
    },
  };
  return success(step.id, { outgoing: [intent] });
}

/** Регистр обработчиков domain action. */
export const domainActionRegistry: Record<string, ActionHandler> = {
  'event.log': handleEventLog,
  'booking.upsert': handleBookingUpsert,
  'rubitime.create_retry.enqueue': handleRubitimeCreateRetryEnqueue,
  'message.send': handleMessageSend,
};
