/**
 * Track D — D3: support conversations + messages direct-public writes.
 *
 * Replaces the HTTP projection fanout (`support.conversation.opened` / `.message.appended` /
 * `.status.changed` → `webappEventsPort.emit()` → webapp `handleIntegratorEvent` →
 * `pgSupportCommunication.ts`'s `upsertConversationFromProjection` / `appendConversationMessageFromProjection`
 * / `setConversationStatusFromProjection`) with a direct transactional write to
 * `public.support_conversations` / `public.support_conversation_messages`, mirroring those webapp
 * consumers' column/semantics, with ONE REQUIRED DEPARTURE mandated by the same class of finding D2
 * documented for its domain:
 *
 * ORGANIZATION_ID FIX. None of the three retired HTTP consumers ever wrote `organization_id` on
 * `support_conversations` (grep-confirmed: neither `upsertConversationFromProjection`'s INSERT column
 * list, nor `appendConversationMessageFromProjection`'s stub-insert fallback, nor
 * `mergeLegacySupportConversationsForPlatformUser`'s canonical-row INSERT ever included it) — every
 * bot-originated (telegram/max) conversation would silently land with `organization_id IS NULL`,
 * invisible to any org-scoped admin read (`saas_org_dormant_p0_8_3` RLS policy requires
 * `organization_id = app.current_org_id()`, which excludes NULL). D3 resolves the ACTUAL canonical
 * `public.platform_users.id` (`resolvePlatformUserIdForActor`) and the exact single active
 * `org_enrollments` row (`resolveExactActiveOrganizationId` — NO
 * default-org fallback) and writes both, instead of perpetuating the gap. When resolution is
 * ambiguous/absent the write fails closed (no row), matching the previous fire-and-forget path's
 * observable effect (no visible admin row) without inventing a default-org guess.
 *
 * INTEGRATOR-LOCAL STATE RETAINED, WRITTEN IN A SEPARATE TX. `integrator.conversations` /
 * `integrator.conversation_messages` — the channel-identity-scoped thread bookkeeping
 * `writePort.ts`'s `insertConversation` / `insertConversationMessage` / `setConversationState` already
 * maintain — are UNCHANGED and keep writing in their own transaction exactly as before: integrator-only
 * state (messenger admin-forward bookkeeping), not a duplicate business projection, explicitly retained
 * per WORK_ORDER §Track D framing. This module's functions run in a SEPARATE transaction that
 * `writePort.ts` calls AFTER the integrator-local transaction has already committed, so a public-side
 * failure never blocks or rolls back the integrator-local conversation the user-facing admin-forward
 * flow depends on.
 *
 * DURABILITY (adversarial-audit fix, post-merge): a direct write here is the PRIMARY path, but it is
 * NOT the only path — `writePort.ts` treats exactly two error buckets differently:
 *   1. LEGITIMATELY FAIL-CLOSED (`isDirectPublicActorResolutionFailClosedError` /
 *      `isIdentityMergeAmbiguityError`
 *      machinery reused unchanged: platform-user candidate unresolved/ambiguous, org enrollment
 *      unresolved/ambiguous). This is a genuine "we do not know whose conversation this is" outcome —
 *      no row is written, ever, by design, matching the shared no-default-org philosophy. No retry, no
 *      alert: retrying would not change an ambiguous/absent identity.
 *   2. EVERYTHING ELSE, including `SupportConversationsDirectWriteError('conversation_not_found')`
 *      (thrown by `appendSupportConversationMessageDirect` / `setSupportConversationStatusDirect` when
 *      their parent conversation row is not yet visible — e.g. because `conversation.open`'s OWN direct
 *      write is still pending in the fallback below) and any unexpected/transient DB error. `writePort.ts`
 *      falls back to `enqueueProjectionEvent` — the SAME durable outbox the retired HTTP projection used
 *      — for the equivalent `support.conversation.opened` / `.message.appended` / `.status.changed`
 *      event, so the still-present webapp consumer (`pgSupportCommunication.ts`) reconciles it via the
 *      outbox worker's at-least-once retry. This restores the durability property the direct write would
 *      otherwise regress (a transient failure must not silently and permanently drop a patient's support
 *      message). Both the direct-write INSERT/UPDATE statements above (`ON CONFLICT` by
 *      `integrator_conversation_id` / `integrator_message_id`) and the webapp consumer they fall back to
 *      are idempotent on the SAME natural keys, so a fallback replay — including one that races with, or
 *      follows, a direct write that actually DID succeed — converges to the same row, never duplicates.
 *
 * NOT MIRRORED (deliberate simplification, out of D3's bounded scope): the retired
 * `appendConversationMessageFromProjection`'s opportunistic `platform_user_id` healing UPDATE (backfills
 * a NULL `platform_user_id` from `user_channel_bindings` on message append) and its
 * `mergeLegacySupportConversationsForPlatformUser` call (webapp-side collapsing of legacy
 * `webapp:platform:{id}` duplicate threads) are webapp-side remediations for conversations that were
 * created WITHOUT a resolved platform user / organization. D3's `openSupportConversationDirect` always
 * resolves both up front (or fails closed, writing no row at all), so there is no NULL-platform-user
 * row left for a later message to heal on the PRIMARY path. The fallback path (above) can still reach
 * that legacy healing logic — it runs the retired webapp consumer unchanged — which is a deliberate
 * degraded-but-safe outcome for the rare fallback case, not a gap in this module.
 *
 * CHOKEPOINT: injected `DbPort`; writes run on the tx-bound connection inside `db.tx(...)`. Raw SQL is
 * allowed here (src/infra/db repo).
 */
