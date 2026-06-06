/** Проки «Здоровье системы», для которых поддерживается архив dead-строк. */
export const HEALTH_FAILURE_ARCHIVE_OUTGOING_PROBE = "outgoing_delivery" as const;
export const HEALTH_FAILURE_ARCHIVE_INTEGRATOR_OUTBOX_PROBE = "integrator_push_outbox" as const;
export const HEALTH_FAILURE_ARCHIVE_PROJECTION_PROBE = "projection_outbox" as const;
export const HEALTH_FAILURE_ARCHIVE_OUTGOING_REMINDER_PROBE = "outgoing_reminder_dispatch" as const;

export type HealthFailureArchiveProbe =
  | typeof HEALTH_FAILURE_ARCHIVE_OUTGOING_PROBE
  | typeof HEALTH_FAILURE_ARCHIVE_INTEGRATOR_OUTBOX_PROBE
  | typeof HEALTH_FAILURE_ARCHIVE_PROJECTION_PROBE
  | typeof HEALTH_FAILURE_ARCHIVE_OUTGOING_REMINDER_PROBE;

export const HEALTH_FAILURE_ARCHIVE_CLEAR_BATCH_SIZE = 500;

/** TTL архива: удаление записей старше N дней (cron `system-health-guard/tick`). */
export const HEALTH_FAILURE_ARCHIVE_RETENTION_DAYS = 90;

export const OUTGOING_ARCHIVE_SOURCE_KIND = "outgoing_delivery_queue_row" as const;
export const INTEGRATOR_OUTBOX_ARCHIVE_SOURCE_KIND = "integrator_push_outbox_row" as const;
export const PROJECTION_ARCHIVE_SOURCE_KIND = "projection_outbox_row" as const;
export const OUTGOING_REMINDER_ARCHIVE_SOURCE_KIND = "outgoing_delivery_queue_row" as const;
/** `outgoing_delivery_queue.kind` для напоминаний (совпадает с integrator enqueue). */
export const OUTGOING_REMINDER_QUEUE_KIND = "reminder_dispatch" as const;
