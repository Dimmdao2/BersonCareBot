import { sql } from 'drizzle-orm';
/** TX-scoped SQL on the caller's `PoolClient`. */
import { getCurrentDbPrincipalOrganizationId } from '@bersoncare/db-principal';
import type { Pool, PoolClient } from 'pg';
import { getWebappSqlFromPgClient, runWebappSql } from '@/infra/db/runWebappSql';
import { mutateCanonicalUserContactsWebapp } from '@/infra/repos/userContactsSql';

/** F6 case 4 (§2a, migration 0342): 'oauth' — phone added as a confirmed contact by an OAuth
 *  provider that returned it alongside an already-matched email (never a login identifier). */
export type PhoneHistorySource = 'otp' | 'messenger' | 'merge' | 'admin' | 'projection' | 'oauth';

/** Канал, доказуемо подтвердивший номер в этой транзакции (`otp`/`messenger` source only). */
export type PhoneHistoryConfirmingChannel = 'telegram' | 'max' | 'email' | 'sms';

/**
 * Canonically changes the phone and records the historical interval in the same transaction.
 */
export async function applyPlatformUserPhoneHistoryTransition(
  client: Pool | PoolClient,
  opts: {
    platformUserId: string;
    newPhoneNormalized: string | null;
    source: PhoneHistorySource;
    /** §3.1 default provenance (`getDefaultAuthOtpChannel`); omit when the source isn't a channel confirmation. */
    confirmingChannel?: PhoneHistoryConfirmingChannel | null;
  },
): Promise<void> {
  const db = getWebappSqlFromPgClient(client as PoolClient);
  const principalMode = process.env.DB_PRINCIPAL_CONTEXT_MODE;
  if (principalMode === 'locked' || principalMode === 'port-context') {
    await runWebappSql(
      db,
      sql`SELECT app.close_active_user_phone_history(${opts.platformUserId}::uuid)`,
    );
  } else {
    await runWebappSql(
      db,
      sql`UPDATE user_phone_history SET valid_to = now()
       WHERE platform_user_id = ${opts.platformUserId}::uuid AND valid_to IS NULL`,
    );
  }

  const p = opts.newPhoneNormalized?.trim();
  if (p) {
    const organizationId = getCurrentDbPrincipalOrganizationId() ?? null;
    await runWebappSql(
      db,
      sql`INSERT INTO user_phone_history (
         platform_user_id, phone_normalized, valid_from, valid_to, source, organization_id, confirming_channel
       )
       VALUES (${opts.platformUserId}::uuid, ${p}::text, now(), NULL, ${opts.source}::text, ${sql.param(organizationId)}::uuid, ${opts.confirmingChannel ?? null}::text)`,
    );
  }
  await mutateCanonicalUserContactsWebapp(
    db,
    opts.platformUserId,
    p
      ? [
          {
            action: 'upsert',
            kind: 'phone',
            valueNormalized: p,
            isPrimary: true,
            confirmedAt: new Date().toISOString(),
            sourceOrigin: 'direct',
          },
        ]
      : [{ action: 'remove', kind: 'phone' }],
  );
}
