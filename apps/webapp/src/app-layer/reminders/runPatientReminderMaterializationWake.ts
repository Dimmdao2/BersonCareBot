import { randomUUID } from 'node:crypto';
import { env } from '@/config/env';
import { planDueReminderOccurrences } from '@/modules/reminders/planDueReminderOccurrences';
import { materializePatientReminderDeliveries } from '@/modules/reminders/materializePatientReminderDeliveries';
import type { PatientReminderMaterializationPort } from '@/modules/reminders/patientReminderMaterializationPort';
import { createPgPatientReminderMaterializationPort } from '@/infra/repos/pgPatientReminderMaterialization';
import { resolvePatientNotificationChannels } from '@/modules/patient-notifications/resolveNotificationChannels';

export type PatientReminderMaterializationWakeResult = {
  rules: number;
  occurrences: number;
  materialized: number;
  deduplicated: number;
  skipped: number;
};

export async function runPatientReminderMaterializationWake(
  organizationId: string,
  now = new Date(),
  port: PatientReminderMaterializationPort = createPgPatientReminderMaterializationPort(),
): Promise<PatientReminderMaterializationWakeResult> {
  const nowIso = now.toISOString();
  const snapshot = await port.readSnapshot(organizationId, nowIso);
  const { rules, dueOccurrences: duePlanned } = snapshot;
  const rulesById = new Map(rules.map((rule) => [rule.id, rule]));
  const result: PatientReminderMaterializationWakeResult = {
    rules: rules.length,
    occurrences: 0,
    materialized: 0,
    deduplicated: 0,
    skipped: 0,
  };
  const dueKeys = new Set(duePlanned.map((item) => item.draft.occurrenceKey));
  const work = [
    ...duePlanned.flatMap((item) => {
      const rule = rulesById.get(item.ruleId);
      return rule ? [{ rule, draft: item.draft, occurrence: item.occurrence }] : [];
    }),
    ...rules.flatMap((rule) =>
      planDueReminderOccurrences(rule, nowIso)
        .filter((draft) => !dueKeys.has(draft.occurrenceKey))
        .map((draft) => ({
          rule,
          draft,
          occurrence: { id: randomUUID(), deliveryGeneration: 0, plannedAt: draft.plannedAt },
        })),
    ),
  ];
  for (const { rule, draft, occurrence } of work) {
    result.occurrences += 1;
    const topic = rule.notificationTopicCode?.trim();
    const targets =
      topic && rule.integratorUserId
        ? await port.readDeliveryTargetSnapshot({
            organizationId,
            platformUserId: rule.platformUserId,
            integratorUserId: rule.integratorUserId,
            topicCode: topic,
            nowIso,
          })
        : null;
    const resolution =
      targets && topic
        ? resolvePatientNotificationChannels({
            topicCode: topic,
            availability: {
              hasTelegram: Boolean(targets.telegramId),
              hasMax: Boolean(targets.maxId),
              hasEmail: Boolean(targets.emailRecipient),
              emailVerified: targets.emailVerified,
              hasWebPushSubscription: targets.hasWebPushSubscription,
              vapidConfigured: targets.vapidConfigured,
              smtpConfigured: targets.smtpConfigured,
            },
            channelPrefs: targets.channelPreferences,
            topicChannelRows: targets.topicChannelRows,
            gate: { muted: targets.muted, topicMasterEnabled: targets.topicMasterEnabled },
          })
        : null;
    const deliveries =
      targets && resolution
        ? materializePatientReminderDeliveries({
            rule,
            occurrence,
            appBaseUrl: env.APP_BASE_URL,
            linkedTitle: rule.linkedTitle,
            targets: {
              selectedChannels: resolution.selectedChannels,
              ...(targets.telegramId ? { telegramId: targets.telegramId } : {}),
              ...(targets.maxId ? { maxId: targets.maxId } : {}),
              ...(targets.emailRecipient ? { emailRecipient: targets.emailRecipient } : {}),
            },
          })
        : [];
    const outcome = await port.materializeOccurrence(rule, draft, occurrence, deliveries);
    if (outcome === 'materialized') result.materialized += 1;
    else if (outcome === 'dedup') result.deduplicated += 1;
    else result.skipped += 1;
  }
  return result;
}
