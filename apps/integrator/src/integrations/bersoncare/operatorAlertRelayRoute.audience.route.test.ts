import { createHmac } from 'node:crypto';
import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import type { DispatchPort, IdempotencyPort, OutgoingIntent } from '../../kernel/contracts/index.js';
import { registerOperatorAlertRelayRoute } from './operatorAlertRelayRoute.js';

const SHARED_SECRET = 'audit-shared-secret';

function signedHeaders(body: string): Record<string, string> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  return {
    'content-type': 'application/json',
    'x-bersoncare-timestamp': timestamp,
    'x-bersoncare-signature': createHmac('sha256', SHARED_SECRET)
      .update(`${timestamp}.${body}`)
      .digest('base64url'),
  };
}

describe('operator alert relay platform audience', () => {
  it.each([
    ['telegram', '42'],
    ['max', '43'],
    ['email', 'staff@example.test'],
  ] as const)(
    'marks a staff %s alert before the shared dispatch boundary',
    async (channel, recipient) => {
      const dispatchOutgoing = vi.fn(async (_intent: OutgoingIntent) => ({}));
      const app = Fastify({ logger: false });
      await registerOperatorAlertRelayRoute(app, {
        dispatchPort: { dispatchOutgoing } as unknown as DispatchPort,
        sharedSecret: SHARED_SECRET,
        isSmsProviderReady: async () => true,
        idempotencyPort: { tryAcquire: async () => true } as IdempotencyPort,
      });
      const payload = JSON.stringify({
        messageId: `operator-alert-${channel}`,
        channel,
        recipient,
        text: 'operator action required',
        idempotencyKey: `operator-alert-${channel}`,
        ...(channel === 'email' ? { metadata: { subject: 'Operator action required' } } : {}),
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/bersoncare/operator-alert-relay',
        headers: signedHeaders(payload),
        payload,
      });
      await app.close();

      expect(response.statusCode).toBe(200);
      // TPB-12b/TPB-13a are the independent oracle. Without this mark, the typed
      // dispatch selector defaults the operational staff alert to TherapyGo.
      expect(dispatchOutgoing).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            delivery: expect.objectContaining({ channels: [channel], audience: 'staff' }),
          }),
        }),
      );
    },
  );
});
