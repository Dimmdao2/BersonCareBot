/**
 * Запись и обновление operator health таблиц через Drizzle (без сырого SQL в приложении).
 */
import { and, eq, isNull, like, sql } from 'drizzle-orm';
import { operatorIncidents } from '@bersoncare/operator-db-schema';
import { getIntegratorDrizzle } from '../drizzle.js';

const ERROR_DETAIL_MAX = 900;

export type OpenOperatorIncidentInput = {
  dedupKey: string;
  direction: string;
  integration: string;
  errorClass: string;
  errorDetail?: string | null;
};

export type OpenOrTouchIncidentResult = {
  id: string;
  occurrenceCount: number;
};

function truncateDetail(detail: string | null | undefined): string | null {
  if (detail === undefined || detail === null || detail === '') return null;
  const t = detail.length > ERROR_DETAIL_MAX ? `${detail.slice(0, ERROR_DETAIL_MAX)}…` : detail;
  return t;
}

/**
 * Открыть инцидент или увеличить счётчик при совпадении открытого dedup_key (partial unique index).
 */
export async function openOrTouchOperatorIncident(
  input: OpenOperatorIncidentInput,
): Promise<OpenOrTouchIncidentResult> {
  const db = getIntegratorDrizzle();
  const errorDetail = truncateDetail(input.errorDetail);

  const rows = await db
    .insert(operatorIncidents)
    .values({
      dedupKey: input.dedupKey,
      direction: input.direction,
      integration: input.integration,
      errorClass: input.errorClass,
      errorDetail,
    })
    .onConflictDoUpdate({
      target: [operatorIncidents.dedupKey],
      targetWhere: sql`${operatorIncidents.resolvedAt} IS NULL`,
      set: {
        lastSeenAt: sql`now()` as unknown as string,
        occurrenceCount: sql`${operatorIncidents.occurrenceCount} + 1`,
        errorDetail: sql`coalesce(excluded.error_detail, ${operatorIncidents.errorDetail})` as unknown as string,
      },
    })
    .returning({
      id: operatorIncidents.id,
      occurrenceCount: operatorIncidents.occurrenceCount,
    });

  const row = rows[0];
  if (!row) {
    throw new Error('openOrTouchOperatorIncident: empty returning');
  }
  return { id: row.id, occurrenceCount: row.occurrenceCount };
}

export async function markOperatorIncidentAlertSent(incidentId: string): Promise<void> {
  const db = getIntegratorDrizzle();
  await db
    .update(operatorIncidents)
    .set({ alertSentAt: new Date().toISOString() })
    .where(eq(operatorIncidents.id, incidentId));
}

export async function getOperatorIncidentAlertState(
  incidentId: string,
): Promise<{ alertSentAt: string | null } | null> {
  const db = getIntegratorDrizzle();
  const rows = await db
    .select({ alertSentAt: operatorIncidents.alertSentAt })
    .from(operatorIncidents)
    .where(eq(operatorIncidents.id, incidentId))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return { alertSentAt: r.alertSentAt ?? null };
}

/**
 * Закрыть все открытые инциденты, чей dedup_key начинается с префикса (MVP: resolve проб MAX/Rubitime).
 */
export async function resolveOpenOperatorIncidentsByDedupKeyPrefix(prefix: string): Promise<number> {
  const db = getIntegratorDrizzle();
  const pattern = `${prefix}%`;
  const finishedAt = new Date().toISOString();
  const rows = await db
    .update(operatorIncidents)
    .set({ resolvedAt: finishedAt })
    .where(and(isNull(operatorIncidents.resolvedAt), like(operatorIncidents.dedupKey, pattern)))
    .returning({ id: operatorIncidents.id });
  return rows.length;
}
