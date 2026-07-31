import { and, asc, desc, eq, gte, inArray, lte, ne, sql } from 'drizzle-orm';
import type {
  DbPort,
  DueReminderOccurrence,
  ReminderCategory,
  ReminderOccurrenceRecord,
  ReminderRuleRecord,
} from '../../../kernel/contracts/index.js';
import { getIntegratorDrizzleSession } from '../drizzle.js';
import {
  contentAccessGrants,
  userReminderDeliveryLogs,
  userReminderOccurrences,
  userReminderRules,
} from '../schema/integratorDomainRepos.js';
import { runIntegratorSql } from '../runIntegratorSql.js';
import {
  getCurrentOrganizationPrincipalId,
  runWithOrganizationPrincipal,
} from '../../principal/organizationPrincipal.js';

function organizationIdForIntegratorUserSql(integratorUserId: string | number) {
  const currentOrganizationId = getCurrentOrganizationPrincipalId() ?? null;
  return sql`COALESCE(
    ${currentOrganizationId}::uuid,
    (
      SELECT (array_agg(DISTINCT active_user_orgs.organization_id))[1]
      FROM public.platform_users platform_user
      INNER JOIN (
        SELECT platform_user_id, organization_id
        FROM public.org_enrollments
        WHERE status = 'active'
        UNION
        SELECT platform_user_id, organization_id
        FROM public.be_organization_members
        WHERE status = 'active'
      ) active_user_orgs
        ON active_user_orgs.platform_user_id = platform_user.id
      WHERE platform_user.integrator_user_id = ${String(integratorUserId)}::bigint
      HAVING count(DISTINCT active_user_orgs.organization_id) = 1
    )
  )`;
}

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
  organization_id?: string | null;
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
    ...(typeof row.organization_id === 'string' && row.organization_id.trim()
      ? { organizationId: row.organization_id.trim() }
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
  organization_id?: string | null;
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
    ...(typeof row.organization_id === 'string' && row.organization_id.trim()
      ? { organizationId: row.organization_id.trim() }
      : {}),
  };
}

const ruleSelectShape = {
  id: userReminderRules.id,
  user_id: userReminderRules.userId,
  category: userReminderRules.category,
  is_enabled: userReminderRules.isEnabled,
  schedule_type: userReminderRules.scheduleType,
  timezone: userReminderRules.timezone,
  interval_minutes: userReminderRules.intervalMinutes,
  window_start_minute: userReminderRules.windowStartMinute,
  window_end_minute: userReminderRules.windowEndMinute,
  days_mask: userReminderRules.daysMask,
  content_mode: userReminderRules.contentMode,
  linked_object_type: userReminderRules.linkedObjectType,
  linked_object_id: userReminderRules.linkedObjectId,
  custom_title: userReminderRules.customTitle,
  custom_text: userReminderRules.customText,
  deep_link: userReminderRules.deepLink,
  schedule_data: userReminderRules.scheduleData,
  reminder_intent: userReminderRules.reminderIntent,
  quiet_hours_start_minute: userReminderRules.quietHoursStartMinute,
  quiet_hours_end_minute: userReminderRules.quietHoursEndMinute,
  notification_topic_code: userReminderRules.notificationTopicCode,
  organization_id: userReminderRules.organizationId,
  created_at: userReminderRules.createdAt,
  updated_at: userReminderRules.updatedAt,
};

const occurrenceSelectShape = {
  id: userReminderOccurrences.id,
  rule_id: userReminderOccurrences.ruleId,
  occurrence_key: userReminderOccurrences.occurrenceKey,
  planned_at: userReminderOccurrences.plannedAt,
  status: userReminderOccurrences.status,
  queued_at: userReminderOccurrences.queuedAt,
  sent_at: userReminderOccurrences.sentAt,
  failed_at: userReminderOccurrences.failedAt,
  delivery_channel: userReminderOccurrences.deliveryChannel,
  delivery_job_id: userReminderOccurrences.deliveryJobId,
  error_code: userReminderOccurrences.errorCode,
  organization_id: userReminderOccurrences.organizationId,
  created_at: userReminderOccurrences.createdAt,
  updated_at: userReminderOccurrences.updatedAt,
};

