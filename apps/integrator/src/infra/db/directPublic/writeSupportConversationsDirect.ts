/* eslint-disable no-secrets/no-secrets -- table tags, failure-code identifiers, not secrets */
/**
 * Track D — D3: support conversations + messages direct-public writes (identity/preferences precedent:
 * D1's `writeIdentityAndPreferencesDirect.ts`; diary/LFK precedent: D2's `writeDiaryLfkDirect.ts`).
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
 * `public.platform_users.id` (D1/D2's `resolvePlatformUserIdForActor`, reused unchanged) and the exact
 * single active `org_enrollments` row (D2's `resolveExactActiveOrganizationId`, reused unchanged — NO
 * default-org fallback) and writes both, instead of perpetuating the gap. When resolution is
 * ambiguous/absent the write fails closed (no row), matching the previous fire-and-forget path's
 * observable effect (no visible admin row) without inventing a default-org guess.
 *
 * INTEGRATOR-LOCAL STATE RETAINED, WRITTEN IN A SEPARATE TX. `integrator.conversations` /
 * `integrator.conversation_messages` — the channel-identity-scoped thread bookkeeping
 * `writePort.ts`'s `insertConversation` / `insertConversationMessage` / `setConversationState` already
 * maintain — are UNCHANGED and keep writing in their own transaction exactly as before: integrator-only
 * state (messenger admin-forward bookkeeping), not a duplicate business projection, explicitly retained
 * per WORK_ORDER §Track D framing. This module's functions run in a SEPARATE, best-effort transaction
 * that `writePort.ts` calls AFTER the integrator-local transaction has already committed, so a
 * public-side fail-closed outcome (unresolved org/platform-user; RLS denial under a bootstrap principal
 * with no organization context yet) never blocks or rolls back the integrator-local conversation the
 * user-facing admin-forward flow depends on — the same non-blocking relationship the removed HTTP
 * projection had (fire-and-forget via the outbox worker, never awaited by the request path). Unlike
 * D1/D2 (where an unexpected error is rethrown because the direct write is the SOLE effect of that
 * mutation), `writePort.ts` swallows ALL errors from these calls, not just the classified fail-closed
 * ones — deliberately, to preserve that exact non-blocking property for a write that now runs after
 * another write has already committed.
 *
 * NOT MIRRORED (deliberate simplification, out of D3's bounded scope): the retired
 * `appendConversationMessageFromProjection`'s opportunistic `platform_user_id` healing UPDATE (backfills
 * a NULL `platform_user_id` from `user_channel_bindings` on message append) and its
 * `mergeLegacySupportConversationsForPlatformUser` call (webapp-side collapsing of legacy
 * `webapp:platform:{id}` duplicate threads) are webapp-side remediations for conversations that were
 * created WITHOUT a resolved platform user / organization. D3's `openSupportConversationDirect` always
 * resolves both up front (or fails closed, writing no row at all), so there is no NULL-platform-user
 * row left for a later message to heal. Backfilling pre-existing legacy rows is a one-time data-cleanup
 * concern (WORK_ORDER Track D "table-cleanup deferred until UI works" boundary), not an ongoing
 * per-write concern of this module.
 *
 * CHOKEPOINT: injected `DbPort`; writes run on the tx-bound connection inside `db.tx(...)`. Raw SQL is
 * allowed here (src/infra/db repo, see scripts/check-db-chokepoint.mjs).
 */
import type { DbPort } from '../../../kernel/contracts/index.js';
import type { DiaryLfkActorInput, DiaryLfkResolveDeps } from './writeDiaryLfkDirect.js';
import {
  isDiaryLfkFailClosedError,
  resolveExactActiveOrganizationId,
  resolvePlatformUserIdForActor,
} from './writeDiaryLfkDirect.js';

