import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpecialistTaskReadyOutgoingDelivery } from '@/modules/messaging/outgoingDeliveryQueuePort';
import type { SpecialistTaskRow } from '@/modules/specialist-tasks/types';

const fakes = vi.hoisted(() => ({
  replaceGeneration: vi.fn(),
  tx: undefined as unknown,
}));

vi.mock('@bersoncare/db-principal', () => ({
  getCurrentDbPrincipalOrganizationId: () => 'org-1',
}));
vi.mock('@/app-layer/db/drizzle', () => ({ getDrizzle: vi.fn() }));
vi.mock('@/infra/db/drizzleMutationTx', () => ({
  runDrizzleMutationTransaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback(fakes.tx),
  ),
}));
vi.mock('@/infra/repos/pgOutgoingDeliveryQueue', () => ({
  createPgOutgoingDeliveryQueueWritePort: () => ({
    replaceSpecialistTaskReminderGeneration: fakes.replaceGeneration,
  }),
}));

import { createPgSpecialistTasksPort } from './pgSpecialistTasks';

const TASK: SpecialistTaskRow = {
  id: 'task-1',
  organizationId: 'org-1',
  ownerUserId: 'owner-1',
  patientUserId: 'patient-1',
  title: 'Позвонить пациенту',
  description: null,
  dueAt: '2026-08-26T09:00:00.000Z',
  remindAt: '2026-08-26T08:00:00.000Z',
  isImportant: true,
  completedAt: null,
  reminderSentAt: null,
  createdAt: '2026-08-23T06:00:00.000Z',
  updatedAt: '2026-08-23T06:00:00.000Z',
};

const DELIVERY: SpecialistTaskReadyOutgoingDelivery = {
  organizationId: 'org-1',
  eventId: 'specialist-task:task-1:telegram',
  kind: 'specialist_task_reminder',
  channel: 'telegram',
  intent: {
    type: 'message.send',
    meta: {
      eventId: 'specialist-task:task-1:telegram',
      occurredAt: '2026-08-23T06:00:00.000Z',
      source: 'telegram',
    },
    payload: {},
  },
  successOutcome: { type: 'specialistTask.reminder.markSent', taskId: 'task-1' },
  nextRetryAt: '2026-08-26T08:00:00.000Z',
};

function buildTx() {
  const returningTask = vi.fn(async () => [TASK]);
  const returningDeleted = vi.fn(async () => [{ id: TASK.id }]);
  return {
    query: { specialistTasks: { findFirst: vi.fn(async () => TASK) } },
    insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: returningTask })) })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn(() => ({ returning: returningTask })) })),
    })),
    delete: vi.fn(() => ({ where: vi.fn(() => ({ returning: returningDeleted })) })),
  };
}

let tx: ReturnType<typeof buildTx>;
const prepareDeliveries = vi.fn(async () => [DELIVERY]);

beforeEach(() => {
  vi.clearAllMocks();
  tx = buildTx();
  fakes.tx = tx;
  fakes.replaceGeneration.mockResolvedValue([]);
});

describe('specialist task write-time reminder producer', () => {
  it('create materializes the reminder generation in the task transaction', async () => {
    await createPgSpecialistTasksPort(prepareDeliveries).create({
      ownerUserId: TASK.ownerUserId,
      patientUserId: TASK.patientUserId,
      title: TASK.title,
      remindAt: TASK.remindAt,
    });

    expect(fakes.replaceGeneration).toHaveBeenCalledOnce();
    expect(fakes.replaceGeneration).toHaveBeenCalledWith(tx, {
      taskId: TASK.id,
      deliveries: [DELIVERY],
      reason: 'SPECIALIST_TASK_REMINDER_SUPERSEDED',
    });
  });

  it('update rematerializes the reminder generation in the task transaction', async () => {
    await createPgSpecialistTasksPort(prepareDeliveries).update(TASK.id, TASK.ownerUserId, {
      title: 'Новый заголовок',
    });

    expect(fakes.replaceGeneration).toHaveBeenCalledOnce();
    expect(fakes.replaceGeneration).toHaveBeenCalledWith(tx, {
      taskId: TASK.id,
      deliveries: [DELIVERY],
      reason: 'SPECIALIST_TASK_REMINDER_SUPERSEDED',
    });
  });

  it('complete cancels the reminder generation in the task transaction', async () => {
    await createPgSpecialistTasksPort(prepareDeliveries).complete(TASK.id, TASK.ownerUserId);

    expect(fakes.replaceGeneration).toHaveBeenCalledOnce();
    expect(fakes.replaceGeneration).toHaveBeenCalledWith(tx, {
      taskId: TASK.id,
      deliveries: [],
      reason: 'SPECIALIST_TASK_REMINDER_CANCELLED',
    });
  });

  it('delete terminates the reminder generation before deleting the task', async () => {
    await createPgSpecialistTasksPort(prepareDeliveries).delete(TASK.id, TASK.ownerUserId);

    expect(fakes.replaceGeneration).toHaveBeenCalledOnce();
    expect(fakes.replaceGeneration).toHaveBeenCalledWith(tx, {
      taskId: TASK.id,
      deliveries: [],
      reason: 'SPECIALIST_TASK_REMINDER_DELETED',
    });
    expect(fakes.replaceGeneration.mock.invocationCallOrder[0]).toBeLessThan(
      tx.delete.mock.invocationCallOrder[0]!,
    );
  });
});
