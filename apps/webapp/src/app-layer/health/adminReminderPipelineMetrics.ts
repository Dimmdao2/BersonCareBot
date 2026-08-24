/**
 * Payload shape for `curatedSnapshot.remindersPipeline`, filled by
 * `app.read_curated_system_health_pre_0196()` (see
 * `db/drizzle-migrations/20260823T170000_retire_duplicate_reminder_delivery_journals.sql`).
 *
 * D30/Track D: this module used to also hold `loadAdminReminderPipelineMetrics`, a second,
 * never-called reader that queried `reminder_delivery_events`/`reminder_occurrence_history`
 * directly from the app layer — the curated DB function above is the sole live producer of this
 * shape. Removed with the `reminder_delivery_events`/`user_reminder_delivery_logs` retirement
 * rather than rewired, since nothing called it.
 */
const WINDOW_HOURS = 24 as const;

export type RemindersPipelineHealthPayload = {
  windowHours: typeof WINDOW_HOURS;
  /** Subset of `outgoing_delivery_queue` for reminder_dispatch only. */
  outgoingReminderDispatch: {
    due: number;
    dead: number;
    processing: number;
  };
  /** `reminder_occurrence_history` rows with `occurred_at` in rolling window (UTC `now()`). */
  occurrenceHistory: { sent: number; failed: number };
  /** `outgoing_delivery_queue` (kind = reminder_dispatch) rows in rolling window (UTC `now()`). */
  deliveryEvents: { sent: number; failed: number };
  /** Активные ключи idempotency `prn:*:channels` (ответ M2M web push + email ещё в TTL). */
  patientReminderM2mIdempotencyKeysActive: number;
};
