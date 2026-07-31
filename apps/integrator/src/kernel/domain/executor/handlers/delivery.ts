import { maxUserRecipient } from '../../../../integrations/max/maxRecipient.js';
import { runWithInfraPrincipal } from '../../../../infra/principal/organizationPrincipal.js';
import type {
  Action,
  ActionResult,
  DomainContext,
  OutgoingIntent,
} from '../../../contracts/index.js';
import type { ExecutorDeps } from '../helpers.js';
import {
  asRecord,
  asString,
  asNumber,
  buildMainReplyKeyboardMarkup,
  buildIntentMeta,
  contentAudience,
  resolveGenericMessageParams,
} from '../helpers.js';
import { applyMessageSendDeliveryPolicy } from '../deliveryPolicy.js';

/** Avoid attaching WebApp reply rows until the user has linked a phone (contact gate). */
function canAttachMainReplyKeyboard(ctx: DomainContext): boolean {
  return ctx.base.linkedPhone === true;
}

/**
 * Раньше подмешивали `menus.main` (max/user): «Запись» + «Приложение» как inline.
 * В MAX мини-приложение открывается из чата; эти кнопки не работают надёжно — оставляем сообщения без авто-inline.
 * Экспорт сохранён: `doctor_broadcast_intent` и `message.send` вызывают ту же функцию (no-op).
 */
export async function enrichMessageSendPayloadWithMaxMainInlineIfApplicable(
  payload: Record<string, unknown>,
  _ctx: DomainContext,
  _deps: Pick<ExecutorDeps, 'templatePort' | 'contentPort'>,
): Promise<Record<string, unknown>> {
  void _ctx;
  void _deps;
  return payload;
}

function channelBindingsToTargets(
  bindings: Record<string, string> | null | undefined,
): Array<{ channel: 'telegram' | 'max'; externalId: string }> {
  if (!bindings || typeof bindings !== 'object') return [];
  const out: Array<{ channel: 'telegram' | 'max'; externalId: string }> = [];
  if (typeof bindings.telegramId === 'string' && bindings.telegramId.trim().length > 0) {
    out.push({ channel: 'telegram', externalId: bindings.telegramId.trim() });
  }
  if (typeof bindings.maxId === 'string' && bindings.maxId.trim().length > 0) {
    out.push({ channel: 'max', externalId: bindings.maxId.trim() });
  }
  return out;
}

export async function handleDelivery(
  action: Action,
  ctx: DomainContext,
  deps: ExecutorDeps,
): Promise<ActionResult> {
  return runWithInfraPrincipal({ source: 'delivery-handler' }, () =>
    handleDeliveryInner(action, ctx, deps),
  );
}

async function handleDeliveryInner(
  action: Action,
  ctx: DomainContext,
  deps: ExecutorDeps,
): Promise<ActionResult> {
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
      canAttachMainReplyKeyboard(ctx) &&
      !resolvedParams.replyMarkup
    ) {
      const recipient = asRecord(resolvedParams.recipient);
      const chatId = asNumber(recipient.chatId);
      if (chatId !== null) {
        const replyMarkup = await buildMainReplyKeyboardMarkup({
          ctx,
          templatePort: deps.templatePort,
          contentPort: deps.contentPort,
        });
        if (replyMarkup) {
          resolvedParams = { ...resolvedParams, replyMarkup };
        }
      }
    }

    const incoming = asRecord((ctx.event.payload as { incoming?: unknown })?.incoming);
    const phone =
      asString(incoming?.phone) ?? asString(asRecord(resolvedParams.recipient).phoneNormalized);
    if (deps.deliveryTargetsPort && phone) {
      const fetched = await deps.deliveryTargetsPort.getTargetsByPhone(phone);
      const targets = channelBindingsToTargets(fetched?.channelBindings);
      if (targets.length > 0) {
        const delivery = asRecord(resolvedParams.delivery);
        const maxAttempts =
          typeof delivery.maxAttempts === 'number' && Number.isFinite(delivery.maxAttempts)
            ? Math.max(1, Math.trunc(delivery.maxAttempts))
            : 1;
        const intents: OutgoingIntent[] = await Promise.all(
          targets.map(async (target) => {
            const recipient =
              target.channel === 'max'
                ? maxUserRecipient(target.externalId)
                : { chatId: Number(target.externalId) };
            let payload: Record<string, unknown> = {
              ...resolvedParams,
              recipient,
              delivery: { channels: [target.channel], maxAttempts },
            };
            payload = await enrichMessageSendPayloadWithMaxMainInlineIfApplicable(
              payload,
              ctx,
              deps,
            );
            return {
              type: 'message.send' as const,
              meta: buildIntentMeta(action, ctx),
              payload,
            };
          }),
        );
        return { actionId: action.id, status: 'success', intents };
      }
    }

    resolvedParams = await enrichMessageSendPayloadWithMaxMainInlineIfApplicable(
      resolvedParams,
      ctx,
      deps,
    );

    const intents: OutgoingIntent[] = [
      {
        type: 'message.send',
        meta: buildIntentMeta(action, ctx),
        payload: resolvedParams,
      },
    ];
    return { actionId: action.id, status: 'success', intents };
  }

  if (action.type === 'callback.answer') {
    const callbackQueryId = asString(action.params.callbackQueryId);
    const intents: OutgoingIntent[] = callbackQueryId
      ? [
          {
            type: 'callback.answer',
            meta: buildIntentMeta(action, ctx),
            payload: {
              callbackQueryId,
              ...(asString(action.params.text) ? { text: asString(action.params.text) } : {}),
              ...(asString(action.params.notification)
                ? { notification: asString(action.params.notification) }
                : {}),
              ...(action.params.show_alert === true ? { show_alert: true } : {}),
            },
          },
        ]
      : [];
    return { actionId: action.id, status: 'success', ...(intents.length > 0 ? { intents } : {}) };
  }

  return { actionId: action.id, status: 'skipped', error: 'DELIVERY_HANDLER_UNKNOWN_TYPE' };
}
