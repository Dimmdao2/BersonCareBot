/**
 * Track D — D4: support questions + delivery-attempt audit direct-public writes (precedent: D3's
 * `writeSupportConversationsDirect.ts`, itself building on D1/D2's candidate/org resolution).
 *
 * Replaces the HTTP projection fanout (`support.question.created` / `.message.appended` / `.answered` /
 * `support.delivery.attempt.logged` → `webappEventsPort.emit()` → webapp `handleIntegratorEvent` →
 * `pgSupportCommunication.ts`'s `upsertQuestionFromProjection` / `appendQuestionMessageFromProjection` /
 * `appendDeliveryEventFromProjection`) with direct transactional writes to `public.support_questions` /
 * `public.support_question_messages` / `public.support_delivery_events`, mirroring those webapp
 * consumers' column/semantics, with the SAME REQUIRED DEPARTURE D3 documented for conversations:
 *
 * ORGANIZATION_ID FIX (same bug class as D3, different tables). Neither `upsertQuestionFromProjection`'s
 * INSERT column list nor `appendQuestionMessageFromProjection`'s two insert branches ever included
 * `organization_id` (grep-confirmed against `apps/webapp/src/infra/repos/pgSupportCommunication.ts`) —
 * even though `public.support_questions` / `public.support_question_messages` gained an
 * `organization_id` column (migration `0151_p0_4_p6_support_comms_org.sql`) with a FORCE RLS policy
 * (`saas_org_dormant_p0_8_3` / `_p0_8_4`) that requires `organization_id = app.current_org_id()` for a
 * staff read. Every bot-originated question would silently land with `organization_id IS NULL`,
 * INVISIBLE to any org-scoped staff read (only the patient-ownership RLS branch, keyed off the parent
 * conversation's `platform_user_id`, could ever see it). D4 resolves `organization_id` from the ALREADY
 * direct-written parent `support_conversations` row (D3's `openSupportConversationDirect` — every
 * question is created together with, and after, its conversation in the same write batch; see
 * `executeAction.ts`'s `question.create` push, which always follows `conversation.open` /
 * `conversation.message.add` in the same `writes` array executed sequentially by `persistWrites`) and
 * writes it, instead of perpetuating the gap. No independent platform-user/org RESOLUTION (D1/D2's
 * `resolvePlatformUserIdForActor` / `resolveExactActiveOrganizationId`) is needed here — the question
 * domain is conversation-scoped by construction, so reusing the parent conversation's already-resolved
 * organization_id is both simpler and strictly more precise than re-deriving it independently.
 *
 * TENANT MISMATCH DENIED (WORK_ORDER D4, explicit). The `organization_id` value written here is
 * whatever the parent `support_conversations` row (or, for delivery events, the caller-supplied
 * already-principal-scoped value — see `appendSupportDeliveryEventDirect` below) resolved to; Postgres
 * RLS's `WITH CHECK` on these FORCE-RLS tables independently re-verifies that value against the LOCKED
 * runtime principal (`app.current_org_id()`, set for the whole webhook/worker request by
 * `runWithOrganizationPrincipal` — see `telegram/webhook.ts` / `max/webhook.ts` /
 * `outgoingDeliveryWorker.ts`) before allowing the write. A mismatch is denied by the database itself
 * (42501), not by application logic re-implementing the same check — the same defense-in-depth shape D3
 * relies on for conversations.
 *
 * DURABILITY (mirrors D3's post-merge audit fix — see `writeSupportConversationsDirect.ts` header
 * "DURABILITY" for the full rationale). `writePort.ts` treats exactly two error buckets differently:
 *   1. LEGITIMATELY FAIL-CLOSED, no retry, no fallback, no operator incident: `conversation_id_required`
 *      (question.create with no parent conversation id — nothing to resolve organization_id from; the
 *      current only caller, `executeAction.ts`, always supplies one, so this is defensive) and the
 *      delivery-attempt case where the caller-supplied `organizationId` is absent (mirrors the retired
 *      webapp consumer's OWN non-retryable rejection — `support.delivery.attempt.logged` returns
 *      `{ accepted: false, retryable: false }` when `organizationId` is missing — so skipping the
 *      direct write AND the outbox enqueue here changes nothing about the eventual outcome, it just
 *      avoids queuing a write the consumer would reject anyway).
 *   2. EVERYTHING ELSE, including `SupportQuestionsDirectWriteError('conversation_not_found' |
 *      'question_not_found')` (parent row not yet visible — e.g. its own direct write is still pending
 *      in ITS OWN fallback) and any unexpected/transient DB error: falls back to the durable outbox
 *      durable direct-write retry queue. Both the direct-write statements here (`ON CONFLICT` by natural
 *      key) and the retry worker are idempotent on the same natural keys, so replay converges, never
 *      duplicates.
 *
 * NOT MIRRORED (deliberate simplification, same reasoning as D3): `appendQuestionMessageFromProjection`'s
 * retired stub-insert-a-question-if-missing fallback (which never set `organization_id`, recreating the
 * same NULL-org gap this module fixes) is NOT reproduced here. `appendSupportQuestionMessageDirect`
 * throws `question_not_found` instead, which `writePort.ts` routes to durable direct-write retry; this
 * module's PRIMARY path never re-creates an orgless row.
 *
 * CHOKEPOINT: injected `DbPort`; writes run on the tx-bound connection inside `db.tx(...)`. Raw SQL is
 * allowed here (src/infra/db repo).
 */
