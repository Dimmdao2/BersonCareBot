import type { Action, ActionResult, DomainContext, OutgoingIntent } from '../../../contracts/index.js';
import type { ExecutorDeps } from '../helpers.js';
import {
  asRecord,
  asString,
  asNumber,
  asStringArray,
  buildDeliveryJob,
  buildIntentMeta,
  buildMessageDeliverJob,
  buildReplyMarkup,
  contentAudience,
  nowIso,
  resolveGenericMessageParams,
  persistWrites,
  renderText,
} from '../helpers.js';
import { applyMessageSendDeliveryPolicy } from '../deliveryPolicy.js';

export async function handleDelivery(
  action: Action,
  ctx: DomainContext,
  deps: ExecutorDeps,
): Promise<ActionResult> {
  if (action.type === 'message.compose') {
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
      : { maxAttempts: 1 };

    const composedText = deps.templatePort && templateId
      ? (await deps.templatePort.renderTemplate({
        source,
        templateId,
        vars,
        audience: contentAudience(ctx),
      })).text
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

  if (action.type === 'message.send') {
    const policyParams = await applyMessageSendDeliveryPolicy(
      action.params,
      ctx,
      deps.deliveryDefaultsPort,
    );
    let resolvedParams = await resolveGenericMessageParams({
      params: policyParams,
      ctx,
      templatePort: deps.templatePort,
    });
    if (
      deps.sendMenuOnButtonPress === true &&
      contentAudience(ctx) === 'user' &&
      !resolvedParams.replyMarkup &&
      deps.contentPort &&
      deps.templatePort
    ) {
      const recipient = asRecord(resolvedParams.recipient);
      const chatId = asNumber(recipient.chatId);
      if (chatId !== null) {
        const scope = { source: ctx.event.meta.source, audience: 'user' as const };
        const bundle = await deps.contentPort.getBundle?.(scope);
        if (bundle?.mainReplyKeyboard && Array.isArray(bundle.mainReplyKeyboard)) {
          const replyMarkup = await buildReplyMarkup({
            params: { keyboard: bundle.mainReplyKeyboard, resizeKeyboard: true },
            ctx,
            templatePort: deps.templatePort,
          });
          if (replyMarkup) {
            resolvedParams = { ...resolvedParams, replyMarkup };
          }
        }
      }
    }
    const intents: OutgoingIntent[] = [{
      type: 'message.send',
      meta: buildIntentMeta(action, ctx),
      payload: resolvedParams,
    }];
    return { actionId: action.id, status: 'success', intents };
  }

  if (action.type === 'message.edit') {
    const text = await renderText({
      text: action.params.text,
      messageText: action.params.messageText,
      templateKey: action.params.templateKey,
      vars: action.params.vars,
      ctx,
      templatePort: deps.templatePort,
    });
    const replyMarkup = await buildReplyMarkup({
      params: action.params,
      vars: action.params.vars,
      ctx,
      templatePort: deps.templatePort,
    });
    const chatId = asNumber(action.params.chatId);
    const messageId = asNumber(action.params.messageId);
    const intents: OutgoingIntent[] = [{
      type: 'message.edit',
      meta: buildIntentMeta(action, ctx),
      payload: {
        recipient: chatId === null ? {} : { chatId },
        ...(messageId === null ? {} : { messageId }),
        message: { text },
        ...(replyMarkup ? { replyMarkup } : {}),
      },
    }];
    return { actionId: action.id, status: 'success', intents };
  }

  if (action.type === 'message.replyMarkup.edit') {
    const chatId = asNumber(action.params.chatId);
    const messageId = asNumber(action.params.messageId);
    const replyMarkup = await buildReplyMarkup({
      params: action.params,
      vars: action.params.vars,
      ctx,
      templatePort: deps.templatePort,
    });
    const intents: OutgoingIntent[] = [{
      type: 'message.replyMarkup.edit',
      meta: buildIntentMeta(action, ctx),
      payload: {
        recipient: chatId === null ? {} : { chatId },
        ...(messageId === null ? {} : { messageId }),
        ...(replyMarkup ? { replyMarkup } : {}),
      },
    }];
    return { actionId: action.id, status: 'success', intents };
  }

  if (action.type === 'callback.answer') {
    const callbackQueryId = asString(action.params.callbackQueryId);
    const intents: OutgoingIntent[] = callbackQueryId ? [{
      type: 'callback.answer',
      meta: buildIntentMeta(action, ctx),
      payload: { callbackQueryId },
    }] : [];
    return { actionId: action.id, status: 'success', ...(intents.length > 0 ? { intents } : {}) };
  }

  if (action.type === 'message.deliver') {
    const job = await buildMessageDeliverJob({
      action,
      ctx,
      ...(deps.readPort ? { readPort: deps.readPort } : {}),
      ...(deps.deliveryDefaultsPort !== undefined ? { deliveryDefaultsPort: deps.deliveryDefaultsPort } : {}),
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

  if (action.type === 'message.retry.enqueue') {
    if (!deps.executeAction) {
      return { actionId: action.id, status: 'skipped', error: 'message.retry.enqueue: executeAction not injected' };
    }
    const mappedAction: Action = {
      id: action.id,
      type: 'message.deliver',
      mode: action.mode,
      params: {
        recipient: {
          phoneNormalized: action.params.phoneNormalized,
        },
        messageText: action.params.messageText,
        delivery: action.params.delivery,
        retry: {
          maxAttempts: action.params.maxAttempts,
          backoffSeconds: [action.params.firstTryDelaySeconds],
        },
      },
    };
    const mappedResult = await deps.executeAction(mappedAction, ctx, deps);
    const writes = [{
      type: 'message.retry.enqueue' as const,
      params: action.params,
    }];
    await persistWrites(deps.writePort, writes);
    return {
      actionId: action.id,
      status: mappedResult.status,
      writes,
      ...(mappedResult.jobs ? { jobs: mappedResult.jobs } : {}),
      ...(mappedResult.intents ? { intents: mappedResult.intents } : {}),
    };
  }

  if (action.type === 'intent.enqueueDelivery') {
    const job = buildDeliveryJob({ actionId: action.id, params: action.params, now: nowIso(ctx) });
    if (deps.queuePort) {
      await deps.queuePort.enqueue({ kind: job.kind, payload: job.payload });
    }
    return { actionId: action.id, status: 'queued', jobs: [job] };
  }

  return { actionId: action.id, status: 'skipped', error: 'DELIVERY_HANDLER_UNKNOWN_TYPE' };
}
