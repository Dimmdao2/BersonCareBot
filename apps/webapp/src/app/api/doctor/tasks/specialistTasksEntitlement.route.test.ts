import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  requireDoctorWorkspaceApiContext: vi.fn(),
  requireEntitlementForMutation: vi.fn(),
  requireEntitlementForRead: vi.fn(),
  listForOwner: vi.fn(),
  listPatientTasks: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  complete: vi.fn(),
  getByIdForOwner: vi.fn(),
  getClientIdentityForOrganization: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requireDoctorWorkspaceApiContext: fakes.requireDoctorWorkspaceApiContext,
}));
vi.mock('@/app-layer/guards/requireEntitlement', () => ({
  requireEntitlementForMutation: fakes.requireEntitlementForMutation,
  requireEntitlementForRead: fakes.requireEntitlementForRead,
  entitlementMutationRefusalResponse: (mechanic: string, action: string) =>
    new Response(
      JSON.stringify({
        ok: false,
        error: 'entitlement_required',
        mechanic,
        message: `Невозможно ${action}: этот раздел не входит в ваш тариф.`,
      }),
      { status: 403, headers: { 'content-type': 'application/json' } },
    ),
}));
vi.mock('@/app-layer/guards/doctorWorkspacePrincipal', () => ({
  withDoctorWorkspacePrincipal: <T>(...args: unknown[]): T => (args.at(-1) as () => T)(),
}));

import {
  GET as listPatientTasks,
  POST as createPatientTask,
} from '@/app/api/doctor/clients/[userId]/tasks/route';
import { POST as completeTask } from '@/app/api/doctor/tasks/[taskId]/complete/route';
import { DELETE as deleteTask, PATCH as updateTask } from '@/app/api/doctor/tasks/[taskId]/route';
import { GET as listGlobalTasks, POST as createGlobalTask } from '@/app/api/doctor/tasks/route';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000001069';
const DOCTOR_ID = '00000000-0000-4000-8000-000000002069';
const PATIENT_ID = '00000000-0000-4000-8000-000000003069';
const TASK_ID = '00000000-0000-4000-8000-000000004069';

const workspace = {
  organizationId: ORGANIZATION_ID,
  session: { user: { userId: DOCTOR_ID } },
};

const task = {
  id: TASK_ID,
  organizationId: ORGANIZATION_ID,
  ownerUserId: DOCTOR_ID,
  patientUserId: PATIENT_ID,
  title: 'Позвонить пациенту',
  description: null,
  dueAt: null,
  remindAt: null,
  reminderSentAt: null,
  isImportant: false,
  completedAt: null,
  createdAt: '2026-08-02T00:00:00.000Z',
  updatedAt: '2026-08-02T00:00:00.000Z',
};

function jsonRequest(url: string, method: 'POST' | 'PATCH', body: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function taskParams() {
  return { params: Promise.resolve({ taskId: TASK_ID }) };
}

function patientParams() {
  return { params: Promise.resolve({ userId: PATIENT_ID }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  fakes.requireDoctorWorkspaceApiContext.mockResolvedValue({ ok: true, ctx: workspace });
  fakes.requireEntitlementForMutation.mockResolvedValue({
    ok: false,
    response: new Response(null, { status: 403 }),
  });
  fakes.requireEntitlementForRead.mockResolvedValue({
    ok: false,
    response: new Response(
      JSON.stringify({
        ok: false,
        error: 'entitlement_required',
        mechanic: 'specialist_tasks',
      }),
      { status: 403, headers: { 'content-type': 'application/json' } },
    ),
  });
  fakes.getClientIdentityForOrganization.mockResolvedValue({ userId: PATIENT_ID });
  fakes.getByIdForOwner.mockResolvedValue(task);
  fakes.create.mockResolvedValue(task);
  fakes.update.mockResolvedValue(task);
  fakes.delete.mockResolvedValue(true);
  fakes.complete.mockResolvedValue(task);
  fakes.buildAppDeps.mockReturnValue({
    doctorClientsPort: {
      getClientIdentityForOrganization: fakes.getClientIdentityForOrganization,
    },
    specialistTasks: {
      listForOwner: fakes.listForOwner,
      listPatientTasks: fakes.listPatientTasks,
      create: fakes.create,
      update: fakes.update,
      delete: fakes.delete,
      complete: fakes.complete,
      getByIdForOwner: fakes.getByIdForOwner,
    },
  });
});

describe('specialist task tariff reads', () => {
  const calls = [
    {
      read: fakes.listForOwner,
      invoke: () => listGlobalTasks(new Request('https://app.example.test/api/doctor/tasks')),
    },
    {
      read: fakes.listPatientTasks,
      invoke: () =>
        listPatientTasks(
          new Request('https://app.example.test/api/doctor/clients/' + PATIENT_ID + '/tasks'),
          patientParams(),
        ),
    },
  ];

  it.each(calls)('refuses a direct read when specialist tasks are disabled', async ({ invoke, read }) => {
    const response = await invoke();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: 'entitlement_required',
      mechanic: 'specialist_tasks',
    });
    expect(read).not.toHaveBeenCalled();
  });

  it.each(calls)('keeps existing tasks readable in read-only mode', async ({ invoke, read }) => {
    fakes.requireEntitlementForRead.mockResolvedValue({ ok: true });
    read.mockResolvedValue([task]);

    const response = await invoke();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, tasks: [task] });
    expect(read).toHaveBeenCalledOnce();
  });
});

describe('specialist task tariff mutations', () => {
  const calls = [
    {
      action: 'создать задачу',
      write: fakes.create,
      invoke: () =>
        createGlobalTask(
          jsonRequest('https://app.example.test/api/doctor/tasks', 'POST', {
            title: task.title,
          }),
        ),
    },
    {
      action: 'создать задачу',
      write: fakes.create,
      invoke: () =>
        createPatientTask(
          jsonRequest(
            'https://app.example.test/api/doctor/clients/' + PATIENT_ID + '/tasks',
            'POST',
            {
              title: task.title,
            },
          ),
          patientParams(),
        ),
    },
    {
      action: 'изменить задачу',
      write: fakes.update,
      invoke: () =>
        updateTask(
          jsonRequest('https://app.example.test/api/doctor/tasks/' + TASK_ID, 'PATCH', {
            title: 'Обновлённая задача',
          }),
          taskParams(),
        ),
    },
    {
      action: 'удалить задачу',
      write: fakes.delete,
      invoke: () =>
        deleteTask(
          new Request('https://app.example.test/api/doctor/tasks/' + TASK_ID),
          taskParams(),
        ),
    },
    {
      action: 'выполнить задачу',
      write: fakes.complete,
      invoke: () =>
        completeTask(
          new Request('https://app.example.test/api/doctor/tasks/' + TASK_ID + '/complete', {
            method: 'POST',
          }),
          taskParams(),
        ),
    },
  ];

  it.each(calls)(
    'refuses $action before its service write when disabled',
    async ({ invoke, write }) => {
      const response = await invoke();

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        error: 'entitlement_required',
        mechanic: 'specialist_tasks',
      });
      expect(write).not.toHaveBeenCalled();
    },
  );

  it.each(calls)('allows $action when specialist tasks are enabled', async ({ invoke, write }) => {
    fakes.requireEntitlementForMutation.mockResolvedValue({ ok: true });

    const response = await invoke();

    expect(response.status).toBe(200);
    expect(write).toHaveBeenCalledOnce();
  });
});