import { sql } from 'drizzle-orm';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { runIntegratorSql } from '../runIntegratorSql.js';

function trimmedOrNull(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

export type SupportQuestionsWriteFailureCode =
  | 'conversation_id_required'
  | 'conversation_not_found'
  | 'question_not_found';

/**
 * `conversation_id_required` is a genuine fail-closed (no row, ever, no retry — see module header
 * "DURABILITY" bucket 1). `conversation_not_found` / `question_not_found` are NOT "fail-closed, swallow
 * silently" signals (unlike that bucket) — they mean the parent row is not yet visible, which is exactly
 * the condition `writePort.ts` routes to the durable outbox fallback (bucket 2). Callers must NOT swallow
 * those two codes.
 */
export class SupportQuestionsDirectWriteError extends Error {
  readonly code: SupportQuestionsWriteFailureCode;

  readonly details: Record<string, unknown>;

  constructor(code: SupportQuestionsWriteFailureCode, details: Record<string, unknown> = {}) {
    super(code);
    this.name = 'SupportQuestionsDirectWriteError';
    this.code = code;
    this.details = details;
  }
}

export type CreateSupportQuestionDirectInput = {
  integratorQuestionId: string;
  integratorConversationId: string | null;
  status: string;
  createdAt: string;
  answeredAt?: string | null;
};

export type CreateSupportQuestionDirectResult = {
  id: string;
  conversationId: string;
  organizationId: string;
};

/** D4 entrypoint replacing the `support.question.created` HTTP projection. */
export async function createSupportQuestionDirect(
  db: DbPort,
  input: CreateSupportQuestionDirectInput,
): Promise<CreateSupportQuestionDirectResult> {
  const integratorConversationId = trimmedOrNull(input.integratorConversationId);
  if (!integratorConversationId) {
    throw new SupportQuestionsDirectWriteError('conversation_id_required', {
      integratorQuestionId: input.integratorQuestionId,
    });
  }

  return db.tx(async (txDb) => {
    const convRes = await runIntegratorSql<{ id: string; organization_id: string | null }>(
      txDb,
      sql`SELECT id::text AS id, organization_id::text AS organization_id
       FROM public.support_conversations
       WHERE integrator_conversation_id = ${integratorConversationId}`,
    );
    const conv = convRes.rows[0];
    if (!conv || !conv.organization_id) {
      throw new SupportQuestionsDirectWriteError('conversation_not_found', {
        integratorQuestionId: input.integratorQuestionId,
        integratorConversationId,
      });
    }

    const res = await runIntegratorSql<{ id: string }>(
      txDb,
      sql`INSERT INTO public.support_questions (
         integrator_question_id, conversation_id, organization_id, status, created_at, answered_at
       ) VALUES (${input.integratorQuestionId}, ${conv.id}::uuid, ${conv.organization_id}::uuid, ${input.status}, ${input.createdAt}::timestamptz, ${input.answeredAt ?? null}::timestamptz)
       ON CONFLICT (integrator_question_id) DO UPDATE SET
         conversation_id = COALESCE(support_questions.conversation_id, EXCLUDED.conversation_id),
         organization_id = COALESCE(support_questions.organization_id, EXCLUDED.organization_id),
         status = EXCLUDED.status,
         answered_at = COALESCE(EXCLUDED.answered_at, support_questions.answered_at),
         updated_at = now()
       RETURNING id::text AS id`,
    );
    const id = res.rows[0]?.id;
    if (!id) throw new Error('support_questions insert returned no id');
    return { id, conversationId: conv.id, organizationId: conv.organization_id };
  });
}

export type AppendSupportQuestionMessageDirectInput = {
  integratorQuestionMessageId: string;
  integratorQuestionId: string;
  senderRole: string;
  text: string;
  createdAt: string;
};

export type AppendSupportQuestionMessageDirectResult = {
  id: string;
  questionId: string;
  organizationId: string;
};

/** D4 entrypoint replacing the `support.question.message.appended` HTTP projection. */
export async function appendSupportQuestionMessageDirect(
  db: DbPort,
  input: AppendSupportQuestionMessageDirectInput,
): Promise<AppendSupportQuestionMessageDirectResult> {
  return db.tx(async (txDb) => {
    const qRes = await runIntegratorSql<{ id: string; organization_id: string | null }>(
      txDb,
      sql`SELECT id::text AS id, organization_id::text AS organization_id
       FROM public.support_questions
       WHERE integrator_question_id = ${input.integratorQuestionId}`,
    );
    const question = qRes.rows[0];
    if (!question || !question.organization_id) {
      throw new SupportQuestionsDirectWriteError('question_not_found', {
        integratorQuestionMessageId: input.integratorQuestionMessageId,
        integratorQuestionId: input.integratorQuestionId,
      });
    }

    const res = await runIntegratorSql<{ id: string }>(
      txDb,
      sql`INSERT INTO public.support_question_messages (
         integrator_question_message_id, question_id, organization_id, sender_role, text, created_at
       ) VALUES (${input.integratorQuestionMessageId}, ${question.id}::uuid, ${question.organization_id}::uuid, ${input.senderRole}, ${input.text}, ${input.createdAt}::timestamptz)
       ON CONFLICT (integrator_question_message_id) DO NOTHING
       RETURNING id::text AS id`,
    );
    return {
      id: res.rows[0]?.id ?? '',
      questionId: question.id,
      organizationId: question.organization_id,
    };
  });
}

export type MarkSupportQuestionAnsweredDirectInput = {
  integratorQuestionId: string;
  answeredAt: string;
};

export type MarkSupportQuestionAnsweredDirectResult = { updated: true };

/**
 * D4 entrypoint replacing the `support.question.answered` HTTP projection.
 *
 * Throws `SupportQuestionsDirectWriteError('question_not_found')` when the question row does not exist
 * yet — mirrors D3's `setSupportConversationStatusDirect` deliberately NOT reproducing the retired
 * `upsertQuestionFromProjection`'s "create the row if missing" fallback for an answer-only event (that
 * fallback would write `conversation_id: null` and no organization_id, the exact gap this module fixes).
 * The caller (`writePort.ts`) treats this thrown error as "needs the durable outbox fallback" — see this
 * module's header "DURABILITY".
 */
export async function markSupportQuestionAnsweredDirect(
  db: DbPort,
  input: MarkSupportQuestionAnsweredDirectInput,
): Promise<MarkSupportQuestionAnsweredDirectResult> {
  return db.tx(async (txDb) => {
    const res = await runIntegratorSql(
      txDb,
      sql`UPDATE public.support_questions SET
         status = 'answered',
         answered_at = ${input.answeredAt}::timestamptz,
         updated_at = now()
       WHERE integrator_question_id = ${input.integratorQuestionId}`,
    );
    const updated = (res.rowCount ?? res.rows.length ?? 0) > 0;
    if (!updated) {
      throw new SupportQuestionsDirectWriteError('question_not_found', {
        integratorQuestionId: input.integratorQuestionId,
      });
    }
    return { updated: true };
  });
}

export type AppendSupportDeliveryEventDirectInput = {
  organizationId: string;
  conversationMessageId: string | null;
  integratorIntentEventId: string | null;
  correlationId: string | null;
  channelCode: string;
  status: string;
  attempt: number;
  reason: string | null;
  payloadJson: Record<string, unknown>;
  occurredAt: string;
};

export type AppendSupportDeliveryEventDirectResult = { id: string };

/**
 * D4 entrypoint replacing the `support.delivery.attempt.logged` HTTP projection.
 *
 * Unlike the question/conversation writes above, this one takes an ALREADY-RESOLVED `organizationId` —
 * the caller (`dispatchPort.ts`'s `logDeliveryAttempt`) reads it via
 * `getCurrentOrganizationPrincipalId()` (the runtime principal locked for the current send/webhook
 * request), the SAME value RLS's `WITH CHECK` re-verifies against (module header "TENANT MISMATCH
 * DENIED"). `writePort.ts` is responsible for NOT calling this function at all when `organizationId` is
 * absent (module header "DURABILITY" bucket 1) — mirroring the retired webapp consumer's own
 * non-retryable rejection of an org-less delivery event.
 */
export async function appendSupportDeliveryEventDirect(
  db: DbPort,
  input: AppendSupportDeliveryEventDirectInput,
): Promise<AppendSupportDeliveryEventDirectResult> {
  return db.tx(async (txDb) => {
    const payloadJson = JSON.stringify(input.payloadJson ?? {});
    const res = await runIntegratorSql<{ id: string }>(
      txDb,
      sql`INSERT INTO public.support_delivery_events (
         organization_id, conversation_message_id, integrator_intent_event_id, correlation_id,
         channel_code, status, attempt, reason, payload_json, occurred_at
       ) VALUES (${input.organizationId}::uuid, ${input.conversationMessageId}, ${input.integratorIntentEventId}, ${input.correlationId}, ${input.channelCode}, ${input.status}, ${input.attempt}, ${input.reason}, ${payloadJson}::jsonb, ${input.occurredAt}::timestamptz)
       ON CONFLICT (integrator_intent_event_id) WHERE integrator_intent_event_id IS NOT NULL
       DO NOTHING
       RETURNING id::text AS id`,
    );
    return { id: res.rows[0]?.id ?? '' };
  });
}
