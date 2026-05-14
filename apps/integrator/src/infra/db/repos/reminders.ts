import type {
  DbPort,
  DueReminderOccurrence,
  ReminderCategory,
  ReminderOccurrenceRecord,
  ReminderRuleRecord,
} from '../../../kernel/contracts/index.js';

function normalizeRuleRow(row: {
  id: string;
  user_id: string | number;
  category: string;
  is_enabled: boolean;
  schedule_type: string;
  timezone: string;
  interval_minutes: number;
  window_start_minute: number;
  window_end_minute: number;
  days_mask: string;
  content_mode: string;
  linked_object_type?: string | null;
  linked_object_id?: string | null;
  custom_title?: string | null;
  custom_text?: string | null;
  deep_link?: string | null;
  schedule_data?: unknown;
  reminder_intent?: string | null;
  quiet_hours_start_minute?: number | null;
  quiet_hours_end_minute?: number | null;
  notification_topic_code?: string | null;
  created_at?: string;
  updated_at?: string;
}): ReminderRuleRecord {
  return {
    id: row.id,
    userId: String(row.user_id),
    category: row.category as ReminderCategory,
    isEnabled: row.is_enabled,
    scheduleType: row.schedule_type,
    timezone: row.timezone,
    intervalMinutes: row.interval_minutes,
    windowStartMinute: row.window_start_minute,
    windowEndMinute: row.window_end_minute,
    daysMask: row.days_mask,
    contentMode: row.content_mode as ReminderRuleRecord['contentMode'],
    quietHoursStartMinute: row.quiet_hours_start_minute ?? null,
    quietHoursEndMinute: row.quiet_hours_end_minute ?? null,
    ...(row.created_at ? { createdAt: row.created_at } : {}),
    ...(row.updated_at ? { updatedAt: row.updated_at } : {}),
    ...(row.linked_object_type != null ? { linkedObjectType: row.linked_object_type } : {}),
    ...(row.linked_object_id != null ? { linkedObjectId: row.linked_object_id } : {}),
    ...(row.custom_title != null ? { customTitle: row.custom_title } : {}),
    ...(row.custom_text != null ? { customText: row.custom_text } : {}),
    ...(row.deep_link != null ? { deepLink: row.deep_link } : {}),
    ...(row.schedule_data != null ? { scheduleData: row.schedule_data } : {}),
    ...(row.reminder_intent != null ? { reminderIntent: row.reminder_intent } : {}),
    ...(typeof row.notification_topic_code === 'string' && row.notification_topic_code.trim()
      ? { notificationTopicCode: row.notification_topic_code.trim() }
      : {}),
  };
}

function normalizeOccurrenceRow(row: {
  id: string;
  rule_id: string;
  occurrence_key: string;
  planned_at: string;
  status: ReminderOccurrenceRecord['status'];
  queued_at?: string | null;
  sent_at?: string | null;
  failed_at?: string | null;
  delivery_channel?: string | null;
  delivery_job_id?: string | null;
  error_code?: string | null;
  created_at?: string;
  updated_at?: string;
}): ReminderOccurrenceRecord {
  return {
    id: row.id,
    ruleId: row.rule_id,
    occurrenceKey: row.occurrence_key,
    plannedAt: row.planned_at,
    status: row.status,
    queuedAt: row.queued_at ?? null,
    sentAt: row.sent_at ?? null,
    failedAt: row.failed_at ?? null,
    deliveryChannel: row.delivery_channel ?? null,
    deliveryJobId: row.delivery_job_id ?? null,
    errorCode: row.error_code ?? null,
    ...(row.created_at ? { createdAt: row.created_at } : {}),
    ...(row.updated_at ? { updatedAt: row.updated_at } : {}),
  };
}

