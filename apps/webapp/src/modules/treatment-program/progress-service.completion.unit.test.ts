import { describe, expect, it, vi } from 'vitest';
import type {
  ProgramActionLogPort,
  TreatmentProgramInstancePort,
  TreatmentProgramTestAttemptsPort,
} from './ports';
import type { TreatmentProgramInstanceDetail } from './types';
import { createTreatmentProgramProgressService } from './progress-service';

const patientId = '11111111-1111-4111-8111-111111111111';
const instanceId = '22222222-2222-4222-8222-222222222222';
const stageId = '33333333-3333-4333-8333-333333333333';
const itemId = '44444444-4444-4444-8444-444444444444';
const completionId = '55555555-5555-4555-8555-555555555555';

function detail(): TreatmentProgramInstanceDetail {
  return {
    id: instanceId,
    organizationId: '66666666-6666-4666-8666-666666666666',
    patientUserId: patientId,
    templateId: null,
    assignedBy: null,
    assignmentSource: 'doctor',
    title: 'План',
    status: 'active',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    patientPlanLastOpenedAt: null,
    stages: [
      {
        id: stageId,
        instanceId,
        sourceStageId: null,
        title: 'Этап',
        description: null,
        sortOrder: 1,
        localComment: null,
        skipReason: null,
        status: 'in_progress',
        startedAt: '2026-08-01T00:00:00.000Z',
        goals: null,
        objectives: null,
        expectedDurationDays: null,
        expectedDurationText: null,
        groups: [],
        items: [
          {
            id: itemId,
            stageId,
            itemType: 'exercise',
            itemRefId: '77777777-7777-4777-8777-777777777777',
            sortOrder: 1,
            comment: null,
            localComment: null,
            settings: null,
            snapshot: {},
            completedAt: null,
            isActionable: true,
            status: 'active',
            groupId: null,
            createdAt: '2026-08-01T00:00:00.000Z',
            lastViewedAt: null,
            effectiveComment: null,
          },
        ],
      },
    ],
  };
}

function harness(latest: { id: string; createdAt: string; payload: Record<string, unknown> } | null) {
  let current = detail();
  const instances = {
    getInstanceForPatient: vi.fn(async () => current),
    setStageItemCompletedAt: vi.fn(async (_instanceId, _itemId, completedAt) => {
      current = detail();
      current.stages[0]!.items[0]!.completedAt = completedAt;
      return current.stages[0]!.items[0]!;
    }),
    runInMutationTransaction: async <T>(fn: () => Promise<T>) => fn(),
  } as unknown as TreatmentProgramInstancePort;
  const actionLog = {
    lockSimpleCompletionTargetAndGetLatest: vi.fn(async () => latest),
    insertAction: vi.fn(async () => ({ id: completionId, createdAt: '2026-08-17T09:00:00.000Z' })),
    updateSimpleDonePayload: vi.fn(async () => null),
  } as unknown as ProgramActionLogPort;
  return {
    instances,
    actionLog,
    service: createTreatmentProgramProgressService({
      instances,
      tests: {} as TreatmentProgramTestAttemptsPort,
      actionLog,
      now: () => '2026-08-17T09:00:00.000Z',
    }),
  };
}

describe('simple completion semantics', () => {
  it('persists one empty-metrics done event immediately and returns its stable id', async () => {
    const { service, actionLog } = harness(null);
    const result = await service.patientCompleteSimpleItem({
      patientUserId: patientId,
      instanceId,
      stageItemId: itemId,
      repeatCooldownMinutes: 60,
    });
    expect(result.completion.id).toBe(completionId);
    expect(actionLog.insertAction).toHaveBeenCalledOnce();
    expect(actionLog.insertAction).toHaveBeenCalledWith(
      expect.objectContaining({
        instanceId,
        instanceStageItemId: itemId,
        patientUserId: patientId,
        actionType: 'done',
        payload: { source: 'simple_item_complete', itemType: 'exercise' },
      }),
    );
  });

  it('rejects a repeat inside the exact-item persisted cooldown before a second insert', async () => {
    const { service, actionLog } = harness({
      id: completionId,
      createdAt: '2026-08-17T08:30:00.000Z',
      payload: { source: 'simple_item_complete' },
    });
    await expect(
      service.patientCompleteSimpleItem({
        patientUserId: patientId,
        instanceId,
        stageItemId: itemId,
        repeatCooldownMinutes: 60,
      }),
    ).rejects.toThrow('completion_cooldown_active');
    expect(actionLog.insertAction).not.toHaveBeenCalled();
  });

  it('passes patient, instance, item and completion ids to exact-event enrichment', async () => {
    const { service, actionLog } = harness(null);
    await expect(
      service.enrichSimpleCompletion({
        patientUserId: patientId,
        instanceId,
        stageItemId: itemId,
        completionId,
        metrics: { reps: 12 },
      }),
    ).rejects.toThrow('completion_not_found');
    expect(actionLog.updateSimpleDonePayload).toHaveBeenCalledWith({
      patientUserId: patientId,
      instanceId,
      instanceStageItemId: itemId,
      completionId,
      metrics: { reps: 12 },
    });
    expect(actionLog.insertAction).not.toHaveBeenCalled();
  });
});
