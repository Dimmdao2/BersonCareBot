/** Ready-to-dispatch envelope stored verbatim; resident runtime must not enrich it with policy. */
export type OutgoingIntent = {
  type: 'message.send';
  meta: {
    eventId: string;
    occurredAt: string;
    source: string;
    userId?: string;
    outboundMessageClass?: 'routine_product' | 'operator_security';
    outboundCapability?: 'app_push' | 'essential_delivery' | 'operator_alert';
  };
  payload: Record<string, unknown>;
};

export type SpecialistTaskReadyOutgoingDelivery = {
  organizationId: string;
  eventId: string;
  kind: 'specialist_task_reminder';
  channel: 'telegram' | 'max' | 'email' | 'web_push';
  intent: OutgoingIntent;
  /** Canonical product receipt applied only after the transport reports success. */
  successOutcome: {
    type: 'specialistTask.reminder.markSent';
    taskId: string;
  };
  /** Product-selected absolute schedule, never a worker-derived delay. */
  nextRetryAt: string;
};

export type OperatorHealthDigestReadyOutgoingDelivery = {
  organizationId: null;
  eventId: string;
  kind: 'operator_health_digest';
  channel: 'telegram' | 'max' | 'sms' | 'email' | 'web_push';
  intent: OutgoingIntent;
  maxAttempts: number;
  nextRetryAt: string;
};

export type AppointmentReminderMessengerStep = {
  channel: 'telegram' | 'max';
  recipient: Record<string, unknown>;
};

export type AppointmentReminderReadyOutgoingDelivery = {
  organizationId: string;
  eventId: string;
  kind: 'appointment_reminder';
  channel: 'telegram' | 'max' | 'web_push';
  intent: OutgoingIntent;
  nextRetryAt: string;
  appointmentId: string;
  generationStartAt: string;
  dueAt: string;
  /** Messenger only. Duplicating a sole step preserves the legacy two-attempt behavior. */
  messengerLadder?: readonly AppointmentReminderMessengerStep[];
};

export type PatientReminderReadyOutgoingDelivery = {
  organizationId: string;
  eventId: string;
  kind: 'reminder_dispatch';
  channel: 'telegram' | 'max' | 'email' | 'web_push';
  intent: OutgoingIntent;
  maxAttempts: number;
  nextRetryAt: string;
  occurrenceId: string;
  deliveryGeneration: number;
  topicCode: string;
  externalId: string;
  logText: string;
  platformUserId: string;
};

export type ReadyOutgoingDelivery =
  | SpecialistTaskReadyOutgoingDelivery
  | OperatorHealthDigestReadyOutgoingDelivery
  | PatientReminderReadyOutgoingDelivery
  | AppointmentReminderReadyOutgoingDelivery;

/** The only webapp write seam for `public.outgoing_delivery_queue`. */
export type OutgoingDeliveryQueueWritePort<TransactionClient> = {
  /** True only when a new stable event row was inserted. */
  enqueueReady(tx: TransactionClient, delivery: ReadyOutgoingDelivery): Promise<boolean>;
  terminalizeUnsentSpecialistTaskReminders(
    tx: TransactionClient,
    input: { taskId: string; exceptEventIds?: readonly string[]; reason: string },
  ): Promise<void>;
  terminalizeUnsentAppointmentReminders(
    tx: TransactionClient,
    input: { appointmentId: string; exceptEventIds?: readonly string[]; reason: string },
  ): Promise<void>;
};
