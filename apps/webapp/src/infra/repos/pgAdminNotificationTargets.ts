import { runWebappPgText } from '@/infra/db/runWebappSql';
import {
  CONTACTS,
  USER_CONTACTS_PRIMARY_LATERALS,
} from '@/infra/repos/userContactsSql';

export type AdminNotificationTargets = {
  telegram: string[];
  max: string[];
  sms: string[];
  email: string[];
};

type AdminNotificationTargetRow = {
  phone_normalized: string | null;
  email_normalized: string | null;
  channel_code: string | null;
  external_id: string | null;
};

/**
 * C-4 (2026-07-26, docs/ARCHITECTURE/ADMIN_ACCESS_MODEL.md): operator-alert recipients are resolved
 * from WHO ACTUALLY HOLDS THE ADMIN ROLE right now — not from the `admin_telegram_ids`/
 * `admin_max_ids`/`admin_phones` address lists, which used to double as both a role grant and an
 * audience. Cutting the grant half without moving this half would have silently killed alert
 * delivery too (the class of outage the July SMTP-quota gap already was — unnoticed for a day).
 *
 * No RLS/new grant needed: `platform_users` and `user_channel_bindings` are both already fully
 * readable by every DB role a background/system job in this app runs as (app_staff has unrestricted
 * CRUD on `platform_users`; both app_staff and app_patient already hold table-level SELECT on
 * `user_channel_bindings` — deploy/postgres/p0-5b-grants.sql).
 */
export async function loadAdminNotificationTargetsFromDb(): Promise<AdminNotificationTargets> {
  const result = await runWebappPgText<AdminNotificationTargetRow>(
    `SELECT ${CONTACTS.phoneNormalized} AS phone_normalized,
            ${CONTACTS.emailNormalized} AS email_normalized,
            ucb.channel_code, ucb.external_id
       FROM platform_users pu
       ${USER_CONTACTS_PRIMARY_LATERALS}
       LEFT JOIN user_channel_bindings ucb
         ON ucb.user_id = pu.id AND ucb.channel_code IN ('telegram', 'max')
      WHERE pu.role = 'admin'
        AND pu.merged_into_id IS NULL
        AND pu.is_archived = FALSE`,
  );

  const telegram = new Set<string>();
  const max = new Set<string>();
  const sms = new Set<string>();
  const email = new Set<string>();

  for (const row of result.rows) {
    const externalId = row.external_id?.trim();
    if (externalId) {
      if (row.channel_code === 'telegram') telegram.add(externalId);
      if (row.channel_code === 'max') max.add(externalId);
    }
    const phone = row.phone_normalized?.trim();
    if (phone) sms.add(phone);
    const emailAddress = row.email_normalized?.trim();
    if (emailAddress) email.add(emailAddress);
  }

  return { telegram: [...telegram], max: [...max], sms: [...sms], email: [...email] };
}
