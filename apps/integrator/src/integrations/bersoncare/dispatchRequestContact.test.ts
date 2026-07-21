import { describe, expect, it, vi } from 'vitest';
import { dispatchRequestContactToUser } from './dispatchRequestContact.js';

describe('dispatchRequestContactToUser', () => {
  it('marks the minimal MAX contact action as the trusted auth handshake', async () => {
    const dispatchOutgoing = vi.fn().mockResolvedValue({});

    await dispatchRequestContactToUser({
      dispatchPort: { dispatchOutgoing },
      channel: 'max',
      recipientId: '123',
      correlationId: 'request-contact-idempotency',
    });

    expect(dispatchOutgoing).toHaveBeenCalledWith(expect.objectContaining({
      meta: expect.objectContaining({
        outboundMessageClass: 'auth_code',
        outboundCapability: 'contact_handshake',
      }),
      payload: expect.objectContaining({ delivery: { channels: ['max'] } }),
    }));
  });
});
