import { describe, expect, it, vi } from 'vitest';
import {
  MechanicWriteClearanceRequiredError,
  assertMechanicWriteClearance,
  enterWithMechanicWriteClearance,
  runWithoutMechanicWriteClearance,
} from '@/app-layer/entitlements/mechanicWriteClearance';
import { createSpecialistTasksService } from './service';
import type { SpecialistTasksPort } from './ports';

function buildService() {
  const create = vi.fn(async () => ({
    id: 'task-1',
    ownerUserId: 'owner-1',
    patientUserId: null,
    title: 'Задача',
    description: null,
    dueAt: null,
    isImportant: false,
    completedAt: null,
    remindAt: null,
    reminderSentAt: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  }));
  const port = {
    listForOwner: vi.fn(async () => []),
    getPatientSummary: vi.fn(async () => ({ openCount: 0, nextImportantOrOverdue: null })),
    create,
    update: vi.fn(async () => null),
    complete: vi.fn(async () => null),
    delete: vi.fn(async () => true),
    getByIdForOwner: vi.fn(async () => null),
    listDueReminders: vi.fn(async () => []),
    markReminderSent: vi.fn(async () => undefined),
    enqueueDueReminders: vi.fn(async () => ({ processed: 0, enqueued: 0 })),
  } as unknown as SpecialistTasksPort;
  const service = createSpecialistTasksService(port, {
    assertWriteClearance: assertMechanicWriteClearance,
  });
  return { service, create };
}

describe('specialist-tasks service — 3.2 physical door (specialist_tasks)', () => {
  it('refuses create when no specialist_tasks mutation decision ran first', async () => {
    const { service, create } = buildService();
    await runWithoutMechanicWriteClearance(async () => {
      await expect(
        service.create({ ownerUserId: 'owner-1', patientUserId: null, title: 'Задача' }),
      ).rejects.toBeInstanceOf(MechanicWriteClearanceRequiredError);
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('proceeds once the mutation guard cleared specialist_tasks for this continuation', async () => {
    const { service, create } = buildService();
    await runWithoutMechanicWriteClearance(async () => {
      enterWithMechanicWriteClearance('specialist_tasks');
      const task = await service.create({
        ownerUserId: 'owner-1',
        patientUserId: null,
        title: 'Задача',
      });
      expect(task.id).toBe('task-1');
    });
    expect(create).toHaveBeenCalledOnce();
  });
});
