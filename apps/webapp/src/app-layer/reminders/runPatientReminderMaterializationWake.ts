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
  const duePlanned = await port.listDuePlannedOccurrences(organizationId, now.toISOString());
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
      return rule ? [{ rule, draft: item.draft }] : [];
    }),
    ...rules.flatMap((rule) =>
      planDueReminderOccurrences(rule, now.toISOString())
        .filter((draft) => !dueKeys.has(draft.occurrenceKey))
        .map((draft) => ({ rule, draft })),
    ),
  ];
  const linkedTitles = new Map<string, string | null>();
  for (const { rule, draft } of work) {
    let linkedTitle = linkedTitles.get(rule.id);
    if (linkedTitle === undefined) {
      linkedTitle = await port.resolveLinkedTitle(rule);
      linkedTitles.set(rule.id, linkedTitle);
    }
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
        linkedTitle,
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
  return result;
}
