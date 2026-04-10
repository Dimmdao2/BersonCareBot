import {
  APPOINTMENT_RECORD_UPSERTED,
  CONTENT_ACCESS_GRANTED,
  MAILING_LOG_SENT,
  REMINDER_DELIVERY_LOGGED,
  REMINDER_OCCURRENCE_FINALIZED,
  REMINDER_RULE_UPSERTED,
  USER_SUBSCRIPTION_UPSERTED,
} from '../../../kernel/contracts/index.js';
import { hashPayload, hashPayloadExcludingKeys, projectionIdempotencyKey } from './projectionKeys.js';

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

const BIGINT_STRING = /^\d+$/;

/**
 * Deep-clone JSON-ish value and replace integrator user id `loser` with `winner`
 * (string or truncated number forms). Other fields unchanged.
 */
export function deepReplaceIntegratorUserIdInValue(value: unknown, loser: string, winner: string): unknown {
  if (value === loser) return winner;
  if (typeof value === 'number' && Number.isFinite(value) && String(Math.trunc(value)) === loser) {
    const w = Number(winner);
    return Number.isFinite(w) ? Math.trunc(w) : winner;
  }
  if (Array.isArray(value)) {
    return value.map((v) => deepReplaceIntegratorUserIdInValue(v, loser, winner));
  }
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) {
      out[k] = deepReplaceIntegratorUserIdInValue(v, loser, winner);
    }
    return out;
  }
  return value;
}

/** Whether JSON (stringified) likely references integrator user id as a dedicated field value. */
export function payloadLikelyReferencesUserId(payload: unknown, userId: string): boolean {
  if (!BIGINT_STRING.test(userId)) return false;
  const s = JSON.stringify(payload);
  return (
    s.includes(`"integratorUserId":"${userId}"`)
    || s.includes(`"integratorUserId":${userId}`)
    || s.includes(`"integrator_user_id":"${userId}"`)
    || s.includes(`"integrator_user_id":${userId}`)
  );
}

/**
 * Recompute idempotency key after loser→winner replacement in payload, mirroring `writePort` rules.
 * `rowId` is used only as a stable fallback for unknown shapes.
 */
