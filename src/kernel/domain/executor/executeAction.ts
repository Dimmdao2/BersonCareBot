import type {
  Action,
  ActionResult,
  DbReadPort,
  DbWriteMutation,
  DbWritePort,
  DomainContext,
  OutgoingIntent,
  QueuePort,
  TemplatePort,
} from '../../contracts/index.js';

type ExecutorDeps = {
  readPort?: DbReadPort;
  writePort?: DbWritePort;
  queuePort?: QueuePort;
  templatePort?: TemplatePort;
};

function nowIso(ctx: DomainContext): string {
  return ctx.nowIso;
}

function buildDeliveryJob(input: {
  actionId: string;
  params: Record<string, unknown>;
  now: string;
}): { id: string; kind: string; runAt: string; attempts: number; maxAttempts: number; payload: Record<string, unknown> } {
  const kind = typeof input.params.kind === 'string' && input.params.kind.length > 0
    ? input.params.kind
    : 'delivery.intent';
  const runAt = typeof input.params.runAt === 'string' && input.params.runAt.length > 0
    ? input.params.runAt
    : input.now;
  const attemptsRaw = input.params.attempts;
  const maxAttemptsRaw = input.params.maxAttempts;
  const attempts = typeof attemptsRaw === 'number' && Number.isFinite(attemptsRaw)
    ? Math.max(0, Math.trunc(attemptsRaw))
    : 0;
  const maxAttempts = typeof maxAttemptsRaw === 'number' && Number.isFinite(maxAttemptsRaw)
    ? Math.max(1, Math.trunc(maxAttemptsRaw))
    : 3;
  const payload = typeof input.params.payload === 'object' && input.params.payload !== null
    ? input.params.payload as Record<string, unknown>
    : input.params;
  return {
    id: `${kind}:${input.actionId}`,
    kind,
    runAt,
    attempts,
    maxAttempts,
    payload,
  };
}

async function persistWrites(writePort: DbWritePort | undefined, writes: DbWriteMutation[]): Promise<void> {
  if (!writePort) return;
  for (const write of writes) {
    await writePort.writeDb(write);
  }
}

export async function executeAction(
  action: Action,
  ctx: DomainContext,
  deps: ExecutorDeps = {},
): Promise<ActionResult> {
  switch (action.type) {
    case 'booking.upsert': {
      const writes: DbWriteMutation[] = [{ type: 'booking.upsert', params: action.params }];
      await persistWrites(deps.writePort, writes);
      return { actionId: action.id, status: 'success', writes };
    }

    case 'booking.event.insert': {
      const writes: DbWriteMutation[] = [{
        type: 'event.log',
        params: {
          source: ctx.event.meta.source,
          eventType: ctx.event.type,
          eventId: ctx.event.meta.eventId,
          occurredAt: ctx.event.meta.occurredAt,
          body: action.params,
        },
      }];
      await persistWrites(deps.writePort, writes);
      return { actionId: action.id, status: 'success', writes };
    }

    case 'message.compose': {
      const source = typeof action.params.source === 'string' ? action.params.source : ctx.event.meta.source;
      const templateId = typeof action.params.templateId === 'string' ? action.params.templateId : '';
      const vars = typeof action.params.vars === 'object' && action.params.vars !== null
        ? action.params.vars as Record<string, unknown>
        : {};
      const recipient = typeof action.params.recipient === 'object' && action.params.recipient !== null
        ? action.params.recipient as Record<string, unknown>
        : {};
      const delivery = typeof action.params.delivery === 'object' && action.params.delivery !== null
        ? action.params.delivery as Record<string, unknown>
        : { channels: ['smsc'], maxAttempts: 1 };

      const composedText = deps.templatePort && templateId
        ? (await deps.templatePort.renderTemplate({ source, templateId, vars })).text
        : (typeof action.params.text === 'string' ? action.params.text : '');

      const intents: OutgoingIntent[] = [{
        type: 'message.send',
        meta: {
          eventId: `${ctx.event.meta.eventId}:intent:${action.id}`,
          occurredAt: nowIso(ctx),
          source: ctx.event.meta.source,
          ...(ctx.event.meta.correlationId ? { correlationId: ctx.event.meta.correlationId } : {}),
          ...(ctx.event.meta.userId ? { userId: ctx.event.meta.userId } : {}),
        },
        payload: {
          recipient,
          message: { text: composedText },
          delivery,
        },
      }];
      return { actionId: action.id, status: 'success', intents };
    }

    case 'intent.enqueueDelivery': {
      const job = buildDeliveryJob({ actionId: action.id, params: action.params, now: nowIso(ctx) });
      if (job.kind === 'rubitime.create_retry.enqueue') {
        const writes: DbWriteMutation[] = [{
          type: 'rubitime.create_retry.enqueue',
          params: {
            ...(typeof action.params.payload === 'object' && action.params.payload !== null
              ? action.params.payload as Record<string, unknown>
              : action.params),
          },
        }];
        await persistWrites(deps.writePort, writes);
        return { actionId: action.id, status: 'queued', writes, jobs: [job] };
      }
      if (deps.queuePort) {
        await deps.queuePort.enqueue({ kind: job.kind, payload: job.payload });
      }
      return { actionId: action.id, status: 'queued', jobs: [job] };
    }

    case 'user.findByPhone': {
      const phone = typeof action.params.phoneNormalized === 'string' ? action.params.phoneNormalized : null;
      if (deps.readPort && phone) {
        await deps.readPort.readDb({ type: 'user.byPhone', params: { phoneNormalized: phone } });
      }
      return { actionId: action.id, status: 'success' };
    }

    case 'log.audit': {
      const writes: DbWriteMutation[] = [{
        type: 'event.log',
        params: {
          source: 'domain',
          eventType: 'audit',
          eventId: `${ctx.event.meta.eventId}:audit:${action.id}`,
          occurredAt: nowIso(ctx),
          body: action.params,
        },
      }];
      await persistWrites(deps.writePort, writes);
      return { actionId: action.id, status: 'success', writes };
    }

    default:
      return {
        actionId: action.id,
        status: 'skipped',
        error: `ACTION_NOT_IMPLEMENTED:${action.type}`,
      };
  }
}
