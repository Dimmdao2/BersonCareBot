import type { AppointmentReminderReadyOutgoingDelivery } from '@/modules/messaging/outgoingDeliveryQueuePort';

export type AppointmentReminderMaterializationPort = {
  replaceGeneration(input: {
    organizationId: string;
    appointmentId: string;
    generationStartAt: string;
    deliveries: readonly AppointmentReminderReadyOutgoingDelivery[];
    reason: string;
    /** Read-only revalidation of a leased occurrence through the same generation root. */
    checkOccurrence?: { reminderId: string; dueAt: string };
  }): Promise<{ current: boolean; inserted: number }>;
};
