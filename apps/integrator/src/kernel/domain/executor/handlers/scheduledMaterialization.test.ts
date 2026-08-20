import { describe, expect, it, vi } from 'vitest';
import { handleScheduledMaterialization } from './scheduledMaterialization.js';
import type { Action, DomainContext } from '../../../contracts/index.js';

const action: Action = {
  id: 'wake',
  type: 'patientReminders.materializeWake',
  mode: 'sync',
  params: {},
};
const schedulerEventId = 'sch:ffffffff-ffff-4fff-8fff-ffffffffffff';
const ctx: DomainContext = {
  event: {
    type: 'schedule.tick',
    meta: {
      eventId: schedulerEventId,
      occurredAt: '2026-08-03T12:00:00.000Z',
      source: 'scheduler',
    },
    payload: { organizationId: 'd0000000-0000-4000-8000-00000000000d' },
  },
  nowIso: '2026-08-03T12:00:00.000Z',
  values: {},
  base: { actor: { isAdmin: false }, identityLinks: [] },
};

describe('scheduled patient reminder materialization', () => {
  it('does only one signed webapp wake', async () => {
    const wake = vi.fn(async () => ({ ok: true, status: 200 }));
    const result = await handleScheduledMaterialization(action, ctx, {
      webappEventsPort: { wakePatientReminderMaterialization: wake },
    });
    expect(result.status).toBe('success');
    expect(wake).toHaveBeenCalledWith({
      organizationId: 'd0000000-0000-4000-8000-00000000000d',
      wakeId: schedulerEventId,
    });
  });

  it('fails closed when the wake is unavailable', async () => {
    const result = await handleScheduledMaterialization(action, ctx, {
      webappEventsPort: {},
    });
    expect(result.status).toBe('failed');
  });
});
