import { getPool } from "@/infra/db/client";
import { getWebappSqlFromPgClient, runWebappPgText } from "@/infra/db/runWebappSql";
import { findCanonicalUserIdByPhone } from "@/infra/repos/pgCanonicalPlatformUser";
import { applyPlatformUserPhoneHistoryTransition } from "@/infra/repos/pgPhoneHistory";

export type ResolveOrCreateDoctorClientByPhoneInput = {
  phoneNormalized: string;
  displayName: string;
  emailRaw: string | null;
  emailNormalized: string | null;
};

export type ResolveOrCreateDoctorClientByPhoneResult =
  | {
      ok: true;
      created: false;
      userId: string;
      displayName: string;
      phoneNormalized: string;
    }
  | {
      ok: true;
      created: true;
      userId: string;
      displayName: string;
    }
  | { ok: false; error: "email_conflict" | "create_failed" };

export async function resolveOrCreateDoctorClientByPhone(
  input: ResolveOrCreateDoctorClientByPhoneInput,
): Promise<ResolveOrCreateDoctorClientByPhoneResult> {
  const pool = getPool();
  const existingId = await findCanonicalUserIdByPhone(pool, input.phoneNormalized);
  if (existingId) {
    const row = await runWebappPgText<{ display_name: string; phone_normalized: string | null }>(
      `SELECT display_name, phone_normalized FROM platform_users WHERE id = $1::uuid`,
      [existingId],
    );
    const existing = row.rows[0];
    if (!existing) return { ok: false, error: "create_failed" };
    return {
      ok: true,
      created: false,
      userId: existingId,
      displayName: existing.display_name,
      phoneNormalized: existing.phone_normalized ?? input.phoneNormalized,
    };
  }

  if (input.emailNormalized) {
    const conflict = await runWebappPgText<{ id: string }>(
      `SELECT id FROM platform_users
       WHERE merged_into_id IS NULL
         AND email IS NOT NULL
         AND lower(trim(email)) = $1
       LIMIT 1`,
      [input.emailNormalized],
    );
    if (conflict.rows.length > 0) {
      return { ok: false, error: "email_conflict" };
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await runWebappPgText<{ id: string; display_name: string }>(
      `INSERT INTO platform_users (
         phone_normalized, display_name, email, email_normalized, role, patient_phone_trust_at
       ) VALUES (
         $1, $2, $3,
         CASE WHEN $3::text IS NOT NULL AND btrim($3::text) <> '' THEN lower(btrim($3::text)) ELSE NULL END,
         'client', now()
       )
       RETURNING id, display_name`,
      [input.phoneNormalized, input.displayName, input.emailRaw],
      getWebappSqlFromPgClient(client),
    );
    const userId = inserted.rows[0]?.id;
    if (!userId) {
      await client.query("ROLLBACK");
      return { ok: false, error: "create_failed" };
    }
    await applyPlatformUserPhoneHistoryTransition(client, {
      platformUserId: userId,
      newPhoneNormalized: input.phoneNormalized,
      source: "admin",
    });
    await client.query("COMMIT");
    return {
      ok: true,
      created: true,
      userId,
      displayName: inserted.rows[0]!.display_name,
    };
  } catch {
    await client.query("ROLLBACK");
    return { ok: false, error: "create_failed" };
  } finally {
    client.release();
  }
}
