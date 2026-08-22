import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type {
  MessengerBindAuditCandidateSummary,
  MessengerBindAuditInitiatorSummary,
  MessengerPhoneBindDb,
} from '@bersoncare/platform-merge';
import {
  buildMessengerBindBlockedRelayLines,
  enrichMessengerBindAuditDetailsFields,
  messengerPhoneBindReasonHumanRu,
} from '@bersoncare/platform-merge';
import { getCurrentDbPrincipalOrganizationId } from '@bersoncare/db-principal';
import type { DbPort, DispatchPort } from '../../../kernel/contracts/index.js';
import { env } from '../../../config/env.js';
import { logger } from '../../observability/logger.js';
import {
  messengerPhoneBindDedupKey,
  relayMessengerPhoneBindAdminIncident,
  type MessengerPhoneBindIncidentTopic,
} from '../adminIncidentAlertRelay.js';
import { runIntegratorNamedRoot } from '../runIntegratorSql.js';

/**
 * D17 шаг 2b. Разбор конфликта привязки номера уходит в `public.admin_audit_log` ОДНИМ именованным
 * корнем вместо собственной `db.tx` из четырёх реляционных операторов (`SELECT … FOR UPDATE`,
 * `UPDATE` счётчика повторов, `INSERT` первой строки и `UPDATE` в ответ на гонку 23505). Дверь одна,
 * потому что действие одно — «зафиксировать случай и сказать, первый ли он»; её `boolean` и есть
 * прежний `insertedFirst`, по которому ниже решается, будить ли администратора.
 *
 * Замок открытой строки и разбор гонки уехали в тело корня целиком: разделив дверь на «прочитать» и
 * «записать», мы вынесли бы блокировку за её пределы и потеряли атомарность, ради которой здесь и
 * была транзакция. Именованный корень транзакцию отношений не открывает и внутри неё не стартует.
 */
const RECORD_MESSENGER_PHONE_BIND_AUDIT_ROOT =
  'app.integrator_record_messenger_phone_bind_audit(uuid,text,text,text)';

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

  let enrichedFields: {
    candidates: MessengerBindAuditCandidateSummary[];
    initiator: MessengerBindAuditInitiatorSummary | null;
    reasonHumanRu: string;
  };
  try {
    enrichedFields = await enrichMessengerBindAuditDetailsFields(input.db as MessengerPhoneBindDb, {
      reason: input.reason,
      candidateIds,
      ...(typeof input.details.channelCode === 'string'
        ? { channelCode: input.details.channelCode }
        : {}),
      ...(typeof input.details.externalId === 'string'
        ? { externalId: input.details.externalId }
        : {}),
    });
  } catch (err) {
    logger.warn({ err, reason: input.reason }, 'recordMessengerPhoneBindBlocked: enrich failed');
    const uniq = [...new Set(candidateIds.map((id) => id.trim()).filter(Boolean))];
    enrichedFields = {
      candidates: uniq.map((id) => ({
        platformUserId: id,
        displayName: null,
        phoneNormalized: null,
        email: null,
      })),
      initiator: null,
      reasonHumanRu: messengerPhoneBindReasonHumanRu(input.reason),
    };
  }

  const baseDetails = {
    ...input.details,
    reason: input.reason,
    candidateIds,
    source: 'integrator.user.phone.link',
    candidates: enrichedFields.candidates,
    initiator: enrichedFields.initiator,
    reasonHumanRu: enrichedFields.reasonHumanRu,
  };

  let insertedFirst = false;
  // D15b/4 (access sweep 2026-08-04): `admin_audit_log` — таблица класса org (`organization_id =
  // app.current_org_id()`), и прежний писатель колонку не ставил. Организация читается ТА ЖЕ
  // окружающая, которую поставил переключатель принципала у вызывающего (`writeDirectPublic`
  // в `writePort.ts`), — не угадывается и не разрешается вторым способом. Корень сверяет её с
  // принятым контекстом и сужает ею КАЖДЫЙ поиск строки.
  const organizationId = getCurrentDbPrincipalOrganizationId() ?? null;
  const detailsJson = JSON.stringify(baseDetails);
  const targetId = candidateIds[0] ?? null;

  try {
    const recorded = await runIntegratorNamedRoot<{ inserted_first: boolean }>(
      input.db,
      RECORD_MESSENGER_PHONE_BIND_AUDIT_ROOT,
      [organizationId, targetId, conflictKey, detailsJson],
      sql`SELECT app.integrator_record_messenger_phone_bind_audit(
        ${organizationId}::uuid, ${targetId}::text, ${conflictKey}::text, ${detailsJson}::text
      ) AS inserted_first`,
    );
    insertedFirst = recorded.rows[0]?.inserted_first === true;
  } catch (err) {
    logger.error(
      { err, reason: input.reason },
      'recordMessengerPhoneBindBlocked: audit insert failed',
    );
    return;
  }

  if (!insertedFirst) return;

  const topic: MessengerPhoneBindIncidentTopic = conflictKey
    ? 'messenger_phone_bind_blocked'
    : 'messenger_phone_bind_anomaly';
  let relayLines: string[];
  try {
    relayLines = buildMessengerBindBlockedRelayLines({
      variantLabel: conflictKey
        ? 'integrator · user.phone.link'
        : 'integrator · user.phone.link (аномалия)',
      machineReason: input.reason,
      reasonHumanRu: enrichedFields.reasonHumanRu,
      appBaseUrl: env.APP_BASE_URL,
      candidates: enrichedFields.candidates,
      initiator: enrichedFields.initiator,
      ...(typeof input.details.channelCode === 'string'
        ? { channelCode: input.details.channelCode }
        : {}),
      ...(typeof input.details.externalId === 'string'
        ? { externalId: input.details.externalId }
        : {}),
      ...(typeof input.details.phoneSuffix === 'string'
        ? { phoneSuffix: input.details.phoneSuffix }
        : {}),
      ...(typeof input.details.correlationId === 'string'
        ? { correlationId: input.details.correlationId }
        : {}),
      source: String(baseDetails.source ?? ''),
    });
  } catch (err) {
    logger.warn({ err, topic }, 'recordMessengerPhoneBindBlocked: relay line build failed');
    relayLines = [
      conflictKey
        ? 'messenger_phone_bind_blocked (integrator)'
        : 'messenger_phone_bind_anomaly (integrator)',
      `reason=${input.reason}`,
      `candidates=${candidateIds.join(', ')}`,
      ...(input.details.channelCode ? [`channel=${String(input.details.channelCode)}`] : []),
      ...(input.details.externalId ? [`externalId=${String(input.details.externalId)}`] : []),
      ...(input.details.correlationId
        ? [`correlation=${String(input.details.correlationId)}`]
        : []),
    ];
  }
  const dedupKey = messengerPhoneBindDedupKey({
    topic,
    conflictKey,
    reason: input.reason,
    candidateIds,
    details: baseDetails,
  });

  try {
    await relayMessengerPhoneBindAdminIncident({
      db: input.db,
      ...(input.getDispatchPort ? { getDispatchPort: input.getDispatchPort } : {}),
      topic,
      dedupKey,
      lines: relayLines,
    });
  } catch (err) {
    logger.warn({ err, topic }, 'recordMessengerPhoneBindBlocked: relay failed');
  }
}
