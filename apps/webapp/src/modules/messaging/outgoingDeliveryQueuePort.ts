/** Ready-to-dispatch envelope stored verbatim; resident runtime must not enrich it with policy. */
export type OutgoingIntent = {
  type: 'message.send';
  meta: {
    eventId: string;
    occurredAt: string;
    source: string;
    userId?: string;
    outboundMessageClass?: 'routine_product' | 'operator_security' | 'auth_code';
    outboundCapability?: 'app_push' | 'essential_delivery' | 'operator_alert' | 'auth_code';
  };
  payload: Record<string, unknown>;
};

export type SpecialistTaskReadyOutgoingDelivery = {
  organizationId: string;
  eventId: string;
  kind: 'specialist_task_reminder';
  channel: 'telegram' | 'max' | 'vk' | 'email' | 'web_push';
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
  channel: 'telegram' | 'max' | 'vk' | 'email' | 'web_push';
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

// D27-C fix round 2: `auth_email_otp` no longer goes through this generic write port. Its enqueue
// is a single narrow SECURITY DEFINER call (`app.email_auth_enqueue_otp_delivery`, migration 0363)
// that composes the row itself from `public.email_challenges` — there is no caller-built
// `ReadyOutgoingDelivery` envelope for it anymore. See pgAuthEmailOtpDeliveryQueue.ts.

/**
 * `AppointmentReminderReadyOutgoingDelivery` намеренно НЕ входит в поверхность записи вебаппа:
 * напоминание о записи проходит не через табличный шов, а через объявленный корень
 * `app.replace_appointment_reminder_generation` (миграция 0034) — INSERT на очередь не выдан ни
 * одной рабочей роли, поэтому этот путь и не работал никогда.
 *
 * `OperatorHealthDigestReadyOutgoingDelivery` вышла оттуда же по той же причине (миграция 0039):
 * суточная сводка ставится корнем `app.enqueue_operator_health_digest_delivery`, а прямой INSERT
 * под `app_staff` отвечал 42501 — сводка не уходила ни разу.
 *
 * `PatientReminderReadyOutgoingDelivery` пишется корнем
 * `app.commit_patient_reminder_materialization` целым поколением занятия, а не поштучно.
 *
 * `SpecialistTaskReadyOutgoingDelivery` — последняя, вышедшая тем же выходом
 * (миграция 20260822T121000): реляционные INSERT и UPDATE под `app_staff` отвечали
 * `42501 permission denied for table outgoing_delivery_queue`, то есть кнопка «Выполнить» у задачи
 * врача возвращала 500, а напоминание по задаче не ставилось ни разу. Двух путей не оставлено ни
 * у одной из четырёх.
 */

/** The only webapp write seam for `public.outgoing_delivery_queue`. */
export type OutgoingDeliveryQueueWritePort<TransactionClient> = {
  /**
   * Заменяет ПОКОЛЕНИЕ напоминаний одной задачи целиком: не отправленные строки прошлого поколения
   * умирают с причиной `reason`, названные `deliveries` ставятся заново. Пустой `deliveries` —
   * это завершение или удаление задачи, а не отдельная операция.
   * Возвращает `eventId` тех строк, которые действительно записаны (отправленная строка —
   * неизменяемое свидетельство, её не переписывает никто).
   */
  replaceSpecialistTaskReminderGeneration(
    tx: TransactionClient,
    input: {
      taskId: string;
      deliveries: readonly SpecialistTaskReadyOutgoingDelivery[];
      reason: string;
    },
  ): Promise<string[]>;
};
