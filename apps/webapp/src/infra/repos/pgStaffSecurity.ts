import { z } from 'zod';
import { runWebappPgText } from '@/infra/db/runWebappSql';
import type { StaffSecurityPort, StaffSecurityProfile } from '@/modules/staff-security/ports';
import { nullableToIsoStringSafe } from '@/shared/lib/toIsoStringSafe';

const profileRowSchema = z.object({
  user_id: z.string().uuid(),
  factor_type: z.literal('totp').nullable(),
  totp_secret_ciphertext: z.string().nullable(),
  pending_totp_secret_ciphertext: z.string().nullable(),
  factor_verified_at: z.union([z.string(), z.date()]).nullable(),
  recovery_code_hashes: z.array(z.string()),
  recovery_codes_confirmed_at: z.union([z.string(), z.date()]).nullable(),
  replacement_required: z.coerce.boolean(),
  failed_attempts: z.coerce.number().int().nonnegative(),
  locked_until: z.union([z.string(), z.date()]).nullable(),
  session_version: z.coerce.number().int().nonnegative(),
  login_challenge_hash: z.string().nullable(),
  login_challenge_expires_at: z.union([z.string(), z.date()]).nullable(),
});

const booleanRowSchema = z.object({ ok: z.coerce.boolean() });
const versionRowSchema = z.object({ session_version: z.coerce.number().int().nonnegative() });
const lockedRowSchema = z.object({ locked_until: z.union([z.string(), z.date()]).nullable() });
const recoveryResultRowSchema = booleanRowSchema.extend({
  session_version: z.coerce.number().int().nonnegative(),
});

function mapProfile(row: unknown): StaffSecurityProfile {
  const parsed = profileRowSchema.parse(row);
  return {
    userId: parsed.user_id,
    factorType: parsed.factor_type,
    totpSecretCiphertext: parsed.totp_secret_ciphertext,
    pendingTotpSecretCiphertext: parsed.pending_totp_secret_ciphertext,
    factorVerifiedAt: nullableToIsoStringSafe(parsed.factor_verified_at),
    recoveryCodeHashes: parsed.recovery_code_hashes,
    recoveryCodesConfirmedAt: nullableToIsoStringSafe(parsed.recovery_codes_confirmed_at),
    replacementRequired: parsed.replacement_required,
    failedAttempts: parsed.failed_attempts,
    lockedUntil: nullableToIsoStringSafe(parsed.locked_until),
    sessionVersion: parsed.session_version,
    loginChallengeHash: parsed.login_challenge_hash,
    loginChallengeExpiresAt: nullableToIsoStringSafe(parsed.login_challenge_expires_at),
  };
}

async function getProfile(): Promise<StaffSecurityProfile | null> {
  const result = await runWebappPgText('SELECT * FROM app.get_staff_security_profile()');
  return result.rows[0] ? mapProfile(result.rows[0]) : null;
}

export function createPgStaffSecurityPort(): StaffSecurityPort {
  return {
    async ensureProfile() {
      await runWebappPgText('SELECT app.ensure_staff_security_profile()');
      const profile = await getProfile();
      if (!profile) throw new Error('staff_security_profile_missing');
      return profile;
    },

    getProfile,

    async savePendingTotp(encryptedSecret) {
      await runWebappPgText('SELECT app.save_pending_staff_totp($1::text)', [encryptedSecret]);
    },

    async completeTotpEnrollment({ encryptedSecret, recoveryCodeHashes }) {
      const result = await runWebappPgText(
        'SELECT app.complete_staff_totp_enrollment($1::text, $2::jsonb) AS session_version',
        [encryptedSecret, JSON.stringify(recoveryCodeHashes)],
      );
      return versionRowSchema.parse(result.rows[0]).session_version;
    },

    async confirmRecoveryCodes() {
      const result = await runWebappPgText('SELECT app.confirm_staff_recovery_codes() AS ok');
      return booleanRowSchema.parse(result.rows[0]).ok;
    },

    async beginLoginChallenge({ challengeHash, expiresAt }) {
      const result = await runWebappPgText(
        'SELECT app.begin_staff_login_challenge($1::text, $2::timestamptz) AS ok',
        [challengeHash, expiresAt],
      );
      if (!booleanRowSchema.parse(result.rows[0]).ok) {
        throw new Error('staff_security_factor_not_enrolled');
      }
    },

    async consumeTotpLogin({ challengeHash }) {
      const result = await runWebappPgText('SELECT app.consume_staff_totp_login($1::text) AS ok', [
        challengeHash,
      ]);
      return booleanRowSchema.parse(result.rows[0]).ok;
    },

    async consumeRecoveryLogin({ challengeHash, recoveryCodeHash }) {
      const result = await runWebappPgText(
        'SELECT * FROM app.consume_staff_recovery_login($1::text, $2::text)',
        [challengeHash, recoveryCodeHash],
      );
      const row = recoveryResultRowSchema.parse(result.rows[0]);
      return { ok: row.ok, sessionVersion: row.session_version };
    },

    async recordFailedFactorAttempt() {
      const result = await runWebappPgText(
        'SELECT app.record_failed_staff_factor_attempt() AS locked_until',
      );
      return nullableToIsoStringSafe(lockedRowSchema.parse(result.rows[0]).locked_until);
    },

    async revokeSessions() {
      const result = await runWebappPgText('SELECT app.revoke_staff_sessions() AS session_version');
      return versionRowSchema.parse(result.rows[0]).session_version;
    },
  };
}