export function recomputeProjectionIdempotencyKeyAfterMerge(
  eventType: string,
  payload: Record<string, unknown>,
  rowId: number,
): string {
  const fallbackStable = `outbox-row:${rowId}`;

  switch (eventType) {
    case APPOINTMENT_RECORD_UPSERTED: {
      const rid = asNonEmptyString(payload.integratorRecordId);
      if (!rid) return projectionIdempotencyKey(eventType, fallbackStable, hashPayload(payload));
      return projectionIdempotencyKey(eventType, rid, hashPayload(payload));
    }
    case 'user.upserted': {
      const uid = asNonEmptyString(payload.integratorUserId);
      if (!uid) return projectionIdempotencyKey(eventType, fallbackStable, hashPayload(payload));
      return projectionIdempotencyKey(eventType, uid, hashPayload(payload));
    }
    case 'contact.linked': {
      const uid = asNonEmptyString(payload.integratorUserId);
      if (!uid) return projectionIdempotencyKey(eventType, fallbackStable, hashPayload(payload));
      return projectionIdempotencyKey(eventType, uid, hashPayload(payload));
    }
    case 'support.conversation.opened': {
      const cid = asNonEmptyString(payload.integratorConversationId);
      if (!cid) return projectionIdempotencyKey(eventType, fallbackStable, hashPayloadExcludingKeys(payload, ['integratorUserId']));
      return projectionIdempotencyKey(
        eventType,
        cid,
        hashPayloadExcludingKeys(payload, ['integratorUserId']),
      );
    }
    case 'support.conversation.message.appended': {
      const mid = asNonEmptyString(payload.integratorMessageId);
      if (!mid) return projectionIdempotencyKey(eventType, fallbackStable, hashPayload(payload));
      return projectionIdempotencyKey(eventType, mid, hashPayload(payload));
    }
    case 'support.conversation.status.changed': {
      const cid = asNonEmptyString(payload.integratorConversationId);
      if (!cid) return projectionIdempotencyKey(eventType, fallbackStable, hashPayload(payload));
      return projectionIdempotencyKey(eventType, cid, hashPayload(payload));
    }
    case 'support.question.created': {
      const qid = asNonEmptyString(payload.integratorQuestionId);
      if (!qid) return projectionIdempotencyKey(eventType, fallbackStable, hashPayloadExcludingKeys(payload, ['integratorUserId']));
      return projectionIdempotencyKey(
        eventType,
        qid,
        hashPayloadExcludingKeys(payload, ['integratorUserId']),
      );
    }
    case 'support.question.message.appended': {
      const mid = asNonEmptyString(payload.integratorQuestionMessageId);
      if (!mid) return projectionIdempotencyKey(eventType, fallbackStable, hashPayload(payload));
      return projectionIdempotencyKey(eventType, mid, hashPayload(payload));
    }
    case 'support.question.answered': {
      const qid = asNonEmptyString(payload.integratorQuestionId);
      if (!qid) return projectionIdempotencyKey(eventType, fallbackStable, hashPayload(payload));
      return projectionIdempotencyKey(eventType, qid, hashPayload(payload));
    }
    case 'preferences.updated': {
      const uid = asNonEmptyString(payload.integratorUserId);
      const topics = payload.topics;
      const topicsObj = topics && typeof topics === 'object' ? { topics } : { topics: [] };
      if (!uid) return projectionIdempotencyKey(eventType, fallbackStable, hashPayload(topicsObj as Record<string, unknown>));
      return projectionIdempotencyKey(eventType, uid, hashPayload(topicsObj as Record<string, unknown>));
    }
    case REMINDER_RULE_UPSERTED: {
      const ruleId = asNonEmptyString(payload.integratorRuleId);
      if (!ruleId) return projectionIdempotencyKey(eventType, fallbackStable, hashPayload(payload));
      const keyPayload = { ...payload } as Record<string, unknown>;
      delete keyPayload.updatedAt;
      return projectionIdempotencyKey(eventType, ruleId, hashPayload(keyPayload));
    }
    case REMINDER_OCCURRENCE_FINALIZED: {
      const oid = asNonEmptyString(payload.integratorOccurrenceId);
      if (!oid) return projectionIdempotencyKey(eventType, fallbackStable, hashPayload(payload));
      return projectionIdempotencyKey(eventType, oid, hashPayload(payload));
    }
    case REMINDER_DELIVERY_LOGGED: {
      const lid = asNonEmptyString(payload.integratorDeliveryLogId);
      if (!lid) return projectionIdempotencyKey(eventType, fallbackStable, hashPayload(payload));
      return projectionIdempotencyKey(eventType, lid, hashPayload(payload));
    }
    case CONTENT_ACCESS_GRANTED: {
      const gid = asNonEmptyString(payload.integratorGrantId);
      if (!gid) return projectionIdempotencyKey(eventType, fallbackStable, hashPayload(payload));
      return projectionIdempotencyKey(eventType, gid, hashPayload(payload));
    }
    case 'support.delivery.attempt.logged': {
      const intentEventId = asNonEmptyString(payload.intentEventId);
      const correlationId = asNonEmptyString(payload.correlationId);
      const stable = intentEventId ?? correlationId ?? `del-${hashPayload(payload)}`;
      return projectionIdempotencyKey(eventType, String(stable), hashPayload(payload));
    }
    case USER_SUBSCRIPTION_UPSERTED: {
      const uid = asNonEmptyString(payload.integratorUserId);
      const topicId = asNonEmptyString(payload.integratorTopicId);
      if (!uid || !topicId) return projectionIdempotencyKey(eventType, fallbackStable, hashPayload(payload));
      return projectionIdempotencyKey(eventType, `${uid}:${topicId}`, hashPayload(payload));
    }
    case MAILING_LOG_SENT: {
      const uid = asNonEmptyString(payload.integratorUserId);
      const mid = asNonEmptyString(payload.integratorMailingId);
      if (!uid || !mid) return projectionIdempotencyKey(eventType, fallbackStable, hashPayload(payload));
      return projectionIdempotencyKey(eventType, `${uid}:${mid}`, hashPayload(payload));
    }
    default:
      return projectionIdempotencyKey(eventType, fallbackStable, hashPayload(payload));
  }
}