export async function getReminderRulesForUser(
  db: DbPort,
  userId: string,
): Promise<ReminderRuleRecord[]> {
  const d = getIntegratorDrizzleSession(db);
  const rows = await d
    .select(ruleSelectShape)
    .from(userReminderRules)
    .where(eq(userReminderRules.userId, Number(userId)))
    .orderBy(asc(userReminderRules.category));
  return rows.map((r) => normalizeRuleRow(r as Parameters<typeof normalizeRuleRow>[0]));
}

export async function getReminderRuleForUserAndCategory(
  db: DbPort,
  userId: string,
  category: ReminderCategory,
): Promise<ReminderRuleRecord | null> {
  const d = getIntegratorDrizzleSession(db);
  const rows = await d
    .select(ruleSelectShape)
    .from(userReminderRules)
    .where(
      and(eq(userReminderRules.userId, Number(userId)), eq(userReminderRules.category, category)),
    )
    .limit(1);
  const row = rows[0] as Parameters<typeof normalizeRuleRow>[0] | undefined;
  return row ? normalizeRuleRow(row) : null;
}

export async function getEnabledReminderRules(db: DbPort): Promise<ReminderRuleRecord[]> {
  const d = getIntegratorDrizzleSession(db);
  const rows = await d
    .select(ruleSelectShape)
    .from(userReminderRules)
    .where(eq(userReminderRules.isEnabled, true))
    .orderBy(desc(userReminderRules.updatedAt));
  return rows.map((r) => normalizeRuleRow(r as Parameters<typeof normalizeRuleRow>[0]));
}

export async function getReminderOccurrencesForRuleRange(
  db: DbPort,
  ruleId: string,
  fromIso: string,
  toIso: string,
): Promise<ReminderOccurrenceRecord[]> {
  const d = getIntegratorDrizzleSession(db);
  const rows = await d
    .select(occurrenceSelectShape)
    .from(userReminderOccurrences)
    .where(
      and(
        eq(userReminderOccurrences.ruleId, ruleId),
        gte(userReminderOccurrences.plannedAt, fromIso),
        lte(userReminderOccurrences.plannedAt, toIso),
      ),
    )
    .orderBy(asc(userReminderOccurrences.plannedAt));
  return rows.map((r) => normalizeOccurrenceRow(r as Parameters<typeof normalizeOccurrenceRow>[0]));
}

/**
 * Due occurrences for the worker: integrator reminder tables + `identities` + `public.platform_users`.
 * **Escape hatch:** one `execute` call with a Drizzle `sql` template — cross-schema JOINs and
 * mute-window logic match legacy; not modeled as typed Drizzle-only selects here.
 */
export async function getDueReminderOccurrences(
  db: DbPort,
  nowIso: string,
  limit: number,
): Promise<DueReminderOccurrence[]> {
  const d = getIntegratorDrizzleSession(db);
  const lim = Math.max(1, Math.trunc(limit));
  const res = await d.execute(sql`
    SELECT
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
       COALESCE(o.organization_id, r.organization_id)::text AS organization_id,
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
       AND o.planned_at <= ${nowIso}::timestamptz
       AND r.is_enabled = true
       AND (pu.reminder_muted_until IS NULL OR pu.reminder_muted_until <= ${nowIso}::timestamptz)
     ORDER BY o.planned_at ASC
     LIMIT ${lim}
  `);
  const rows = res.rows as {
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
    organization_id: string | null;
    created_at: string;
    updated_at: string;
    user_id: string | number;
    category: string;
    timezone: string;
    channel_id: string;
  }[];
  return rows.map((row) => {
    const occurrence = normalizeOccurrenceRow(row);
    const chatId = Number(row.channel_id);
    return {
      ...occurrence,
      userId: String(row.user_id),
      category: row.category as ReminderCategory,
      timezone: row.timezone,
      channelId: row.channel_id ?? '',
      chatId: Number.isFinite(chatId) ? chatId : 0,
      ...(typeof row.organization_id === 'string' && row.organization_id.trim()
        ? { organizationId: row.organization_id.trim() }
        : {}),
    };
  });
}