import { sql } from 'drizzle-orm';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { runIntegratorSql } from '../runIntegratorSql.js';
import type {
  DirectPublicActorInput,
  DirectPublicActorResolveDeps,
} from './resolveDirectPublicActor.js';
import {
  resolveExactActiveOrganizationId,
  resolvePlatformUserIdForActor,
} from './resolveDirectPublicActor.js';

function trimmedOrNull(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

export type SupportConversationsWriteFailureCode = 'conversation_not_found';

/**
 * NOT a "fail-closed, swallow silently" signal — `conversation_not_found`
 * means the parent conversation row is not yet visible, which is exactly the condition `writePort.ts`
 * routes to the durable outbox fallback (see module header "DURABILITY"). Callers must NOT swallow this.
 */
export class SupportConversationsDirectWriteError extends Error {
  readonly code: SupportConversationsWriteFailureCode;

  readonly details: Record<string, unknown>;

  constructor(code: SupportConversationsWriteFailureCode, details: Record<string, unknown> = {}) {
    super(code);
    this.name = 'SupportConversationsDirectWriteError';
    this.code = code;
    this.details = details;
  }
}

export type OpenSupportConversationDirectInput = DirectPublicActorInput & {
  integratorConversationId: string;
  source: string;
  adminScope: string;
  status: string;
  openedAt: string;
  lastMessageAt: string;
};

export type OpenSupportConversationDirectResult = {
  id: string;
  platformUserId: string;
  organizationId: string;
};

/** D3 entrypoint replacing the `support.conversation.opened` HTTP projection. */
export async function openSupportConversationDirect(
  db: DbPort,
  input: OpenSupportConversationDirectInput,
  deps: DirectPublicActorResolveDeps = {},
): Promise<OpenSupportConversationDirectResult> {
  return db.tx(async (txDb) => {
    const platformUserId = await resolvePlatformUserIdForActor(txDb, input, deps);
    const organizationId = await resolveExactActiveOrganizationId(txDb, platformUserId);

    const res = await runIntegratorSql<{ id: string }>(
      txDb,
      sql`INSERT INTO public.support_conversations (
         integrator_conversation_id, platform_user_id, organization_id, source, admin_scope, status,
         opened_at, last_message_at, channel_code, channel_external_id
       ) VALUES (${input.integratorConversationId}, ${platformUserId}::uuid, ${organizationId}::uuid, ${input.source}, ${input.adminScope}, ${input.status}, ${input.openedAt}::timestamptz, ${input.lastMessageAt}::timestamptz, ${input.channelCode}, ${input.externalId})
       ON CONFLICT (integrator_conversation_id) DO UPDATE SET
         platform_user_id = COALESCE(support_conversations.platform_user_id, EXCLUDED.platform_user_id),
         organization_id = COALESCE(support_conversations.organization_id, EXCLUDED.organization_id),
         status = EXCLUDED.status,
         last_message_at = GREATEST(support_conversations.last_message_at, EXCLUDED.last_message_at),
         updated_at = now()
       RETURNING id::text AS id`,
    );
    const id = res.rows[0]?.id;
    if (!id) throw new Error('support_conversations insert returned no id');
    return { id, platformUserId, organizationId };
  });
}

export type AppendSupportConversationMessageDirectInput = {
  integratorConversationId: string;
  integratorMessageId: string;
  senderRole: string;
  messageType?: string | null;
  text: string;
  source: string;
  externalChatId?: string | null;
  externalMessageId?: string | null;
  createdAt: string;
};

export type AppendSupportConversationMessageDirectResult = {
  id: string;
  conversationId: string;
  organizationId: string;
};

/** D3 entrypoint replacing the `support.conversation.message.appended` HTTP projection. */
export async function appendSupportConversationMessageDirect(
  db: DbPort,
  input: AppendSupportConversationMessageDirectInput,
): Promise<AppendSupportConversationMessageDirectResult> {
  const messageType = trimmedOrNull(input.messageType ?? null) ?? 'text';

  return db.tx(async (txDb) => {
    const convRes = await runIntegratorSql<{ id: string; organization_id: string | null }>(
      txDb,
      sql`SELECT id::text AS id, organization_id::text AS organization_id
       FROM public.support_conversations
       WHERE integrator_conversation_id = ${input.integratorConversationId}`,
    );
    const conv = convRes.rows[0];
    if (!conv || !conv.organization_id) {
      throw new SupportConversationsDirectWriteError('conversation_not_found', {
        integratorConversationId: input.integratorConversationId,
      });
    }

    const res = await runIntegratorSql<{ id: string }>(
      txDb,
      sql`INSERT INTO public.support_conversation_messages (
         integrator_message_id, conversation_id, organization_id, sender_role, message_type, text, source,
         external_chat_id, external_message_id, created_at
       ) VALUES (${input.integratorMessageId}, ${conv.id}::uuid, ${conv.organization_id}::uuid, ${input.senderRole}, ${messageType}, ${input.text}, ${input.source}, ${input.externalChatId ?? null}, ${input.externalMessageId ?? null}, ${input.createdAt}::timestamptz)
       ON CONFLICT (integrator_message_id) DO UPDATE SET conversation_id = EXCLUDED.conversation_id
       RETURNING id::text AS id`,
    );
    const messageId = res.rows[0]?.id;
    if (!messageId) throw new Error('support_conversation_messages insert returned no id');

    await runIntegratorSql(
      txDb,
      sql`UPDATE public.support_conversations
       SET last_message_at = GREATEST(last_message_at, ${input.createdAt}::timestamptz), updated_at = now()
       WHERE id = ${conv.id}::uuid`,
    );

    return { id: messageId, conversationId: conv.id, organizationId: conv.organization_id };
  });
}

export type SetSupportConversationStatusDirectInput = {
  integratorConversationId: string;
  status: string;
  lastMessageAt?: string | null;
  closedAt?: string | null;
  closeReason?: string | null;
};

export type SetSupportConversationStatusDirectResult = { updated: true };

/**
 * D3 entrypoint replacing the `support.conversation.status.changed` HTTP projection.
 *
 * Throws `SupportConversationsDirectWriteError('conversation_not_found')` when the conversation row
 * does not exist yet — deliberately NOT mirroring the retired projection's insert-a-stub-row-on-0-rowcount
 * fallback (that stub never set `organization_id`, recreating the exact NULL-org gap D3 fixes). The
 * caller (`writePort.ts`) treats this thrown error as "needs the durable outbox fallback", not as a
 * silent no-op — see this module's header "DURABILITY".
 */
export async function setSupportConversationStatusDirect(
  db: DbPort,
  input: SetSupportConversationStatusDirectInput,
): Promise<SetSupportConversationStatusDirectResult> {
  return db.tx(async (txDb) => {
    const res = await runIntegratorSql(
      txDb,
      sql`UPDATE public.support_conversations SET
         status = ${input.status},
         last_message_at = COALESCE(${input.lastMessageAt ?? null}::timestamptz, last_message_at),
         closed_at = COALESCE(${input.closedAt ?? null}::timestamptz, closed_at),
         close_reason = COALESCE(${input.closeReason ?? null}, close_reason),
         updated_at = now()
       WHERE integrator_conversation_id = ${input.integratorConversationId}`,
    );
    const updated = (res.rowCount ?? res.rows.length ?? 0) > 0;
    if (!updated) {
      throw new SupportConversationsDirectWriteError('conversation_not_found', {
        integratorConversationId: input.integratorConversationId,
      });
    }
    return { updated: true };
  });
}
