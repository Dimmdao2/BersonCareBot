import type { DeliveryDefaultsPort, DomainContext } from '../../contracts/index.js';

export type DirectBotSenderScope = 'clinic_required' | 'platform_required';

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

/**
 * A reply to an inbound bot interaction must leave through the same bot surface.
 * Dedicated clinic webhooks mark themselves explicitly; ordinary Telegram/MAX
 * input is platform traffic. Scheduled notifications are intentionally outside
 * this rule and retain their own delivery policy.
 */
export function resolveDirectBotSenderScope(ctx: DomainContext): DirectBotSenderScope | null {
  const source = asString(ctx.event.meta.source);
  const isDirectInput =
    ctx.event.type === 'message.received' || ctx.event.type === 'callback.received';
  if ((source !== 'telegram' && source !== 'max') || !isDirectInput) return null;

  const facts = asRecord(ctx.base?.facts);
  return facts.botDeliverySenderScope === 'clinic_required'
    ? 'clinic_required'
    : 'platform_required';
}

export function applyDirectBotSenderScope(
  delivery: Record<string, unknown>,
  ctx: DomainContext,
): Record<string, unknown> {
  const senderScope = resolveDirectBotSenderScope(ctx);
  if (!senderScope || asString(delivery.senderScope)) return delivery;
  return { ...delivery, senderScope };
}

/**
 * Подставляет дефолты доставки из порта (infra). Ядро не знает имён каналов;
 * все значения приходят из deliveryDefaultsPort или уже заданы в params.
 */
export async function applyMessageSendDeliveryPolicy(
  params: Record<string, unknown>,
  ctx: DomainContext,
  deliveryDefaultsPort?: DeliveryDefaultsPort | null,
): Promise<Record<string, unknown>> {
  const directSenderScope = resolveDirectBotSenderScope(ctx);
  const suppliedDelivery = asRecord(params.delivery);
  const scopedParams = directSenderScope
    ? { ...params, delivery: applyDirectBotSenderScope(suppliedDelivery, ctx) }
    : params;
  if (!deliveryDefaultsPort) return scopedParams;

  const source = asString(ctx.event.meta.source);
  if (!source) return scopedParams;

  const input = asRecord(ctx.values?.input);
  const inputAction = asString(input.action);

  const options: { eventType?: string; inputAction?: string } = {};
  if (ctx.event.type) options.eventType = ctx.event.type;
  if (inputAction != null) options.inputAction = inputAction;
  const defaults = await deliveryDefaultsPort.getDeliveryDefaults(
    source,
    Object.keys(options).length > 0 ? options : undefined,
  );
  if (!defaults) return scopedParams;

  const delivery = asRecord(scopedParams.delivery);
  const retry = asRecord(scopedParams.retry);
  const onFail = asRecord(scopedParams.onFail);
  const recipientPolicy = asRecord(scopedParams.recipientPolicy);

  const hasDelivery = Object.keys(delivery).length > 0;
  const hasRetry = Object.keys(retry).length > 0;
  const hasOnFail = Object.keys(onFail).length > 0;
  const hasPreferredLinkedChannels =
    asStringArray(recipientPolicy.preferredLinkedChannels).length > 0;

  if (hasDelivery && hasRetry && (hasOnFail || directSenderScope) && hasPreferredLinkedChannels) {
    return scopedParams;
  }

  const defaultChannels =
    defaults.defaultChannels && defaults.defaultChannels.length > 0 ? defaults.defaultChannels : [];
  const retryProfile = defaults.retry ?? { maxAttempts: 1, backoffSeconds: [] };
  const maxAttempts = hasDelivery
    ? Math.max(1, Math.trunc(asNumber(delivery.maxAttempts) ?? 1))
    : retryProfile.maxAttempts;

  const resolved: Record<string, unknown> = {
    ...scopedParams,
    recipientPolicy: {
      ...recipientPolicy,
      ...(hasPreferredLinkedChannels
        ? {}
        : { preferredLinkedChannels: defaults.preferredLinkedChannels ?? [] }),
    },
    ...(hasDelivery ? {} : { delivery: { channels: defaultChannels, maxAttempts } }),
    ...(hasRetry ? {} : { retry: { maxAttempts, backoffSeconds: retryProfile.backoffSeconds } }),
  };

  if (
    !directSenderScope &&
    !hasOnFail &&
    defaults.fallbackChannels &&
    defaults.fallbackChannels.length > 0
  ) {
    const recipient = asRecord(resolved.recipient);
    const message = asRecord(resolved.message);
    const templateKey = asString(resolved.templateKey);
    resolved.onFail = {
      fallbackIntent: {
        type: 'message.send',
        payload: {
          recipient,
          message,
          delivery: { channels: defaults.fallbackChannels, maxAttempts: 1 },
          ...(templateKey ? { templateKey } : {}),
        },
      },
    };
  }

  return resolved;
}
