import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Lead } from '@/modules/leads/types';

const fakes = vi.hoisted(() => ({
  db: { select: vi.fn() },
  withQueueTransaction: vi.fn(),
}));

vi.mock('@/app-layer/db/drizzle', () => ({ getDrizzle: () => fakes.db }));
vi.mock('@/infra/repos/pgOutboundMessageQueue', () => ({
  withPgOutboundMessageEnqueueTransaction: fakes.withQueueTransaction,
}));

import { createPgLeadsPort } from './pgLeads';

const REJECTED: Lead = {
  id: '1ead0000-0000-4000-8000-000000000012',
  organizationId: '1ead0000-0000-4000-8000-0000000000a0',
  platformUserId: '1ead0000-0000-4000-8000-000000000001',
  submittedFirstName: null,
  submittedLastName: null,
  submittedPatronymic: null,
  submittedEmail: 'reject@example.test',
  submittedPhone: null,
  preferredContact: null,
  messageText: 'Нужна консультация',
  status: 'rejected',
  rejectionComment: null,
  rejectedAt: '2026-09-14T12:00:00.000Z',
  acceptedAt: null,
  closedAt: null,
  archivedAt: null,
  sourceSurface: 'public_page',
  createdAt: '2026-09-14T11:00:00.000Z',
  updatedAt: '2026-09-14T12:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  fakes.db.select.mockReturnValue({
    from: () => ({
      where: () => ({
        limit: async () => [REJECTED],
      }),
    }),
  });
});

describe('lead rejection delivery', () => {
  it('a repeated reject is refused before a second durable email can be queued', async () => {
    await expect(
      createPgLeadsPort().reject({
        organizationId: REJECTED.organizationId,
        leadId: REJECTED.id,
        comment: null,
        now: '2026-09-14T13:00:00.000Z',
      }),
    ).rejects.toThrow('lead_status_transition_invalid');

    expect(fakes.withQueueTransaction).not.toHaveBeenCalled();
  });
});
