/**
 * D28 — «при отвязке номера — он удаляется вместе с подтверждением» (`WORK_ORDER.md` §2.3 Р-D28).
 * `user_contacts` is the account's canonical current phone source; `user_phone_history`
 * is the append-only confirmation ledger (`valid_to IS NULL` = the number is currently confirmed for that
 * account). Every writer in this package that sets/replaces a confirmed phone must close the account's
 * previous active spell in the same transaction — otherwise the OLD number keeps an "active" confirmation
 * row forever (`uq_user_phone_history_phone_active`), which is exactly the state that later blocks a
 * different, legitimate owner of that same (reassigned/SIM-recycled) number from confirming it themselves.
 */
import { sql } from 'drizzle-orm';
import type { PlatformMergeDbClient } from './pgPlatformUserMerge.js';
import { runMergeSql } from './mergeSql.js';

/** `user_phone_history.source` values written by this package's own confirm-paths. */
export type PhoneHistorySyncSource = 'messenger' | 'projection';

/**
 * Close the account's current active `user_phone_history` spell (whatever number it names — self-heals
 * drift from before this fix existed) and open a new one for `newPhoneNormalized`, in lockstep with a
 * caller that is about to upsert the canonical phone for this account.
 * No-op when the account's ALREADY-current primary phone (read fresh from `user_contacts`) already equals
 * the incoming number — a repeat webhook for
 * an unchanged, already-confirmed number must not keep opening/closing history rows.
 */
export async function syncPlatformUserPhoneHistoryOnConfirm(
  db: PlatformMergeDbClient,
  platformUserId: string,
  newPhoneNormalized: string,
  source: PhoneHistorySyncSource,
): Promise<void> {
  const current = await runMergeSql<{ phone_normalized: string | null }>(
    db,
    sql`SELECT value_normalized AS phone_normalized FROM public.user_contacts
        WHERE platform_user_id = ${platformUserId}::uuid
          AND contact_kind = 'phone' AND is_primary = true LIMIT 1`,
  );
  if (current.rows[0]?.phone_normalized === newPhoneNormalized) return;

  await runMergeSql(
    db,
    sql`UPDATE public.user_phone_history SET valid_to = now()
     WHERE platform_user_id = ${platformUserId}::uuid AND valid_to IS NULL`,
  );
  await runMergeSql(
    db,
    sql`INSERT INTO public.user_phone_history (platform_user_id, phone_normalized, valid_from, valid_to, source)
     VALUES (${platformUserId}::uuid, ${newPhoneNormalized}::text, now(), NULL, ${source}::text)`,
  );
}
