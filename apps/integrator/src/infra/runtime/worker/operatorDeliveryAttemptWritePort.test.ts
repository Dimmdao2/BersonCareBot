import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  principal: undefined as
    | { kind: 'organization'; organizationId: string }
    | { kind: 'integrator'; organizationId: string; integratorUserId: string }
    | { kind: 'infra'; source: string }
    | undefined,
  writeOperatorDeliveryAttempt: vi.fn(async () => undefined),
  tenantWrite: vi.fn(async () => undefined),
}));

vi.mock('@bersoncare/db-principal', () => ({
  getCurrentDbPrincipal: () => fakes.principal,
}));

vi.mock('../../db/repos/operatorDeliveryAttempts.js', () => ({
  writeOperatorDeliveryAttempt: fakes.writeOperatorDeliveryAttempt,
}));

import { createOperatorAwareDeliveryAttemptWritePort } from './operatorDeliveryAttemptWritePort.js';

const db = { query: vi.fn(), tx: vi.fn() };
const mutation = {
  type: 'delivery.attempt.log' as const,
  params: {
    intentEventId: 'operator-alert:incident:abc:email:def',
    channel: 'email',
    status: 'success',
    attempt: 1,
  },
};

describe('operator-aware delivery-attempt write port', () => {
  beforeEach(() => {
    fakes.principal = undefined;
    fakes.writeOperatorDeliveryAttempt.mockClear();
    fakes.tenantWrite.mockClear();
  });

  it.each([
    { kind: 'organization' as const, organizationId: '10000000-0000-4000-8000-000000000001' },
    {
      kind: 'integrator' as const,
      organizationId: '10000000-0000-4000-8000-000000000001',
      integratorUserId: '42',
    },
    { kind: 'infra' as const, source: 'other-infra-producer' },
  ])('routes delivery.attempt.log from $kind to the canonical writer', async (principal) => {
    fakes.principal = principal;
    const writePort = createOperatorAwareDeliveryAttemptWritePort({
      db: db as never,
      tenantWritePort: { writeDb: fakes.tenantWrite },
    });

    await writePort.writeDb(mutation);

    expect(fakes.writeOperatorDeliveryAttempt).toHaveBeenCalledWith(db, mutation);
    expect(fakes.tenantWrite).not.toHaveBeenCalled();
  });
});
