import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  runWebappNamedRoot: vi.fn(),
  getWebappSqlDb: vi.fn(() => ({ marker: 'db' })),
}));

vi.mock('@/infra/db/runWebappSql', () => fakes);

import { createPgPatientReminderMaterializationPort } from './pgPatientReminderMaterialization';

const organizationId = '11111111-1111-4111-8111-111111111111';
const platformUserId = '22222222-2222-4222-8222-222222222222';

describe('patient reminder materialization exact capability boundary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('commits occurrence and all ready deliveries through one atomic named root', async () => {
    fakes.runWebappNamedRoot.mockResolvedValue({
      rows: [{ result: { ok: true, outcome: 'materialized' } }],
    });
    const port = createPgPatientReminderMaterializationPort();
    const outcome = await port.materializeOccurrence(
      {
        id: 'rule-1',
        organizationId,
        platformUserId,
        integratorUserId: '42',
        category: 'warmup',
        isEnabled: true,
        scheduleType: 'slots_v1',
        timezone: 'Europe/Moscow',
        intervalMinutes: 60,
        windowStartMinute: 600,
        windowEndMinute: 600,
        daysMask: '1111111',
        scheduleData: null,
        quietHoursStartMinute: null,
        quietHoursEndMinute: null,
        linkedObjectType: null,
        linkedObjectId: null,
        customTitle: null,
        customText: null,
        displayTitle: null,
        reminderIntent: 'warmup',
        notificationTopicCode: 'warmup_reminders',
        linkedTitle: null,
      },
      { occurrenceKey: 'rule-1:slot', plannedAt: '2026-08-17T10:00:00.000Z' },
      { id: 'occ-1', deliveryGeneration: 0, plannedAt: '2026-08-17T10:00:00.000Z' },
      [],
    );
    expect(outcome).toBe('materialized');
    expect(fakes.runWebappNamedRoot).toHaveBeenCalledOnce();
    expect(fakes.runWebappNamedRoot.mock.calls[0]?.[1]).toBe(
      'app.commit_patient_reminder_materialization(uuid,text,text,uuid,text,timestamp with time zone,integer,text)',
    );
    expect(fakes.runWebappNamedRoot.mock.calls[0]?.[2]).toHaveLength(8);
  });

  it('treats an org/user rejected target snapshot as unavailable', async () => {
    fakes.runWebappNamedRoot.mockResolvedValue({
      rows: [{ result: { ok: false, code: 'notification_target_outside_organization' } }],
    });
    const result = await createPgPatientReminderMaterializationPort().readDeliveryTargetSnapshot({
      organizationId,
      platformUserId,
      integratorUserId: '42',
      topicCode: 'warmup_reminders',
      nowIso: '2026-08-17T10:00:00.000Z',
    });
    expect(result).toBeNull();
    expect(fakes.runWebappNamedRoot.mock.calls[0]?.[1]).toBe(
      'app.read_patient_reminder_delivery_target_snapshot(uuid,uuid,bigint,text,timestamp with time zone)',
    );
  });
});
