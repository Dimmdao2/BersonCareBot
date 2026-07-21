import { describe, expect, it, vi } from 'vitest';
import type { OutgoingIntent } from '../../kernel/contracts/index.js';
import {
  OUTBOUND_MESSAGE_POLICY_DENIED,
  assertOutboundMessagePolicy,
} from './outboundMessagePolicy.js';
import { createDefaultDispatchPort } from './dispatchPort.js';

function intent(input: {
  channel: string;
  messageClass?: 'auth_code' | 'routine_product' | 'conversation_event' | 'broadcast_event' | 'account_service' | 'operator_security';
  capability?: 'auth_code' | 'contact_handshake' | 'app_push';
  type?: OutgoingIntent['type'];
}): OutgoingIntent {
  return {
    type: input.type ?? 'message.send',
    meta: {
      eventId: 'event-id',
      occurredAt: '2026-07-21T00:00:00.000Z',
      source: input.channel,
      ...(input.messageClass ? { outboundMessageClass: input.messageClass } : {}),
      ...(input.capability ? { outboundCapability: input.capability } : {}),
    },
    payload: {
      recipient: { chatId: '123' },
      message: { text: 'sensitive test body' },
      delivery: { channels: [input.channel] },
    },
  };
}

describe('central outbound message policy', () => {
  it.each([
    ['telegram', 'auth_code', 'auth_code'],
    ['max', 'auth_code', 'auth_code'],
    ['email', 'auth_code', 'auth_code'],
    ['smsc', 'auth_code', 'auth_code'],
    ['telegram', 'auth_code', 'contact_handshake'],
    ['max', 'auth_code', 'contact_handshake'],
    ['web_push', 'routine_product', 'app_push'],
    ['web_push', 'conversation_event', 'app_push'],
    ['web_push', 'broadcast_event', 'app_push'],
    ['web_push', 'account_service', 'app_push'],
    ['web_push', 'operator_security', 'app_push'],
  ] as const)('allows %s only with %s/%s capability', (channel, messageClass, capability) => {
    expect(assertOutboundMessagePolicy(intent({ channel, messageClass, capability }))).toBe(channel);
  });

  it.each([
    intent({ channel: 'telegram' }),
    intent({ channel: 'max', messageClass: 'routine_product', capability: 'app_push' }),
    intent({ channel: 'email', messageClass: 'auth_code', capability: 'contact_handshake' }),
    intent({ channel: 'smsc', messageClass: 'routine_product', capability: 'app_push' }),
    intent({ channel: 'web_push' }),
    intent({ channel: 'legacy' as string, messageClass: 'auth_code', capability: 'auth_code' }),
    intent({ channel: 'telegram', messageClass: 'auth_code', capability: 'app_push' }),
  ])('denies missing, forged, and legacy message sends', (candidate) => {
    expect(() => assertOutboundMessagePolicy(candidate)).toThrow(OUTBOUND_MESSAGE_POLICY_DENIED);
  });

  it('does not change non-message intent behaviour before N4', () => {
    expect(() => assertOutboundMessagePolicy(intent({ channel: 'telegram', type: 'message.delete' }))).not.toThrow();
  });

  it('stops an unclassified payload before adapter selection and delivery-attempt persistence', async () => {
    const send = vi.fn().mockResolvedValue({});
    const writeDb = vi.fn().mockResolvedValue(undefined);
    const dispatchPort = createDefaultDispatchPort({
      adapters: [{ canHandle: () => true, send }],
      writePort: { writeDb },
    });

    await expect(dispatchPort.dispatchOutgoing(intent({ channel: 'telegram' }))).rejects.toThrow(
      OUTBOUND_MESSAGE_POLICY_DENIED,
    );
    expect(send).not.toHaveBeenCalled();
    expect(writeDb).not.toHaveBeenCalled();
  });
});