export async function getReminderRulesForUser(db: DbPort, userId: string): Promise<ReminderRuleRecord[]> {
  const res = await db.query<{
    id: string;
    user_id: string | number;
    category: string;
    is_enabled: boolean;
    schedule_type: string;
    timezone: string;
    interval_minutes: number;
    window_start_minute: number;
    window_end_minute: number;
    days_mask: string;
    content_mode: string;
    linked_object_type: string | null;
    linked_object_id: string | null;
    custom_title: string | null;
    custom_text: string | null;
    deep_link: string | null;
    schedule_data: unknown | null;
    reminder_intent: string | null;
    quiet_hours_start_minute: number | null;
    quiet_hours_end_minute: number | null;
    notification_topic_code: string | null;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT
       id,
       user_id,
       category,
       is_enabled,
       schedule_type,
       timezone,
       interval_minutes,
       window_start_minute,
       window_end_minute,
       days_mask,
       content_mode,
       linked_object_type,
       linked_object_id,
       custom_title,
       custom_text,
       deep_link,
       schedule_data,
       reminder_intent,
       quiet_hours_start_minute,
       quiet_hours_end_minute,
       notification_topic_code,
       created_at::text,
       updated_at::text
     FROM user_reminder_rules
     WHERE user_id = $1
     ORDER BY category ASC`,
    [userId],
  );
  return res.rows.map(normalizeRuleRow);
}

export async function getReminderRuleForUserAndCategory(
  db: DbPort,
  userId: string,
  category: ReminderCategory,
): Promise<ReminderRuleRecord | null> {
  const res = await db.query<{
    id: string;
    user_id: string | number;
    category: string;
    is_enabled: boolean;
    schedule_type: string;
    timezone: string;
    interval_minutes: number;
    window_start_minute: number;
    window_end_minute: number;
    days_mask: string;
    content_mode: string;
    linked_object_type: string | null;
    linked_object_id: string | null;
    custom_title: string | null;
    custom_text: string | null;
    deep_link: string | null;
    schedule_data: unknown | null;
    reminder_intent: string | null;
    quiet_hours_start_minute: number | null;
    quiet_hours_end_minute: number | null;
    notification_topic_code: string | null;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT
       id,
       user_id,
       category,
       is_enabled,
       schedule_type,
       timezone,
       interval_minutes,
       window_start_minute,
       window_end_minute,
       days_mask,
       content_mode,
       linked_object_type,
       linked_object_id,
       custom_title,
       custom_text,
       deep_link,
       schedule_data,
       reminder_intent,
       quiet_hours_start_minute,
       quiet_hours_end_minute,
       notification_topic_code,
       created_at::text,
       updated_at::text
     FROM user_reminder_rules
     WHERE user_id = $1 AND category = $2
     LIMIT 1`,
    [userId, category],
  );
  return res.rows[0] ? normalizeRuleRow(res.rows[0]) : null;
}

export async function getEnabledReminderRules(db: DbPort): Promise<ReminderRuleRecord[]> {
  const res = await db.query<{
    id: string;
    user_id: string | number;
    category: string;
    is_enabled: boolean;
    schedule_type: string;
    timezone: string;
    interval_minutes: number;
    window_start_minute: number;
    window_end_minute: number;
    days_mask: string;
    content_mode: string;
    linked_object_type: string | null;
    linked_object_id: string | null;
    custom_title: string | null;
    custom_text: string | null;
    deep_link: string | null;
    schedule_data: unknown | null;
    reminder_intent: string | null;
    quiet_hours_start_minute: number | null;
    quiet_hours_end_minute: number | null;
    notification_topic_code: string | null;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT
       id,
       user_id,
       category,
       is_enabled,
       schedule_type,
       timezone,
       interval_minutes,
       window_start_minute,
       window_end_minute,
       days_mask,
       content_mode,
       linked_object_type,
       linked_object_id,
       custom_title,
       custom_text,
       deep_link,
       schedule_data,
       reminder_intent,
       quiet_hours_start_minute,
       quiet_hours_end_minute,
       notification_topic_code,
       created_at::text,
       updated_at::text
     FROM user_reminder_rules
     WHERE is_enabled = true
     ORDER BY updated_at DESC`,
  );
  return res.rows.map(normalizeRuleRow);
}

export async function getReminderOccurrencesForRuleRange(
  db: DbPort,
  ruleId: string,
  fromIso: string,
  toIso: string,
): Promise<ReminderOccurrenceRecord[]> {
  const res = await db.query<{
    id: string;
    rule_id: string;
    occurrence_key: string;
    planned_at: string;
    status: ReminderOccurrenceRecord['status'];
    queued_at: string | null;
    sent_at: string | null;
    failed_at: string | null;
    delivery_channel: string | null;
    delivery_job_id: string | null;
    error_code: string | null;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT
       id,
       rule_id,
       occurrence_key,
       planned_at::text,
       status,
       queued_at::text,
       sent_at::text,
       failed_at::text,
       delivery_channel,
       delivery_job_id,
       error_code,
       created_at::text,
       updated_at::text
     FROM user_reminder_occurrences
     WHERE rule_id = $1
       AND planned_at >= $2::timestamptz
       AND planned_at <= $3::timestamptz
     ORDER BY planned_at ASC`,
    [ruleId, fromIso, toIso],
  );
  return res.rows.map(normalizeOccurrenceRow);
}

