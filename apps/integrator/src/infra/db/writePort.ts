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
import { appSettings } from '../../config/appSettings.js';
import { createPostgresJobQueue } from '../adapters/jobQueuePort.js';
import {
  getCurrentDbPrincipal,
  getCurrentDbPrincipalOrganizationId,
} from '@bersoncare/db-principal';
import { createDbPort } from './client.js';
import { appendMessageLog, insertDeliveryAttemptLog } from './repos/messageLogs.js';
import {
  applyMessengerPhonePublicBind,
  MessengerPhoneLinkError,
} from './repos/messengerPhonePublicBind.js';
import { recordMessengerPhoneBindBlocked } from './repos/messengerPhoneBindAudit.js';
import {
  createContentAccessGrant,
  getReminderOccurrenceContextForProjection,
  insertReminderDeliveryLog,
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
  writeIdentityAndPreferencesDirect,
  upsertBootstrapChannelIdentity,
  normalizeChannelDisplayHandle,
  type DirectPublicChannelCode,
} from './directPublic/writeIdentityAndPreferencesDirect.js';
import {
  mergeCandidateIdsViaPlatformMerge,
  isIdentityMergeAmbiguityError,
} from './directPublic/mergeCandidatesDirect.js';
import { appendSupportDeliveryEventDirect } from './directPublic/writeSupportQuestionsDirect.js';
import { upsertReminderRuleDirect } from './directPublic/writeReminderRulesDirect.js';
import { collectPlatformUserCandidates } from './directPublic/writeIdentityAndPreferencesDirect.js';
import {
  appendReminderDeliveryEventDirect,
  recordReminderOccurrenceFinalizedDirect,
  upsertContentAccessGrantDirect,
  type ContentAccessGrantDirectInput,
  type ReminderDeliveryLoggedDirectInput,
  type ReminderOccurrenceFinalizedDirectInput,
} from './directPublic/writeReminderProjectionDirect.js';
import { enqueueDirectPublicWriteRetry } from './repos/directPublicWriteRetry.js';
import { recordOperatorFailureIncident } from '../operatorIncident/reportOperatorFailure.js';
import {
  runWithIntegratorPrincipal,
  runWithOrganizationPrincipal,
} from '../principal/organizationPrincipal.js';
import { executeCanonicalWriteOrLegacy } from '../adapters/supportCanonicalWriteHandoff.js';
import { applySpecialistTaskReminderSuccessOutcome } from './repos/specialistTaskReminderOutcome.js';
import { bindBootstrapMessengerPhone } from './directPublic/bootstrapMessengerPhoneBind.js';

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
      | 'reminder_occurrence_expired_record'
      | 'reminder_delivery_log_append'
      | 'content_access_grant_upsert',
    organizationId: string,
    stableId: string,
    payload:
      | ReminderOccurrenceFinalizedDirectInput
      | ReminderDeliveryLoggedDirectInput
      | ContentAccessGrantDirectInput,
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
          try {
            // D15b/4 fix (access sweep 2026-08-04, ACCESS_SWEEP_2026-08-04.md "Топ находка"): this
            // writes `public.platform_users`/`user_channel_bindings` directly (see
            // writeIdentityAndPreferencesDirect.ts). Under the bare "integrator" principal
            // (`app_patient`, org set, `patient_user_id` NULL) every `platform_users` FORCE-RLS policy
            // denies it — reads come back silently empty, writes get permission-denied. Same
            // `runDirectPublicWriteWithOrgPrincipal` idiom as the D3-D5 direct writes below.
            const input = {
              channelCode,
              externalId,
              displayHandle: normalizeChannelDisplayHandle(username),
              firstName: null,
              lastName: null,
              displayName: null,
            };
            if (getCurrentDbPrincipal()?.kind === 'bootstrap') {
              await upsertBootstrapChannelIdentity(db, input);
            } else {
              await runDirectPublicWriteWithOrgPrincipal(() =>
                writeIdentityAndPreferencesDirect(db, input, {
                  mergeCandidateIds: mergeCandidateIdsViaPlatformMerge,
                }),
              );
            }
          } catch (err) {
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
          try {
            let applied = false;
            let platformUserIdForLog: string | undefined;
            if (getCurrentDbPrincipal()?.kind === 'bootstrap') {
              const bootstrapResult = await bindBootstrapMessengerPhone(db, {
                channelCode: resource,
                externalId: channelUserId,
                phoneNormalized,
                preferredPlatformUserId,
              });
              if (!bootstrapResult.applied) {
                const reason = bootstrapResult.failureCode as PhoneLinkFailureReason | null;
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
                  platformUserId: bootstrapResult.platformUserId ?? undefined,
                  phoneSuffix,
                  ...(asNonEmptyString(mutation.params.correlationId)
                    ? { correlationId: asNonEmptyString(mutation.params.correlationId) }
                    : {}),
                },
                'bind_tx_ok',
              );
              return { userPhoneLinkApplied: true };
            }
            // Same D15b/4 fix as `user.upsert` above: this binding-first canonical write is RLS-denied
            // under the bare integrator principal, so it runs with the already-resolved organization
            // principal. It does not create or update integrator-local identity/user rows.
            await runDirectPublicWriteWithOrgPrincipal(() =>
              db.tx(async (txDb) => {
                const { platformUserId } = await applyMessengerPhonePublicBind(txDb, {
                  channelCode: resource,
                  externalId: channelUserId,
                  phoneNormalized,
                  canonicalIntegratorUserId: null,
                  preferredPlatformUserId,
                });
                platformUserIdForLog = platformUserId;
                applied = true;
              }),
            );
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
                // Same D15b/4 fix: `admin_audit_log` insert/update, also RLS-scoped by
                // `organization_id` (`saas_org_dormant_p0_8_3`) — denied under the bare integrator
                // principal, blocked entirely for `app_patient` (no grant at all).
                void runDirectPublicWriteWithOrgPrincipal(() =>
                  recordMessengerPhoneBindBlocked({
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
                  }),
                ).catch(() => {});
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
          const resolvedPlatformUserId = asNonEmptyString(mutation.params.resolvedPlatformUserId);
          const resolvedOrganizationId = asNonEmptyString(mutation.params.resolvedOrganizationId);
          const canonicalUserId = userId;
          // D5 canonical write: the scheduler reads this same public row. A failed write retains its
          // complete direct-write input in the durable retry queue, so a later retry does not regress
          // to the retired narrow HTTP projection payload.
          const directInput = {
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
            resolvedPlatformUserId,
            resolvedOrganizationId,
          };
          try {
            await runDirectPublicWriteWithOrgPrincipal(() =>
              upsertReminderRuleDirect(db, directInput),
            );
          } catch (err) {
            const fallbackOrganizationId =
              resolvedOrganizationId ?? getCurrentDbPrincipalOrganizationId();
            if (!fallbackOrganizationId) throw err;
            await runWithIntegratorPrincipal(
              {
                organizationId: fallbackOrganizationId,
                integratorUserId: canonicalUserId,
                source: 'reminder-rule-direct-write-retry',
              },
              () =>
                enqueueDirectPublicWriteRetry(db, {
                  operation: 'reminder_rule_upsert',
                  organizationId: fallbackOrganizationId,
                  idempotencyKey: projectionIdempotencyKey(
                    'direct-public-write.reminder-rule-upsert',
                    id,
                    hashPayload(directInput),
                  ),
                  payload: { ...directInput, organizationId: fallbackOrganizationId },
                }),
            );
            logger.warn(
              { err, mutationType: mutation.type, id, userId: canonicalUserId },
              'reminders.rule.upsert: direct public write failed, queued durable direct retry',
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
            await runDirectPublicWriteWithOrgPrincipal(() =>
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
            await runDirectPublicWriteWithOrgPrincipal(() =>
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
              await runDirectPublicWriteWithOrgPrincipal(() =>
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
          const directInput = await db.tx(
            async (txDb): Promise<ReminderDeliveryLoggedDirectInput | null> => {
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
                const canonicalUserId = ctx.userId;
                return {
                  organizationId: ctx.organizationId,
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
              }
              return null;
            },
          );
          if (!directInput) return;
          try {
            await runDirectPublicWriteWithOrgPrincipal(() =>
              appendReminderDeliveryEventDirect(db, directInput!),
            );
          } catch (err) {
            await queueDirectPublicRetry(
              'reminder_delivery_log_append',
              directInput.organizationId,
              id,
              directInput,
            );
            logger.warn({ err, id }, 'reminder delivery log direct write failed, queued retry');
          }
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
          const directInput = await db.tx(
            async (txDb): Promise<ContentAccessGrantDirectInput | null> => {
              const canonicalUserId = userId;
              const created = await createContentAccessGrant(txDb, {
                id,
                userId: canonicalUserId,
                contentId,
                purpose,
                tokenHash: asNullableString(mutation.params.tokenHash),
                expiresAt,
                metaJson,
              });
              if (!created.organizationId) return null;
              const candidates = await collectPlatformUserCandidates(txDb, {
                integratorUserId: canonicalUserId,
                phoneNormalized: null,
                channelCode: '',
                externalId: '',
              });
              return {
                organizationId: created.organizationId,
                integratorGrantId: id,
                integratorUserId: canonicalUserId,
                platformUserId: candidates[0] ?? null,
                contentId,
                purpose,
                tokenHash: asNullableString(mutation.params.tokenHash),
                expiresAt,
                revokedAt: null,
                metaJson,
                createdAt: created.createdAt,
              };
            },
          );
          if (!directInput) return;
          try {
            await runDirectPublicWriteWithOrgPrincipal(() =>
              upsertContentAccessGrantDirect(db, directInput!),
            );
          } catch (err) {
            await queueDirectPublicRetry(
              'content_access_grant_upsert',
              directInput.organizationId,
              id,
              directInput,
            );
            logger.warn({ err, id }, 'content access grant direct write failed, queued retry');
          }
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
          // The audit write is an exact named-root capability. Its attested transaction must begin
          // before a physical client is checked out; wrapping it in a generic relation transaction
          // makes the port reject the call before PostgreSQL can verify the named function.
          await insertDeliveryAttemptLog(db, dalParams);
          // D4: replaces the `support.delivery.attempt.logged` HTTP projection fanout. Own transaction
          // after the integrator-local audit-log write above; see writeSupportQuestionsDirect.ts header
          // ("DURABILITY"). A missing `organizationId` is a genuine fail-closed (no write, no fallback,
          // no incident) — the retired webapp consumer ALSO rejected this case non-retryably
          // (`support.delivery.attempt.logged: organizationId required`, `retryable: false`), so skipping
          // both the direct write and retry enqueue changes nothing about the eventual outcome.
          // Anything else (row not written for an unexpected reason) enters the durable direct retry queue.
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
            // Global/pre-login delivery has no clinic support timeline by design. The mandatory
            // operational audit was already persisted above; this optional organization projection
            // is simply not applicable. Unexpected failures with a known organization stay loud below.
            return;
          }
          const deliveryAttemptId =
            intentEventId ?? correlationId ?? `del-${hashPayload(deliveryFallbackPayload)}`;
          const directInput = {
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
          };
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
                  appendSupportDeliveryEventDirect(db, directInput),
                );
              } catch (err) {
                await enqueueDirectPublicWriteRetry(db, {
                  operation: 'support_delivery_attempt_append',
                  organizationId,
                  idempotencyKey: projectionIdempotencyKey(
                    'direct-public-write.support-delivery-attempt-append',
                    String(deliveryAttemptId),
                    hashPayload(directInput),
                  ),
                  payload: directInput,
                });
                logger.warn(
                  { err, mutationType: mutation.type, intentEventId, correlationId, channel },
                  'delivery.attempt.log: direct public write failed, queued durable direct retry',
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
