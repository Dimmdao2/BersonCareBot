import { describe, expect, it, vi } from 'vitest';
import type { OutgoingEvent } from '../../domain/contracts/index.js';
import { createOutgoingEventDispatcher } from './outgoingEvent.js';

function buildRubitimeMessageEvent(): OutgoingEvent {
  return {
    type: 'message.send',
    meta: {
      eventId: 'out_test_1',
      source: 'rubitime',
      occurredAt: new Date().toISOString(),
      correlationId: 'corr-1',
    },
    payload: {
      recipient: { phoneNormalized: '+79991234567' },
      message: { text: 'hello' },
      fallback: { smsText: 'fallback' },
    },
  };
}

describe('createOutgoingEventDispatcher', () => {
  it('routes rubitime message.send into messageByPhone dispatcher', async () => {
    const dispatchMessageByPhone = vi.fn(async () => undefined);
    const dispatcher = createOutgoingEventDispatcher({ dispatchMessageByPhone });

    await dispatcher.dispatchOutgoing(buildRubitimeMessageEvent());

    expect(dispatchMessageByPhone).toHaveBeenCalledTimes(1);
    expect(dispatchMessageByPhone).toHaveBeenCalledWith({
      phoneNormalized: '+79991234567',
      messageText: 'hello',
      smsFallbackText: 'fallback',
      correlationId: 'corr-1',
    });
  });

  it('ignores non-rubitime events', async () => {
    const dispatchMessageByPhone = vi.fn(async () => undefined);
    const dispatcher = createOutgoingEventDispatcher({ dispatchMessageByPhone });

    await dispatcher.dispatchOutgoing({
      ...buildRubitimeMessageEvent(),
      meta: {
        ...buildRubitimeMessageEvent().meta,
        source: 'telegram',
      },
    });

    expect(dispatchMessageByPhone).not.toHaveBeenCalled();
  });
});
