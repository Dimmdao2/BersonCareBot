import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { PatientReminderRuleForMaterialization } from '@/modules/reminders/patientReminderMaterializationPort';
import {
  assertCanonicalNamedDevTarget,
  assertOccurrenceAbsent,
  buildAtomicRollbackDeliveries,
  parseRunArgs,
} from './patient-reminder-materialization-named-dev-step';

const apiEnv = `
DB_PRINCIPAL_CONTEXT_MODE=port-context
INTEGRATOR_DB_URL=postgresql://integrator:redacted@127.0.0.1:5432/bcb_webapp_dev
`;
const webappEnv = `
DB_PRINCIPAL_CONTEXT_MODE=port-context
DATABASE_URL_STAFF=postgresql://staff:redacted@127.0.0.1:5432/bcb_webapp_dev
DATABASE_URL_PATIENT=postgresql://patient:redacted@127.0.0.1:5432/bcb_webapp_dev
DATABASE_URL_GLOBAL_ADMIN=postgresql://admin:redacted@127.0.0.1:5432/bcb_webapp_dev
`;
const rule: PatientReminderRuleForMaterialization = {
  id: 'rule-1',
  organizationId: '11111111-1111-4111-8111-111111111111',
  platformUserId: '22222222-2222-4222-8222-222222222222',
  integratorUserId: '42',
  category: 'warmup',
  isEnabled: true,
  scheduleType: 'interval_window',
  timezone: 'Europe/Moscow',
  intervalMinutes: 60,
  windowStartMinute: 600,
  windowEndMinute: 1200,
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
};

describe('named DEV patient reminder materialization step', () => {
  it('refuses every target except exact canonical named DEV in port-context mode', () => {
    assert.doesNotThrow(() => assertCanonicalNamedDevTarget(apiEnv, webappEnv));
    for (const mutation of [
      webappEnv.replaceAll('bcb_webapp_dev', 'bersoncarebot_test'),
      webappEnv.replaceAll('127.0.0.1', '135.106.162.170'),
      webappEnv.replaceAll(':5432/', ':5433/'),
      webappEnv.replace('port-context', 'legacy-guc'),
      ...[
        'host=203.0.113.10',
        'hostaddr=203.0.113.10',
        'port=6543',
        'dbname=bersoncarebot_test',
        'database=bersoncarebot_test',
        'service=production',
      ].map((override) =>
        webappEnv.replaceAll('/bcb_webapp_dev', `/bcb_webapp_dev?${override}`),
      ),
    ]) {
      assert.throws(() => assertCanonicalNamedDevTarget(apiEnv, mutation));
    }
    for (const override of ['host=203.0.113.10', 'port=6543', 'service=production']) {
      assert.throws(() =>
        assertCanonicalNamedDevTarget(
          apiEnv.replace('/bcb_webapp_dev', `/bcb_webapp_dev?${override}`),
          webappEnv,
        ),
      );
    }
  });

  it('puts one valid queue delivery before the deliberately invalid second envelope', () => {
    const [valid, invalid] = buildAtomicRollbackDeliveries({
      rule,
      occurrenceId: 'occurrence-1',
      plannedAt: '2026-08-17T15:00:00.000Z',
    });
    assert.equal(valid.eventId, 'rem:occurrence-1:g0:telegram');
    assert.equal(valid.intent.meta.eventId, valid.eventId);
    assert.notEqual(invalid.eventId, 'rem:occurrence-1:g0:telegram');
    assert.equal(invalid.intent.meta.eventId, invalid.eventId);
    assert.equal(invalid.occurrenceId, valid.occurrenceId);
  });

  it('detects a leaked occurrence by either stable id or idempotency key', () => {
    const clean = { rules: [], dueOccurrences: [] };
    assert.doesNotThrow(() => assertOccurrenceAbsent(clean, 'occurrence-1', 'key-1'));
    for (const dueOccurrences of [
      [
        {
          ruleId: 'rule-1',
          draft: { occurrenceKey: 'key-1', plannedAt: '2026-08-17T15:00:00.000Z' },
          occurrence: {
            id: 'other',
            deliveryGeneration: 0,
            plannedAt: '2026-08-17T15:00:00.000Z',
          },
        },
      ],
      [
        {
          ruleId: 'rule-1',
          draft: { occurrenceKey: 'other', plannedAt: '2026-08-17T15:00:00.000Z' },
          occurrence: {
            id: 'occurrence-1',
            deliveryGeneration: 0,
            plannedAt: '2026-08-17T15:00:00.000Z',
          },
        },
      ],
    ]) {
      assert.throws(
        () => assertOccurrenceAbsent({ rules: [], dueOccurrences }, 'occurrence-1', 'key-1'),
        /leaked/,
      );
    }
  });

  it('requires one explicit authenticated organization UUID and refuses every extra target argument', () => {
    assert.equal(
      parseRunArgs(['--run', '--organization-id', rule.organizationId]),
      rule.organizationId,
    );
    for (const args of [
      [],
      ['--run'],
      ['--run', '--organization-id', 'not-a-uuid'],
      ['--run', '--organization-id', rule.organizationId, '--target=test'],
    ]) {
      assert.throws(() => parseRunArgs(args));
    }
  });
});
