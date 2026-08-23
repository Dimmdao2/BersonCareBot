import type {
  DbPort,
  DispatchPort,
  DbWriteDbResult,
  DbWriteMutation,
  DbWriteMutationType,
  DbWritePort,
  PhoneLinkFailureReason,
  QueuePort,
  WebappEventsPort,
} from '../../kernel/contracts/index.js';
import { getCurrentDbPrincipalOrganizationId } from '@bersoncare/db-principal';
import { appSettings } from '../../config/appSettings.js';
import { createPostgresJobQueue } from '../adapters/jobQueuePort.js';
import { createDbPort } from './client.js';
import { appendMessageLog } from './repos/messageLogs.js';
import { writeOperatorDeliveryAttempt } from './repos/operatorDeliveryAttempts.js';
import { recordMessengerPhoneBindBlocked } from './repos/messengerPhoneBindAudit.js';
import { enqueueDirectPublicWriteRetry } from './repos/directPublicWriteRetry.js';
import {
  createContentAccessGrant,
  getReminderOccurrenceContextForProjection,
  markReminderOccurrenceFailed,
  markReminderOccurrenceSent,
  expireOrphanedPendingReminderOccurrences,
  markReminderOccurrenceSkippedLocal,
  rescheduleReminderOccurrencePlanned,
} from './repos/reminders.js';
import type { FinalizedReminderOccurrenceProjectionContext } from './repos/reminders.js';
import { getOperationalVerboseLogEnabled } from './repos/operationalVerboseLog.js';
import { projectionIdempotencyKey, hashPayload } from './repos/projectionKeys.js';
import { logger } from '../observability/logger.js';
import { isAuthChannelEnabled as readAuthChannelPolicy } from './authChannelPolicy.js';
import {
  upsertBootstrapChannelIdentity,
  normalizeChannelDisplayHandle,
  type DirectPublicChannelCode,
} from './directPublic/writeIdentityAndPreferencesDirect.js';
import {
  recordReminderOccurrenceFinalizedDirect,
  type ReminderOccurrenceFinalizedDirectInput,
} from './directPublic/writeReminderProjectionDirect.js';
import { applySpecialistTaskReminderSuccessOutcome } from './repos/specialistTaskReminderOutcome.js';
import { bindBootstrapMessengerPhone } from './directPublic/bootstrapMessengerPhoneBind.js';
import { writeDirectPublic } from './directPublic/writePort.js';

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
 * by signed scheduled wakes): re-install an EXPLICIT organization principal — `SET ROLE
 * app_staff` + the SAME organization id already ambiently known — for the duration of the direct write,
 * satisfying `is_staff() AND organization_id = current_org_id()`. No new organization is invented or
 * guessed: this reuses whatever `organizationId` the CURRENT principal (integrator, organization, or
 * staff) already carries — the same org webhook pre-routing already scoped this whole event to. When no
 * organization id is ambiently known at all (bootstrap/unresolved-org paths), this is a no-op passthrough
 * — `fn` runs under whatever principal is already active, and its own resolver fails closed / throws as
 * before, routed by the caller to the existing fallback.
 */
