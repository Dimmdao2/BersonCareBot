import type { Pool, PoolClient } from "pg";

export type PhoneHistorySource = "otp" | "messenger" | "merge" | "admin" | "projection";

/**
 * Вызывать **после** того, как в транзакции обновлён `platform_users.phone_normalized`
 * (закрывает предыдущие активные интервалы и открывает новый для текущего номера).
 */
export async function applyPlatformUserPhoneHistoryTransition(
  client: Pool | PoolClient,
  opts: {
    platformUserId: string;
    newPhoneNormalized: string | null;
    source: PhoneHistorySource;
  },
): Promise<void> {
  await client.query(
    `UPDATE user_phone_history SET valid_to = now()
     WHERE platform_user_id = $1::uuid AND valid_to IS NULL`,
    [opts.platformUserId],
  );
  const p = opts.newPhoneNormalized?.trim();
  if (p) {
    await client.query(
      `INSERT INTO user_phone_history (platform_user_id, phone_normalized, valid_from, valid_to, source)
       VALUES ($1::uuid, $2::text, now(), NULL, $3::text)`,
      [opts.platformUserId, p, opts.source],
    );
  }
}
