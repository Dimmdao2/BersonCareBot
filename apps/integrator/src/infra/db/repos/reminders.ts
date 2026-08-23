import { and, asc, eq, gte, inArray, lte, ne, sql } from 'drizzle-orm';
import type {
  DbPort,
  ReminderOccurrenceRecord,
} from '../../../kernel/contracts/index.js';
import { getIntegratorDrizzleSession } from '../drizzle.js';
import { contentAccessGrants, userReminderOccurrences } from '../schema/integratorDomainRepos.js';
import { reminderRules } from '../schema/integratorPublicProduct.js';
import { runIntegratorSql } from '../runIntegratorSql.js';
import {
  getCurrentOrganizationPrincipalId,
  runWithDeliveryWorkerPrincipal,
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
        SELECT platform_user_id, organization_id FROM public.org_enrollments WHERE status = 'active'
        UNION
        SELECT platform_user_id, organization_id FROM public.be_organization_members WHERE status = 'active'
      ) active_user_orgs ON active_user_orgs.platform_user_id = platform_user.id
      WHERE platform_user.integrator_user_id = ${String(integratorUserId)}::bigint
      HAVING count(DISTINCT active_user_orgs.organization_id) = 1
    )
  )`;
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
  platform_user_id: string;
  delivery_generation: number;
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
    platformUserId: row.platform_user_id,
    deliveryGeneration: row.delivery_generation,
    ...(row.created_at ? { createdAt: row.created_at } : {}),
    ...(row.updated_at ? { updatedAt: row.updated_at } : {}),
    ...(typeof row.organization_id === 'string' && row.organization_id.trim()
      ? { organizationId: row.organization_id.trim() }
      : {}),
  };
}

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
  platform_user_id: userReminderOccurrences.platformUserId,
  delivery_generation: userReminderOccurrences.deliveryGeneration,
  created_at: userReminderOccurrences.createdAt,
  updated_at: userReminderOccurrences.updatedAt,
};

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
export async function isReminderTransactionalEmailRateLimited(
  db: DbPort,
  platformUserId: string,
): Promise<boolean> {
  const result = await runWithDeliveryWorkerPrincipal(() =>
    runIntegratorSql<{ rate_limited: boolean }>(
      db,
      sql`SELECT COALESCE(
          app.read_reminder_transactional_email_cooldown(${platformUserId}::uuid)
            > statement_timestamp() - interval '45 seconds',
          false
        ) AS rate_limited`,
    ),
  );
  return result.rows[0]?.rate_limited === true;
}

export async function recordReminderTransactionalEmailSent(
  db: DbPort,
  platformUserId: string,
): Promise<void> {
  await runWithDeliveryWorkerPrincipal(() =>
    runIntegratorSql(
      db,
      sql`SELECT app.record_reminder_transactional_email_cooldown(${platformUserId}::uuid)`,
    ),
  );
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
  platformUserId: string;
  organizationId: string;
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
      LEFT JOIN public.reminder_rules r ON r.integrator_rule_id = o.rule_id
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
            FROM public.reminder_rules AS r
            WHERE r.integrator_rule_id = o.rule_id
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

export async function resolveReminderOccurrenceOrganizationId(
  db: DbPort,
  occurrenceId: string,
): Promise<string | null> {
  const res = await runIntegratorSql<{ organization_id: string | null }>(
    db,
    sql`
      SELECT COALESCE(o.organization_id, r.organization_id)::text AS organization_id
      FROM user_reminder_occurrences o
      INNER JOIN public.reminder_rules r ON r.integrator_rule_id = o.rule_id
      WHERE o.id = ${occurrenceId}
      LIMIT 1
    `,
  );
  const organizationId = res.rows[0]?.organization_id;
  return typeof organizationId === 'string' && organizationId.trim().length > 0
    ? organizationId.trim()
    : null;
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

/** Context for projection reminder.occurrence.finalized / reminder.delivery.logged. */
export async function getReminderOccurrenceContextForProjection(
  db: DbPort,
  occurrenceId: string,
): Promise<Omit<FinalizedReminderOccurrenceProjectionContext, 'occurrenceId'> | null> {
  const d = getIntegratorDrizzleSession(db);
  const rows = await d
    .select({
      rule_id: userReminderOccurrences.ruleId,
      user_id: sql<string>`${reminderRules.integratorUserId}::text`,
      platform_user_id: userReminderOccurrences.platformUserId,
      organization_id: sql<string>`COALESCE(${userReminderOccurrences.organizationId}, ${reminderRules.organizationId})::text`,
      category: reminderRules.category,
      status: userReminderOccurrences.status,
      sent_at: userReminderOccurrences.sentAt,
      failed_at: userReminderOccurrences.failedAt,
      delivery_channel: userReminderOccurrences.deliveryChannel,
      error_code: userReminderOccurrences.errorCode,
    })
    .from(userReminderOccurrences)
    .innerJoin(reminderRules, eq(reminderRules.integratorRuleId, userReminderOccurrences.ruleId))
    .where(eq(userReminderOccurrences.id, occurrenceId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (!row.platform_user_id || !row.organization_id) {
    throw new Error(`reminder occurrence ${occurrenceId} has no canonical ownership`);
  }
  const occurredAt = row.sent_at ?? row.failed_at ?? new Date().toISOString();
  return {
    ruleId: row.rule_id,
    userId: String(row.user_id),
    platformUserId: row.platform_user_id,
    organizationId: row.organization_id,
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
): Promise<{ createdAt: string; organizationId: string | null }> {
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
    .returning({
      created_at: contentAccessGrants.createdAt,
      organization_id: contentAccessGrants.organizationId,
    });
  const row = rows[0];
  return {
    createdAt: row?.created_at ?? new Date().toISOString(),
    organizationId: row?.organization_id ?? null,
  };
}

/** Integrator `users.id` (text) owning the occurrence's rule, or null if missing. */
export async function getReminderOccurrenceOwnerUserId(
  db: DbPort,
  occurrenceId: string,
): Promise<string | null> {
  const d = getIntegratorDrizzleSession(db);
  const rows = await d
    .select({ user_id: sql<string>`${reminderRules.integratorUserId}::text` })
    .from(userReminderOccurrences)
    .innerJoin(reminderRules, eq(reminderRules.integratorRuleId, userReminderOccurrences.ruleId))
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
 * `public.outgoing_delivery_queue` is the sole surviving per-delivery record (the retired
 * `user_reminder_delivery_logs` journal used to carry this); `telegramMessageId`/`maxMessageId` are
 * merged into the sent row's `payload_json` by `outgoingDeliveryWorker.ts`'s `queueMarkSent`, and the
 * dispatching row's `payload_json.occurrenceId` is how it ties back to the reminder occurrence.
 */
export async function getStaleReminderMessengerMessageIdForResend(
  db: DbPort,
  input: { ruleId: string; excludeOccurrenceId: string; channel: string },
): Promise<string | null> {
  const d = getIntegratorDrizzleSession(db);
  const res = await d.execute(sql`
    SELECT (
       CASE WHEN ${input.channel} = 'max'
         THEN q.payload_json->>'maxMessageId'
         ELSE q.payload_json->>'telegramMessageId'
       END
     ) AS mid
     FROM public.outgoing_delivery_queue q
     INNER JOIN user_reminder_occurrences o ON o.id = q.payload_json->>'occurrenceId'
     WHERE q.kind = 'reminder_dispatch'
       AND q.channel = ${input.channel}
       AND q.status = 'sent'
       AND o.rule_id = ${input.ruleId}
       AND o.id <> ${input.excludeOccurrenceId}
       AND o.status = 'sent'
       AND (
         (${input.channel} = 'max' AND (q.payload_json ? 'maxMessageId'))
         OR (${input.channel} <> 'max' AND (q.payload_json ? 'telegramMessageId'))
       )
     ORDER BY q.sent_at DESC
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