function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
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
    /** Injectable for tests; production defaults to a queue bound to this call's own `db`
     * (must match `db`, incl. when this runs inside `createTxBoundWritePort`'s tx — see below). */
    queuePort?: QueuePort;
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
  const queuePort: QueuePort =
    input.queuePort ??
    createPostgresJobQueue({ db, retryDelaySeconds: appSettings.runtime.worker.retryDelaySeconds });
  const plainMutationsRequiringPrincipalTx: ReadonlySet<DbWriteMutationType> = new Set([
    'event.log',
    'reminders.occurrence.reschedulePlanned',
    'reminders.occurrence.markSkippedLocal',
    'specialistTask.reminder.markSent',
    'message.retry.enqueue',
  ]);

  async function queueDirectPublicRetry(
    operation:
      | 'reminder_occurrence_sent_record'
      | 'reminder_occurrence_failed_record'
      | 'reminder_occurrence_expired_record',
    organizationId: string,
    stableId: string,
    payload: ReminderOccurrenceFinalizedDirectInput,
  ): Promise<void> {
    await enqueueDirectPublicWriteRetry(db, {
      operation,
      organizationId,
      idempotencyKey: projectionIdempotencyKey(
        `direct-public-write.${operation}`,
        stableId,
        hashPayload(payload),
      ),
      payload,
    });
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
        case 'specialistTask.reminder.markSent': {
          const queueId = asNonEmptyString(mutation.params.queueId);
          if (!queueId) return;
          await applySpecialistTaskReminderSuccessOutcome(db, queueId);
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
          if (!externalId) return;
          // `readResource` returns a wide `string`; the guard above only proves it AT RUNTIME, TS does
          // not narrow a plain `string` from `!==` checks — re-derive a properly literal-typed value.
          const channelCode: DirectPublicChannelCode = resource === 'max' ? 'max' : 'telegram';
          // D1: ONE tx writes the canonical public.platform_users/user_channel_bindings directly.
          //
          // D29 (owner, 31.07): the canonical ФИО (`platform_users.first_name`/`last_name`, and the
          // `display_name` derived from them) is no longer autofilled from the channel's own profile —
          // the person types it at registration. The messenger profile contributes only its channel
          // display handle; no integrator-local identity or user row is created.
          // D25 correction (owner decision 23.08.2026): one exact named root
          // (`app.integrator_upsert_channel_identity`), entered through the one direct-public
          // principal chokepoint (`writeDirectPublic`), which re-installs the bootstrap principal the
          // root's declared capability accepts — the webhook itself runs under
          // `runWithIntegratorPrincipal`/`runWithOrganizationPrincipal` whenever the clinic is already
          // resolved (telegram/webhook.ts), and the root is unreachable from those (audit K5, 22.08).
          // It never opens a relation transaction. LOOKUP-ONLY: an unknown `externalId` resolves to
          // `null` and creates nothing — a generic webhook proves no phone ownership, so it must never
          // create `platform_users`/`user_identity`/`user_channel_bindings`/`user_channel_preferences`.
          // Account creation is exclusively webapp-owned completion of the token-bound
          // phone-messenger-bind flow. The return value is intentionally discarded here: whether the
          // identity already existed or stayed unresolved, there is nothing further for `user.upsert`
          // to do — see `writeIdentityAndPreferencesDirect.ts` module header.
          await writeDirectPublic('identity-upsert', () =>
            upsertBootstrapChannelIdentity(db, {
              channelCode,
              externalId,
              displayHandle: normalizeChannelDisplayHandle(username),
            }),
          );
          return;
        }
        case 'user.phone.link': {
          const resource = readResource(mutation.params);
          const channelUserId = readChannelUserId(mutation.params);
          const phoneNormalized = asNonEmptyString(mutation.params.phoneNormalized);
          const preferredPlatformUserId = asNonEmptyString(mutation.params.preferredPlatformUserId);
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
          // D25: one exact named root (`app.integrator_bind_bootstrap_channel_phone`), entered through
          // the one direct-public principal chokepoint (`writeDirectPublic`), which re-installs the
          // bootstrap principal the root's declared capability accepts — see `identity-upsert` above
          // and audit K5 (22.08). That re-entry is scoped to the root call alone, so the ambient
          // organization principal is back in force for the `admin_audit_log` case below. The root
          // never opens a relation transaction and reports a conflict without deciding or executing an
          // account merge (D26); the durable, repeat-aware `admin_audit_log` case below is the same one
          // the retired relation-writer path (`applyMessengerPhonePublicBind`) used to record, now fed
          // from the exact root's result whenever an organization is ambiently known.
          try {
            const bindResult = await writeDirectPublic('phone-bind', () =>
              bindBootstrapMessengerPhone(db, {
                channelCode: resource,
                externalId: channelUserId,
                phoneNormalized,
                preferredPlatformUserId,
              }),
            );
            if (!bindResult.applied) {
              const reason = bindResult.failureCode as PhoneLinkFailureReason | null;
              logger.warn(
                { ...bindLogBase, reason: reason ?? 'indeterminate', phoneSuffix },
                'bind_tx_fail',
              );
              const organizationId = getCurrentDbPrincipalOrganizationId();
              if (reason && organizationId) {
                void writeDirectPublic('admin-audit-write', () =>
                  recordMessengerPhoneBindBlocked({
                    db,
                    ...(getDispatchPort ? { getDispatchPort } : {}),
                    reason,
                    // K8 (audit, 22.08): the human Р-D26 hands the merge decision to opens this
                    // case and must see BOTH colliding accounts — the source AND the account the
                    // number/merge collided with, which the root now returns alongside it. It is
                    // also what keeps `conflict_key` (sha256 of the sorted candidate ids) distinct:
                    // with the source alone, two different conflicts sharing it collapsed into one
                    // row and the second case disappeared into `repeat_count`.
                    candidateIds: [
                      ...new Set(
                        [bindResult.platformUserId, bindResult.counterpartyPlatformUserId].filter(
                          (id): id is string => typeof id === 'string' && id.length > 0,
                        ),
                      ),
                    ],
                    details: {
                      channelCode: resource,
                      externalId: channelUserId,
                      phoneSuffix,
                      ...(asNonEmptyString(mutation.params.correlationId)
                        ? { correlationId: asNonEmptyString(mutation.params.correlationId) }
                        : {}),
                    },
                  }),
                ).catch(() => {});
              }
              return {
                userPhoneLinkApplied: false,
                ...(reason ? { phoneLinkReason: reason } : { phoneLinkIndeterminate: true }),
              };
            }
            logger.info(
              {
                event: 'messenger_phone_bind_tx',
                bindOutcome: 'bind_tx_ok',
                metric: 'messenger_bind_ok',
                resource,
                channelCode: resource,
                externalId: channelUserId,
                platformUserId: bindResult.platformUserId ?? undefined,
                phoneSuffix,
                ...(asNonEmptyString(mutation.params.correlationId)
                  ? { correlationId: asNonEmptyString(mutation.params.correlationId) }
                  : {}),
              },
              'bind_tx_ok',
            );
            return { userPhoneLinkApplied: true };
          } catch (err) {
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
        case 'reminders.occurrence.markSent': {
          const occurrenceId = asNonEmptyString(mutation.params.occurrenceId);
          const channel = asNonEmptyString(mutation.params.channel);
          if (!occurrenceId || !channel) return;
          const directInput = await db.tx(
            async (txDb): Promise<ReminderOccurrenceFinalizedDirectInput | null> => {
              await markReminderOccurrenceSent(txDb, occurrenceId, channel);
              const ctx = await getReminderOccurrenceContextForProjection(txDb, occurrenceId);
              if (ctx && (ctx.status === 'sent' || ctx.status === 'failed')) {
                const canonicalUserId = ctx.userId;
                return {
                  integratorOccurrenceId: occurrenceId,
                  integratorRuleId: ctx.ruleId,
                  integratorUserId: canonicalUserId,
                  platformUserId: ctx.platformUserId,
                  organizationId: ctx.organizationId,
                  category: ctx.category,
                  status: ctx.status as 'sent' | 'failed',
                  deliveryChannel: ctx.deliveryChannel,
                  errorCode: ctx.errorCode,
                  occurredAt: ctx.occurredAt,
                };
              }
              return null;
            },
          );
          if (!directInput) return;
          try {
            await writeDirectPublic('reminder-occurrence-finalize', () =>
              recordReminderOccurrenceFinalizedDirect(db, directInput!),
            );
          } catch (err) {
            await queueDirectPublicRetry(
              'reminder_occurrence_sent_record',
              directInput.organizationId,
              occurrenceId,
              directInput,
            );
            logger.warn(
              { err, occurrenceId },
              'reminder occurrence sent direct write failed, queued retry',
            );
          }
          return;
        }
        case 'reminders.occurrence.markFailed': {
          const occurrenceId = asNonEmptyString(mutation.params.occurrenceId);
          const channel = asNonEmptyString(mutation.params.channel);
          if (!occurrenceId || !channel) return;
          const directInput = await db.tx(
            async (txDb): Promise<ReminderOccurrenceFinalizedDirectInput | null> => {
              await markReminderOccurrenceFailed(
                txDb,
                occurrenceId,
                channel,
                asNullableString(mutation.params.errorCode),
              );
              const ctx = await getReminderOccurrenceContextForProjection(txDb, occurrenceId);
              if (ctx && (ctx.status === 'sent' || ctx.status === 'failed')) {
                const canonicalUserId = ctx.userId;
                return {
                  integratorOccurrenceId: occurrenceId,
                  integratorRuleId: ctx.ruleId,
                  integratorUserId: canonicalUserId,
                  platformUserId: ctx.platformUserId,
                  organizationId: ctx.organizationId,
                  category: ctx.category,
                  status: ctx.status as 'sent' | 'failed',
                  deliveryChannel: ctx.deliveryChannel,
                  errorCode: ctx.errorCode,
                  occurredAt: ctx.occurredAt,
                };
              }
              return null;
            },
          );
          if (!directInput) return;
          try {
            await writeDirectPublic('reminder-occurrence-finalize', () =>
              recordReminderOccurrenceFinalizedDirect(db, directInput!),
            );
          } catch (err) {
            await queueDirectPublicRetry(
              'reminder_occurrence_failed_record',
              directInput.organizationId,
              occurrenceId,
              directInput,
            );
            logger.warn(
              { err, occurrenceId },
              'reminder occurrence failure direct write failed, queued retry',
            );
          }
          return;
        }
        case 'reminders.occurrence.expireOrphanedPending': {
          const nowIso = asNonEmptyString(mutation.params.nowIso);
          if (!nowIso) return;
          const expired = await expireOrphanedReminderOccurrences(db, nowIso);
          for (const context of expired) {
            const canonicalUserId = context.userId;
            const directInput: ReminderOccurrenceFinalizedDirectInput = {
              integratorOccurrenceId: context.occurrenceId,
              integratorRuleId: context.ruleId,
              integratorUserId: canonicalUserId,
              platformUserId: context.platformUserId,
              organizationId: context.organizationId,
              category: context.category,
              status: 'failed' as const,
              deliveryChannel: context.deliveryChannel,
              errorCode: context.errorCode,
              occurredAt: context.occurredAt,
            };
            try {
              await writeDirectPublic('reminder-occurrence-finalize', () =>
                recordReminderOccurrenceFinalizedDirect(db, directInput),
              );
            } catch (err) {
              await queueDirectPublicRetry(
                'reminder_occurrence_expired_record',
                directInput.organizationId,
                context.occurrenceId,
                directInput,
              );
              logger.warn(
                { err, occurrenceId: context.occurrenceId },
                'expired reminder occurrence direct write failed, queued retry',
              );
            }
          }
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
          await db.tx((txDb) => createContentAccessGrant(txDb, {
            id,
            userId,
            contentId,
            purpose,
            tokenHash: asNullableString(mutation.params.tokenHash),
            expiresAt,
            metaJson,
          }));
          return;
        }
        case 'delivery.attempt.log': {
          // Track D final cutover (#987), section C: this case used to ALSO fan out into
          // public.support_delivery_events (a separate support-conversation delivery timeline).
          // That fan-out's only production trigger was this exact case, but the sole production
          // producer of a 'delivery.attempt.log' mutation (outgoingDeliveryWorker.ts's
          // recordDeliveryFailureAttempt) never reaches it — it goes through
          // operatorDeliveryAttemptWritePort.ts's operator-aware port, which intercepts this
          // mutation type and returns before this generic switch. dispatchPort.ts's own
          // non-queue-backed attempt write (F5/F6 follow-up) uses the SAME operator-aware port for
          // the same reason: a reminder/OTP/booking delivery attempt is not a support-conversation
          // event. support_delivery_events, its named root, and this fan-out were removed together
          // (20260823T200000 migration); only the canonical operator-journal write remains here.
          if (await getOperationalVerboseLogEnabled(db)) {
            const dalParams = mutation.params as {
              intentType?: unknown;
              intentEventId?: unknown;
              correlationId?: unknown;
              channel?: unknown;
              status?: unknown;
              attempt?: unknown;
              reason?: unknown;
            };
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
          // The canonical operator-journal root is an exact named-root capability. Its attested
          // transaction must begin before a physical client is checked out; the shared writer installs
          // the existing delivery-worker principal when this path has another ambient principal.
          await writeOperatorDeliveryAttempt(db, mutation);
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
          // Forwarded as-is (no local default here — QueuePort applies the one shared retry
          // policy when the caller doesn't override maxAttempts/firstTryDelaySeconds).
          const firstTryDelaySecondsRaw = mutation.params.firstTryDelaySeconds;
          const maxAttemptsRaw = mutation.params.maxAttempts;
          const retry: { maxAttempts?: number; backoffSeconds?: number[] } = {};
          if (typeof maxAttemptsRaw === 'number' && Number.isFinite(maxAttemptsRaw)) {
            retry.maxAttempts = maxAttemptsRaw;
          }
          if (
            typeof firstTryDelaySecondsRaw === 'number' &&
            Number.isFinite(firstTryDelaySecondsRaw)
          ) {
            retry.backoffSeconds = [firstTryDelaySecondsRaw];
          }

          await queuePort.enqueue({
            kind: 'message.deliver',
            payload: {
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
              ...(Object.keys(retry).length > 0 ? { retry } : {}),
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
