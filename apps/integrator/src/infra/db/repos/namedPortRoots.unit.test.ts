import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  runIntegratorNamedRoot: vi.fn(),
}));

vi.mock('../runIntegratorSql.js', () => ({
  runIntegratorNamedRoot: fakes.runIntegratorNamedRoot,
}));

import type { DbPort } from '../../../kernel/contracts/index.js';
import {
  markOperatorIncidentAlertSent,
  operatorIncidentAlertAlreadySent,
  resolveOutgoingDeliveryScope,
} from './outgoingDeliveryScope.js';
import { listSchedulerReminderOrganizationIds } from './schedulerReminderOrganizations.js';
import {
  advanceAppointmentReminderMessengerLadder,
  revalidateAppointmentReminderMaterialization,
} from './appointmentReminderDelivery.js';

const QUEUE_ID = '11111111-1111-4111-8111-111111111111';
const ORGANIZATION_ID = '22222222-2222-4222-8222-222222222222';
const INCIDENT_ID = '33333333-3333-4333-8333-333333333333';
const db = {} as DbPort;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('integrator named-root repository metadata', () => {
  it('binds outgoing-delivery roots to their exact identities and arguments', async () => {
    fakes.runIntegratorNamedRoot
      .mockResolvedValueOnce({
        rows: [
          {
            queue_kind: 'appointment_reminder',
            organization_id: ORGANIZATION_ID,
            resolution: 'tenant',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ already_sent: true }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(resolveOutgoingDeliveryScope(db, QUEUE_ID)).resolves.toEqual({
      kind: 'tenant',
      queueKind: 'appointment_reminder',
      organizationId: ORGANIZATION_ID,
    });
    await expect(operatorIncidentAlertAlreadySent(db, INCIDENT_ID)).resolves.toBe(true);
    await markOperatorIncidentAlertSent(db, INCIDENT_ID);

    expect(fakes.runIntegratorNamedRoot.mock.calls.map((call) => call.slice(1, 3))).toEqual([
      ['app.resolve_outgoing_delivery_scope(uuid)', [QUEUE_ID]],
      ['app.operator_incident_alert_already_sent(uuid)', [INCIDENT_ID]],
      ['app.mark_operator_incident_alert_sent(uuid)', [INCIDENT_ID]],
    ]);
  });

  it('binds scheduler and appointment-reminder roots to exact typed inputs', async () => {
    fakes.runIntegratorNamedRoot
      .mockResolvedValueOnce({ rows: [{ organization_id: ORGANIZATION_ID }] })
      .mockResolvedValueOnce({ rows: [{ current: true }] })
      .mockResolvedValueOnce({ rows: [{ transition: 'advanced' }] });

    await expect(listSchedulerReminderOrganizationIds(db)).resolves.toEqual([ORGANIZATION_ID]);
    await expect(revalidateAppointmentReminderMaterialization(db, QUEUE_ID)).resolves.toBe(true);
    await expect(
      advanceAppointmentReminderMessengerLadder(db, {
        queueId: QUEUE_ID,
        expectedAttemptCount: 2,
        error: 'provider_timeout',
      }),
    ).resolves.toBe('advanced');

    expect(fakes.runIntegratorNamedRoot.mock.calls.map((call) => call.slice(1, 3))).toEqual([
      ['app.list_scheduler_reminder_organization_ids()', []],
      ['app.revalidate_appointment_reminder_materialization(uuid)', [QUEUE_ID]],
      [
        'app.advance_appointment_reminder_messenger_ladder(uuid,integer,text)',
        [QUEUE_ID, 2, 'provider_timeout'],
      ],
    ]);
  });
});
