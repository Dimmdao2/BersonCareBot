import { getPool } from "@/app-layer/db/client";
import { fireAndForgetContactEmailSetup } from "@/modules/auth/emailSetupAccess/enqueueContactEmailSetup";
import type { EmailSetupAccessService } from "@/modules/auth/emailSetupAccess/service";
import { findCanonicalUserIdByPhone } from "@/infra/repos/pgCanonicalPlatformUser";
import { applyPlatformUserPhoneHistoryTransition } from "@/infra/repos/pgPhoneHistory";
import {
  TrustedPatientPhoneSource,
  trustedPatientPhoneWriteAnchor,
} from "@/modules/platform-access/trustedPhonePolicy";
import { normalizeRuPhoneE164 } from "@/shared/phone/normalizeRuPhoneE164";

export type CreateDoctorClientInput = {
  displayName?: string | null;
  phone: string;
  email?: string | null;
  createdByUserId: string;
};

export type CreateDoctorClientResult =
  | {
      ok: true;
      userId: string;
      displayName: string;
      phoneNormalized: string;
      created: boolean;
      emailSetupEnqueued: boolean;
    }
  | { ok: false; error: "invalid_phone" | "invalid_email" | "email_conflict" | "create_failed" };

export async function createDoctorClient(
  input: CreateDoctorClientInput,
  emailSetupAccess: Pick<EmailSetupAccessService, "requestContactEmailSetup">,
): Promise<CreateDoctorClientResult> {
  const phoneNormalized = normalizeRuPhoneE164(input.phone.trim());
  if (!/^\+7\d{10}$/.test(phoneNormalized)) {
    return { ok: false, error: "invalid_phone" };
  }

  const emailRaw = input.email?.trim() ?? "";
  const emailNorm = emailRaw ? emailRaw.toLowerCase() : null;
  if (emailRaw && !zEmailSafe(emailRaw)) {
    return { ok: false, error: "invalid_email" };
  }

  const pool = getPool();
  const existingId = await findCanonicalUserIdByPhone(pool, phoneNormalized);
  if (existingId) {
    const row = await pool.query<{ display_name: string; phone_normalized: string | null }>(
      `SELECT display_name, phone_normalized FROM platform_users WHERE id = $1::uuid`,
      [existingId],
    );
    const existing = row.rows[0];
    if (!existing) return { ok: false, error: "create_failed" };
    return {
      ok: true,
      userId: existingId,
      displayName: existing.display_name,
      phoneNormalized: existing.phone_normalized ?? phoneNormalized,
      created: false,
      emailSetupEnqueued: false,
    };
  }

  if (emailNorm) {
    const conflict = await pool.query<{ id: string }>(
      `SELECT id FROM platform_users
       WHERE merged_into_id IS NULL
         AND email IS NOT NULL
         AND lower(trim(email)) = $1
       LIMIT 1`,
      [emailNorm],
    );
    if (conflict.rows.length > 0) {
      return { ok: false, error: "email_conflict" };
    }
  }

  const displayName =
    input.displayName?.trim().slice(0, 500) ||
    emailRaw ||
    phoneNormalized;

  trustedPatientPhoneWriteAnchor(TrustedPatientPhoneSource.DoctorStaffClientCreate);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const ins = await client.query<{ id: string; display_name: string }>(
      `INSERT INTO platform_users (
         phone_normalized, display_name, email, email_normalized, role, patient_phone_trust_at
       ) VALUES (
         $1, $2, $3,
         CASE WHEN $3::text IS NOT NULL AND btrim($3::text) <> '' THEN lower(btrim($3::text)) ELSE NULL END,
         'client', now()
       )
       RETURNING id, display_name`,
      [phoneNormalized, displayName, emailRaw || null],
    );
    const userId = ins.rows[0]?.id;
    if (!userId) {
      await client.query("ROLLBACK");
      return { ok: false, error: "create_failed" };
    }
    await applyPlatformUserPhoneHistoryTransition(client, {
      platformUserId: userId,
      newPhoneNormalized: phoneNormalized,
      source: "admin",
    });
    await client.query("COMMIT");

    let emailSetupEnqueued = false;
    if (emailNorm) {
      fireAndForgetContactEmailSetup(
        emailSetupAccess,
        {
          userId,
          emailNormalized: emailNorm,
          source: "doctor_profile",
          createdByUserId: input.createdByUserId,
        },
        { hook: "doctor_client_create" },
      );
      emailSetupEnqueued = true;
    }

    return {
      ok: true,
      userId,
      displayName: ins.rows[0]!.display_name,
      phoneNormalized,
      created: true,
      emailSetupEnqueued,
    };
  } catch {
    await client.query("ROLLBACK");
    return { ok: false, error: "create_failed" };
  } finally {
    client.release();
  }
}

function zEmailSafe(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 320;
}
