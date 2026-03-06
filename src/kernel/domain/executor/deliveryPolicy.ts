import type { DomainContext } from '../../contracts/index.js';

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

function computeRubitimeRetryProfile(ctx: DomainContext): { maxAttempts: number; backoffSeconds: number[] } {
  const input = asRecord(ctx.values.input);
  const action = asString(input.action);
  if (action === 'created') {
    return { maxAttempts: 3, backoffSeconds: [60, 60, 60] };
  }
  return { maxAttempts: 1, backoffSeconds: [] };
}

export function applyMessageSendDeliveryPolicy(params: Record<string, unknown>, ctx: DomainContext): Record<string, unknown> {
  if (ctx.event.meta.source !== 'rubitime') return params;

  const delivery = asRecord(params.delivery);
  const retry = asRecord(params.retry);
  const onFail = asRecord(params.onFail);
  const recipientPolicy = asRecord(params.recipientPolicy);

  const hasDelivery = Object.keys(delivery).length > 0;
  const hasRetry = Object.keys(retry).length > 0;
  const hasOnFail = Object.keys(onFail).length > 0;
  const hasPreferredLinkedChannels = asStringArray(recipientPolicy.preferredLinkedChannels).length > 0;

  if (hasDelivery && hasRetry && hasOnFail && hasPreferredLinkedChannels) return params;

  const retryProfile = computeRubitimeRetryProfile(ctx);
  const maxAttempts = hasDelivery
    ? Math.max(1, Math.trunc(asNumber(delivery.maxAttempts) ?? 1))
    : retryProfile.maxAttempts;

  const resolved: Record<string, unknown> = {
    ...params,
    recipientPolicy: {
      ...recipientPolicy,
      ...(hasPreferredLinkedChannels ? {} : { preferredLinkedChannels: ['telegram'] }),
    },
    ...(hasDelivery ? {} : { delivery: { channels: ['telegram'], maxAttempts } }),
    ...(hasRetry ? {} : { retry: { maxAttempts, backoffSeconds: retryProfile.backoffSeconds } }),
  };

  if (!hasOnFail) {
    const recipient = asRecord(resolved.recipient);
    const message = asRecord(resolved.message);
    const templateKey = asString(resolved.templateKey);
    resolved.onFail = {
      fallbackIntent: {
        type: 'message.send',
        payload: {
          recipient,
          message,
          delivery: { channels: ['smsc'], maxAttempts: 1 },
          ...(templateKey ? { templateKey } : {}),
        },
      },
    };
  }

  return resolved;
}
