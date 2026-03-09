import type { DeliveryDefaultsPort, DomainContext } from '../../contracts/index.js';

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
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
 * Подставляет дефолты доставки из порта (infra). Ядро не знает имён каналов;
 * все значения приходят из deliveryDefaultsPort или уже заданы в params.
 */
export async function applyMessageSendDeliveryPolicy(
  params: Record<string, unknown>,
  ctx: DomainContext,
  deliveryDefaultsPort?: DeliveryDefaultsPort | null,
): Promise<Record<string, unknown>> {
  if (!deliveryDefaultsPort) return params;

  const source = asString(ctx.event.meta.source);
  if (!source) return params;

  const input = asRecord(ctx.values?.input);
  const inputAction = asString(input.action);

  const options: { eventType?: string; inputAction?: string } = {};
  if (ctx.event.type) options.eventType = ctx.event.type;
  if (inputAction != null) options.inputAction = inputAction;
  const defaults = await deliveryDefaultsPort.getDeliveryDefaults(source, Object.keys(options).length > 0 ? options : undefined);
  if (!defaults) return params;

  const delivery = asRecord(params.delivery);
  const retry = asRecord(params.retry);
  const onFail = asRecord(params.onFail);
  const recipientPolicy = asRecord(params.recipientPolicy);

  const hasDelivery = Object.keys(delivery).length > 0;
  const hasRetry = Object.keys(retry).length > 0;
  const hasOnFail = Object.keys(onFail).length > 0;
  const hasPreferredLinkedChannels = asStringArray(recipientPolicy.preferredLinkedChannels).length > 0;

  if (hasDelivery && hasRetry && hasOnFail && hasPreferredLinkedChannels) return params;

  const defaultChannels = defaults.defaultChannels && defaults.defaultChannels.length > 0
    ? defaults.defaultChannels
    : [];
  const retryProfile = defaults.retry ?? { maxAttempts: 1, backoffSeconds: [] };
  const maxAttempts = hasDelivery
    ? Math.max(1, Math.trunc(asNumber(delivery.maxAttempts) ?? 1))
    : retryProfile.maxAttempts;

  const resolved: Record<string, unknown> = {
    ...params,
    recipientPolicy: {
      ...recipientPolicy,
      ...(hasPreferredLinkedChannels ? {} : { preferredLinkedChannels: defaults.preferredLinkedChannels ?? [] }),
    },
    ...(hasDelivery ? {} : { delivery: { channels: defaultChannels, maxAttempts } }),
    ...(hasRetry ? {} : { retry: { maxAttempts, backoffSeconds: retryProfile.backoffSeconds } }),
  };

  if (!hasOnFail && defaults.fallbackChannels && defaults.fallbackChannels.length > 0) {
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
