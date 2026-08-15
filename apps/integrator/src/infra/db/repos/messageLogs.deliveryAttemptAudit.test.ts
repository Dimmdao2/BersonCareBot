/**
 * Delivery-attempt audit is one exact integrator-port capability. It must not depend on the
 * caller's ambient tenant/worker principal and must never fall back to direct table INSERT.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  runNamedRoot: vi.fn(async () => ({ rows: [] })),
  runWithInfraPrincipal: vi.fn(
    (_input: { source: string }, fn: () => unknown): unknown => fn(),
  ),
}));

vi.mock('../runIntegratorSql.js', () => ({
  runIntegratorNamedRoot: fakes.runNamedRoot,
}));

vi.mock('../../principal/organizationPrincipal.js', () => ({
  runWithInfraPrincipal: fakes.runWithInfraPrincipal,
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
    fakes.runNamedRoot.mockClear();
    fakes.runWithInfraPrincipal.mockClear();
    vi.mocked(db.query).mockClear();
    vi.mocked(db.tx).mockClear();
  });

  it.each(['max', 'telegram', 'smsc', 'email', 'web_push'])(
    'routes %s through the same exact named root',
    async (channel) => {
      const { appendMessageLog } = await import('./messageLogs.js');
      await appendMessageLog(db as never, {
        type: 'delivery.attempt.log',
        params: attempt(channel),
      } as never);

      expect(fakes.runWithInfraPrincipal).toHaveBeenCalledWith(
        { source: 'delivery-handler' },
        expect.any(Function),
      );
      expect(fakes.runNamedRoot).toHaveBeenCalledWith(
        db,
        'app.record_operational_delivery_attempt_audit(text,text,text,uuid,text,text,integer,text,text,timestamp with time zone)',
        expect.arrayContaining([channel, 'failed']),
        expect.anything(),
      );
    },
  );

  it('persists a skipped provider outcome instead of rejecting it before the DB capability', async () => {
    const { appendMessageLog } = await import('./messageLogs.js');
    await appendMessageLog(db as never, {
      type: 'delivery.attempt.log',
      params: attempt('web_push', 'skipped'),
    } as never);

    expect(fakes.runNamedRoot).toHaveBeenCalledWith(
      db,
      expect.any(String),
      expect.arrayContaining(['web_push', 'skipped']),
      expect.anything(),
    );
  });

  it('starts the named-root transaction before any generic write transaction', async () => {
    const { createDbWritePort } = await import('../writePort.js');
    const writePort = createDbWritePort({ db: db as never });

    await writePort.writeDb({
      type: 'delivery.attempt.log',
      params: { ...attempt('max', 'success'), organizationId: null },
    } as never);

    expect(db.tx).not.toHaveBeenCalled();
    expect(fakes.runNamedRoot).toHaveBeenCalledWith(
      db,
      'app.record_operational_delivery_attempt_audit(text,text,text,uuid,text,text,integer,text,text,timestamp with time zone)',
      expect.arrayContaining(['max', 'success']),
      expect.anything(),
    );
  });
});