export async function getDueReminderOccurrences(
  db: DbPort,
  nowIso: string,
  limit: number,
): Promise<DueReminderOccurrence[]> {
  const res = await db.query<{
    id: string;
    rule_id: string;
    occurrence_key: string;
    planned_at: string;
    status: ReminderOccurrenceRecord['status'];
    queued_at: string | null;
    sent_at: string | null;
    failed_at: string | null;
    delivery_channel: string | null;
    delivery_job_id: string | null;
    error_code: string | null;
    created_at: string;
    updated_at: string;
    user_id: string | number;
    category: string;
    timezone: string;
    channel_id: string;
  }>(
    `SELECT
       o.id,
       o.rule_id,
       o.occurrence_key,
       o.planned_at::text,
       o.status,
       o.queued_at::text,
       o.sent_at::text,
       o.failed_at::text,
       o.delivery_channel,
       o.delivery_job_id,
       o.error_code,
       o.created_at::text,
       o.updated_at::text,
       r.user_id,
       r.category,
       r.timezone,
       COALESCE(i.external_id::text, '') AS channel_id
     FROM user_reminder_occurrences o
     JOIN user_reminder_rules r ON r.id = o.rule_id
     LEFT JOIN identities i ON i.user_id = r.user_id AND i.resource = 'telegram'
     LEFT JOIN public.platform_users pu ON pu.integrator_user_id = r.user_id
     WHERE o.status = 'planned'
       AND o.planned_at <= $1::timestamptz
       AND r.is_enabled = true
       AND (pu.reminder_muted_until IS NULL OR pu.reminder_muted_until <= $1::timestamptz)
     ORDER BY o.planned_at ASC
     LIMIT $2`,
    [nowIso, Math.max(1, Math.trunc(limit))],
  );
  return res.rows.map((row) => {
    const occurrence = normalizeOccurrenceRow(row);
    const chatId = Number(row.channel_id);
    return {
      ...occurrence,
      userId: String(row.user_id),
      category: row.category as ReminderCategory,
      timezone: row.timezone,
      channelId: row.channel_id ?? '',
      chatId: Number.isFinite(chatId) ? chatId : 0,
    };
  });
}

