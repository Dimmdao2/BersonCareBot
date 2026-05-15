import { createHash } from 'node:crypto';
import type { DbPort, DispatchPort } from '../../../kernel/contracts/index.js';
import { logger } from '../../observability/logger.js';
import {
  messengerPhoneBindDedupKey,
  relayMessengerPhoneBindAdminIncident,
  type MessengerPhoneBindIncidentTopic,
} from '../adminIncidentAlertRelay.js';

/**
 * Inserts/updates `public.admin_audit_log` for messenger phone-bind failures.
 * Column set must stay aligned with Drizzle `adminAuditLog` in
 * `apps/webapp/db/schema/schema.ts` (integrator uses raw SQL + `DbPort`; webapp owns schema).
 */

function isPgUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: unknown }).code === '23505';
}

/**
 * Durable audit + deduped admin relay (first inserted open row per `conflict_key`, or first anomaly insert).
 * Runs in a **separate** `db.tx` after the main bind transaction has rolled back — not nested in the bind tx.
 */
export async function recordMessengerPhoneBindBlocked(input: {
  db: DbPort;
  getDispatchPort?: () => DispatchPort | undefined;
  reason: string;
  candidateIds: string[];
  details: Record<string, unknown>;
}): Promise<void> {
  const { candidateIds } = input;
  let conflictKey: string | null = null;
  if (candidateIds.length > 0) {
    try {
      const normalized = [...new Set(candidateIds.map((id) => id.trim()).filter(Boolean))].sort();
      if (normalized.length > 0) {
        conflictKey = createHash('sha256').update(normalized.join('|'), 'utf8').digest('hex');
      }
    } catch {
      conflictKey = null;
    }
  }

  const baseDetails = {
    ...input.details,
    reason: input.reason,
    candidateIds,
    source: 'integrator.user.phone.link',
  };

  let insertedFirst = false;

  try {
    await input.db.tx(async (tx) => {
      if (conflictKey) {
        const existing = await tx.query<{ id: string; repeat_count: number }>(
          `SELECT id::text, repeat_count FROM public.admin_audit_log
           WHERE conflict_key = $1 AND resolved_at IS NULL
           FOR UPDATE
           LIMIT 1`,
          [conflictKey],
        );
        if (existing.rows[0]) {
          await tx.query(
            `UPDATE public.admin_audit_log
             SET details = details || $2::jsonb,
                 repeat_count = repeat_count + 1,
                 last_seen_at = now(),
                 status = 'error'
             WHERE id = $1::uuid`,
            [existing.rows[0].id, JSON.stringify(baseDetails)],
          );
        } else {
          try {
            await tx.query(
              `INSERT INTO public.admin_audit_log (actor_id, action, target_id, conflict_key, details, status, repeat_count, last_seen_at)
               VALUES (NULL, 'messenger_phone_bind_blocked', $1, $2, $3::jsonb, 'error', 1, now())`,
              [candidateIds[0] ?? null, conflictKey, JSON.stringify(baseDetails)],
            );
            insertedFirst = true;
          } catch (err) {
            if (!isPgUniqueViolation(err)) throw err;
            await tx.query(
              `UPDATE public.admin_audit_log
               SET details = details || $2::jsonb,
                   repeat_count = repeat_count + 1,
                   last_seen_at = now(),
                   status = 'error'
               WHERE conflict_key = $1 AND resolved_at IS NULL`,
              [conflictKey, JSON.stringify(baseDetails)],
            );
          }
        }
      } else {
        await tx.query(
          `INSERT INTO public.admin_audit_log (actor_id, action, target_id, conflict_key, details, status)
           VALUES (NULL, 'messenger_phone_bind_anomaly', $1, NULL, $2::jsonb, 'error')`,
          [candidateIds[0] ?? null, JSON.stringify(baseDetails)],
        );
        insertedFirst = true;
      }
    });
  } catch (err) {
    logger.error({ err, reason: input.reason }, 'recordMessengerPhoneBindBlocked: audit insert failed');
    return;
  }

  if (!insertedFirst) return;

  const topic: MessengerPhoneBindIncidentTopic = conflictKey ? 'messenger_phone_bind_blocked' : 'messenger_phone_bind_anomaly';
  const lines = [
    conflictKey ? 'messenger_phone_bind_blocked (integrator)' : 'messenger_phone_bind_anomaly (integrator)',
    `reason=${input.reason}`,
    `candidates=${candidateIds.join(', ')}`,
    ...(input.details.channelCode ? [`channel=${String(input.details.channelCode)}`] : []),
    ...(input.details.externalId ? [`externalId=${String(input.details.externalId)}`] : []),
    ...(input.details.correlationId ? [`correlation=${String(input.details.correlationId)}`] : []),
  ];
  const dedupKey = messengerPhoneBindDedupKey({
    topic,
    conflictKey,
    reason: input.reason,
    candidateIds,
    details: input.details,
  });

  try {
    await relayMessengerPhoneBindAdminIncident({
      db: input.db,
      ...(input.getDispatchPort ? { getDispatchPort: input.getDispatchPort } : {}),
      topic,
      dedupKey,
      lines,
    });
  } catch (err) {
    logger.warn({ err, topic }, 'recordMessengerPhoneBindBlocked: relay failed');
  }
}
