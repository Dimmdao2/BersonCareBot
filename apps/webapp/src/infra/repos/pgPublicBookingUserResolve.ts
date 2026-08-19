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
 */
export async function enrollCurrentPatientInPublicBookingClinic(
  organizationId: string,
): Promise<'invited' | 'active'> {
  const result = await runWebappNamedRoot<{ status: string | null }>(
    getWebappSqlDb(),
    'app.enroll_current_patient_in_public_booking_clinic(uuid)',
    [organizationId],
    sql`SELECT app.enroll_current_patient_in_public_booking_clinic(${organizationId}::uuid) AS status`,
  );
  const status = result.rows[0]?.status ?? null;
  if (status !== 'active' && status !== 'invited') {
    throw new Error('booking_blocked');
  }
  return status;
}