/** Upserts rule by `id` (webapp integrator_rule_id PK); returns DB `updated_at`. */
export async function upsertReminderRule(
  db: DbPort,
  input: ReminderRuleRecord,
): Promise<string> {
  const scheduleJson =
    input.scheduleData !== undefined && input.scheduleData !== null
      ? JSON.stringify(input.scheduleData as Record<string, unknown>)
      : null;

  let notificationTopicForSql: string | null;
  if (Object.prototype.hasOwnProperty.call(input, 'notificationTopicCode')) {
    const v = input.notificationTopicCode;
    notificationTopicForSql =
      v === null || v === undefined ? null : typeof v === 'string' ? v.trim() || null : null;
  } else {
    const prev = await db.query<{ notification_topic_code: string | null }>(
      `SELECT notification_topic_code FROM user_reminder_rules WHERE id = $1`,
      [input.id],
    );
    notificationTopicForSql = prev.rows[0]?.notification_topic_code ?? null;
  }

  const res = await db.query<{ updated_at: string }>(
    `INSERT INTO user_reminder_rules (
       id,
       user_id,
       category,
       is_enabled,
       schedule_type,
       timezone,
       interval_minutes,
       window_start_minute,
       window_end_minute,
       days_mask,
       content_mode,
       linked_object_type,
       linked_object_id,
       custom_title,
       custom_text,
       deep_link,
       schedule_data,
       reminder_intent,
       quiet_hours_start_minute,
       quiet_hours_end_minute,
       notification_topic_code,
       created_at,
       updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
       $12, $13, $14, $15, $16, $17::jsonb, $18,
       $19, $20, $21,
       now(), now()
     )
     ON CONFLICT (id) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       category = EXCLUDED.category,
       is_enabled = EXCLUDED.is_enabled,
       schedule_type = EXCLUDED.schedule_type,
       timezone = EXCLUDED.timezone,
       interval_minutes = EXCLUDED.interval_minutes,
       window_start_minute = EXCLUDED.window_start_minute,
       window_end_minute = EXCLUDED.window_end_minute,
       days_mask = EXCLUDED.days_mask,
       content_mode = EXCLUDED.content_mode,
       linked_object_type = EXCLUDED.linked_object_type,
       linked_object_id = EXCLUDED.linked_object_id,
       custom_title = EXCLUDED.custom_title,
       custom_text = EXCLUDED.custom_text,
       deep_link = EXCLUDED.deep_link,
       schedule_data = EXCLUDED.schedule_data,
       reminder_intent = EXCLUDED.reminder_intent,
       quiet_hours_start_minute = EXCLUDED.quiet_hours_start_minute,
       quiet_hours_end_minute = EXCLUDED.quiet_hours_end_minute,
       notification_topic_code = EXCLUDED.notification_topic_code,
       updated_at = now()
     RETURNING updated_at::text`,
    [
      input.id,
      input.userId,
      input.category,
      input.isEnabled,
      input.scheduleType,
      input.timezone,
      input.intervalMinutes,
      input.windowStartMinute,
      input.windowEndMinute,
      input.daysMask,
      input.contentMode,
      input.linkedObjectType ?? null,
      input.linkedObjectId ?? null,
      input.customTitle ?? null,
      input.customText ?? null,
      input.deepLink ?? null,
      scheduleJson,
      input.reminderIntent ?? null,
      input.quietHoursStartMinute ?? null,
      input.quietHoursEndMinute ?? null,
      notificationTopicForSql,
    ],
  );
  return res.rows[0]?.updated_at ?? new Date().toISOString();
}

export async function upsertReminderOccurrencePlanned(
  db: DbPort,
  input: { id: string; ruleId: string; occurrenceKey: string; plannedAt: string },
): Promise<void> {
  await db.query(
    `INSERT INTO user_reminder_occurrences (
       id,
       rule_id,
       occurrence_key,
       planned_at,
       status,
       created_at,
       updated_at
     ) VALUES (
       $1, $2, $3, $4::timestamptz, 'planned', now(), now()
     )
     ON CONFLICT (occurrence_key) DO NOTHING`,
    [input.id, input.ruleId, input.occurrenceKey, input.plannedAt],
  );
}

export async function markReminderOccurrenceQueued(
  db: DbPort,
  occurrenceId: string,
  deliveryJobId: string | null,
): Promise<void> {
  await db.query(
    `UPDATE user_reminder_occurrences
     SET status = 'queued',
         queued_at = now(),
         delivery_job_id = $2,
         updated_at = now()
     WHERE id = $1`,
    [occurrenceId, deliveryJobId],
  );
}

export async function markReminderOccurrenceSent(
  db: DbPort,
  occurrenceId: string,
  channel: string,
): Promise<void> {
  await db.query(
    `UPDATE user_reminder_occurrences
     SET status = 'sent',
         sent_at = now(),
         delivery_channel = $2,
         updated_at = now()
     WHERE id = $1`,
    [occurrenceId, channel],
  );
}

export async function markReminderOccurrenceFailed(
  db: DbPort,
  occurrenceId: string,
  channel: string,
  errorCode: string | null,
): Promise<void> {
  await db.query(
    `UPDATE user_reminder_occurrences
     SET status = 'failed',
         failed_at = now(),
         delivery_channel = $2,
         error_code = $3,
         updated_at = now()
     WHERE id = $1`,
    [occurrenceId, channel, errorCode],
  );
}

/** Inserts delivery log; returns DB `created_at` for projection idempotency payload. */
export async function insertReminderDeliveryLog(
  db: DbPort,
  input: {
    id: string;
    occurrenceId: string;
    channel: string;
    status: 'success' | 'failed';
    errorCode?: string | null;
    payloadJson?: Record<string, unknown>;
  },
): Promise<string> {
  const res = await db.query<{ created_at: string }>(
    `INSERT INTO user_reminder_delivery_logs (
       id,
       occurrence_id,
       channel,
       status,
       error_code,
       payload_json,
       created_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6::jsonb, now()
     )
     RETURNING created_at::text`,
    [
      input.id,
      input.occurrenceId,
      input.channel,
      input.status,
      input.errorCode ?? null,
      JSON.stringify(input.payloadJson ?? {}),
    ],
  );
  return res.rows[0]?.created_at ?? new Date().toISOString();
}

