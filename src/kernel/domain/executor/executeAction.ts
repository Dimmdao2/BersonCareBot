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

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

async function resolveTargets(params: Record<string, unknown>, readPort?: DbReadPort): Promise<Array<{
  resource: string;
  address: Record<string, unknown>;
}>> {
  const explicitTargetsRaw = params.targets;
  if (Array.isArray(explicitTargetsRaw)) {
    const explicitTargets = explicitTargetsRaw
      .map((item) => asRecord(item))
      .filter((item) => asString(item.resource) !== null)
      .map((item) => ({
        resource: asString(item.resource) as string,
        address: asRecord(item.address),
      }));
    if (explicitTargets.length > 0) return explicitTargets;
  }

  const recipient = asRecord(params.recipient);
  const chatId = recipient.chatId;
  if (typeof chatId === 'number' && Number.isFinite(chatId)) {
    return [{ resource: 'telegram', address: { chatId } }];
  }

  const phoneNormalized = asString(recipient.phoneNormalized) ?? asString(params.phoneNormalized);
  if (!phoneNormalized) return [];

  if (readPort) {
    const telegram = await readPort.readDb<{ chatId?: number } | null>({
      type: 'user.lookup',
      params: {
        resource: 'telegram',
        by: 'phone',
        value: phoneNormalized,
      },
    });
    if (telegram && typeof telegram.chatId === 'number' && Number.isFinite(telegram.chatId)) {
      return [{
        resource: 'telegram',
        address: { chatId: telegram.chatId, phoneNormalized },
      }];
    }
  }

  return [{ resource: 'smsc', address: { phoneNormalized } }];
}

async function buildMessageDeliverJob(input: {
  action: Action;
  ctx: DomainContext;
  readPort?: DbReadPort;
}): Promise<{ id: string; kind: string; runAt: string; attempts: number; maxAttempts: number; payload: Record<string, unknown> }> {
  const payload = asRecord(input.action.params.payload);
  const message = asRecord(payload.message);
  const text = asString(message.text) ?? asString(input.action.params.messageText) ?? '';
  const delivery = asRecord(payload.delivery);
  const channels = asStringArray(delivery.channels);
  const retryRaw = asRecord(input.action.params.retry);
  const maxAttemptsRaw = retryRaw.maxAttempts ?? input.action.params.maxAttempts ?? delivery.maxAttempts;
  const maxAttempts = typeof maxAttemptsRaw === 'number' && Number.isFinite(maxAttemptsRaw)
    ? Math.max(1, Math.trunc(maxAttemptsRaw))
    : 1;
  const firstBackoffRaw = Array.isArray(retryRaw.backoffSeconds)
    ? retryRaw.backoffSeconds.find((value) => typeof value === 'number' && Number.isFinite(value))
    : undefined;
  const firstBackoff = typeof firstBackoffRaw === 'number' ? Math.max(0, Math.trunc(firstBackoffRaw)) : 0;
  const targets = await resolveTargets(input.action.params, input.readPort);

  return {
    id: `delivery:${input.action.id}`,
    kind: 'message.deliver',
    runAt: new Date(Date.parse(input.ctx.nowIso) + firstBackoff * 1000).toISOString(),
    attempts: 0,
    maxAttempts,
    payload: {
      intent: {
        type: 'message.send',
        meta: {
          eventId: `${input.ctx.event.meta.eventId}:delivery:${input.action.id}`,
          occurredAt: input.ctx.nowIso,
          source: input.ctx.event.meta.source,
          ...(input.ctx.event.meta.correlationId ? { correlationId: input.ctx.event.meta.correlationId } : {}),
          ...(input.ctx.event.meta.userId ? { userId: input.ctx.event.meta.userId } : {}),
        },
        payload: {
          message: { text },
          delivery: {
            channels: channels.length > 0 ? channels : targets.map((target) => target.resource),
            maxAttempts,
          },
        },
      },
      targets,
      retry: {
        maxAttempts,
        backoffSeconds: Array.isArray(retryRaw.backoffSeconds)
          ? retryRaw.backoffSeconds.filter((value): value is number => typeof value === 'number' && Number.isFinite(value)).map((value) => Math.max(0, Math.trunc(value)))
          : [],
        ...(typeof retryRaw.deadlineAt === 'string' ? { deadlineAt: retryRaw.deadlineAt } : {}),
      },
      ...(input.action.params.onFail ? { onFail: asRecord(input.action.params.onFail) } : {}),
    },
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
    case 'event.log': {
      const writes: DbWriteMutation[] = [{ type: 'event.log', params: action.params }];
      await persistWrites(deps.writePort, writes);
      return { actionId: action.id, status: 'success', writes };
    }

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

    case 'message.send': {
      const intents: OutgoingIntent[] = [{
        type: 'message.send',
        meta: {
          eventId: `${ctx.event.meta.eventId}:intent:${action.id}`,
          occurredAt: nowIso(ctx),
          source: ctx.event.meta.source,
          ...(ctx.event.meta.correlationId ? { correlationId: ctx.event.meta.correlationId } : {}),
          ...(ctx.event.meta.userId ? { userId: ctx.event.meta.userId } : {}),
        },
        payload: action.params,
      }];
      return { actionId: action.id, status: 'success', intents };
    }

    case 'message.deliver': {
      const job = await buildMessageDeliverJob({
        action,
        ctx,
        ...(deps.readPort ? { readPort: deps.readPort } : {}),
      });
      if (deps.queuePort) {
        await deps.queuePort.enqueue({ kind: job.kind, payload: job.payload });
      }
      const payloadIntent = asRecord(job.payload.intent);
      const payloadDelivery = asRecord(asRecord(payloadIntent.payload).delivery);
      const channels = asStringArray(payloadDelivery.channels);
      return {
        actionId: action.id,
        status: 'queued',
        jobs: [{
          ...job,
          jobId: job.id,
          createdAt: ctx.nowIso,
          status: 'pending',
          attemptsMade: 0,
          plan: channels.map((channel, index) => ({
            stageId: `stage:${index + 1}`,
            channel,
            maxAttempts: 1,
          })),
          targets: Array.isArray(job.payload.targets) ? job.payload.targets as Array<{ resource: string; address: Record<string, unknown> }> : [],
          retry: asRecord(job.payload.retry) as { maxAttempts: number; backoffSeconds: number[]; deadlineAt?: string },
          onFail: asRecord(job.payload.onFail) as { adminNotifyIntent?: OutgoingIntent },
        }],
      };
    }

    case 'rubitime.create_retry.enqueue': {
      const mappedAction: Action = {
        id: action.id,
        type: 'message.deliver',
        mode: action.mode,
        params: {
          recipient: {
            phoneNormalized: action.params.phoneNormalized,
          },
          messageText: action.params.messageText,
          retry: {
            maxAttempts: action.params.maxAttempts,
            backoffSeconds: [action.params.firstTryDelaySeconds],
          },
        },
      };
      const mappedResult = await executeAction(mappedAction, ctx, deps);
      const writes: DbWriteMutation[] = [{
        type: 'rubitime.create_retry.enqueue',
        params: action.params,
      }];
      await persistWrites(deps.writePort, writes);
      const result: ActionResult = {
        actionId: action.id,
        status: mappedResult.status,
        writes,
        ...(mappedResult.jobs ? { jobs: mappedResult.jobs } : {}),
        ...(mappedResult.intents ? { intents: mappedResult.intents } : {}),
      };
      return {
        ...result,
      };
    }

    case 'intent.enqueueDelivery': {
      const job = buildDeliveryJob({ actionId: action.id, params: action.params, now: nowIso(ctx) });
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
