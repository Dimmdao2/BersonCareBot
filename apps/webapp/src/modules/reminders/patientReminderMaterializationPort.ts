import type { ReminderOccurrenceDraft, ReminderPlanRule } from './planDueReminderOccurrences';
import type {
  PatientReminderMaterializationOccurrence,
  PatientReminderMaterializationRule,
} from './materializePatientReminderDeliveries';
import type { PatientReminderReadyOutgoingDelivery } from '@/modules/messaging/outgoingDeliveryQueuePort';

export type PatientReminderRuleForMaterialization = ReminderPlanRule &
  PatientReminderMaterializationRule;

export type PatientReminderMaterializationPort = {
  listEnabledRules(organizationId: string): Promise<PatientReminderRuleForMaterialization[]>;
  materializeOccurrence(
    rule: PatientReminderRuleForMaterialization,
    draft: ReminderOccurrenceDraft,
    prepare: (
      occurrence: PatientReminderMaterializationOccurrence,
    ) => Promise<PatientReminderReadyOutgoingDelivery[]>,
  ): Promise<'materialized' | 'dedup' | 'not_actionable' | 'no_channels'>;
};
