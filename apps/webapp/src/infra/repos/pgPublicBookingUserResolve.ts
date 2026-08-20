import { sql } from 'drizzle-orm';
import { getWebappSqlDb, runWebappNamedRoot } from '@/infra/db/runWebappSql';

/**
 * Resolve-or-create a client by normalised phone.
 *
 * `phoneProven` is REQUIRED and has no default on purpose (A-3). Before 2026-07-26 this function
 * stamped `patient_phone_trust_at` on every insert, so an unauthenticated POST to
 * `/api/booking/public/create` minted a phone-trusted identity — the same flag the login path
 * consults (`pgCanonicalPlatformUser.ts:118-127`). Trust is now a claim the caller has to have
 * earned, and the caller has to say so in the type system.
 *
 * Since 2026-08-19 the work happens inside `app.resolve_public_booking_client_by_phone`, a named
 * root owned by `app_seam_public_booking_owner`, instead of relational drizzle statements. It had
 * to: this call sits in the `pre_session` context class, which has no through-going relational door
 * and by the privilege scheme never will, so every statement here died with «Missing declared
 * webapp port capability: pre_session» — the first of the denials that made the whole WRITE half of
 * the public funnel unreachable. The door takes no person id from the caller.
 *
 * @param phoneProven the caller has just proved control of THIS phone number (an SMS code it
 *   entered, or an authenticated session already bound to it). A code delivered to an e-mail does
 *   not qualify — see `channelProvesPhoneControl`.
 */
export async function resolveOrCreateTrustedPatientUserByPhone(
  phoneNormalized: string,
  displayName: string,
  phoneProven: boolean,
): Promise<{ userId: string | null; created: boolean }> {
  const result = await runWebappNamedRoot<{ user_id: string | null }>(
    getWebappSqlDb(),
    'app.resolve_public_booking_client_by_phone(text,text,boolean)',
    [phoneNormalized, displayName, phoneProven],
    sql`SELECT app.resolve_public_booking_client_by_phone(
      ${phoneNormalized}::text, ${displayName}::text, ${phoneProven}::boolean
    ) AS user_id`,
  );
  return { userId: result.rows[0]?.user_id ?? null, created: false };
}

/**
 * Confirmation channels a public booking may record on the clinic relationship.
 *
 * Owner 19.08 (`OWNER_PRODUCT_RULES.md` §33): «Я много раз говорил, какие каналы у нас являются
 * каналами для регистрации пользователя и подтверждения его аккаунта. Публичная запись ничем не
 * отличается.» So the channel is not a constant of this funnel — it names what the person actually
 * proved on THIS booking, out of the channels `AUTH_AND_IDENTITY_CANON.md` §15 already counts as a
 * confirmed contact. The same closed list is the CHECK on `org_enrollments`, and the door refuses
 * anything outside it.
 */
export type PublicBookingConfirmationChannel =
  | 'public_booking_phone_otp'
  | 'public_booking_verified_email'
  | 'public_booking_session';

export type PublicBookingEnrollment = {
  status: 'invited' | 'active';
  /** What the door did, so a failed booking can undo exactly that and nothing else. */
  effect: 'created' | 'activated' | 'unchanged';
};

/**
 * Make the identified visitor a client of the clinic they are booking into.
 *
 * Owner ruling 2026-08-19 (`docs/_TODO/TENANT_CLAIM_IS_NOT_VERIFIED_2026-08-19.md`), verbatim:
 * «КЛИЕНТ — ТОТ У КОГО ЕСТЬ ВИЗИТ ИЛИ НАЗНАЧЕНА ПРОГРАММА ИЛИ ЕСТЬ ПРИГЛАШЕНИЕ ИЛИ ПЕРЕПИСКА ИЛИ
 * ЗАПИСЬ — короче есть аккаунт и какой-то контекст от этой клиники/специалиста». A visitor who
 * proved control of a contact in order to be booked into one named clinic has both, so the
 * relationship is created at identification — it has to be, because the appointment root
 * (`app.create_current_patient_booking_appointments`) refuses a person the clinic has no row for.
 *
 * MUST run under a patient principal: the door reads the person from `app.current_patient_user_id()`
 * and accepts none from the caller, so nobody can enrol somebody else into a clinic.
 *
 * This door never spent the clinic's paid client ceiling (owner 19.08, `OWNER_PRODUCT_RULES.md`
 * §33.2 — migration 0053, reverting the 2026-08-19 change that briefly put it here): «запись на приём
 * сама по себе лимита не расходует и не должна его расходовать». Т12 (owner 19.08, later the same
 * day, `docs/OWNER_DECISIONS.md`: «лимит клиентов - убрать») then removed the ceiling itself — the
 * staff card writer (`ensureInvitedOrganizationClientRelationship`) no longer calls
 * `app.assert_org_patient_count_quota_available` either. The function stays in the schema (migrations
 * are immutable history) but nothing in the application calls it any more.
 */
export async function enrollCurrentPatientInPublicBookingClinic(
  organizationId: string,
  confirmationChannel: PublicBookingConfirmationChannel,
): Promise<PublicBookingEnrollment> {
  const result = await runWebappNamedRoot<{ enrollment: unknown }>(
    getWebappSqlDb(),
    'app.enroll_current_patient_in_public_booking_clinic(uuid,text)',
    [organizationId, confirmationChannel],
    sql`SELECT app.enroll_current_patient_in_public_booking_clinic(
      ${organizationId}::uuid, ${confirmationChannel}::text
    ) AS enrollment`,
  );
  const payload = result.rows[0]?.enrollment as
    | { status?: unknown; effect?: unknown }
    | null
    | undefined;
  const status = payload?.status;
  const effect = payload?.effect;
  if (
    (status !== 'active' && status !== 'invited') ||
    (effect !== 'created' && effect !== 'activated' && effect !== 'unchanged')
  ) {
    throw new Error('booking_blocked');
  }
  return { status, effect };
}

/**
 * Undo the relationship a public booking created, when the booking itself did not happen.
 *
 * Enrolment commits in its own port transaction BEFORE the appointment, and it cannot be otherwise:
 * a named root refuses to run inside a relational transaction (`runWebappSql.ts`), and the
 * appointment root refuses a person the clinic holds no row for. So the compensating step is the
 * only way a visitor whose slot was taken (409 `slot_overlap`) does not stay in the clinic's client
 * list — occupying a paid place and holding a portal the clinic never opened.
 *
 * The door is not told what to undo: it decides from the row itself (public provenance, the age
 * window of one booking attempt, no live appointment), so a visitor cannot use it to erase a card
 * the clinic created.
 */
export async function revokePublicBookingEnrollment(
  organizationId: string,
): Promise<'deleted' | 'reverted' | 'kept' | 'absent'> {
  const result = await runWebappNamedRoot<{ outcome: unknown }>(
    getWebappSqlDb(),
    'app.revoke_public_booking_enrollment(uuid)',
    [organizationId],
    sql`SELECT app.revoke_public_booking_enrollment(${organizationId}::uuid) AS outcome`,
  );
  const effect = (result.rows[0]?.outcome as { effect?: unknown } | null | undefined)?.effect;
  return effect === 'deleted' || effect === 'reverted' || effect === 'absent' ? effect : 'kept';
}
