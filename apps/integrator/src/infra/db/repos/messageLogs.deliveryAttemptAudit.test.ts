/**
 * Delivery attempts are one exact canonical capability. The base write port must route them
 * through the shared operator-journal writer before it performs an optional support projection.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  writeOperatorDeliveryAttempt: vi.fn(async () => undefined),
}));

vi.mock('./operatorDeliveryAttempts.js', () => ({
  writeOperatorDeliveryAttempt: fakes.writeOperatorDeliveryAttempt,
}));

const db = { query: vi.fn(), tx: vi.fn() };

const attempt = (channel: string, status: 'success' | 'failed' | 'skipped' = 'failed') => ({
  intentType: 'message.send',
  intentEventId: `booking-reminder:${channel}:24h`,
  correlationId: null,
  organizationId: '10000000-0000-4000-8000-000000000001',
  channel,
  status,
  attempt: 1,
  reason: status === 'skipped' ? 'provider_skipped' : 'provider_rejected',
  payload: { message: { text: 'x' } },
  occurredAt: '2026-08-07T13:01:02.011Z',
});

describe('delivery attempt audit capability', () => {
  beforeEach(() => {
    fakes.writeOperatorDeliveryAttempt.mockClear();
    vi.mocked(db.query).mockClear();
    vi.mocked(db.tx).mockClear();
  });

  it.each(['max', 'telegram', 'smsc', 'email', 'web_push'])(
    'routes %s through the canonical operator-journal writer',
    async (channel) => {
      const { createDbWritePort } = await import('../writePort.js');
      await createDbWritePort({ db: db as never }).writeDb({
        type: 'delivery.attempt.log',
        params: { ...attempt(channel), organizationId: null },
      } as never);

      expect(fakes.writeOperatorDeliveryAttempt).toHaveBeenCalledWith(
        db,
        expect.objectContaining({
          type: 'delivery.attempt.log',
          params: expect.objectContaining({ channel, status: 'failed' }),
        }),
      );
    },
  );

  it('persists a skipped provider outcome instead of rejecting it before the DB capability', async () => {
    const { createDbWritePort } = await import('../writePort.js');
    await createDbWritePort({ db: db as never }).writeDb({
      type: 'delivery.attempt.log',
      params: { ...attempt('web_push', 'skipped'), organizationId: null },
    } as never);

    expect(fakes.writeOperatorDeliveryAttempt).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        params: expect.objectContaining({ channel: 'web_push', status: 'skipped' }),
      }),
    );
  });

  it('uses the canonical writer before any generic write transaction', async () => {
    const { createDbWritePort } = await import('../writePort.js');
    const writePort = createDbWritePort({ db: db as never });

    await writePort.writeDb({
      type: 'delivery.attempt.log',
      params: { ...attempt('max', 'success'), organizationId: null },
    } as never);

    expect(db.tx).not.toHaveBeenCalled();
    expect(fakes.writeOperatorDeliveryAttempt).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        params: expect.objectContaining({ channel: 'max', status: 'success' }),
      }),
    );
  });
});
