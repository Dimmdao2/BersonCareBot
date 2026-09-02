import { sql } from 'drizzle-orm';
import { getWebappSqlDb, runWebappSql } from '@/infra/db/runWebappSql';
import {
  findCanonicalUserIdByChannelBinding,
  resolveCanonicalUserId,
} from '@/infra/repos/pgCanonicalPlatformUser';
import { CONTACTS, USER_CONTACTS_PRIMARY_PHONE_LATERAL } from '@/infra/repos/userContactsSql';

export async function replaceChannelLinkSecret(params: {
  userId: string;
  channelCode: 'telegram' | 'max';
  tokenHash: string;
  expiresAtIso: string;
}): Promise<void> {
  await runWebappSql(
    getWebappSqlDb(),
    sql`SELECT app.auth_channel_link_replace_secret(
       ${params.userId}::uuid,
       ${params.channelCode}::text,
       ${params.tokenHash}::text,
       ${params.expiresAtIso}::timestamptz
     )`,
  );
}

export async function loadPlatformPhoneBindingInfo(
  userId: string,
): Promise<{ needsPhone: boolean; phoneNormalized?: string }> {
  const canonical = await resolveCanonicalUserId(getWebappSqlDb(), userId);
  const result = await runWebappSql<{ phone_normalized: string | null }>(
    getWebappSqlDb(),
    sql`SELECT ${sql.raw(CONTACTS.phoneNormalized)} AS phone_normalized
     FROM platform_users pu
     ${sql.raw(USER_CONTACTS_PRIMARY_PHONE_LATERAL)}
     WHERE pu.id = ${canonical}::uuid`,
  );
  const phone = result.rows[0]?.phone_normalized;
  const phoneNormalized =
    typeof phone === 'string' && phone.trim().length > 0 ? phone.trim() : undefined;
  return { needsPhone: phoneNormalized === undefined, phoneNormalized };
}

export type ChannelLinkSecretRow = {
  id: string;
  userId: string;
  expiresAt: string;
  usedAt: string | null;
};

export async function loadChannelLinkSecretByTokenHash(params: {
  channelCode: 'telegram' | 'max';
  tokenHash: string;
}): Promise<ChannelLinkSecretRow | null> {
  const result = await runWebappSql<{
    id: string;
    user_id: string;
    expires_at: string;
    used_at: string | null;
  }>(
    getWebappSqlDb(),
    sql`SELECT id::text AS id, user_id::text AS user_id, expires_at, used_at
     FROM app.auth_channel_link_read_secret(${params.channelCode}::text, ${params.tokenHash}::text)`,
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
  };
}

export async function loadChannelBindingUserId(params: {
  channelCode: 'telegram' | 'max';
  externalId: string;
}): Promise<string | null> {
  const db = getWebappSqlDb();
  const viaContacts = await findCanonicalUserIdByChannelBinding(
    db,
    params.channelCode,
    params.externalId,
  );
  if (viaContacts) return viaContacts;
  const result = await runWebappSql<{ user_id: string }>(
    getWebappSqlDb(),
    sql`SELECT user_id FROM user_channel_bindings WHERE channel_code = ${params.channelCode} AND external_id = ${params.externalId}`,
  );
  return result.rows[0]?.user_id ?? null;
}

export async function markChannelLinkSecretUsed(secretRowId: string): Promise<void> {
  await runWebappSql(
    getWebappSqlDb(),
    sql`SELECT app.auth_channel_link_mark_secret_used(${secretRowId}::uuid) AS marked`,
  );
}

export async function markChannelLinkSecretUsedIfUnused(secretRowId: string): Promise<void> {
  await runWebappSql(
    getWebappSqlDb(),
    sql`SELECT app.auth_channel_link_mark_secret_used_if_unused(${secretRowId}::uuid) AS marked`,
  );
}

export async function insertChannelBinding(params: {
  userId: string;
  channelCode: 'telegram' | 'max';
  externalId: string;
}): Promise<void> {
  await runWebappSql(
    getWebappSqlDb(),
    sql`INSERT INTO user_channel_bindings (user_id, channel_code, external_id)
     VALUES (${params.userId}, ${params.channelCode}, ${params.externalId})`,
  );
}
