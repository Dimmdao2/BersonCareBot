import { sql } from 'drizzle-orm';
import type {
  PatientReminderDeliveryTargetSnapshot,
  PatientReminderMaterializationPort,
  PatientReminderMaterializationSnapshot,
} from '@/modules/reminders/patientReminderMaterializationPort';
import { getWebappSqlDb, runWebappNamedRoot } from '@/infra/db/runWebappSql';

type JsonResultRow = { result: unknown };

function requireObject(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  return value as Record<string, unknown>;
}

function parseSnapshot(value: unknown): PatientReminderMaterializationSnapshot {
  const payload = requireObject(value, 'patient_reminder_snapshot_invalid');
  if (
    payload.ok !== true ||
    !Array.isArray(payload.rules) ||
    !Array.isArray(payload.dueOccurrences)
  ) {
    throw new Error('patient_reminder_snapshot_invalid');
  }
  return {
    rules: payload.rules as PatientReminderMaterializationSnapshot['rules'],
    dueOccurrences: (payload.dueOccurrences as Array<Record<string, unknown>>).map((row) => ({
      ruleId: String(row.ruleId),
      draft: { occurrenceKey: String(row.occurrenceKey), plannedAt: String(row.plannedAt) },
      occurrence: {
        id: String(row.occurrenceId),
        deliveryGeneration: Number(row.deliveryGeneration),
        plannedAt: String(row.plannedAt),
      },
    })),
  };
}

function parseTargets(value: unknown): PatientReminderDeliveryTargetSnapshot | null {
  const payload = requireObject(value, 'patient_reminder_target_snapshot_invalid');
  if (payload.ok !== true) return null;
  const bindings = requireObject(payload.bindings, 'patient_reminder_target_snapshot_invalid');
  if (!Array.isArray(payload.channelPreferences) || !Array.isArray(payload.topicChannelRows)) {
    throw new Error('patient_reminder_target_snapshot_invalid');
  }
  return {
    ...(typeof bindings.telegram === 'string' ? { telegramId: bindings.telegram } : {}),
    ...(typeof bindings.max === 'string' ? { maxId: bindings.max } : {}),
    channelPreferences:
      payload.channelPreferences as PatientReminderDeliveryTargetSnapshot['channelPreferences'],
    topicChannelRows:
      payload.topicChannelRows as PatientReminderDeliveryTargetSnapshot['topicChannelRows'],
    ...(typeof payload.emailRecipient === 'string'
      ? { emailRecipient: payload.emailRecipient }
      : {}),
    emailVerified: payload.emailVerified === true,
    muted: payload.muted === true,
    topicMasterEnabled: payload.topicMasterEnabled === true,
    hasWebPushSubscription: payload.hasWebPushSubscription === true,
    vapidConfigured: payload.vapidConfigured === true,
    smtpConfigured: payload.smtpConfigured === true,
  };
}

export function createPgPatientReminderMaterializationPort(): PatientReminderMaterializationPort {
  return {
    async readSnapshot(organizationId, nowIso) {
      const result = await runWebappNamedRoot<JsonResultRow>(
        getWebappSqlDb(),
        'app.read_patient_reminder_materialization_snapshot(uuid,timestamp with time zone)',
        [organizationId, nowIso],
        sql`SELECT app.read_patient_reminder_materialization_snapshot(
          ${organizationId}::uuid, ${nowIso}::timestamptz
        ) AS result`,
      );
      return parseSnapshot(result.rows[0]?.result);
    },

    async readDeliveryTargetSnapshot(input) {
      const args = [
        input.organizationId,
        input.platformUserId,
        input.integratorUserId,
        input.topicCode,
        input.nowIso,
      ] as const;
      const result = await runWebappNamedRoot<JsonResultRow>(
        getWebappSqlDb(),
        'app.read_patient_reminder_delivery_target_snapshot(uuid,uuid,bigint,text,timestamp with time zone)',
        args,
        sql`SELECT app.read_patient_reminder_delivery_target_snapshot(
          ${input.organizationId}::uuid, ${input.platformUserId}::uuid,
          ${input.integratorUserId}::bigint, ${input.topicCode}, ${input.nowIso}::timestamptz
        ) AS result`,
      );
      return parseTargets(result.rows[0]?.result);
    },

    async materializeOccurrence(rule, draft, occurrence, deliveries) {
      const deliveriesJson = JSON.stringify(deliveries);
      const args = [
        rule.organizationId,
        occurrence.id,
        rule.id,
        rule.platformUserId,
        draft.occurrenceKey,
        draft.plannedAt,
        occurrence.deliveryGeneration,
        deliveriesJson,
      ] as const;
      const result = await runWebappNamedRoot<JsonResultRow>(
        getWebappSqlDb(),
        'app.commit_patient_reminder_materialization(uuid,text,text,uuid,text,timestamp with time zone,integer,text)',
        args,
        sql`SELECT app.commit_patient_reminder_materialization(
          ${rule.organizationId}::uuid, ${occurrence.id}, ${rule.id},
          ${rule.platformUserId}::uuid, ${draft.occurrenceKey}, ${draft.plannedAt}::timestamptz,
          ${occurrence.deliveryGeneration}, ${deliveriesJson}
        ) AS result`,
      );
      const payload = requireObject(result.rows[0]?.result, 'patient_reminder_commit_invalid');
      const outcome = payload.outcome;
      if (
        outcome !== 'materialized' &&
        outcome !== 'dedup' &&
        outcome !== 'not_actionable' &&
        outcome !== 'no_channels'
      ) {
        throw new Error('patient_reminder_commit_invalid');
      }
      return outcome;
    },
  };
}
