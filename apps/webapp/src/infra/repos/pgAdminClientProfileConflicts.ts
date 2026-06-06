/** Wave 3 phase 15E — admin profile patch conflict lookups via `runWebappPgText`. */
import { runWebappPgText } from "@/infra/db/runWebappSql";

export async function findPlatformUserIdWithEmailConflict(
  canonicalId: string,
  email: string,
): Promise<string | null> {
  const r = await runWebappPgText<{ id: string }>(
    `SELECT id::text AS id FROM platform_users
     WHERE id <> $1::uuid
       AND merged_into_id IS NULL
       AND email IS NOT NULL
       AND lower(trim(email)) = lower(trim($2::text))
     LIMIT 1`,
    [canonicalId, email],
  );
  return r.rows[0]?.id ?? null;
}

export async function findPlatformUserIdWithPhoneConflict(
  canonicalId: string,
  phoneNormalized: string,
): Promise<string | null> {
  const r = await runWebappPgText<{ id: string }>(
    `SELECT id::text AS id FROM platform_users
     WHERE id <> $1::uuid
       AND merged_into_id IS NULL
       AND phone_normalized IS NOT NULL
       AND phone_normalized = $2
     LIMIT 1`,
    [canonicalId, phoneNormalized],
  );
  return r.rows[0]?.id ?? null;
}