/** Context for projection reminder.occurrence.finalized / reminder.delivery.logged. */
export async function getReminderOccurrenceContextForProjection(
  db: DbPort,
  occurrenceId: string,
): Promise<{
  ruleId: string;
  userId: string;
  category: string;
  status: string;
  occurredAt: string;
  deliveryChannel: string | null;
  errorCode: string | null;
} | null> {
  const res = await db.query<{
    rule_id: string;
    user_id: string | number;
    category: string;
    status: string;
    sent_at: string | null;
    failed_at: string | null;
    delivery_channel: string | null;
    error_code: string | null;
  }>(
    `SELECT o.rule_id, r.user_id::text AS user_id, r.category, o.status,
            o.sent_at::text AS sent_at, o.failed_at::text AS failed_at,
            o.delivery_channel, o.error_code
     FROM user_reminder_occurrences o
     JOIN user_reminder_rules r ON r.id = o.rule_id
     WHERE o.id = $1`,
    [occurrenceId],
  );
  const row = res.rows[0];
  if (!row) return null;
  const occurredAt = row.sent_at ?? row.failed_at ?? new Date().toISOString();
  return {
    ruleId: row.rule_id,
    userId: String(row.user_id),
    category: row.category,
    status: row.status,
    occurredAt,
    deliveryChannel: row.delivery_channel ?? null,
    errorCode: row.error_code ?? null,
  };
}

/** Creates grant; returns DB `created_at` for deterministic projection payload. */
export async function createContentAccessGrant(
  db: DbPort,
  input: {
    id: string;
    userId: string;
    contentId: string;
    purpose: string;
    tokenHash?: string | null;
    expiresAt: string;
    metaJson?: Record<string, unknown>;
  },
): Promise<string> {
  const res = await db.query<{ created_at: string }>(
    `INSERT INTO content_access_grants (
       id,
       user_id,
       content_id,
       purpose,
       token_hash,
       expires_at,
       meta_json,
       created_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6::timestamptz, $7::jsonb, now()
     )
     RETURNING created_at::text`,
    [
      input.id,
      input.userId,
      input.contentId,
      input.purpose,
      input.tokenHash ?? null,
      input.expiresAt,
      JSON.stringify(input.metaJson ?? {}),
    ],
  );
  return res.rows[0]?.created_at ?? new Date().toISOString();
}

/** Integrator `users.id` (text) owning the occurrence's rule, or null if missing. */
export async function getReminderOccurrenceOwnerUserId(db: DbPort, occurrenceId: string): Promise<string | null> {
  const res = await db.query<{ user_id: string }>(
    `SELECT r.user_id::text AS user_id
     FROM user_reminder_occurrences o
     JOIN user_reminder_rules r ON r.id = o.rule_id
     WHERE o.id = $1
     LIMIT 1`,
    [occurrenceId],
  );
  const id = res.rows[0]?.user_id;
  return id && id.trim().length > 0 ? id.trim() : null;
}

/** Snooze: move occurrence back to planned at `plannedAtIso`, clear send/queue fields. */
export async function rescheduleReminderOccurrencePlanned(
  db: DbPort,
  occurrenceId: string,
  plannedAtIso: string,
): Promise<boolean> {
  const res = await db.query(
    `UPDATE user_reminder_occurrences
     SET planned_at = $2::timestamptz,
         status = 'planned',
         queued_at = NULL,
         sent_at = NULL,
         failed_at = NULL,
         delivery_channel = NULL,
         delivery_job_id = NULL,
         error_code = NULL,
         updated_at = now()
     WHERE id = $1
       AND status <> 'skipped'`,
    [occurrenceId, plannedAtIso],
  );
  return (res.rowCount ?? 0) > 0;
}

export async function markReminderOccurrenceSkippedLocal(db: DbPort, occurrenceId: string): Promise<boolean> {
  const res = await db.query(
    `UPDATE user_reminder_occurrences
     SET status = 'skipped',
         updated_at = now()
     WHERE id = $1
       AND status <> 'skipped'`,
    [occurrenceId],
  );
  return (res.rowCount ?? 0) > 0;
}
