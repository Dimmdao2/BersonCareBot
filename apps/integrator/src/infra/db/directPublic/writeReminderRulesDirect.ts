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
 * CHOKEPOINT: injected `DbPort`; writes run on the tx-bound connection inside `db.tx(...)`. Raw SQL is
 * allowed here (src/infra/db repo).
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { runIntegratorSql } from '../runIntegratorSql.js';
import { collectPlatformUserCandidates } from './writeIdentityAndPreferencesDirect.js';
import { resolveExactActiveOrganizationId } from './resolveDirectPublicActor.js';
import { userReminderOccurrences } from '../schema/integratorDomainRepos.js';
import { getIntegratorDrizzleSession } from '../drizzle.js';

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
  return db.tx(async (txDb) => {
    const canonicalIntegratorUserId = input.integratorUserId;
    // Integrator_user_id-only resolution (no channel/phone args) — see file header.
    let platformUserId = input.resolvedPlatformUserId ?? null;
    let organizationId = input.resolvedOrganizationId ?? null;
    if (!platformUserId || !organizationId) {
      const candidates = await collectPlatformUserCandidates(txDb, {
        integratorUserId: canonicalIntegratorUserId,
        phoneNormalized: null,
        channelCode: '',
        externalId: '',
      });
      platformUserId = candidates[0] ?? null;
      if (!platformUserId) {
        throw new ReminderRuleDirectWriteError('no_platform_user_candidate', {
          integratorUserId: canonicalIntegratorUserId,
        });
      }
      // Fail-closed via the exact-org resolver on 0/2+ active enrollments. The caller
      // treats this as a durable direct-write retry when no pre-routing result was available.
      organizationId = await resolveExactActiveOrganizationId(txDb, platformUserId);
    }
    const notificationTopicCodeProvided = input.notificationTopicCode !== undefined;
    const notificationTopicCodeValue = notificationTopicCodeProvided
      ? input.notificationTopicCode
      : null;
    const scheduleDataValue = scheduleDataJson(input.scheduleData);

    const res = await runIntegratorSql<{ updated_at: string }>(
      txDb,
      sql`INSERT INTO public.reminder_rules (
         integrator_rule_id, platform_user_id, organization_id, integrator_user_id, category, is_enabled,
         schedule_type, timezone, interval_minutes, window_start_minute, window_end_minute,
         days_mask, content_mode,
         linked_object_type, linked_object_id, custom_title, custom_text,
         schedule_data, reminder_intent, quiet_hours_start_minute, quiet_hours_end_minute,
         notification_topic_code, updated_at
       )
       VALUES (
         ${input.integratorRuleId}, ${platformUserId}::uuid, ${organizationId}::uuid, ${canonicalIntegratorUserId}::bigint, ${input.category}, ${input.isEnabled},
         ${input.scheduleType}, ${input.timezone}, ${input.intervalMinutes}, ${input.windowStartMinute}, ${input.windowEndMinute},
         ${input.daysMask}, ${input.contentMode},
         ${input.linkedObjectType}, ${input.linkedObjectId}, ${input.customTitle}, ${input.customText},
         ${scheduleDataValue}::jsonb, ${input.reminderIntent}, ${input.quietHoursStartMinute}, ${input.quietHoursEndMinute},
         ${notificationTopicCodeValue}, now()
       )
       ON CONFLICT (integrator_rule_id) DO UPDATE SET
         platform_user_id = COALESCE(EXCLUDED.platform_user_id, reminder_rules.platform_user_id),
         organization_id = COALESCE(EXCLUDED.organization_id, reminder_rules.organization_id),
         integrator_user_id = EXCLUDED.integrator_user_id,
         category = EXCLUDED.category,
         is_enabled = EXCLUDED.is_enabled,
         schedule_type = EXCLUDED.schedule_type,
         timezone = EXCLUDED.timezone,
         interval_minutes = EXCLUDED.interval_minutes,
         window_start_minute = EXCLUDED.window_start_minute,
         window_end_minute = EXCLUDED.window_end_minute,
         days_mask = EXCLUDED.days_mask,
         content_mode = EXCLUDED.content_mode,
         linked_object_type = EXCLUDED.linked_object_type,
         linked_object_id = EXCLUDED.linked_object_id,
         custom_title = EXCLUDED.custom_title,
         custom_text = EXCLUDED.custom_text,
         schedule_data = EXCLUDED.schedule_data,
         reminder_intent = EXCLUDED.reminder_intent,
         quiet_hours_start_minute = EXCLUDED.quiet_hours_start_minute,
         quiet_hours_end_minute = EXCLUDED.quiet_hours_end_minute,
         notification_topic_code = CASE WHEN ${notificationTopicCodeProvided} THEN EXCLUDED.notification_topic_code ELSE reminder_rules.notification_topic_code END,
         updated_at = EXCLUDED.updated_at
       RETURNING updated_at::text AS updated_at`,
    );
    const updatedAt = res.rows[0]?.updated_at;
    if (!updatedAt) throw new Error('reminder_rules upsert returned no row');
    await getIntegratorDrizzleSession(txDb)
      .delete(userReminderOccurrences)
      .where(
        and(
          eq(userReminderOccurrences.ruleId, input.integratorRuleId),
          inArray(userReminderOccurrences.status, ['planned', 'queued']),
        ),
      );
    return { platformUserId, organizationId, updatedAt };
  });
}
