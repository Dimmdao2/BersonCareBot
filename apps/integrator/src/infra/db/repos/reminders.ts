import { and, asc, eq, gte, inArray, lte, ne, sql } from 'drizzle-orm';
import type {
  DbPort,
  ReminderOccurrenceRecord,
} from '../../../kernel/contracts/index.js';
import { getIntegratorDrizzleSession } from '../drizzle.js';
import { contentAccessGrants } from '../schema/integratorDomainRepos.js';
import { reminderOccurrenceHistory, reminderRules } from '../schema/integratorPublicProduct.js';
import { runIntegratorSql } from '../runIntegratorSql.js';
import {
  getCurrentOrganizationPrincipalId,
  runWithDeliveryWorkerPrincipal,
  runWithOrganizationPrincipal,
} from '../../principal/organizationPrincipal.js';

/**
 * Track D (#987): the clinic of a content-access grant comes from the live organization principal
 * and nowhere else. The removed `COALESCE` fallback re-derived it by joining
 * `public.platform_users.integrator_user_id` — the retired public identity — and could only ever
 * fire when no principal was installed, i.e. exactly when the INSERT itself would be refused by
 * RLS. It bought nothing and kept a live reader of the retired column alive.
 */
function organizationIdForCurrentPrincipalSql() {
  return sql`${getCurrentOrganizationPrincipalId() ?? null}::uuid`;
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
  id: reminderOccurrenceHistory.integratorOccurrenceId,
  rule_id: reminderOccurrenceHistory.integratorRuleId,
  occurrence_key: reminderOccurrenceHistory.occurrenceKey,
  planned_at: reminderOccurrenceHistory.plannedAt,
  status: reminderOccurrenceHistory.status,
  queued_at: reminderOccurrenceHistory.queuedAt,
  sent_at: reminderOccurrenceHistory.sentAt,
  failed_at: reminderOccurrenceHistory.failedAt,
  delivery_channel: reminderOccurrenceHistory.deliveryChannel,
  delivery_job_id: reminderOccurrenceHistory.deliveryJobId,
  error_code: reminderOccurrenceHistory.errorCode,
  organization_id: reminderOccurrenceHistory.organizationId,
  platform_user_id: reminderOccurrenceHistory.platformUserId,
  delivery_generation: reminderOccurrenceHistory.deliveryGeneration,
  created_at: reminderOccurrenceHistory.createdAt,
  updated_at: reminderOccurrenceHistory.updatedAt,
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
    .from(reminderOccurrenceHistory)
    .where(
      and(
        eq(reminderOccurrenceHistory.integratorRuleId, ruleId),
        gte(reminderOccurrenceHistory.plannedAt, fromIso),
        lte(reminderOccurrenceHistory.plannedAt, toIso),
      ),
    )
    .orderBy(asc(reminderOccurrenceHistory.plannedAt));
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
    .delete(reminderOccurrenceHistory)
    .where(
      and(
        eq(reminderOccurrenceHistory.integratorRuleId, ruleId),
        inArray(reminderOccurrenceHistory.status, ['planned', 'queued']),
      ),
    );
}

/** Pending rows left from legacy same-day backfill; grace matches webapp web-push tick. */
export type FinalizedReminderOccurrenceProjectionContext = {
  occurrenceId: string;
  ruleId: string;
  /** Track D (#987): canonical owner; the retired numeric `userId` twin was dropped with the column. */
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
      SELECT DISTINCT o.organization_id::text AS organization_id
      FROM public.reminder_occurrence_history o
      WHERE o.status IN ('planned', 'queued')
        AND o.planned_at < ${nowIso}::timestamptz - interval '3 minutes'
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
            UPDATE public.reminder_occurrence_history AS o
            SET status = 'failed',
                failed_at = now(),
                error_code = 'orphaned_past_slot',
                occurred_at = COALESCE(occurred_at, now()),
                updated_at = now()
            WHERE o.status IN ('planned', 'queued')
              AND o.planned_at < ${nowIso}::timestamptz - interval '3 minutes'
              AND o.organization_id = ${row.organization_id}::uuid
            RETURNING o.integrator_occurrence_id AS id
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
      SELECT o.organization_id::text AS organization_id
      FROM public.reminder_occurrence_history o
      WHERE o.integrator_occurrence_id = ${occurrenceId}
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
    .update(reminderOccurrenceHistory)
    .set({
      status: 'sent',
      sentAt: sql`now()`,
      deliveryChannel: channel,
      occurredAt: sql`COALESCE(${reminderOccurrenceHistory.occurredAt}, now())`,
      updatedAt: sql`now()`,
    })
    .where(eq(reminderOccurrenceHistory.integratorOccurrenceId, occurrenceId));
}

