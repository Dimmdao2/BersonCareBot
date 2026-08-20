import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  principal: undefined as
    | { kind: 'infra'; source: string }
    | { kind: 'organization'; organizationId: string }
    | undefined,
  runNamedRoot: vi.fn(async () => ({ rows: [] })),
  runWithInfraPrincipal: vi.fn(
    (_input: { source: string }, fn: () => Promise<unknown>): Promise<unknown> => fn(),
  ),
}));

vi.mock('@bersoncare/db-principal', () => ({
  getCurrentDbPrincipal: () => fakes.principal,
}));

vi.mock('../runIntegratorSql.js', () => ({
  runIntegratorNamedRoot: fakes.runNamedRoot,
}));

vi.mock('../../principal/organizationPrincipal.js', () => ({
  runWithInfraPrincipal: fakes.runWithInfraPrincipal,
}));

import {
  recordOperatorDeliveryAttempt,
  writeOperatorDeliveryAttempt,
} from './operatorDeliveryAttempts.js';

const db = { query: vi.fn(), tx: vi.fn() };
const mutation = {
  type: 'delivery.attempt.log' as const,
  params: {
    intentType: 'booking.confirmation',
    intentEventId: 'booking.confirmation.ics:abc',
    correlationId: 'booking:abc',
    organizationId: '10000000-0000-4000-8000-000000000001',
    channel: 'email',
    status: 'success',
    attempt: 2,
    reason: null,
    payload: { bookingId: 'abc' },
    occurredAt: '2026-08-20T12:34:56.000Z',
  },
};

describe('operator delivery attempt writer', () => {
  beforeEach(() => {
    fakes.principal = undefined;
    fakes.runNamedRoot.mockClear();
    fakes.runWithInfraPrincipal.mockClear();
  });

  it('forwards all ten delivery-attempt fields to the canonical named root', async () => {
    await recordOperatorDeliveryAttempt(db as never, mutation);

    expect(fakes.runNamedRoot).toHaveBeenCalledWith(
      db,
      'app.record_operator_delivery_attempt(text,text,text,uuid,text,text,integer,text,text,timestamp with time zone)',
      [
        'booking.confirmation',
        'booking.confirmation.ics:abc',
        'booking:abc',
        '10000000-0000-4000-8000-000000000001',
        'email',
        'success',
        2,
        null,
        JSON.stringify({ bookingId: 'abc' }),
        '2026-08-20T12:34:56.000Z',
      ],
      expect.anything(),
    );
  });

  it('installs the existing delivery-worker principal for an attempt outside that principal', async () => {
    fakes.principal = {
      kind: 'organization',
      organizationId: '10000000-0000-4000-8000-000000000001',
    };

    await writeOperatorDeliveryAttempt(db as never, mutation);

    expect(fakes.runWithInfraPrincipal).toHaveBeenCalledWith(
      { source: 'worker:outgoing-delivery-tick' },
      expect.any(Function),
    );
    expect(fakes.runNamedRoot).toHaveBeenCalledOnce();
  });

  it('does not replace the delivery-worker principal when it is already active', async () => {
    fakes.principal = { kind: 'infra', source: 'worker:outgoing-delivery-tick' };

    await writeOperatorDeliveryAttempt(db as never, mutation);

    expect(fakes.runWithInfraPrincipal).not.toHaveBeenCalled();
    expect(fakes.runNamedRoot).toHaveBeenCalledOnce();
  });
});