function trimmedOrNull(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

export type SupportConversationsWriteFailureCode = 'conversation_not_found';

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

/**
 * True when `err` is a fail-closed condition (platform-user unresolved/ambiguous — D1/D2 machinery
 * reuse — org resolution failure, or "conversation row not found" for a message/status write whose
 * `conversation.open` counterpart never resolved) that callers should log-and-swallow (no write, no
 * crash).
 */
export function isSupportConversationsFailClosedError(err: unknown): boolean {
  if (err instanceof SupportConversationsDirectWriteError) return true;
  return isDiaryLfkFailClosedError(err);
}

export type OpenSupportConversationDirectInput = DiaryLfkActorInput & {
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
  deps: DiaryLfkResolveDeps = {},
): Promise<OpenSupportConversationDirectResult> {
  return db.tx(async (txDb) => {
    const platformUserId = await resolvePlatformUserIdForActor(txDb, input, deps);
    const organizationId = await resolveExactActiveOrganizationId(txDb, platformUserId);

    const res = await txDb.query<{ id: string }>(
      `INSERT INTO public.support_conversations (
         integrator_conversation_id, platform_user_id, organization_id, source, admin_scope, status,
         opened_at, last_message_at, channel_code, channel_external_id
       ) VALUES ($1, $2::uuid, $3::uuid, $4, $5, $6, $7::timestamptz, $8::timestamptz, $9, $10)
       ON CONFLICT (integrator_conversation_id) DO UPDATE SET
         platform_user_id = COALESCE(support_conversations.platform_user_id, EXCLUDED.platform_user_id),
         organization_id = COALESCE(support_conversations.organization_id, EXCLUDED.organization_id),
         status = EXCLUDED.status,
         last_message_at = GREATEST(support_conversations.last_message_at, EXCLUDED.last_message_at),
         updated_at = now()
       RETURNING id::text AS id`,
      [
        input.integratorConversationId,
        platformUserId,
        organizationId,
        input.source,
        input.adminScope,
        input.status,
        input.openedAt,
        input.lastMessageAt,
        input.channelCode,
        input.externalId,
      ],
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
    const convRes = await txDb.query<{ id: string; organization_id: string | null }>(
      `SELECT id::text AS id, organization_id::text AS organization_id
       FROM public.support_conversations
       WHERE integrator_conversation_id = $1`,
      [input.integratorConversationId],
    );
    const conv = convRes.rows[0];
    if (!conv || !conv.organization_id) {
      throw new SupportConversationsDirectWriteError('conversation_not_found', {
        integratorConversationId: input.integratorConversationId,
      });
    }

    const res = await txDb.query<{ id: string }>(
      `INSERT INTO public.support_conversation_messages (
         integrator_message_id, conversation_id, organization_id, sender_role, message_type, text, source,
         external_chat_id, external_message_id, created_at
       ) VALUES ($1, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9, $10::timestamptz)
       ON CONFLICT (integrator_message_id) DO UPDATE SET conversation_id = EXCLUDED.conversation_id
       RETURNING id::text AS id`,
      [
        input.integratorMessageId,
        conv.id,
        conv.organization_id,
        input.senderRole,
        messageType,
        input.text,
        input.source,
        input.externalChatId ?? null,
        input.externalMessageId ?? null,
        input.createdAt,
      ],
    );
    const messageId = res.rows[0]?.id;
    if (!messageId) throw new Error('support_conversation_messages insert returned no id');

    await txDb.query(
      `UPDATE public.support_conversations
       SET last_message_at = GREATEST(last_message_at, $2::timestamptz), updated_at = now()
       WHERE id = $1::uuid`,
      [conv.id, input.createdAt],
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

export type SetSupportConversationStatusDirectResult = { updated: boolean };

/** D3 entrypoint replacing the `support.conversation.status.changed` HTTP projection. */
export async function setSupportConversationStatusDirect(
  db: DbPort,
  input: SetSupportConversationStatusDirectInput,
): Promise<SetSupportConversationStatusDirectResult> {
  return db.tx(async (txDb) => {
    const res = await txDb.query(
      `UPDATE public.support_conversations SET
         status = $2,
         last_message_at = COALESCE($3::timestamptz, last_message_at),
         closed_at = COALESCE($4::timestamptz, closed_at),
         close_reason = COALESCE($5, close_reason),
         updated_at = now()
       WHERE integrator_conversation_id = $1`,
      [
        input.integratorConversationId,
        input.status,
        input.lastMessageAt ?? null,
        input.closedAt ?? null,
        input.closeReason ?? null,
      ],
    );
    return { updated: (res.rowCount ?? res.rows.length ?? 0) > 0 };
  });
}