/** Upserts rule by `id` (webapp integrator_rule_id PK); returns DB `updated_at`. */
export async function upsertReminderRule(db: DbPort, input: ReminderRuleRecord): Promise<string> {
  const d = getIntegratorDrizzleSession(db);
  const scheduleJson =
    input.scheduleData !== undefined && input.scheduleData !== null
      ? (input.scheduleData as Record<string, unknown>)
      : null;

  let notificationTopicForSql: string | null;
  if (Object.prototype.hasOwnProperty.call(input, 'notificationTopicCode')) {
    const v = input.notificationTopicCode;
    notificationTopicForSql =
      v === null || v === undefined ? null : typeof v === 'string' ? v.trim() || null : null;
  } else {
    const prev = await d
      .select({ notification_topic_code: userReminderRules.notificationTopicCode })
      .from(userReminderRules)
      .where(eq(userReminderRules.id, input.id))
      .limit(1);
    notificationTopicForSql = prev[0]?.notification_topic_code ?? null;
  }

  const organizationIdExpression = organizationIdForIntegratorUserSql(input.userId);
  const rows = await d
    .insert(userReminderRules)
    .values({
      id: input.id,
      userId: Number(input.userId),
      category: input.category,
      isEnabled: input.isEnabled,
      scheduleType: input.scheduleType,
      timezone: input.timezone,
      intervalMinutes: input.intervalMinutes,
      windowStartMinute: input.windowStartMinute,
      windowEndMinute: input.windowEndMinute,
      daysMask: input.daysMask,
      contentMode: input.contentMode,
      linkedObjectType: input.linkedObjectType ?? null,
      linkedObjectId: input.linkedObjectId ?? null,
      customTitle: input.customTitle ?? null,
      customText: input.customText ?? null,
      deepLink: input.deepLink ?? null,
      scheduleData: scheduleJson,
      reminderIntent: input.reminderIntent ?? null,
      quietHoursStartMinute: input.quietHoursStartMinute ?? null,
      quietHoursEndMinute: input.quietHoursEndMinute ?? null,
      notificationTopicCode: notificationTopicForSql,
      organizationId: organizationIdExpression,
      createdAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .onConflictDoUpdate({
      target: userReminderRules.id,
      set: {
        userId: Number(input.userId),
        category: input.category,
        isEnabled: input.isEnabled,
        scheduleType: input.scheduleType,
        timezone: input.timezone,
        intervalMinutes: input.intervalMinutes,
        windowStartMinute: input.windowStartMinute,
        windowEndMinute: input.windowEndMinute,
        daysMask: input.daysMask,
        contentMode: input.contentMode,
        linkedObjectType: input.linkedObjectType ?? null,
        linkedObjectId: input.linkedObjectId ?? null,
        customTitle: input.customTitle ?? null,
        customText: input.customText ?? null,
        deepLink: input.deepLink ?? null,
        scheduleData: scheduleJson,
        reminderIntent: input.reminderIntent ?? null,
        quietHoursStartMinute: input.quietHoursStartMinute ?? null,
        quietHoursEndMinute: input.quietHoursEndMinute ?? null,
        notificationTopicCode: notificationTopicForSql,
        organizationId: sql`COALESCE(${organizationIdExpression}, ${userReminderRules.organizationId})`,
        updatedAt: sql`now()`,
      },
    })
    .returning({ updated_at: userReminderRules.updatedAt });
  return rows[0]?.updated_at ?? new Date().toISOString();
}

export async function cancelPendingReminderOccurrencesForRule(
  db: DbPort,
  ruleId: string,
): Promise<void> {
  const d = getIntegratorDrizzleSession(db);
  await d
    .delete(userReminderOccurrences)
    .where(
      and(
        eq(userReminderOccurrences.ruleId, ruleId),
        inArray(userReminderOccurrences.status, ['planned', 'queued']),
      ),
    );
}

/** Pending rows left from legacy same-day backfill; grace matches webapp web-push tick. */
export type FinalizedReminderOccurrenceProjectionContext = {
  occurrenceId: string;
  ruleId: string;
  userId: string;
  category: string;
  status: string;
  occurredAt: string;
  deliveryChannel: string | null;
  errorCode: string | null;
};

export async function expireOrphanedPendingReminderOccurrences(
  db: DbPort,
  nowIso: string,
): Promise<FinalizedReminderOccurrenceProjectionContext[]> {
  const orgs = await runIntegratorSql<{ organization_id: string }>(
    db,
    sql`
      SELECT DISTINCT COALESCE(o.organization_id, r.organization_id)::text AS organization_id
      FROM user_reminder_occurrences o
      LEFT JOIN user_reminder_rules r ON r.id = o.rule_id
      WHERE o.status IN ('planned', 'queued')
        AND o.planned_at < ${nowIso}::timestamptz - interval '3 minutes'
        AND COALESCE(o.organization_id, r.organization_id) IS NOT NULL
      ORDER BY organization_id
    `,
  );
  const finalized: FinalizedReminderOccurrenceProjectionContext[] = [];
  for (const row of orgs.rows) {
    if (!row.organization_id) continue;
    const organizationFinalized = await runWithOrganizationPrincipal(row.organization_id, () =>
      db.tx(async (txDb) => {
        const updated = await runIntegratorSql<{ id: string }>(
          txDb,
          sql`
            UPDATE user_reminder_occurrences AS o
            SET status = 'failed',
                failed_at = now(),
                error_code = 'orphaned_past_slot',
                updated_at = now()
            FROM user_reminder_rules AS r
            WHERE r.id = o.rule_id
              AND o.status IN ('planned', 'queued')
              AND o.planned_at < ${nowIso}::timestamptz - interval '3 minutes'
              AND COALESCE(o.organization_id, r.organization_id) = ${row.organization_id}::uuid
            RETURNING o.id
          `,
        );
        const contexts: FinalizedReminderOccurrenceProjectionContext[] = [];
        for (const updatedRow of updated.rows) {
          const context = await getReminderOccurrenceContextForProjection(txDb, updatedRow.id);
          if (context?.status === 'failed') {
            contexts.push({ occurrenceId: updatedRow.id, ...context });
          }
        }
        return contexts;
      }),
    );
    finalized.push(...organizationFinalized);
  }
  return finalized;
}

export async function resolveReminderRuleOrganizationId(
  db: DbPort,
  ruleId: string,
): Promise<string | null> {
  const res = await runIntegratorSql<{ organization_id: string | null }>(
    db,
    sql`
      SELECT organization_id::text AS organization_id
      FROM user_reminder_rules
      WHERE id = ${ruleId}
      LIMIT 1
    `,
  );
  const organizationId = res.rows[0]?.organization_id;
  return typeof organizationId === 'string' && organizationId.trim().length > 0
    ? organizationId.trim()
    : null;
}

export async function resolveReminderOccurrenceOrganizationId(
  db: DbPort,
  occurrenceId: string,
): Promise<string | null> {
  const res = await runIntegratorSql<{ organization_id: string | null }>(
    db,
    sql`
      SELECT COALESCE(o.organization_id, r.organization_id)::text AS organization_id
      FROM user_reminder_occurrences o
      INNER JOIN user_reminder_rules r ON r.id = o.rule_id
      WHERE o.id = ${occurrenceId}
      LIMIT 1
    `,
  );
  const organizationId = res.rows[0]?.organization_id;
  return typeof organizationId === 'string' && organizationId.trim().length > 0
    ? organizationId.trim()
    : null;
}

export async function upsertReminderOccurrencePlanned(
  db: DbPort,
  input: { id: string; ruleId: string; occurrenceKey: string; plannedAt: string },
): Promise<void> {
  const d = getIntegratorDrizzleSession(db);
  await d
    .insert(userReminderOccurrences)
    .values({
      id: input.id,
      ruleId: input.ruleId,
      occurrenceKey: input.occurrenceKey,
      plannedAt: input.plannedAt,
      status: 'planned',
      organizationId: sql`(SELECT organization_id FROM user_reminder_rules WHERE id = ${input.ruleId} LIMIT 1)`,
      createdAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .onConflictDoNothing({ target: userReminderOccurrences.occurrenceKey });
}

export async function markReminderOccurrenceQueued(
  db: DbPort,
  occurrenceId: string,
  deliveryJobId: string | null,
): Promise<void> {
  const d = getIntegratorDrizzleSession(db);
  await d
    .update(userReminderOccurrences)
    .set({
      status: 'queued',
      queuedAt: sql`now()`,
      deliveryJobId,
      updatedAt: sql`now()`,
    })
    .where(eq(userReminderOccurrences.id, occurrenceId));
}

export async function markReminderOccurrenceSent(
  db: DbPort,
  occurrenceId: string,
  channel: string,
): Promise<void> {
  const d = getIntegratorDrizzleSession(db);
  await d
    .update(userReminderOccurrences)
    .set({
      status: 'sent',
      sentAt: sql`now()`,
      deliveryChannel: channel,
      updatedAt: sql`now()`,
    })
    .where(eq(userReminderOccurrences.id, occurrenceId));
}

export async function markReminderOccurrenceFailed(
  db: DbPort,
  occurrenceId: string,
  channel: string,
  errorCode: string | null,
): Promise<void> {
  const d = getIntegratorDrizzleSession(db);
  await d
    .update(userReminderOccurrences)
    .set({
      status: 'failed',
      failedAt: sql`now()`,
      deliveryChannel: channel,
      errorCode,
      updatedAt: sql`now()`,
    })
    .where(eq(userReminderOccurrences.id, occurrenceId));
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
  const d = getIntegratorDrizzleSession(db);
  const rows = await d
    .insert(userReminderDeliveryLogs)
    .values({
      id: input.id,
      occurrenceId: input.occurrenceId,
      channel: input.channel,
      status: input.status,
      errorCode: input.errorCode ?? null,
      payloadJson: input.payloadJson ?? {},
      organizationId: sql`(SELECT organization_id FROM user_reminder_occurrences WHERE id = ${input.occurrenceId} LIMIT 1)`,
      createdAt: sql`now()`,
    })
    .returning({ created_at: userReminderDeliveryLogs.createdAt });
  return rows[0]?.created_at ?? new Date().toISOString();
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
  const d = getIntegratorDrizzleSession(db);
  const rows = await d
    .select({
      rule_id: userReminderOccurrences.ruleId,
      user_id: sql<string>`${userReminderRules.userId}::text`,
      category: userReminderRules.category,
      status: userReminderOccurrences.status,
      sent_at: userReminderOccurrences.sentAt,
      failed_at: userReminderOccurrences.failedAt,
      delivery_channel: userReminderOccurrences.deliveryChannel,
      error_code: userReminderOccurrences.errorCode,
    })
    .from(userReminderOccurrences)
    .innerJoin(userReminderRules, eq(userReminderRules.id, userReminderOccurrences.ruleId))
    .where(eq(userReminderOccurrences.id, occurrenceId))
    .limit(1);
  const row = rows[0];
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
  const d = getIntegratorDrizzleSession(db);
  const organizationIdExpression = organizationIdForIntegratorUserSql(input.userId);
  const rows = await d
    .insert(contentAccessGrants)
    .values({
      id: input.id,
      userId: Number(input.userId),
      contentId: input.contentId,
      purpose: input.purpose,
      tokenHash: input.tokenHash ?? null,
      expiresAt: input.expiresAt,
      metaJson: input.metaJson ?? {},
      organizationId: organizationIdExpression,
      createdAt: sql`now()`,
    })
    .returning({ created_at: contentAccessGrants.createdAt });
  return rows[0]?.created_at ?? new Date().toISOString();
}

/** Integrator `users.id` (text) owning the occurrence's rule, or null if missing. */
export async function getReminderOccurrenceOwnerUserId(
  db: DbPort,
  occurrenceId: string,
): Promise<string | null> {
  const d = getIntegratorDrizzleSession(db);
  const rows = await d
    .select({ user_id: sql<string>`${userReminderRules.userId}::text` })
    .from(userReminderOccurrences)
    .innerJoin(userReminderRules, eq(userReminderRules.id, userReminderOccurrences.ruleId))
    .where(eq(userReminderOccurrences.id, occurrenceId))
    .limit(1);
  const id = rows[0]?.user_id;
  return id && id.trim().length > 0 ? id.trim() : null;
}

/** Snooze: move occurrence back to planned at `plannedAtIso`, clear send/queue fields. */
export async function rescheduleReminderOccurrencePlanned(
  db: DbPort,
  occurrenceId: string,
  plannedAtIso: string,
): Promise<boolean> {
  const d = getIntegratorDrizzleSession(db);
  const updated = await d
    .update(userReminderOccurrences)
    .set({
      plannedAt: plannedAtIso,
      status: 'planned',
      queuedAt: null,
      sentAt: null,
      failedAt: null,
      deliveryChannel: null,
      deliveryJobId: null,
      errorCode: null,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(userReminderOccurrences.id, occurrenceId),
        ne(userReminderOccurrences.status, 'skipped'),
      ),
    )
    .returning({ id: userReminderOccurrences.id });
  return updated.length > 0;
}

export async function markReminderOccurrenceSkippedLocal(
  db: DbPort,
  occurrenceId: string,
): Promise<boolean> {
  const d = getIntegratorDrizzleSession(db);
  const updated = await d
    .update(userReminderOccurrences)
    .set({
      status: 'skipped',
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(userReminderOccurrences.id, occurrenceId),
        ne(userReminderOccurrences.status, 'skipped'),
      ),
    )
    .returning({ id: userReminderOccurrences.id });
  return updated.length > 0;
}

/**
 * Last successfully delivered messenger message id for another occurrence of the same rule
 * that is still `sent` (user did not skip/snooze/finalize via bot) — candidate for delete-before-resend.
 * Uses `telegramMessageId` or `maxMessageId` in `payload_json` depending on `channel`.
 */
export async function getStaleReminderMessengerMessageIdForResend(
  db: DbPort,
  input: { ruleId: string; excludeOccurrenceId: string; channel: string },
): Promise<string | null> {
  const d = getIntegratorDrizzleSession(db);
  const res = await d.execute(sql`
    SELECT (
       CASE WHEN ${input.channel} = 'max'
         THEN l.payload_json->>'maxMessageId'
         ELSE l.payload_json->>'telegramMessageId'
       END
     ) AS mid
     FROM user_reminder_delivery_logs l
     INNER JOIN user_reminder_occurrences o ON o.id = l.occurrence_id
     WHERE l.channel = ${input.channel}
       AND l.status = 'success'
       AND o.rule_id = ${input.ruleId}
       AND o.id <> ${input.excludeOccurrenceId}
       AND o.status = 'sent'
       AND (
         (${input.channel} = 'max' AND (l.payload_json ? 'maxMessageId'))
         OR (${input.channel} <> 'max' AND (l.payload_json ? 'telegramMessageId'))
       )
     ORDER BY l.created_at DESC
     LIMIT 1
  `);
  const raw = (res.rows[0] as { mid: string | null } | undefined)?.mid;
  if (raw == null || raw.trim() === '') return null;
  const trimmed = raw.trim();
  if (input.channel === 'telegram') {
    const n = Number(trimmed);
    return Number.isFinite(n) && n > 0 ? String(Math.trunc(n)) : null;
  }
  return trimmed;
}
