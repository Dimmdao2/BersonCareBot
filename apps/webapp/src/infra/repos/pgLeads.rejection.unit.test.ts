import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Lead } from '@/modules/leads/types';

const fakes = vi.hoisted(() => ({
  db: { select: vi.fn(), update: vi.fn() },
  enqueue: vi.fn(),
  reportEmptyAudience: vi.fn(async () => undefined),
}));

vi.mock('@/app-layer/db/drizzle', () => ({ getDrizzle: () => fakes.db }));
vi.mock('@/infra/repos/pgOutboundMessageQueue', () => ({
  createPgOutboundMessageQueue: () => ({ enqueue: fakes.enqueue }),
}));
vi.mock('@/infra/logging/logger', () => ({
  logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
  serializeError: (err: unknown) => ({ type: (err as Error)?.name }),
}));
vi.mock('@/modules/operator-alerts/emptyAudienceRuntime', () => ({
  reportEmptyAudience: fakes.reportEmptyAudience,
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
  it('the first reject changes the status and only then queues the letter', async () => {
    const NEW = { ...REJECTED, status: 'new' as const, rejectedAt: null, updatedAt: REJECTED.createdAt };
    fakes.db.select.mockReturnValue({
      from: () => ({ where: () => ({ limit: async () => [NEW] }) }),
    });
    const updated = { ...REJECTED, rejectionComment: 'не наш профиль' };
    const casWhere = vi.fn();
    // Переход идёт СВОИМ обращением к базе: под именованным контекстом корня доставки любое
    // обращение к `public.leads` отказано гейтом принятого контекста, поэтому объединять их
    // в одну транзакцию нельзя. Порядок «сначала состояние, потом письмо» здесь и проверяется.
    const order: string[] = [];
    fakes.db.update.mockReturnValue({
      set: (patch: unknown) => ({
        where: (predicate: unknown) => {
          casWhere(patch, predicate);
          order.push('cas');
          return { returning: async () => [updated] };
        },
      }),
    });
    fakes.enqueue.mockImplementation(async () => {
      order.push('enqueue');
      return true;
    });

    const lead = await createPgLeadsPort().reject({
      organizationId: NEW.organizationId,
      leadId: NEW.id,
      comment: 'не наш профиль',
      now: '2026-09-14T13:00:00.000Z',
    });

    expect(lead?.status).toBe('rejected');
    expect(casWhere).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['cas', 'enqueue']);
    expect(fakes.enqueue.mock.calls[0]![0]).toMatchObject({
      organizationId: NEW.organizationId,
      purpose: 'lead.rejected',
      idempotencyKey: NEW.id,
      channel: 'email',
      recipient: NEW.submittedEmail,
    });
  });

  it('a refused delivery does not undo an already recorded rejection', async () => {
    const NEW = { ...REJECTED, status: 'new' as const, rejectedAt: null, updatedAt: REJECTED.createdAt };
    fakes.db.select.mockReturnValue({
      from: () => ({ where: () => ({ limit: async () => [NEW] }) }),
    });
    fakes.db.update.mockReturnValue({
      set: () => ({ where: () => ({ returning: async () => [REJECTED] }) }),
    });
    fakes.enqueue.mockRejectedValue(new Error('queue unavailable'));

    const lead = await createPgLeadsPort().reject({
      organizationId: NEW.organizationId,
      leadId: NEW.id,
      comment: null,
      now: '2026-09-14T13:00:00.000Z',
    });

    expect(lead?.status).toBe('rejected');
    // Повторить отказ нельзя — CAS закрыл дверь. Значит несостоявшееся письмо обязано быть
    // СЛЫШНЫМ оператору, иначе человек не узнает об отказе никогда при зелёном экране.
    expect(fakes.reportEmptyAudience).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: 'lead.rejected',
        severity: 'user_facing',
        context: expect.objectContaining({ reason: 'enqueue_failed' }),
      }),
    );
  });

  it('a repeated reject is refused before a second durable email can be queued', async () => {
    await expect(
      createPgLeadsPort().reject({
        organizationId: REJECTED.organizationId,
        leadId: REJECTED.id,
        comment: null,
        now: '2026-09-14T13:00:00.000Z',
      }),
    ).rejects.toThrow('lead_status_transition_invalid');

    expect(fakes.enqueue).not.toHaveBeenCalled();
  });
});
