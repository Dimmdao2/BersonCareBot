import { describe, expect, it } from 'vitest';
import type { DomainContext } from '../../contracts/index.js';
import { applyMessageSendDeliveryPolicy } from './deliveryPolicy.js';

function directContext(
  botDeliverySenderScope?: 'clinic_required' | 'platform_required',
): DomainContext {
  return {
    event: {
      type: 'message.received',
      meta: {
        eventId: 'event-direct-bot',
        occurredAt: '2026-09-02T10:00:00.000Z',
        source: 'telegram',
      },
      payload: {},
    },
    nowIso: '2026-09-02T10:00:00.000Z',
    values: {},
    base: {
      actor: { isAdmin: false },
      identityLinks: [],
      facts: botDeliverySenderScope ? { botDeliverySenderScope } : {},
    },
  };
}

describe('direct bot sender policy', () => {
  it('keeps an ordinary bot reply on the platform bot without a fallback intent', async () => {
    const resolved = await applyMessageSendDeliveryPolicy(
      { recipient: { chatId: 42 }, delivery: { channels: ['telegram'], maxAttempts: 1 } },
      directContext(),
      {
        getDeliveryDefaults: async () => ({
          defaultChannels: ['telegram'],
          fallbackChannels: ['max'],
          preferredLinkedChannels: ['telegram'],
          retry: { maxAttempts: 1, backoffSeconds: [] },
        }),
      },
    );

    expect(resolved.delivery).toEqual({
      channels: ['telegram'],
      maxAttempts: 1,
      senderScope: 'platform_required',
    });
    expect(resolved).not.toHaveProperty('onFail');
  });

  it('keeps a dedicated webhook reply on the clinic bot', async () => {
    const resolved = await applyMessageSendDeliveryPolicy(
      { recipient: { chatId: 42 }, delivery: { channels: ['telegram'], maxAttempts: 1 } },
      directContext('clinic_required'),
    );

    expect(resolved.delivery).toEqual({
      channels: ['telegram'],
      maxAttempts: 1,
      senderScope: 'clinic_required',
    });
  });
});
