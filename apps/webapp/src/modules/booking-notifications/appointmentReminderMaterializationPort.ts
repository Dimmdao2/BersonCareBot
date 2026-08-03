import type { AppointmentReminderReadyOutgoingDelivery } from '@/modules/messaging/outgoingDeliveryQueuePort';

export type AppointmentReminderMaterializationPort = {
  replaceGeneration(input: {
    organizationId: string;
    appointmentId: string;
    generationStartAt: string;
    deliveries: readonly AppointmentReminderReadyOutgoingDelivery[];
    reason: string;
  }): Promise<{ current: boolean; inserted: number }>;
};