export async function markReminderOccurrenceFailed(
  db: DbPort,
  occurrenceId: string,
  channel: string,
  errorCode: string | null,
): Promise<void> {
  const d = getIntegratorDrizzleSession(db);
  await d
    .update(reminderOccurrenceHistory)
    .set({
      status: 'failed',
      failedAt: sql`now()`,
      deliveryChannel: channel,
      errorCode,
      occurredAt: sql`COALESCE(${reminderOccurrenceHistory.occurredAt}, now())`,
      updatedAt: sql`now()`,
    })
    .where(eq(reminderOccurrenceHistory.integratorOccurrenceId, occurrenceId));
}

/** Context for projection reminder.occurrence.finalized / reminder.delivery.logged. */
export async function getReminderOccurrenceContextForProjection(
  db: DbPort,
  occurrenceId: string,
): Promise<Omit<FinalizedReminderOccurrenceProjectionContext, 'occurrenceId'> | null> {
  const d = getIntegratorDrizzleSession(db);
  const rows = await d
    .select({
      rule_id: reminderOccurrenceHistory.integratorRuleId,
      platform_user_id: reminderOccurrenceHistory.platformUserId,
      organization_id: sql<string>`${reminderOccurrenceHistory.organizationId}::text`,
      category: reminderRules.category,
      status: reminderOccurrenceHistory.status,
      sent_at: reminderOccurrenceHistory.sentAt,
      failed_at: reminderOccurrenceHistory.failedAt,
      delivery_channel: reminderOccurrenceHistory.deliveryChannel,
      error_code: reminderOccurrenceHistory.errorCode,
    })
    .from(reminderOccurrenceHistory)
    .innerJoin(reminderRules, eq(reminderRules.integratorRuleId, reminderOccurrenceHistory.integratorRuleId))
    .where(eq(reminderOccurrenceHistory.integratorOccurrenceId, occurrenceId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (!row.platform_user_id || !row.organization_id) {
    throw new Error(`reminder occurrence ${occurrenceId} has no canonical ownership`);
  }
  const occurredAt = row.sent_at ?? row.failed_at ?? new Date().toISOString();
  return {
    ruleId: row.rule_id,
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
  const organizationIdExpression = organizationIdForCurrentPrincipalSql();
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

/**
 * Canonical `public.platform_users.id` owning the occurrence, or null if missing.
 *
 * Track D (#987): this used to return `reminder_rules.integrator_user_id::text`, while its only
 * caller — the Telegram/MAX reminder callback ownership check in
 * `kernel/domain/executor/handlers/reminders.ts` — compared it against the value of
 * `user.byIdentity`, which has been the canonical uuid since D17. A bigint never equals a uuid, so
 * EVERY reminder button (snooze/done/skip) failed closed with `forbidden`. Both sides now speak the
 * canonical uuid, and it is read straight off the occurrence row, whose `platform_user_id` is
 * `NOT NULL` — no join through the retired identity and no fallback.
 */
export async function getReminderOccurrenceOwnerPlatformUserId(
  db: DbPort,
  occurrenceId: string,
): Promise<string | null> {
  const d = getIntegratorDrizzleSession(db);
  const rows = await d
    .select({ platform_user_id: sql<string>`${reminderOccurrenceHistory.platformUserId}::text` })
    .from(reminderOccurrenceHistory)
    .where(eq(reminderOccurrenceHistory.integratorOccurrenceId, occurrenceId))
    .limit(1);
  const id = rows[0]?.platform_user_id;
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
    .update(reminderOccurrenceHistory)
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
        eq(reminderOccurrenceHistory.integratorOccurrenceId, occurrenceId),
        ne(reminderOccurrenceHistory.status, 'skipped'),
      ),
    )
    .returning({ id: reminderOccurrenceHistory.integratorOccurrenceId });
  return updated.length > 0;
}

export async function markReminderOccurrenceSkippedLocal(
  db: DbPort,
  occurrenceId: string,
): Promise<boolean> {
  const d = getIntegratorDrizzleSession(db);
  const updated = await d
    .update(reminderOccurrenceHistory)
    .set({
      status: 'skipped',
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(reminderOccurrenceHistory.integratorOccurrenceId, occurrenceId),
        ne(reminderOccurrenceHistory.status, 'skipped'),
      ),
    )
    .returning({ id: reminderOccurrenceHistory.integratorOccurrenceId });
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
     INNER JOIN public.reminder_occurrence_history o ON o.integrator_occurrence_id = q.payload_json->>'occurrenceId'
     WHERE q.kind = 'reminder_dispatch'
       AND q.channel = ${input.channel}
       AND q.status = 'sent'
       AND o.integrator_rule_id = ${input.ruleId}
       AND o.integrator_occurrence_id <> ${input.excludeOccurrenceId}
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
