import { sql } from 'drizzle-orm';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { runIntegratorSql } from '../runIntegratorSql.js';

export type OutgoingDeliveryScope =
  | { kind: 'tenant'; queueKind: string; organizationId: string }
  | {
      kind: 'operator';
      queueKind: 'operator_alert' | 'inbound_reply' | 'operator_health_digest' | 'auth_email_otp';
    }
  | { kind: 'invalid'; queueKind: string | null; reason: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function resolveOutgoingDeliveryScope(
  db: DbPort,
  queueId: string,
): Promise<OutgoingDeliveryScope> {
  const result = await runIntegratorSql<{
    queue_kind: string | null;
    organization_id: string | null;
    resolution: string;
  }>(
    db,
    sql`SELECT queue_kind, organization_id::text AS organization_id, resolution FROM app.resolve_outgoing_delivery_scope(${queueId}::uuid)`,
  );
  const row = result.rows[0];
  if (!row) return { kind: 'invalid', queueKind: null, reason: 'queue_not_found' };
  if (
    row.resolution === 'operator_global' &&
    (row.queue_kind === 'operator_alert' ||
      row.queue_kind === 'inbound_reply' ||
      row.queue_kind === 'operator_health_digest' ||
      row.queue_kind === 'auth_email_otp')
  ) {
    return { kind: 'operator', queueKind: row.queue_kind };
  }
  const organizationId = row.organization_id?.trim().toLowerCase() ?? '';
  if (row.resolution === 'tenant' && row.queue_kind && UUID_RE.test(organizationId)) {
    return { kind: 'tenant', queueKind: row.queue_kind, organizationId };
  }
  return {
    kind: 'invalid',
    queueKind: row.queue_kind,
    reason: row.resolution || 'unresolved',
  };
}

export async function operatorIncidentAlertAlreadySent(
  db: DbPort,
  incidentId: string,
): Promise<boolean> {
  const result = await runIntegratorSql<{ already_sent: boolean }>(
    db,
    sql`SELECT app.operator_incident_alert_already_sent(${incidentId}::uuid) AS already_sent`,
  );
  return result.rows[0]?.already_sent === true;
}

export async function markOperatorIncidentAlertSent(db: DbPort, incidentId: string): Promise<void> {
  await runIntegratorSql(
    db,
    sql`SELECT app.mark_operator_incident_alert_sent(${incidentId}::uuid)`,
  );
}
