/**
 * Track D — D5: reminder rules direct-public write.
 *
 * ONE bounded integrator transaction writes directly to `public.reminder_rules`, replacing the retired
 * `reminder.rule.upserted` HTTP projection path.
 *
 * TWO gaps found and fixed while consolidating (same "found + fixed a latent bug in the retired path"
 * pattern as the neighboring direct-public writers):
 *
 * 1. FIELD-COMPLETENESS GAP. The retired projection's payload (`buildReminderRuleUpsertKeyPayload`,
 *    `writePort.ts`) only ever carried the narrow fingerprint field set (id/user/category/enabled/
 *    schedule/timezone/interval/window/daysMask/contentMode) — `linkedObjectType`, `linkedObjectId`,
 *    `customTitle`, `customText`, `scheduleData`, `reminderIntent`, `quietHoursStart/EndMinute` and
 *    `notificationTopicCode` were not carried by the retired projection and never reached
 *    `public.reminder_rules` — every bot/webhook-originated rule with a linked object (LFK complex,
 *    rehab program, custom text, etc.) landed in the webapp/patient-facing table missing those fields.
 *    This direct write carries the FULL field set (parity with `upsertReminderRule`'s own column list).
 * 2. ORGANIZATION-ID GAP. `upsertRuleFromProjection`'s INSERT never set `organization_id` at all — every
 *    projection-consumer-created row is permanently org-NULL, invisible to any `app.is_staff()` +
 *    `current_org_id()` org-scoped read (same class of bug D3 found for `support_conversations`: "none
 *    of the retired HTTP consumers ever wrote organization_id"). This direct write resolves the platform
 *    user's exactly-one active `org_enrollments` row (`resolveExactActiveOrganizationId`) and sets it.
 *
 * DURABILITY / FAIL-CLOSED PHILOSOPHY — aligned with D3's
 * `conversation.open`: `reminder_rules` has NEVER had an ownership/ambiguity fail-closed gate (the retired
 * consumer wrote the row unconditionally, even with a NULL-resolved platform user — `platform_user_id` is
 * nullable on this table and `resolvePlatformUserId` returning null there was tolerated, not fatal).
 * Introducing a NEW hard "no write" case here would be a behavioural REGRESSION, not a hardening. So this
 * module has NO
 * fail-closed-no-write branch of its own: platform-user-unresolved, ambiguous-platform-user, and
 * org-unresolved/ambiguous ALL throw and are treated by the caller (`writePort.ts`) as a durable direct-write
 * retry, not as a silent drop. This keeps the write at-least-once in every case, same as before D5, while
 * the HAPPY path gets full field parity + a correct organization_id.
 *
 * PLATFORM-USER RESOLUTION: integrator_user_id-only (no channel/phone args), matching the retired path's
 * resolution (`resolvePlatformUserId` → `findCanonicalUserIdByIntegratorId`, integrator-space id only) —
 * `collectPlatformUserCandidates` is called with `channelCode: ''`, `externalId: ''`; the channel-binding
 * branch is a no-op on empty args.
 *
 * D17: THE WRITE ITSELF IS NO LONGER RELATIONAL. The canonical row and the occurrence sweep that
 * used to run as two statements of one integrator transaction are now the single named root
 * `app.integrator_upsert_reminder_rule` (SECURITY DEFINER, owner `app_seam_reminder_patient_owner`),
 * which keeps them atomic inside its own body and repeats the tenant wall RLS used to apply
 * (`rev10_tenant_insert_173` / `rev10_tenant_update_173` / `rev10_tenant_delete_17`) — see the root's
 * migration. Platform-user/organization RESOLUTION stays here and stays relational: it only reads.
 *
 * CHOKEPOINT: injected `DbPort`; the resolution reads run inside `db.tx(...)`, the write runs through
 * `runIntegratorNamedRoot` (which refuses to start inside an open relation transaction). Raw SQL is
 * allowed here (src/infra/db repo).
 */
import { sql } from 'drizzle-orm';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { runIntegratorNamedRoot } from '../runIntegratorSql.js';
import { collectPlatformUserCandidates } from './writeIdentityAndPreferencesDirect.js';
import { resolveExactActiveOrganizationId } from './resolveDirectPublicActor.js';

const UPSERT_REMINDER_RULE_ROOT =
  'app.integrator_upsert_reminder_rule(text,text,uuid,bigint,text,boolean,text,text,integer,integer,integer,text,text,text,text,text,text,text,text,integer,integer,text,boolean)';

export type UpsertReminderRuleDirectInput = {
  /** Raw integrator-space id (`identities.user_id`), NOT a `public.platform_users.id`. */
  integratorUserId: string;
  integratorRuleId: string;
  category: string;
  isEnabled: boolean;
  scheduleType: string;
  timezone: string;
  intervalMinutes: number;
  windowStartMinute: number;
  windowEndMinute: number;
  daysMask: string;
  contentMode: string;
  linkedObjectType: string | null;
  linkedObjectId: string | null;
  customTitle: string | null;
  customText: string | null;
  scheduleData: unknown;
  reminderIntent: string | null;
  quietHoursStartMinute: number | null;
  quietHoursEndMinute: number | null;
  /**
   * `undefined` (caller's mutation had no `notificationTopicCode` key at all) means PRESERVE the
   * existing stored value, matching `upsertReminderRule`'s (the integrator-local writer's) own
   * `hasOwnProperty` preserve-on-absent semantic — NOT "clear it". `null` means explicitly clear.
   */
  notificationTopicCode: string | null | undefined;
  /** Exact pre-routing result; both values must be present or the repository resolves them itself. */
  resolvedPlatformUserId?: string | null;
  resolvedOrganizationId?: string | null;
};

