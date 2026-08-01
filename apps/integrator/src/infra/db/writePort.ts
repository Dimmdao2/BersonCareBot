import type {
  DbPort,
  DispatchPort,
  DbWriteDbResult,
  DbWriteMutation,
  DbWriteMutationType,
  DbWritePort,
  WebappEventsPort,
} from '../../kernel/contracts/index.js';
import { sql } from 'drizzle-orm';
import { getCurrentDbPrincipalOrganizationId } from '@bersoncare/db-principal';
import { createDbPort } from './client.js';
import { runIntegratorSql } from './runIntegratorSql.js';
import { setUserPhone, setUserState, upsertUser } from './repos/channelUsers.js';
import { appendMessageLog, insertDeliveryAttemptLog } from './repos/messageLogs.js';
import {
  applyMessengerPhonePublicBind,
  MessengerPhoneLinkError,
} from './repos/messengerPhonePublicBind.js';
import { recordMessengerPhoneBindBlocked } from './repos/messengerPhoneBindAudit.js';
import {
  cancelDraftByIdentity,
  ensureIdentityForMessenger,
  insertConversation,
  insertConversationMessage,
  setConversationState,
  upsertDraftByIdentity,
  insertUserQuestion,
  insertQuestionMessage,
  setQuestionAnswered,
} from './repos/messageThreads.js';
import { enqueueMessageRetryJob } from './repos/jobQueue.js';
import {
  createContentAccessGrant,
  getReminderOccurrenceContextForProjection,
  insertReminderDeliveryLog,
  markReminderOccurrenceFailed,
  markReminderOccurrenceQueued,
  markReminderOccurrenceSent,
  expireOrphanedPendingReminderOccurrences,
  markReminderOccurrenceSkippedLocal,
  rescheduleReminderOccurrencePlanned,
  cancelPendingReminderOccurrencesForRule,
  upsertReminderOccurrencePlanned,
  upsertReminderRule,
} from './repos/reminders.js';
import type { FinalizedReminderOccurrenceProjectionContext } from './repos/reminders.js';
import { buildReminderRuleUpsertKeyPayload } from './repos/projectionOutboxMergePolicy.js';
import { getOperationalVerboseLogEnabled } from './repos/operationalVerboseLog.js';
import {
  REMINDER_RULE_UPSERTED,
  REMINDER_OCCURRENCE_FINALIZED,
  REMINDER_DELIVERY_LOGGED,
  CONTENT_ACCESS_GRANTED,
} from '../../kernel/contracts/index.js';
import type { ProjectionFanoutInput } from './repos/projectionFanout.js';
import { tryEmitWebappProjectionThenEnqueue } from './repos/projectionFanout.js';
import {
  projectionIdempotencyKey,
  hashPayload,
  hashPayloadExcludingKeys,
} from './repos/projectionKeys.js';
import {
  resolveCanonicalIntegratorUserId,
  resolveCanonicalUserIdFromIdentityId,
} from './repos/canonicalUserId.js';
import { logger } from '../observability/logger.js';
import { isAuthChannelEnabled as readAuthChannelPolicy } from './authChannelPolicy.js';
import {
  writeIdentityAndPreferencesDirect,
  DirectPublicWriteError,
  type ChannelAnchorResult,
  type DirectPublicChannelCode,
  type DirectPublicIdentityInput,
} from './directPublic/writeIdentityAndPreferencesDirect.js';
import {
  mergeCandidateIdsViaPlatformMerge,
  isIdentityMergeAmbiguityError,
} from './directPublic/mergeCandidatesDirect.js';
import { isDirectPublicActorResolutionFailClosedError } from './directPublic/resolveDirectPublicActor.js';
import {
  appendSupportConversationMessageDirect,
  openSupportConversationDirect,
  setSupportConversationStatusDirect,
  SupportConversationsDirectWriteError,
} from './directPublic/writeSupportConversationsDirect.js';
import {
  appendSupportDeliveryEventDirect,
  appendSupportQuestionMessageDirect,
  createSupportQuestionDirect,
  markSupportQuestionAnsweredDirect,
  SupportQuestionsDirectWriteError,
} from './directPublic/writeSupportQuestionsDirect.js';
import { upsertReminderRuleDirect } from './directPublic/writeReminderRulesDirect.js';
import { enqueueProjectionEvent } from './repos/projectionOutbox.js';
import { recordOperatorFailureIncident } from '../operatorIncident/reportOperatorFailure.js';
import { runWithOrganizationPrincipal } from '../principal/organizationPrincipal.js';
import { executeCanonicalWriteOrLegacy } from '../adapters/supportCanonicalWriteHandoff.js';

/**
 * Re-verified 2026-07-25 by independent audit against the REAL "integrator" principal shape
 * (`runWithIntegratorPrincipal`, telegram/webhook.ts): every D3-D5 direct-public write below targets a
 * `public.*` table whose FORCE RLS policy is `(is_staff() AND organization_id = current_org_id()) OR
 * (current_patient_user_id() IS NOT NULL AND platform_user_id = current_patient_user_id())`
 * (`saas_org_dormant_p0_8_3`). The "integrator" principal locks the `app_patient` runtime role with
 * `organization_id` SET but `patient_user_id` NULL — `is_staff()` is false (app_patient is not a member
 * of app_staff) and the patient branch is null, so BOTH branches fail: every direct write AND every
 * internal org-resolution SELECT (e.g. `org_enrollments`) is RLS-denied for a normal telegram/max
 * message from an already-known user — the common case, since `runWithIntegratorPrincipal` wraps the
 * WHOLE event pipeline whenever webhook pre-routing already resolved both `organizationId` and
 * `integratorUserId`. This silently degraded every one of these writes to "always falls back to the
 * durable outbox + fires an operator incident" (D3/D4/D5).
 *
 * Fix (mirrors `persistWritesByOrganization` in handlers/reminders.ts, the ALREADY-correct pattern used
 * by `reminders.planDue`/`.dispatchDue`): re-install an EXPLICIT organization principal — `SET ROLE
 * app_staff` + the SAME organization id already ambiently known — for the duration of the direct write,
 * satisfying `is_staff() AND organization_id = current_org_id()`. No new organization is invented or
 * guessed: this reuses whatever `organizationId` the CURRENT principal (integrator, organization, or
 * staff) already carries — the same org webhook pre-routing already scoped this whole event to. When no
 * organization id is ambiently known at all (bootstrap/unresolved-org paths), this is a no-op passthrough
 * — `fn` runs under whatever principal is already active, and its own resolver fails closed / throws as
 * before, routed by the caller to the existing fallback.
 */
