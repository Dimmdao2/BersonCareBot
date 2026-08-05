import type { PlatformMergeDbClient } from './pgPlatformUserMerge.js';

/**
 * D15b/6 dual-write: rebuild `user_contacts` for one user from the four source tables.
 * Called after contact writes while legacy columns/bindings remain authoritative.
 */
export async function syncUserContactsMirror(
  db: PlatformMergeDbClient,
  platformUserId: string,
): Promise<void> {
  await db.query(`DELETE FROM user_contacts WHERE platform_user_id = $1::uuid`, [platformUserId]);

  await db.query(
    `INSERT INTO user_contacts (
       platform_user_id, contact_kind, channel_code, value_normalized,
       is_primary, confirmed_at, source_origin, updated_at
     )
     SELECT pu.id, 'phone', NULL, pu.phone_normalized,
            true, pu.patient_phone_trust_at, 'platform_users', now()
     FROM platform_users pu
     WHERE pu.id = $1::uuid AND pu.merged_into_id IS NULL AND pu.phone_normalized IS NOT NULL`,
    [platformUserId],
  );

  await db.query(
    `INSERT INTO user_contacts (
       platform_user_id, contact_kind, channel_code, value_normalized,
       is_primary, confirmed_at, source_origin, updated_at
     )
     SELECT pu.id, 'email', NULL, pu.email_normalized,
            true, pu.email_verified_at, 'platform_users', now()
     FROM platform_users pu
     WHERE pu.id = $1::uuid AND pu.merged_into_id IS NULL AND pu.email_normalized IS NOT NULL`,
    [platformUserId],
  );

  await db.query(
    `INSERT INTO user_contacts (
       platform_user_id, contact_kind, channel_code, value_normalized,
       is_primary, confirmed_at, source_origin, updated_at
     )
     SELECT ob.user_id, 'email', ob.provider, lower(btrim(ob.email)),
            false, ob.created_at, 'oauth_binding', now()
     FROM user_oauth_bindings ob
     INNER JOIN platform_users pu ON pu.id = ob.user_id
     WHERE ob.user_id = $1::uuid
       AND pu.merged_into_id IS NULL
       AND ob.email IS NOT NULL
       AND btrim(ob.email) <> ''`,
    [platformUserId],
  );

  await db.query(
    `INSERT INTO user_contacts (
       platform_user_id, contact_kind, channel_code, value_normalized,
       is_primary, confirmed_at, source_origin, updated_at
     )
     SELECT uph.platform_user_id, 'phone', NULL, uph.phone_normalized,
            false, uph.valid_from, 'phone_history', now()
     FROM user_phone_history uph
     INNER JOIN platform_users pu ON pu.id = uph.platform_user_id
     WHERE uph.platform_user_id = $1::uuid
       AND uph.valid_to IS NULL
       AND pu.merged_into_id IS NULL`,
    [platformUserId],
  );

  await db.query(
    `INSERT INTO user_contacts (
       platform_user_id, contact_kind, channel_code, value_normalized,
       is_primary, confirmed_at, source_origin, updated_at
     )
     SELECT ucb.user_id, 'channel', ucb.channel_code, ucb.external_id,
            false, ucb.created_at, 'channel_binding', now()
     FROM user_channel_bindings ucb
     INNER JOIN platform_users pu ON pu.id = ucb.user_id
     WHERE ucb.user_id = $1::uuid AND pu.merged_into_id IS NULL`,
    [platformUserId],
  );
}