export type UpsertReminderRuleDirectResult = {
  platformUserId: string;
  organizationId: string;
  updatedAt: string;
};

export type ReminderRuleDirectWriteFailureCode = 'no_platform_user_candidate';

/**
 * Thrown ONLY for the one case that is neither a resolvable write nor a shared-resolution ambiguity:
 * no platform user has ever been
 * linked to this integrator user. Callers treat this identically to any other unexpected failure — fall
 * back to the durable outbox — it is exported/typed only so tests and callers can assert on it by name.
 */
export class ReminderRuleDirectWriteError extends Error {
  readonly code: ReminderRuleDirectWriteFailureCode;

  readonly details: Record<string, unknown>;

  constructor(code: ReminderRuleDirectWriteFailureCode, details: Record<string, unknown> = {}) {
    super(code);
    this.name = 'ReminderRuleDirectWriteError';
    this.code = code;
    this.details = details;
  }
}

function scheduleDataJson(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  try {
    return JSON.stringify(raw);
  } catch {
    return null;
  }
}

/** D5 entrypoint replacing the `reminder.rule.upserted` HTTP projection. */
export async function upsertReminderRuleDirect(
  db: DbPort,
  input: UpsertReminderRuleDirectInput,
): Promise<UpsertReminderRuleDirectResult> {
  const canonicalIntegratorUserId = input.integratorUserId;
  let platformUserId = input.resolvedPlatformUserId ?? null;
  let organizationId = input.resolvedOrganizationId ?? null;
  if (!platformUserId || !organizationId) {
    // Integrator_user_id-only resolution (no channel/phone args) — see file header. Read-only, so it
    // keeps its own bounded transaction and finishes before the named root opens its context.
    const resolved = await db.tx(async (txDb) => {
      const candidates = await collectPlatformUserCandidates(txDb, {
        integratorUserId: canonicalIntegratorUserId,
        phoneNormalized: null,
        channelCode: '',
        externalId: '',
      });
      const candidateId = candidates[0] ?? null;
      if (!candidateId) {
        throw new ReminderRuleDirectWriteError('no_platform_user_candidate', {
          integratorUserId: canonicalIntegratorUserId,
        });
      }
      // Fail-closed via the exact-org resolver on 0/2+ active enrollments. The caller
      // treats this as a durable direct-write retry when no pre-routing result was available.
      return {
        platformUserId: candidateId,
        organizationId: await resolveExactActiveOrganizationId(txDb, candidateId),
      };
    });
    platformUserId = resolved.platformUserId;
    organizationId = resolved.organizationId;
  }
  const notificationTopicCodeProvided = input.notificationTopicCode !== undefined;
  const notificationTopicCodeValue = notificationTopicCodeProvided
    ? input.notificationTopicCode
    : null;
  const scheduleDataValue = scheduleDataJson(input.scheduleData);

  const res = await runIntegratorNamedRoot<{ updated_at: string | null }>(
    db,
    UPSERT_REMINDER_RULE_ROOT,
    [
      input.integratorRuleId,
      platformUserId,
      organizationId,
      canonicalIntegratorUserId,
      input.category,
      input.isEnabled,
      input.scheduleType,
      input.timezone,
      input.intervalMinutes,
      input.windowStartMinute,
      input.windowEndMinute,
      input.daysMask,
      input.contentMode,
      input.linkedObjectType,
      input.linkedObjectId,
      input.customTitle,
      input.customText,
      scheduleDataValue,
      input.reminderIntent,
      input.quietHoursStartMinute,
      input.quietHoursEndMinute,
      notificationTopicCodeValue,
      notificationTopicCodeProvided,
    ],
    sql`SELECT app.integrator_upsert_reminder_rule(
      ${input.integratorRuleId}::text, ${platformUserId}::text, ${organizationId}::uuid,
      ${canonicalIntegratorUserId}::bigint, ${input.category}::text, ${input.isEnabled}::boolean,
      ${input.scheduleType}::text, ${input.timezone}::text, ${input.intervalMinutes}::integer,
      ${input.windowStartMinute}::integer, ${input.windowEndMinute}::integer,
      ${input.daysMask}::text, ${input.contentMode}::text,
      ${input.linkedObjectType}::text, ${input.linkedObjectId}::text,
      ${input.customTitle}::text, ${input.customText}::text,
      ${scheduleDataValue}::text, ${input.reminderIntent}::text,
      ${input.quietHoursStartMinute}::integer, ${input.quietHoursEndMinute}::integer,
      ${notificationTopicCodeValue}::text, ${notificationTopicCodeProvided}::boolean
    ) AS updated_at`,
  );
  const updatedAt = res.rows[0]?.updated_at;
  if (!updatedAt) throw new Error('reminder_rules upsert returned no row');
  return { platformUserId, organizationId, updatedAt };
}