function runDirectPublicWriteWithOrgPrincipal<T>(fn: () => Promise<T>): Promise<T> {
  const organizationId = getCurrentDbPrincipalOrganizationId();
  return organizationId ? runWithOrganizationPrincipal(organizationId, fn) : fn();
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNullableIntegerMinute(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  return null;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  const stringValue = asNonEmptyString(value);
  if (!stringValue) return null;
  const parsed = Number(stringValue);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function readChannelUserId(params: Record<string, unknown>): string | null {
  const raw = params.channelUserId ?? params.channelId;
  const asStr = asNonEmptyString(raw);
  if (asStr) return asStr;
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(Math.trunc(raw));
  return null;
}

function readResource(params: Record<string, unknown>): string {
  const r = asNonEmptyString(params.resource);
  return r ?? 'telegram';
}

/**
 * A1 — D1 channel-anchor hook for `writeIdentityAndPreferencesDirect`: writes the retained
 * integrator-only channel identity (telegram `upsertUser`, max `ensureIdentityForMessenger`) on the
 * SAME tx-bound `DbPort` the scaffold's public writes use, then resolves the canonical integrator user
 * id — exactly the same two steps `user.upsert` performed before D1 (see the removed inline logic this
 * replaces). Returns null (no anchor, no public write) for the same cases that used to silently `return`:
 * a non-numeric telegram external id, or a max identity that failed to resolve a `user_id`.
 */
function buildChannelAnchorWriter(
  /** Caller has already asserted `resource === 'telegram' || resource === 'max'` at the call site. */
  resource: string,
  externalId: string,
  username: string | null,
  firstName: string | null,
  lastName: string | null,
): (txDb: DbPort, input: DirectPublicIdentityInput) => Promise<ChannelAnchorResult | null> {
  return async (txDb: DbPort): Promise<ChannelAnchorResult | null> => {
    let integratorUserId: string | null;
    if (resource === 'telegram') {
      const parsedId = Number(externalId);
      if (!Number.isFinite(parsedId)) return null;
      const userPayload = {
        id: Math.trunc(parsedId),
        ...(username ? { username } : {}),
        ...(firstName ? { first_name: firstName } : {}),
        ...(lastName ? { last_name: lastName } : {}),
      };
      const row = await upsertUser(txDb, userPayload);
      integratorUserId = row?.id ?? null;
    } else {
      await ensureIdentityForMessenger(txDb, { resource: 'max', externalId });
      const identityRes = await runIntegratorSql<{ user_id: string }>(
        txDb,
        sql`SELECT user_id::text AS user_id FROM identities WHERE resource = ${resource} AND external_id = ${externalId} LIMIT 1`,
      );
      integratorUserId = identityRes.rows[0]?.user_id ?? null;
    }
    if (!integratorUserId) return null;
    const canonicalUserId = await resolveCanonicalIntegratorUserId(txDb, integratorUserId);
    return { integratorUserId: canonicalUserId };
  };
}

/** Last digits only — avoid logging full E.164 in clear text. */
function phoneLogSuffix(phoneNormalized: string): string {
  const d = phoneNormalized.replace(/\D/g, '');
  if (d.length <= 4) return '****';
  return d.slice(-4);
}

function pgSqlStateFromUnknown(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const code = (err as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

/**
 * Creates the default DbWritePort implementation used by eventGateway.
 * It maps canonical write mutations to existing infra repositories.
 */
export function createDbWritePort(
  input: {
    db?: DbPort;
    /** When set, projection events are POSTed to webapp immediately after commit; outbox only on failure. */
    webappEventsPort?: WebappEventsPort;
    /** Filled after `buildDeps` constructs `dispatchPort` (avoid circular init). */
    getDispatchPort?: () => DispatchPort | undefined;
    /** Injectable for deterministic tests; production reads canonical public.system_settings. */
    authChannelPolicy?: (channel: 'telegram' | 'max') => Promise<boolean>;
    /** Injectable boundary for the scheduler's orphan-expiry maintenance mutation. */
    expireOrphanedReminderOccurrences?: (
      db: DbPort,
      nowIso: string,
    ) => Promise<FinalizedReminderOccurrenceProjectionContext[]>;
  } = {},
): DbWritePort {
  const db = input.db ?? createDbPort();
  const webappEventsPort = input.webappEventsPort;
  const getDispatchPort = input.getDispatchPort;
  const authChannelPolicy =
    input.authChannelPolicy ??
    ((channel: 'telegram' | 'max') => readAuthChannelPolicy(db, channel));
  const expireOrphanedReminderOccurrences =
    input.expireOrphanedReminderOccurrences ?? expireOrphanedPendingReminderOccurrences;
  const plainMutationsRequiringPrincipalTx: ReadonlySet<DbWriteMutationType> = new Set([
    'event.log',
    'user.state.set',
    'draft.upsert',
    'draft.cancel',
    'identity.ensure',
    'conversation.mergeLegacyToPlatform',
    'reminders.occurrence.upsertPlanned',
    'reminders.occurrence.markQueued',
    'reminders.occurrence.reschedulePlanned',
    'reminders.occurrence.markSkippedLocal',
    'message.retry.enqueue',
  ]);

  async function fanoutProjectionsAfterTx(pending: ProjectionFanoutInput[]): Promise<void> {
    for (const ev of pending) {
      await tryEmitWebappProjectionThenEnqueue(db, webappEventsPort, ev);
    }
  }

  function createTxBoundWritePort(txDb: DbPort): DbWritePort {
    return createDbWritePort({
      db: txDb,
      ...(webappEventsPort !== undefined ? { webappEventsPort } : {}),
      ...(getDispatchPort !== undefined ? { getDispatchPort } : {}),
      authChannelPolicy,
      expireOrphanedReminderOccurrences,
    });
  }

  return {
    async writeDb(mutation: DbWriteMutation): Promise<void | DbWriteDbResult> {
      if (
        getCurrentDbPrincipalOrganizationId() !== undefined &&
        db.integratorDrizzle === undefined &&
        plainMutationsRequiringPrincipalTx.has(mutation.type)
      ) {
        return db.tx((txDb) => createTxBoundWritePort(txDb).writeDb(mutation));
      }

      switch (mutation.type) {
        case 'event.log': {
          await appendMessageLog(db, mutation);
          return;
        }
        case 'user.upsert': {
          const resource = readResource(mutation.params);
          if (resource !== 'telegram' && resource !== 'max') return;
          const externalId = asNonEmptyString(
            mutation.params.externalId ??
              mutation.params.channelUserId ??
              mutation.params.channelId,
          );
          const username = asNullableString(mutation.params.username);
          const firstName = asNullableString(mutation.params.firstName);
          const lastName = asNullableString(mutation.params.lastName);
          if (!externalId) return;
          // `readResource` returns a wide `string`; the guard above only proves it AT RUNTIME, TS does
          // not narrow a plain `string` from `!==` checks — re-derive a properly literal-typed value.
          const channelCode: DirectPublicChannelCode = resource === 'max' ? 'max' : 'telegram';
          // D1: ONE tx writes the retained channel anchor PLUS the canonical public.platform_users /
          // user_channel_bindings directly — replaces the `user.upserted` HTTP projection fanout.
          try {
            await writeIdentityAndPreferencesDirect(
              db,
              {
                channelCode,
                externalId,
                firstName,
                lastName,
                // Same displayName the removed projection payload used to send. The webapp enrich path
                // (pgUserProjection.ts:276-289) DOES overwrite an existing display_name when
                // displayName+firstName+lastName are all non-empty (structured triple wins); otherwise
                // it only fills a currently-empty display_name — see enrichPlatformUser for the parity SQL.
                displayName: [lastName, firstName].filter(Boolean).join(' ') || null,
              },
              {
                writeChannelAnchor: buildChannelAnchorWriter(
                  resource,
                  externalId,
                  username,
                  firstName,
                  lastName,
                ),
                mergeCandidateIds: mergeCandidateIdsViaPlatformMerge,
              },
            );
          } catch (err) {
            if (err instanceof DirectPublicWriteError && err.code === 'channel_anchor_unresolved') {
              // Parity: old code silently returned when the anchor couldn't resolve (non-numeric
              // telegram id / missing max identity) — no write, no error.
              return;
            }
            if (isIdentityMergeAmbiguityError(err)) {
              logger.warn(
                { err, mutationType: mutation.type, resource, externalId },
                'user.upsert: ambiguous identity merge deferred (no direct write)',
              );
              return;
            }
            throw err;
          }
          return;
        }
        case 'user.state.set': {
          const resource = readResource(mutation.params);
          if (resource !== 'telegram' && resource !== 'max') return;
          const channelUserId = readChannelUserId(mutation.params);
          if (!channelUserId) return;
          await setUserState(db, channelUserId, asNullableString(mutation.params.state), resource);
          return;
        }
        case 'user.phone.link': {
          const resource = readResource(mutation.params);
          const channelUserId = readChannelUserId(mutation.params);
          const phoneNormalized = asNonEmptyString(mutation.params.phoneNormalized);
          const bindLogBase = {
            event: 'messenger_phone_bind_tx' as const,
            bindOutcome: 'bind_tx_fail' as const,
            resource,
            channelCode: resource,
            ...(channelUserId ? { externalId: channelUserId } : {}),
            metric: 'messenger_bind_tx_fail' as const,
            ...(asNonEmptyString(mutation.params.correlationId)
              ? { correlationId: asNonEmptyString(mutation.params.correlationId) }
              : {}),
          };
          if (resource !== 'telegram' && resource !== 'max') {
            logger.warn({ ...bindLogBase, reason: 'unsupported_resource' }, 'bind_tx_fail');
            return { userPhoneLinkApplied: false, phoneLinkIndeterminate: true };
          }
          if (!channelUserId || !phoneNormalized) {
            logger.warn({ ...bindLogBase, reason: 'missing_input' }, 'bind_tx_fail');
            return { userPhoneLinkApplied: false, phoneLinkIndeterminate: true };
          }
          if (!(await authChannelPolicy(resource))) {
            logger.warn({ ...bindLogBase, reason: 'auth_channel_disabled' }, 'bind_tx_fail');
            return { userPhoneLinkApplied: false, phoneLinkReason: 'auth_channel_disabled' };
          }
          const phoneSuffix = phoneLogSuffix(phoneNormalized);
          try {
            let applied = false;
            let phoneLinkEarly: DbWriteDbResult | undefined;
            let platformUserIdForLog: string | undefined;
            await db.tx(async (txDb) => {
              if (resource === 'max') {
                await ensureIdentityForMessenger(txDb, {
                  resource: 'max',
                  externalId: channelUserId,
                });
              }
              const idPeek = await runIntegratorSql<{ user_id: string }>(
                txDb,
                sql`SELECT i.user_id::text AS user_id
                 FROM identities i
                 WHERE i.resource = ${resource} AND i.external_id = ${channelUserId}
                 LIMIT 1`,
              );
              const rawUid = idPeek.rows[0]?.user_id ?? null;
              if (!rawUid) {
                phoneLinkEarly = {
                  userPhoneLinkApplied: false,
                  phoneLinkReason: 'no_integrator_identity',
                };
                return;
              }
              const canonicalUid = await resolveCanonicalIntegratorUserId(txDb, rawUid);
              const { platformUserId } = await applyMessengerPhonePublicBind(txDb, {
                channelCode: resource,
                externalId: channelUserId,
                phoneNormalized,
                canonicalIntegratorUserId: canonicalUid,
              });
              platformUserIdForLog = platformUserId;
              const outcome = await setUserPhone(txDb, channelUserId, phoneNormalized, resource);
              if (outcome === 'failed') {
                throw new MessengerPhoneLinkError('db_transient_failure');
              }
              if (outcome === 'noop_conflict') {
                throw new MessengerPhoneLinkError('legacy_contacts_conflict');
              }
              applied = true;
            });
            if (phoneLinkEarly) {
              logger.warn(
                {
                  ...bindLogBase,
                  bindOutcome: 'bind_tx_fail',
                  reason: phoneLinkEarly.phoneLinkReason ?? 'no_integrator_identity',
                  phoneSuffix,
                },
                'bind_tx_fail',
              );
              return phoneLinkEarly;
            }
            logger.info(
              {
                event: 'messenger_phone_bind_tx',
                bindOutcome: 'bind_tx_ok',
                metric: 'messenger_bind_ok',
                resource,
                channelCode: resource,
                externalId: channelUserId,
                platformUserId: platformUserIdForLog,
                phoneSuffix,
                ...(asNonEmptyString(mutation.params.correlationId)
                  ? { correlationId: asNonEmptyString(mutation.params.correlationId) }
                  : {}),
              },
              'bind_tx_ok',
            );
            return { userPhoneLinkApplied: applied };
          } catch (err) {
            if (err instanceof MessengerPhoneLinkError) {
              const cause = (err as Error & { cause?: unknown }).cause;
              const sqlState = pgSqlStateFromUnknown(cause) ?? pgSqlStateFromUnknown(err);
              logger.warn(
                {
                  ...bindLogBase,
                  reason: err.code,
                  ...(sqlState ? { sqlState } : {}),
                  phoneSuffix,
                },
                'bind_tx_fail',
              );
              if (err.code !== 'db_transient_failure') {
                void recordMessengerPhoneBindBlocked({
                  db,
                  ...(getDispatchPort ? { getDispatchPort } : {}),
                  reason: err.code,
                  candidateIds: err.candidateIds,
                  details: {
                    channelCode: resource,
                    externalId: channelUserId,
                    phoneSuffix,
                    ...(asNonEmptyString(mutation.params.correlationId)
                      ? { correlationId: asNonEmptyString(mutation.params.correlationId) }
                      : {}),
                  },
                }).catch(() => {});
              }
              if (err.code === 'db_transient_failure') {
                return {
                  userPhoneLinkApplied: false,
                  phoneLinkIndeterminate: true,
                  phoneLinkReason: err.code,
                };
              }
              return { userPhoneLinkApplied: false, phoneLinkReason: err.code };
            }
            const sqlState = pgSqlStateFromUnknown(err);
            logger.error(
              { err, ...bindLogBase, ...(sqlState ? { sqlState } : {}), phoneSuffix },
              'user.phone.link: unexpected error',
            );
            logger.warn(
              {
                ...bindLogBase,
                reason: 'db_transient_failure',
                ...(sqlState ? { sqlState } : {}),
                phoneSuffix,
              },
              'bind_tx_fail',
            );
            return {
              userPhoneLinkApplied: false,
              phoneLinkIndeterminate: true,
              phoneLinkReason: 'db_transient_failure',
            };
          }
        }
        case 'draft.upsert': {
          const resource = readResource(mutation.params);
          const externalId =
            readChannelUserId(mutation.params) ?? asNonEmptyString(mutation.params.externalId);
          const source = asNonEmptyString(mutation.params.source) ?? resource;
          const id = asNonEmptyString(mutation.params.id);
          const draftTextCurrent = asNonEmptyString(mutation.params.draftTextCurrent);
          if (!resource || !externalId || !source || !id || !draftTextCurrent) return;
          const state = asNullableString(mutation.params.state);
          await upsertDraftByIdentity(db, {
            id,
            resource,
            externalId,
            source,
            ...(asNullableString(mutation.params.externalChatId) !== null
              ? { externalChatId: asNullableString(mutation.params.externalChatId) }
              : {}),
            ...(asNullableString(mutation.params.externalMessageId) !== null
              ? { externalMessageId: asNullableString(mutation.params.externalMessageId) }
              : {}),
            draftTextCurrent,
            ...(state ? { state } : {}),
          });
          return;
        }
        case 'draft.cancel': {
          const resource = readResource(mutation.params);
          const externalId =
            readChannelUserId(mutation.params) ?? asNonEmptyString(mutation.params.externalId);
          const source = asNonEmptyString(mutation.params.source);
          if (!resource || !externalId) return;
          await cancelDraftByIdentity(db, { resource, externalId, ...(source ? { source } : {}) });
          return;
        }
        case 'identity.ensure': {
          const resource = asNonEmptyString(mutation.params.resource);
          const externalId = asNonEmptyString(mutation.params.externalId);
          if (!resource || !externalId) return;
          await ensureIdentityForMessenger(db, { resource, externalId });
          return;
        }
        case 'conversation.mergeLegacyToPlatform': {
          const platformConversationId = asNonEmptyString(mutation.params.platformConversationId);
          const legacyConversationId = asNonEmptyString(mutation.params.legacyConversationId);
          const resource = readResource(mutation.params);
          const externalId =
            readChannelUserId(mutation.params) ?? asNonEmptyString(mutation.params.externalId);
          if (!platformConversationId || !legacyConversationId || !resource || !externalId) return;
          const { mergeIntegratorConversationToPlatformThread } =
            await import('./repos/mergeIntegratorConversationToPlatform.js');
          await mergeIntegratorConversationToPlatformThread(db, {
            platformConversationId,
            legacyConversationId,
            resource,
            externalId,
          });
          return;
        }
        case 'conversation.open': {
          const resource = readResource(mutation.params);
          const externalId =
            readChannelUserId(mutation.params) ?? asNonEmptyString(mutation.params.externalId);
          const source = asNonEmptyString(mutation.params.source) ?? resource;
          const id = asNonEmptyString(mutation.params.id);
          const adminScope = asNonEmptyString(mutation.params.adminScope) ?? 'default';
          const status = asNonEmptyString(mutation.params.status) ?? 'waiting_admin';
          const openedAt = asNonEmptyString(mutation.params.openedAt);
          const lastMessageAt = asNonEmptyString(mutation.params.lastMessageAt) ?? openedAt;
          if (!resource || !externalId || !source || !id || !openedAt || !lastMessageAt) return;
          let resolvedIntegratorUserId: string | null = null;
          await db.tx(async (txDb) => {
            await insertConversation(txDb, {
              id,
              source,
              resource,
              externalId,
              adminScope,
              status,
              openedAt,
              lastMessageAt,
            });
            const convRow = await runIntegratorSql<{ user_identity_id: string }>(
              txDb,
              sql`SELECT user_identity_id::text AS user_identity_id FROM conversations WHERE id = ${id}`,
            );
            const rawIdentityId = convRow.rows[0]?.user_identity_id ?? null;
            resolvedIntegratorUserId =
              rawIdentityId != null
                ? await resolveCanonicalUserIdFromIdentityId(txDb, rawIdentityId)
                : null;
          });
          if (mutation.params.canonicalWriteHandled === true) return;
          // D3: replaces the `support.conversation.opened` HTTP projection fanout. Runs in its OWN
          // transaction AFTER the integrator-local `conversations` row above has already committed — see
          // writeSupportConversationsDirect.ts header ("DURABILITY") for why this must never block/roll
          // back that write, and for the two-bucket error handling below: platform-user/org ambiguity is
          // a genuine fail-closed (no row, ever, no alert); anything else falls back to the SAME durable
          // outbox the retired projection used, so the write is at-least-once again.
          const conversationOpenFallbackPayload: Record<string, unknown> = {
            integratorConversationId: id,
            integratorUserId: resolvedIntegratorUserId,
            source,
            adminScope,
            status,
            openedAt,
            lastMessageAt,
            channelCode: resource,
            channelExternalId: externalId,
          };
          const enqueueConversationOpenFallback = async (
            reason: string,
            err?: unknown,
          ): Promise<void> => {
            await enqueueProjectionEvent(db, {
              eventType: 'support.conversation.opened',
              idempotencyKey: projectionIdempotencyKey(
                'support.conversation.opened',
                id,
                hashPayloadExcludingKeys(conversationOpenFallbackPayload, ['integratorUserId']),
              ),
              occurredAt: openedAt,
              payload: conversationOpenFallbackPayload,
            });
            logger.warn(
              { err, mutationType: mutation.type, id, resource, externalId, reason },
              'conversation.open: direct public write failed, fell back to durable outbox',
            );
            await recordOperatorFailureIncident({
              direction: 'db_write',
              integration: 'support_conversations',
              errorClass: 'conversation_open_direct_write_fallback',
              errorDetail: reason,
            }).catch((incidentErr: unknown) => {
              logger.error(
                { err: incidentErr, mutationType: mutation.type, id },
                'conversation.open: failed to record operator incident for direct-write fallback',
              );
            });
          };
          if (!resolvedIntegratorUserId) {
            // No integrator identity resolved at all — the retired projection would still have emitted
            // (webapp's resolvePlatformUserId falls back to channel-binding lookup with a null
            // integratorUserId); preserve that durability rather than silently dropping the open.
            await enqueueConversationOpenFallback('no_resolved_integrator_user_id');
          } else {
            const resolvedIntegratorUserIdForWrite = resolvedIntegratorUserId;
            try {
              await runDirectPublicWriteWithOrgPrincipal(() =>
                openSupportConversationDirect(
                  db,
                  {
                    integratorUserId: resolvedIntegratorUserIdForWrite,
                    channelCode: resource,
                    externalId,
                    integratorConversationId: id,
                    source,
                    adminScope,
                    status,
                    openedAt,
                    lastMessageAt,
                  },
                  { mergeCandidateIds: mergeCandidateIdsViaPlatformMerge },
                ),
              );
            } catch (err) {
              if (
                isDirectPublicActorResolutionFailClosedError(err) ||
                isIdentityMergeAmbiguityError(err)
              ) {
                logger.warn(
                  { err, mutationType: mutation.type, id, resource, externalId },
                  'conversation.open: direct public write fail-closed (org/platform-user unresolved or ambiguous) — no write, no fallback',
                );
              } else {
                await enqueueConversationOpenFallback('direct_write_unexpected_error', err);
              }
            }
          }
          return;
        }
        case 'conversation.message.add': {
          const id = asNonEmptyString(mutation.params.id);
          const conversationId = asNonEmptyString(mutation.params.conversationId);
          const senderRole = asNonEmptyString(mutation.params.senderRole);
          const text = asNonEmptyString(mutation.params.text);
          const source = asNonEmptyString(mutation.params.source) ?? 'telegram';
          const createdAt = asNonEmptyString(mutation.params.createdAt);
          const externalChatId = asNullableString(mutation.params.externalChatId);
          const externalMessageId = asNullableString(mutation.params.externalMessageId);
          const messageType = asNullableString(mutation.params.messageType) ?? 'text';
          if (!id || !conversationId || !senderRole || !text || !createdAt) return;
          await db.tx(async (txDb) => {
            await insertConversationMessage(txDb, {
              id,
              conversationId,
              senderRole,
              text,
              source,
              ...(externalChatId !== null ? { externalChatId } : {}),
              ...(externalMessageId !== null ? { externalMessageId } : {}),
              createdAt,
            });
          });
          if (mutation.params.canonicalWriteHandled === true) return;
          // D3: replaces the `support.conversation.message.appended` HTTP projection fanout. Own
          // transaction after the integrator-local write above; see writeSupportConversationsDirect.ts
          // header ("DURABILITY"). `conversation_not_found` (parent row not yet visible — e.g. its OWN
          // open is mid-fallback) is NOT a legitimately-fail-closed condition here: the message text
          // itself must not be lost, so it — like any other unexpected error — falls back to the durable
          // outbox. Only D1/D2's platform-user/org ambiguity is a genuine no-write-ever case, and this
          // mutation never resolves an actor itself (it reuses the already-resolved parent conversation),
          // so that bucket cannot occur here.
          try {
            await runDirectPublicWriteWithOrgPrincipal(() =>
              appendSupportConversationMessageDirect(db, {
                integratorConversationId: conversationId,
                integratorMessageId: id,
                senderRole,
                messageType,
                text,
                source,
                externalChatId,
                externalMessageId,
                createdAt,
              }),
            );
          } catch (err) {
            const fallbackPayload: Record<string, unknown> = {
              integratorMessageId: id,
              integratorConversationId: conversationId,
              senderRole,
              messageType,
              text,
              source,
              externalChatId: externalChatId ?? null,
              externalMessageId: externalMessageId ?? null,
              createdAt,
            };
            await enqueueProjectionEvent(db, {
              eventType: 'support.conversation.message.appended',
              idempotencyKey: projectionIdempotencyKey(
                'support.conversation.message.appended',
                id,
                hashPayload(fallbackPayload),
              ),
              occurredAt: createdAt,
              payload: fallbackPayload,
            });
            const reason =
              err instanceof SupportConversationsDirectWriteError
                ? err.code
                : 'direct_write_unexpected_error';
            logger.warn(
              { err, mutationType: mutation.type, id, conversationId, reason },
              'conversation.message.add: direct public write failed, fell back to durable outbox',
            );
            await recordOperatorFailureIncident({
              direction: 'db_write',
              integration: 'support_conversations',
              errorClass: 'conversation_message_add_direct_write_fallback',
              errorDetail: reason,
            }).catch((incidentErr: unknown) => {
              logger.error(
                { err: incidentErr, mutationType: mutation.type, id, conversationId },
                'conversation.message.add: failed to record operator incident for direct-write fallback',
              );
            });
          }
          return;
        }
        case 'conversation.state.set': {
          const id = asNonEmptyString(mutation.params.id ?? mutation.params.conversationId);
          const status = asNonEmptyString(mutation.params.status);
          const lastMessageAt = asNullableString(mutation.params.lastMessageAt);
          const closedAt = asNullableString(mutation.params.closedAt);
          const closeReason = asNullableString(mutation.params.closeReason);
          if (!id || !status) return;
          await db.tx(async (txDb) => {
            await setConversationState(txDb, {
              id,
              status,
              ...(lastMessageAt !== null ? { lastMessageAt } : {}),
              ...(closedAt !== null ? { closedAt } : {}),
              ...(closeReason !== null ? { closeReason } : {}),
            });
          });
          if (mutation.params.canonicalWriteHandled === true) return;
          // D3: replaces the `support.conversation.status.changed` HTTP projection fanout. Own
          // transaction after the integrator-local write above; see writeSupportConversationsDirect.ts
          // header ("DURABILITY"). `conversation_not_found` (row not opened via D3 yet) and any other
          // unexpected error both fall back to the durable outbox — the status change (e.g. closing a
          // conversation) must not be silently and permanently lost.
          try {
            await runDirectPublicWriteWithOrgPrincipal(() =>
              setSupportConversationStatusDirect(db, {
                integratorConversationId: id,
                status,
                lastMessageAt,
                closedAt,
                closeReason,
              }),
            );
          } catch (err) {
            const fallbackPayload: Record<string, unknown> = {
              integratorConversationId: id,
              status,
              lastMessageAt: lastMessageAt ?? null,
              closedAt: closedAt ?? null,
              closeReason: closeReason ?? null,
            };
            await enqueueProjectionEvent(db, {
              eventType: 'support.conversation.status.changed',
              idempotencyKey: projectionIdempotencyKey(
                'support.conversation.status.changed',
                id,
                hashPayload(fallbackPayload),
              ),
              occurredAt: new Date().toISOString(),
              payload: fallbackPayload,
            });
            const reason =
              err instanceof SupportConversationsDirectWriteError
                ? err.code
                : 'direct_write_unexpected_error';
            logger.warn(
              { err, mutationType: mutation.type, id, reason },
              'conversation.state.set: direct public write failed, fell back to durable outbox',
            );
            await recordOperatorFailureIncident({
              direction: 'db_write',
              integration: 'support_conversations',
              errorClass: 'conversation_state_set_direct_write_fallback',
              errorDetail: reason,
            }).catch((incidentErr: unknown) => {
              logger.error(
                { err: incidentErr, mutationType: mutation.type, id },
                'conversation.state.set: failed to record operator incident for direct-write fallback',
              );
            });
          }
          return;
        }
        case 'question.create': {
          const id = asNonEmptyString(mutation.params.id);
          const userIdentityId = asNonEmptyString(mutation.params.userIdentityId);
          const conversationId = asNullableString(mutation.params.conversationId);
          const text = asNonEmptyString(mutation.params.text);
          const createdAt = asNonEmptyString(mutation.params.createdAt);
          if (!id || !userIdentityId || !text || !createdAt) return;
          let resolvedIntegratorUserId: string | null = null;
          await db.tx(async (txDb) => {
            await insertUserQuestion(txDb, {
              id,
              userIdentityId,
              conversationId,
              telegramMessageId: asNullableString(mutation.params.telegramMessageId),
              text,
              createdAt,
            });
            resolvedIntegratorUserId = await resolveCanonicalUserIdFromIdentityId(
              txDb,
              userIdentityId,
            );
          });
          // D4: replaces the `support.question.created` HTTP projection fanout. Own transaction after
          // the integrator-local `insertUserQuestion` write above; see writeSupportQuestionsDirect.ts
          // header ("DURABILITY"). `conversation_id_required` (no parent conversation id supplied — the
          // only current caller always supplies one) is a genuine fail-closed: no write, no fallback,
          // no incident. `conversation_not_found` (parent conversation row not yet visible — e.g. its
          // own `conversation.open` direct write is still mid-fallback) and any other unexpected error
          // fall back to the durable outbox.
          const questionCreateFallbackPayload: Record<string, unknown> = {
            integratorQuestionId: id,
            integratorConversationId: conversationId,
            integratorUserId: resolvedIntegratorUserId,
            status: 'open',
            createdAt,
          };
          await executeCanonicalWriteOrLegacy({
            sync:
              conversationId && webappEventsPort?.syncSupportQuestionWrite
                ? () =>
                    webappEventsPort.syncSupportQuestionWrite!({
                      body: JSON.stringify({
                        operation: 'create',
                        integratorConversationId: conversationId,
                        integratorQuestionId: id,
                        ...(asNullableString(mutation.params.organizationId)
                          ? { organizationId: asNullableString(mutation.params.organizationId) }
                          : {}),
                        status: 'open',
                        createdAt,
                      }),
                      idempotencyKey: `support-question-create:${id}`,
                    })
                : undefined,
            accepts: (canonicalWrite) => canonicalWrite.questionId === id,
            legacyWrite: async () => {
              try {
                await runDirectPublicWriteWithOrgPrincipal(() =>
                  createSupportQuestionDirect(db, {
                    integratorQuestionId: id,
                    integratorConversationId: conversationId,
                    status: 'open',
                    createdAt,
                  }),
                );
              } catch (err) {
                if (
                  err instanceof SupportQuestionsDirectWriteError &&
                  err.code === 'conversation_id_required'
                ) {
                  logger.warn(
                    { err, mutationType: mutation.type, id },
                    'question.create: direct public write fail-closed (no conversation id) — no write, no fallback',
                  );
                } else {
                  await enqueueProjectionEvent(db, {
                    eventType: 'support.question.created',
                    idempotencyKey: projectionIdempotencyKey(
                      'support.question.created',
                      id,
                      hashPayloadExcludingKeys(questionCreateFallbackPayload, ['integratorUserId']),
                    ),
                    occurredAt: createdAt,
                    payload: questionCreateFallbackPayload,
                  });
                  const reason =
                    err instanceof SupportQuestionsDirectWriteError
                      ? err.code
                      : 'direct_write_unexpected_error';
                  logger.warn(
                    { err, mutationType: mutation.type, id, reason },
                    'question.create: direct public write failed, fell back to durable outbox',
                  );
                  await recordOperatorFailureIncident({
                    direction: 'db_write',
                    integration: 'support_questions',
                    errorClass: 'question_create_direct_write_fallback',
                    errorDetail: reason,
                  }).catch((incidentErr: unknown) => {
                    logger.error(
                      { err: incidentErr, mutationType: mutation.type, id },
                      'question.create: failed to record operator incident for direct-write fallback',
                    );
                  });
                }
              }
            },
          });
          return;
        }
        case 'question.message.add': {
          const id = asNonEmptyString(mutation.params.id);
          const questionId = asNonEmptyString(mutation.params.questionId);
          const senderType = asNonEmptyString(mutation.params.senderType);
          const messageText = asNonEmptyString(mutation.params.messageText);
          const createdAt = asNonEmptyString(mutation.params.createdAt);
          if (
            !id ||
            !questionId ||
            (senderType !== 'user' && senderType !== 'admin') ||
            !messageText ||
            !createdAt
          )
            return;
          await db.tx(async (txDb) => {
            await insertQuestionMessage(txDb, {
              id,
              questionId,
              senderType: senderType as 'user' | 'admin',
              messageText,
              createdAt,
            });
          });
          // D4: replaces the `support.question.message.appended` HTTP projection fanout. Own
          // transaction after the integrator-local write above; see writeSupportQuestionsDirect.ts
          // header ("DURABILITY"). `question_not_found` (parent row not yet visible) is NOT a
          // legitimately-fail-closed condition here: the message text itself must not be lost, so it —
          // like any other unexpected error — falls back to the durable outbox.
          const questionConversationId = asNullableString(mutation.params.conversationId);
          await executeCanonicalWriteOrLegacy({
            sync:
              questionConversationId && webappEventsPort?.syncSupportQuestionWrite
                ? () =>
                    webappEventsPort.syncSupportQuestionWrite!({
                      body: JSON.stringify({
                        operation: 'message',
                        integratorConversationId: questionConversationId,
                        integratorQuestionId: questionId,
                        integratorQuestionMessageId: id,
                        ...(asNullableString(mutation.params.organizationId)
                          ? { organizationId: asNullableString(mutation.params.organizationId) }
                          : {}),
                        senderRole: senderType,
                        text: messageText,
                        createdAt,
                      }),
                      idempotencyKey: `support-question-message:${id}`,
                    })
                : undefined,
            accepts: (canonicalWrite) =>
              canonicalWrite.questionId === questionId && canonicalWrite.questionMessageId === id,
            legacyWrite: async () => {
              try {
                await runDirectPublicWriteWithOrgPrincipal(() =>
                  appendSupportQuestionMessageDirect(db, {
                    integratorQuestionMessageId: id,
                    integratorQuestionId: questionId,
                    senderRole: senderType,
                    text: messageText,
                    createdAt,
                  }),
                );
              } catch (err) {
                const fallbackPayload: Record<string, unknown> = {
                  integratorQuestionMessageId: id,
                  integratorQuestionId: questionId,
                  senderRole: senderType,
                  text: messageText,
                  createdAt,
                };
                await enqueueProjectionEvent(db, {
                  eventType: 'support.question.message.appended',
                  idempotencyKey: projectionIdempotencyKey(
                    'support.question.message.appended',
                    id,
                    hashPayload(fallbackPayload),
                  ),
                  occurredAt: createdAt,
                  payload: fallbackPayload,
                });
                const reason =
                  err instanceof SupportQuestionsDirectWriteError
                    ? err.code
                    : 'direct_write_unexpected_error';
                logger.warn(
                  { err, mutationType: mutation.type, id, questionId, reason },
                  'question.message.add: direct public write failed, fell back to durable outbox',
                );
                await recordOperatorFailureIncident({
                  direction: 'db_write',
                  integration: 'support_questions',
                  errorClass: 'question_message_add_direct_write_fallback',
                  errorDetail: reason,
                }).catch((incidentErr: unknown) => {
                  logger.error(
                    { err: incidentErr, mutationType: mutation.type, id, questionId },
                    'question.message.add: failed to record operator incident for direct-write fallback',
                  );
                });
              }
            },
          });
          return;
        }
        case 'question.markAnswered': {
          const questionId = asNonEmptyString(mutation.params.questionId);
          const answeredAt = asNonEmptyString(mutation.params.answeredAt);
          if (!questionId || !answeredAt) return;
          await db.tx(async (txDb) => {
            await setQuestionAnswered(txDb, { questionId, answeredAt });
          });
          // D4: replaces the `support.question.answered` HTTP projection fanout. Own transaction after
          // the integrator-local write above; see writeSupportQuestionsDirect.ts header ("DURABILITY").
          // `question_not_found` and any other unexpected error both fall back to the durable outbox —
          // an admin's answer must not be silently and permanently lost.
          const answeredConversationId = asNullableString(mutation.params.conversationId);
          await executeCanonicalWriteOrLegacy({
            sync:
              answeredConversationId && webappEventsPort?.syncSupportQuestionWrite
                ? () =>
                    webappEventsPort.syncSupportQuestionWrite!({
                      body: JSON.stringify({
                        operation: 'answered',
                        integratorConversationId: answeredConversationId,
                        integratorQuestionId: questionId,
                        ...(asNullableString(mutation.params.organizationId)
                          ? { organizationId: asNullableString(mutation.params.organizationId) }
                          : {}),
                        answeredAt,
                      }),
                      idempotencyKey: `support-question-answered:${questionId}:${answeredAt}`,
                    })
                : undefined,
            accepts: (canonicalWrite) => canonicalWrite.questionId === questionId,
            legacyWrite: async () => {
              try {
                await runDirectPublicWriteWithOrgPrincipal(() =>
                  markSupportQuestionAnsweredDirect(db, {
                    integratorQuestionId: questionId,
                    answeredAt,
                  }),
                );
              } catch (err) {
                const fallbackPayload: Record<string, unknown> = {
                  integratorQuestionId: questionId,
                  answeredAt,
                };
                await enqueueProjectionEvent(db, {
                  eventType: 'support.question.answered',
                  idempotencyKey: projectionIdempotencyKey(
                    'support.question.answered',
                    questionId,
                    hashPayload(fallbackPayload),
                  ),
                  occurredAt: answeredAt,
                  payload: fallbackPayload,
                });
                const reason =
                  err instanceof SupportQuestionsDirectWriteError
                    ? err.code
                    : 'direct_write_unexpected_error';
                logger.warn(
                  { err, mutationType: mutation.type, questionId, reason },
                  'question.markAnswered: direct public write failed, fell back to durable outbox',
                );
                await recordOperatorFailureIncident({
                  direction: 'db_write',
                  integration: 'support_questions',
                  errorClass: 'question_mark_answered_direct_write_fallback',
                  errorDetail: reason,
                }).catch((incidentErr: unknown) => {
                  logger.error(
                    { err: incidentErr, mutationType: mutation.type, questionId },
                    'question.markAnswered: failed to record operator incident for direct-write fallback',
                  );
                });
              }
            },
          });
          return;
        }
        case 'reminders.rule.upsert': {
          const userId = asNonEmptyString(mutation.params.userId);
          const category = asNonEmptyString(mutation.params.category);
          const id = asNonEmptyString(mutation.params.id);
          const timezone = asNonEmptyString(mutation.params.timezone);
          const scheduleType = asNonEmptyString(mutation.params.scheduleType);
          const intervalMinutes = asFiniteNumber(mutation.params.intervalMinutes);
          const windowStartMinute = asFiniteNumber(mutation.params.windowStartMinute);
          const windowEndMinute = asFiniteNumber(mutation.params.windowEndMinute);
          const daysMask = asNonEmptyString(mutation.params.daysMask);
          const contentMode = asNonEmptyString(mutation.params.contentMode);
          if (
            !userId ||
            !category ||
            !id ||
            !timezone ||
            !scheduleType ||
            intervalMinutes === null ||
            windowStartMinute === null ||
            windowEndMinute === null ||
            !daysMask ||
            !contentMode
          ) {
            return;
          }
          const isEnabled = mutation.params.isEnabled === true;
          const linkedObjectType = asNullableString(mutation.params.linkedObjectType);
          const linkedObjectId = asNullableString(mutation.params.linkedObjectId);
          const customTitle = asNullableString(mutation.params.customTitle);
          const customText = asNullableString(mutation.params.customText);
          const reminderIntent = asNullableString(mutation.params.reminderIntent);
          const quietHoursStartMinute = asNullableIntegerMinute(
            mutation.params.quietHoursStartMinute,
          );
          const quietHoursEndMinute = asNullableIntegerMinute(mutation.params.quietHoursEndMinute);
          const notificationTopicCodeProvided = Object.prototype.hasOwnProperty.call(
            mutation.params,
            'notificationTopicCode',
          );
          const notificationTopicCodeRaw = notificationTopicCodeProvided
            ? asNullableString(mutation.params.notificationTopicCode)
            : undefined;
          let canonicalUserId = userId;
          await db.tx(async (txDb) => {
            canonicalUserId = await resolveCanonicalIntegratorUserId(txDb, userId);
            await cancelPendingReminderOccurrencesForRule(txDb, id);
            // D5 note: `integrator.user_reminder_rules` is retained UNCHANGED here — NOT a duplicate
            // business projection but genuine local state `user_reminder_occurrences.rule_id` has a hard
            // FK to (`ON DELETE CASCADE`), so occurrence planning/dispatch (Track D D6/D7) still requires
            // every rule id to exist here. Classified for migration-backed removal only once D6 migrates
            // that FK and the scheduler's `getEnabledReminderRules` read off `public.reminder_rules`
            // instead — out of D5's scope (see WORK_ORDER Track D5 report).
            await upsertReminderRule(txDb, {
              id,
              userId: canonicalUserId,
              category: category as never,
              isEnabled,
              scheduleType,
              timezone,
              intervalMinutes,
              windowStartMinute,
              windowEndMinute,
              daysMask,
              contentMode: contentMode as never,
              linkedObjectType,
              linkedObjectId,
              customTitle,
              customText,
              deepLink: asNullableString(mutation.params.deepLink),
              reminderIntent,
              quietHoursStartMinute,
              quietHoursEndMinute,
              ...(typeof mutation.params.scheduleData !== 'undefined'
                ? { scheduleData: mutation.params.scheduleData }
                : {}),
            });
          });
          // D5: replaces the `reminder.rule.upserted` HTTP projection fanout. Runs in its OWN transaction
          // AFTER the integrator-local `user_reminder_rules` row above has already committed — see
          // writeReminderRulesDirect.ts header ("DURABILITY"): this domain never had a fail-closed-no-write
          // case before D5, so EVERY failure (platform-user unresolved, org unresolved/ambiguous, or any
          // other unexpected error) falls back to the SAME durable outbox the retired projection used —
          // never a silent drop.
          const fallbackKeyPayload = buildReminderRuleUpsertKeyPayload({
            integratorRuleId: id,
            integratorUserId: canonicalUserId,
            category,
            isEnabled,
            scheduleType,
            timezone,
            intervalMinutes,
            windowStartMinute,
            windowEndMinute,
            daysMask,
            contentMode,
          });
          try {
            await runDirectPublicWriteWithOrgPrincipal(() =>
              upsertReminderRuleDirect(db, {
                integratorUserId: canonicalUserId,
                integratorRuleId: id,
                category,
                isEnabled,
                scheduleType,
                timezone,
                intervalMinutes,
                windowStartMinute,
                windowEndMinute,
                daysMask,
                contentMode,
                linkedObjectType,
                linkedObjectId,
                customTitle,
                customText,
                scheduleData: mutation.params.scheduleData,
                reminderIntent,
                quietHoursStartMinute,
                quietHoursEndMinute,
                notificationTopicCode: notificationTopicCodeRaw,
              }),
            );
          } catch (err) {
            const fallbackUpdatedAt = new Date().toISOString();
            await enqueueProjectionEvent(db, {
              eventType: REMINDER_RULE_UPSERTED,
              idempotencyKey: projectionIdempotencyKey(
                REMINDER_RULE_UPSERTED,
                id,
                hashPayload(fallbackKeyPayload),
              ),
              occurredAt: fallbackUpdatedAt,
              payload: { ...fallbackKeyPayload, updatedAt: fallbackUpdatedAt },
            });
            logger.warn(
              { err, mutationType: mutation.type, id, userId: canonicalUserId },
              'reminders.rule.upsert: direct public write failed, fell back to durable outbox',
            );
            await recordOperatorFailureIncident({
              direction: 'db_write',
              integration: 'reminder_rules',
              errorClass: 'reminder_rule_upsert_direct_write_fallback',
              errorDetail: err instanceof Error ? err.message : String(err),
            }).catch((incidentErr: unknown) => {
              logger.error(
                { err: incidentErr, mutationType: mutation.type, id },
                'reminders.rule.upsert: failed to record operator incident for direct-write fallback',
              );
            });
          }
          return;
        }
        case 'reminders.occurrence.upsertPlanned': {
          const id = asNonEmptyString(mutation.params.id);
          const ruleId = asNonEmptyString(mutation.params.ruleId);
          const occurrenceKey = asNonEmptyString(mutation.params.occurrenceKey);
          const plannedAt = asNonEmptyString(mutation.params.plannedAt);
          if (!id || !ruleId || !occurrenceKey || !plannedAt) return;
          await upsertReminderOccurrencePlanned(db, { id, ruleId, occurrenceKey, plannedAt });
          return;
        }
        case 'reminders.occurrence.markQueued': {
          const occurrenceId = asNonEmptyString(mutation.params.occurrenceId);
          if (!occurrenceId) return;
          await markReminderOccurrenceQueued(
            db,
            occurrenceId,
            asNullableString(mutation.params.deliveryJobId),
          );
          return;
        }
        case 'reminders.occurrence.markSent': {
          const occurrenceId = asNonEmptyString(mutation.params.occurrenceId);
          const channel = asNonEmptyString(mutation.params.channel);
          if (!occurrenceId || !channel) return;
          const pendingOccSent: ProjectionFanoutInput[] = [];
          await db.tx(async (txDb) => {
            await markReminderOccurrenceSent(txDb, occurrenceId, channel);
            const ctx = await getReminderOccurrenceContextForProjection(txDb, occurrenceId);
            if (ctx && (ctx.status === 'sent' || ctx.status === 'failed')) {
              const canonicalUserId = await resolveCanonicalIntegratorUserId(txDb, ctx.userId);
              const payload = {
                integratorOccurrenceId: occurrenceId,
                integratorRuleId: ctx.ruleId,
                integratorUserId: canonicalUserId,
                category: ctx.category,
                status: ctx.status as 'sent' | 'failed',
                deliveryChannel: ctx.deliveryChannel,
                errorCode: ctx.errorCode,
                occurredAt: ctx.occurredAt,
              };
              pendingOccSent.push({
                eventType: REMINDER_OCCURRENCE_FINALIZED,
                idempotencyKey: projectionIdempotencyKey(
                  REMINDER_OCCURRENCE_FINALIZED,
                  occurrenceId,
                  hashPayload(payload),
                ),
                occurredAt: ctx.occurredAt,
                payload,
              });
            }
          });
          await fanoutProjectionsAfterTx(pendingOccSent);
          return;
        }
        case 'reminders.occurrence.markFailed': {
          const occurrenceId = asNonEmptyString(mutation.params.occurrenceId);
          const channel = asNonEmptyString(mutation.params.channel);
          if (!occurrenceId || !channel) return;
          const pendingOccFail: ProjectionFanoutInput[] = [];
          await db.tx(async (txDb) => {
            await markReminderOccurrenceFailed(
              txDb,
              occurrenceId,
              channel,
              asNullableString(mutation.params.errorCode),
            );
            const ctx = await getReminderOccurrenceContextForProjection(txDb, occurrenceId);
            if (ctx && (ctx.status === 'sent' || ctx.status === 'failed')) {
              const canonicalUserId = await resolveCanonicalIntegratorUserId(txDb, ctx.userId);
              const payload = {
                integratorOccurrenceId: occurrenceId,
                integratorRuleId: ctx.ruleId,
                integratorUserId: canonicalUserId,
                category: ctx.category,
                status: ctx.status as 'sent' | 'failed',
                deliveryChannel: ctx.deliveryChannel,
                errorCode: ctx.errorCode,
                occurredAt: ctx.occurredAt,
              };
              pendingOccFail.push({
                eventType: REMINDER_OCCURRENCE_FINALIZED,
                idempotencyKey: projectionIdempotencyKey(
                  REMINDER_OCCURRENCE_FINALIZED,
                  occurrenceId,
                  hashPayload(payload),
                ),
                occurredAt: ctx.occurredAt,
                payload,
              });
            }
          });
          await fanoutProjectionsAfterTx(pendingOccFail);
          return;
        }
        case 'reminders.occurrence.expireOrphanedPending': {
          const nowIso = asNonEmptyString(mutation.params.nowIso);
          if (!nowIso) return;
          const expired = await expireOrphanedReminderOccurrences(db, nowIso);
          const pendingExpired: ProjectionFanoutInput[] = [];
          for (const context of expired) {
            const canonicalUserId = await resolveCanonicalIntegratorUserId(db, context.userId);
            const payload = {
              integratorOccurrenceId: context.occurrenceId,
              integratorRuleId: context.ruleId,
              integratorUserId: canonicalUserId,
              category: context.category,
              status: 'failed' as const,
              deliveryChannel: context.deliveryChannel,
              errorCode: context.errorCode,
              occurredAt: context.occurredAt,
            };
            pendingExpired.push({
              eventType: REMINDER_OCCURRENCE_FINALIZED,
              idempotencyKey: projectionIdempotencyKey(
                REMINDER_OCCURRENCE_FINALIZED,
                context.occurrenceId,
                hashPayload(payload),
              ),
              occurredAt: context.occurredAt,
              payload,
            });
          }
          await fanoutProjectionsAfterTx(pendingExpired);
          return;
        }
        case 'reminders.occurrence.reschedulePlanned': {
          const occurrenceId = asNonEmptyString(mutation.params.occurrenceId);
          const plannedAt = asNonEmptyString(mutation.params.plannedAt);
          if (!occurrenceId || !plannedAt) return;
          await rescheduleReminderOccurrencePlanned(db, occurrenceId, plannedAt);
          return;
        }
        case 'reminders.occurrence.markSkippedLocal': {
          const occurrenceId = asNonEmptyString(mutation.params.occurrenceId);
          if (!occurrenceId) return;
          await markReminderOccurrenceSkippedLocal(db, occurrenceId);
          return;
        }
        case 'reminders.delivery.log': {
          const id = asNonEmptyString(mutation.params.id);
          const occurrenceId = asNonEmptyString(mutation.params.occurrenceId);
          const channel = asNonEmptyString(mutation.params.channel);
          const status = asNonEmptyString(mutation.params.status);
          if (!id || !occurrenceId || !channel || (status !== 'success' && status !== 'failed'))
            return;
          const payloadJson =
            typeof mutation.params.payloadJson === 'object' && mutation.params.payloadJson !== null
              ? (mutation.params.payloadJson as Record<string, unknown>)
              : {};
          const pendingDelLog: ProjectionFanoutInput[] = [];
          await db.tx(async (txDb) => {
            const createdAt = await insertReminderDeliveryLog(txDb, {
              id,
              occurrenceId,
              channel,
              status,
              errorCode: asNullableString(mutation.params.errorCode),
              payloadJson,
            });
            const ctx = await getReminderOccurrenceContextForProjection(txDb, occurrenceId);
            if (ctx) {
              const canonicalUserId = await resolveCanonicalIntegratorUserId(txDb, ctx.userId);
              const payload = {
                integratorDeliveryLogId: id,
                integratorOccurrenceId: occurrenceId,
                integratorRuleId: ctx.ruleId,
                integratorUserId: canonicalUserId,
                channel,
                status,
                errorCode: asNullableString(mutation.params.errorCode),
                payloadJson,
                createdAt,
              };
              pendingDelLog.push({
                eventType: REMINDER_DELIVERY_LOGGED,
                idempotencyKey: projectionIdempotencyKey(
                  REMINDER_DELIVERY_LOGGED,
                  id,
                  hashPayload(payload),
                ),
                occurredAt: createdAt,
                payload,
              });
            }
          });
          await fanoutProjectionsAfterTx(pendingDelLog);
          return;
        }
        case 'content.access.grant.create': {
          const id = asNonEmptyString(mutation.params.id);
          const userId = asNonEmptyString(mutation.params.userId);
          const contentId = asNonEmptyString(mutation.params.contentId);
          const purpose = asNonEmptyString(mutation.params.purpose);
          const expiresAt = asNonEmptyString(mutation.params.expiresAt);
          if (!id || !userId || !contentId || !purpose || !expiresAt) return;
          const metaJson =
            typeof mutation.params.metaJson === 'object' && mutation.params.metaJson !== null
              ? (mutation.params.metaJson as Record<string, unknown>)
              : {};
          const pendingContent: ProjectionFanoutInput[] = [];
          await db.tx(async (txDb) => {
            const canonicalUserId = await resolveCanonicalIntegratorUserId(txDb, userId);
            const createdAt = await createContentAccessGrant(txDb, {
              id,
              userId: canonicalUserId,
              contentId,
              purpose,
              tokenHash: asNullableString(mutation.params.tokenHash),
              expiresAt,
              metaJson,
            });
            const payload = {
              integratorGrantId: id,
              integratorUserId: canonicalUserId,
              contentId,
              purpose,
              tokenHash: asNullableString(mutation.params.tokenHash),
              expiresAt,
              revokedAt: null as string | null,
              metaJson,
              createdAt,
            };
            pendingContent.push({
              eventType: CONTENT_ACCESS_GRANTED,
              idempotencyKey: projectionIdempotencyKey(
                CONTENT_ACCESS_GRANTED,
                id,
                hashPayload(payload),
              ),
              occurredAt: createdAt,
              payload,
            });
          });
          await fanoutProjectionsAfterTx(pendingContent);
          return;
        }
        case 'delivery.attempt.log': {
          const dalParams = mutation.params as {
            intentType?: unknown;
            intentEventId?: unknown;
            correlationId?: unknown;
            channel?: unknown;
            status?: unknown;
            attempt?: unknown;
            reason?: unknown;
            organizationId?: unknown;
            payload?: unknown;
            occurredAt?: unknown;
          };
          if (await getOperationalVerboseLogEnabled(db)) {
            logger.info(
              {
                intentType: asNullableString(dalParams.intentType),
                intentEventId: asNullableString(dalParams.intentEventId),
                correlationId: asNullableString(dalParams.correlationId),
                channel: asNonEmptyString(dalParams.channel),
                status: asNonEmptyString(dalParams.status),
                attempt:
                  typeof dalParams.attempt === 'number' && Number.isFinite(dalParams.attempt)
                    ? Math.trunc(dalParams.attempt)
                    : null,
                reason: asNullableString(dalParams.reason),
              },
              'delivery attempt log',
            );
          }
          const intentEventId = asNullableString(dalParams.intentEventId);
          const correlationId = asNullableString(dalParams.correlationId);
          const channel = asNonEmptyString(dalParams.channel);
          const status = asNonEmptyString(dalParams.status);
          const attemptRaw =
            typeof dalParams.attempt === 'number' && Number.isFinite(dalParams.attempt)
              ? Math.trunc(dalParams.attempt)
              : null;
          const reason = asNullableString(dalParams.reason);
          const organizationId = asNullableString(dalParams.organizationId);
          const payloadJson =
            typeof dalParams.payload === 'object' && dalParams.payload !== null
              ? (dalParams.payload as Record<string, unknown>)
              : {};
          const occurredAt = asNonEmptyString(dalParams.occurredAt) ?? new Date().toISOString();
          await db.tx(async (txDb) => {
            await insertDeliveryAttemptLog(txDb, dalParams);
          });
          // D4: replaces the `support.delivery.attempt.logged` HTTP projection fanout. Own transaction
          // after the integrator-local audit-log write above; see writeSupportQuestionsDirect.ts header
          // ("DURABILITY"). A missing `organizationId` is a genuine fail-closed (no write, no fallback,
          // no incident) — the retired webapp consumer ALSO rejected this case non-retryably
          // (`support.delivery.attempt.logged: organizationId required`, `retryable: false`), so skipping
          // both the direct write and the outbox enqueue changes nothing about the eventual outcome.
          // Anything else (row not written for an unexpected reason) falls back to the durable outbox.
          const deliveryFallbackPayload: Record<string, unknown> = {
            intentEventId: intentEventId ?? null,
            correlationId: correlationId ?? null,
            channelCode: channel ?? 'unknown',
            status: status ?? 'failed',
            attempt: attemptRaw ?? 1,
            reason: reason ?? null,
            organizationId,
            payloadJson,
            occurredAt,
          };
          if (!organizationId) {
            logger.warn(
              { mutationType: mutation.type, intentEventId, correlationId, channel },
              'delivery.attempt.log: direct public write fail-closed (no organizationId) — no write, no fallback',
            );
            return;
          }
          const deliveryAttemptId =
            intentEventId ?? correlationId ?? `del-${hashPayload(deliveryFallbackPayload)}`;
          await executeCanonicalWriteOrLegacy({
            sync: webappEventsPort?.syncSupportDeliveryAttempt
              ? () =>
                  webappEventsPort.syncSupportDeliveryAttempt!({
                    body: JSON.stringify({
                      organizationId,
                      integratorIntentEventId: intentEventId,
                      correlationId,
                      channelCode: channel ?? 'unknown',
                      status: status ?? 'failed',
                      attempt: attemptRaw !== null && attemptRaw > 0 ? attemptRaw : 1,
                      reason,
                      payloadJson,
                      occurredAt,
                    }),
                    idempotencyKey: `support-delivery-attempt:${deliveryAttemptId}`,
                  })
              : undefined,
            accepts: (canonicalWrite) =>
              canonicalWrite.deliveryAttemptId === deliveryAttemptId &&
              canonicalWrite.organizationId === organizationId,
            legacyWrite: async () => {
              try {
                // organizationId is already a known, validated value here (guarded above) — wrap with it
                // directly rather than relying on the ambient principal (this mutation can also be reached
                // from delivery/retry paths without an ambient organization principal at all).
                await runWithOrganizationPrincipal(organizationId, () =>
                  appendSupportDeliveryEventDirect(db, {
                    organizationId,
                    conversationMessageId: null,
                    integratorIntentEventId: intentEventId,
                    correlationId,
                    channelCode: channel ?? 'unknown',
                    status: status ?? 'failed',
                    attempt: attemptRaw !== null && attemptRaw > 0 ? attemptRaw : 1,
                    reason,
                    payloadJson,
                    occurredAt,
                  }),
                );
              } catch (err) {
                await enqueueProjectionEvent(db, {
                  eventType: 'support.delivery.attempt.logged',
                  idempotencyKey: projectionIdempotencyKey(
                    'support.delivery.attempt.logged',
                    String(deliveryAttemptId),
                    hashPayload(deliveryFallbackPayload),
                  ),
                  occurredAt,
                  payload: deliveryFallbackPayload,
                });
                logger.warn(
                  { err, mutationType: mutation.type, intentEventId, correlationId, channel },
                  'delivery.attempt.log: direct public write failed, fell back to durable outbox',
                );
                await recordOperatorFailureIncident({
                  direction: 'db_write',
                  integration: 'support_delivery_events',
                  errorClass: 'delivery_attempt_log_direct_write_fallback',
                  errorDetail: 'direct_write_unexpected_error',
                }).catch((incidentErr: unknown) => {
                  logger.error(
                    { err: incidentErr, mutationType: mutation.type, intentEventId, correlationId },
                    'delivery.attempt.log: failed to record operator incident for direct-write fallback',
                  );
                });
              }
            },
          });
          return;
        }
        case 'message.retry.enqueue': {
          const phoneNormalized = asNonEmptyString(mutation.params.phoneNormalized);
          const messageText = asNonEmptyString(mutation.params.messageText);
          if (!phoneNormalized || !messageText) {
            logger.warn(
              { mutationType: mutation.type },
              'skip retry enqueue: missing phone/message',
            );
            return;
          }
          const firstTryDelaySecondsRaw = mutation.params.firstTryDelaySeconds;
          const maxAttemptsRaw = mutation.params.maxAttempts;
          const firstTryDelaySeconds =
            typeof firstTryDelaySecondsRaw === 'number' && Number.isFinite(firstTryDelaySecondsRaw)
              ? Math.max(0, Math.trunc(firstTryDelaySecondsRaw))
              : 60;
          const maxAttempts =
            typeof maxAttemptsRaw === 'number' && Number.isFinite(maxAttemptsRaw)
              ? Math.max(1, Math.trunc(maxAttemptsRaw))
              : 2;

          await enqueueMessageRetryJob(db, {
            phoneNormalized,
            messageText,
            firstTryDelaySeconds,
            maxAttempts,
            kind: 'message.deliver',
            payloadJson: {
              intent: {
                type: 'message.send',
                meta: {
                  // Intentionally unique per attempt (not a projection idempotency key); retry events must not dedupe.
                  eventId: `message-retry:${phoneNormalized}:${Date.now()}`,
                  occurredAt: new Date().toISOString(),
                  source: 'worker',
                },
                payload: {
                  message: { text: messageText },
                  delivery: {
                    channels: ['smsc'],
                    maxAttempts: 1,
                  },
                },
              },
              targets: [
                {
                  resource: 'smsc',
                  address: { phoneNormalized },
                },
              ],
              retry: {
                maxAttempts,
                backoffSeconds: [firstTryDelaySeconds],
              },
            },
          });
          return;
        }
        default: {
          logger.warn({ mutationType: mutation.type }, 'unsupported DbWriteMutation type');
        }
      }
    },
  };
}
