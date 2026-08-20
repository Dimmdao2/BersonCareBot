import { describe, expect, it } from 'vitest';
import type { DbPort, DbQueryResult } from '../../../kernel/contracts/index.js';
import { getCurrentDatabasePrincipal, runWithOrganizationPrincipal } from '../../principal/organizationPrincipal.js';
import {
  integratorPortContextPrincipal,
  type IntegratorPortCapabilityDescriptor,
} from '../portContextRuntime.js';
import { revalidatePatientReminderDeliveryMaterialization } from './patientReminderMaterialization.js';
import { revalidateSpecialistTaskReminderMaterialization } from './specialistTaskReminderOutcome.js';
import {
  advanceAppointmentReminderMessengerLadder,
  revalidateAppointmentReminderMaterialization,
} from './appointmentReminderDelivery.js';
import {
  isReminderTransactionalEmailRateLimited,
  recordReminderTransactionalEmailSent,
} from './reminders.js';

const ORGANIZATION_ID = '22222222-2222-4222-8222-222222222222';
const QUEUE_ID = '11111111-1111-4111-8111-111111111111';
const PLATFORM_USER_ID = '33333333-3333-4333-8333-333333333333';

/** The TEST/DEV integrator capability rows that matter for these roots. */
const CAPABILITIES: Record<string, IntegratorPortCapabilityDescriptor> = {
  delivery: {
    capabilityId: '00000000-0000-4000-8000-000000000001',
    targetRole: 'app_operational_delivery_worker',
    contextClass: 'service',
    purpose: 'relation',
    runtimeSources: ['worker:outgoing-delivery-tick'],
  },
  tenant_service: {
    capabilityId: '00000000-0000-4000-8000-000000000002',
    targetRole: 'app_tenant_service',
    contextClass: 'tenant_service',
    purpose: 'relation',
  },
  revalidate_appointment_reminder_materialization: {
    capabilityId: '00000000-0000-4000-8000-000000000003',
    targetRole: 'app_operational_delivery_worker',
    contextClass: 'service',
    purpose: 'delivery.appointment-reminder-revalidate',
    functionIdentity: 'app.revalidate_appointment_reminder_materialization(uuid)',
  },
  advance_appointment_reminder_messenger_ladder: {
    capabilityId: '00000000-0000-4000-8000-000000000004',
    targetRole: 'app_operational_delivery_worker',
    contextClass: 'service',
    purpose: 'delivery.appointment-reminder-advance',
    functionIdentity: 'app.advance_appointment_reminder_messenger_ladder(uuid,integer,text)',
  },
};

/**
 * Resolves the role PostgreSQL would actually run the statement as: the port context installs
 * `SET LOCAL ROLE <targetRole>` for the capability selected from the ambient principal.
 */
function targetRoleAtQueryTime(): string {
  return integratorPortContextPrincipal(getCurrentDatabasePrincipal(), CAPABILITIES).targetRole;
}

function dbPortCapturing(roles: string[], row: Record<string, unknown>): DbPort {
  return {
    query: async <T>(): Promise<DbQueryResult<T>> => {
      roles.push(targetRoleAtQueryTime());
      return { rows: [row as T] };
    },
    tx: async <T>(fn: (db: DbPort) => Promise<T>): Promise<T> => fn(dbPortCapturing(roles, row)),
  };
}

describe('delivery-worker-only DB capabilities under an organization principal', () => {
  it('runs every outgoing-delivery claim-time root as app_operational_delivery_worker', async () => {
    const roles: string[] = [];
    const db = dbPortCapturing(roles, {
      current: true,
      transition: 'advanced',
      rate_limited: false,
    });
    const roots: Record<string, () => Promise<unknown>> = {
      'revalidate_patient_reminder_delivery_materialization': () =>
        revalidatePatientReminderDeliveryMaterialization(db, QUEUE_ID),
      'revalidate_specialist_task_reminder_materialization': () =>
        revalidateSpecialistTaskReminderMaterialization(db, QUEUE_ID),
      'revalidate_appointment_reminder_materialization': () =>
        revalidateAppointmentReminderMaterialization(db, QUEUE_ID),
      'advance_appointment_reminder_messenger_ladder': () =>
        advanceAppointmentReminderMessengerLadder(db, {
          queueId: QUEUE_ID,
          expectedAttemptCount: 2,
          error: 'provider_timeout',
        }),
      'read_reminder_transactional_email_cooldown': () =>
        isReminderTransactionalEmailRateLimited(db, PLATFORM_USER_ID),
      'record_reminder_transactional_email_cooldown': () =>
        recordReminderTransactionalEmailSent(db, PLATFORM_USER_ID),
    };

    const observed: Record<string, string> = {};
    for (const [name, run] of Object.entries(roots)) {
      roles.length = 0;
      try {
        await runWithOrganizationPrincipal(ORGANIZATION_ID, run);
        observed[name] = roles.join(',');
      } catch (error) {
        observed[name] = error instanceof Error ? error.message : String(error);
      }
    }

    expect(observed).toEqual(
      Object.fromEntries(
        Object.keys(roots).map((name) => [name, 'app_operational_delivery_worker']),
      ),
    );
  });

  it('still resolves the organization principal to app_tenant_service for tenant relations', () => {
    expect(runWithOrganizationPrincipal(ORGANIZATION_ID, targetRoleAtQueryTime)).toBe(
      'app_tenant_service',
    );
  });
});
