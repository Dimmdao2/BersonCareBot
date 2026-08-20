import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../../kernel/contracts/index.js';

const fakes = vi.hoisted(() => ({
  getOrganizationId: vi.fn(() => '22222222-2222-4222-8222-222222222222'),
  runInfra: vi.fn((_principal: unknown, fn: () => unknown) => fn()),
  runNamedRoot: vi.fn(),
  runSql: vi.fn(),
}));

vi.mock('@bersoncare/db-principal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@bersoncare/db-principal')>()),
  getCurrentCorrelationId: vi.fn(() => undefined),
  runWithDbInfraPrincipal: fakes.runInfra,
}));

vi.mock('../../principal/organizationPrincipal.js', () => ({
  getCurrentOrganizationPrincipalId: fakes.getOrganizationId,
}));

vi.mock('../runIntegratorSql.js', () => ({
  runIntegratorNamedRoot: fakes.runNamedRoot,
  runIntegratorSql: fakes.runSql,
}));

import { enqueueAcceptedIncomingReplyIfAbsent } from './outgoingDeliveryQueue.js';

const db = {} as DbPort;

beforeEach(() => vi.clearAllMocks());

describe('inbound reply retry enqueue boundary', () => {
  it('uses only the exact delivery-worker root and carries the ambient organization', async () => {
    fakes.runNamedRoot.mockResolvedValueOnce({ rows: [{ inserted: true }] });

    await expect(
      enqueueAcceptedIncomingReplyIfAbsent(db, {
        eventId: ' event-1 ',
        channel: 'telegram',
        payloadJson: { intent: { type: 'message.send' } },
        maxAttempts: 4,
      }),
    ).resolves.toBe(true);

    expect(fakes.runInfra).toHaveBeenCalledWith(
      { source: 'delivery-handler' },
      expect.any(Function),
    );
    expect(fakes.runNamedRoot.mock.calls[0]?.slice(0, 3)).toEqual([
      db,
      'app.enqueue_integrator_outgoing_delivery(text,text,text,text,integer,timestamp with time zone,uuid)',
      [
        'event-1',
        'inbound_reply',
        'telegram',
        JSON.stringify({ intent: { type: 'message.send' } }),
        4,
        null,
        '22222222-2222-4222-8222-222222222222',
      ],
    ]);
    expect(fakes.runSql).not.toHaveBeenCalled();
  });
});
