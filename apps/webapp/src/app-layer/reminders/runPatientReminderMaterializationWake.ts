import { env } from '@/config/env';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { planDueReminderOccurrences } from '@/modules/reminders/planDueReminderOccurrences';
import { materializePatientReminderDeliveries } from '@/modules/reminders/materializePatientReminderDeliveries';
import type { PatientReminderMaterializationPort } from '@/modules/reminders/patientReminderMaterializationPort';
import { createPgPatientReminderMaterializationPort } from '@/infra/repos/pgPatientReminderMaterialization';

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
  const rules = await port.listEnabledRules(organizationId);
  const result: PatientReminderMaterializationWakeResult = {
    rules: rules.length,
    occurrences: 0,
    materialized: 0,
    deduplicated: 0,
    skipped: 0,
  };
  for (const rule of rules) {
    const drafts = planDueReminderOccurrences(rule, now.toISOString());
    for (const draft of drafts) {
      result.occurrences += 1;
      const outcome = await port.materializeOccurrence(rule, draft, async (occurrence) => {
        const topic = rule.notificationTopicCode?.trim() || undefined;
        if (!topic) return [];
        const targets = await buildAppDeps().deliveryTargetsApi.getTargets({
          organizationId,
          platformUserId: rule.platformUserId,
          ...(rule.integratorUserId ? { integratorUserId: rule.integratorUserId } : {}),
          topic,
        });
        const resolution = targets?.resolution;
        if (!targets || !resolution) return [];
        return materializePatientReminderDeliveries({
          rule,
          occurrence,
          appBaseUrl: env.APP_BASE_URL,
          targets: {
            selectedChannels: resolution.selectedChannels,
            ...(targets.channelBindings.telegramId
              ? { telegramId: targets.channelBindings.telegramId }
              : {}),
            ...(targets.channelBindings.maxId ? { maxId: targets.channelBindings.maxId } : {}),
            ...(targets.emailRecipient ? { emailRecipient: targets.emailRecipient } : {}),
          },
        });
      });
      if (outcome === 'materialized') result.materialized += 1;
      else if (outcome === 'dedup') result.deduplicated += 1;
      else result.skipped += 1;
    }
  }
  return result;
}
