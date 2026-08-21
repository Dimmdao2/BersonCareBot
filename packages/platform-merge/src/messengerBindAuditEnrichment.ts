/**
 * Loads platform user summaries for messenger phone-bind audit / operator alerts (public schema).
 */
import type { MessengerPhoneBindDb } from './messengerPhonePublicBind.js';
import { runMergePgText } from './mergeSql.js';
import {
  messengerChannelLabelRu,
  messengerPhoneBindReasonHumanRu,
  type MessengerBindAuditCandidateSummary,
  type MessengerBindAuditInitiatorSummary,
} from './messengerBindAuditPresentation.js';

async function resolveTelegramMessengerDisplayHint(
  db: MessengerPhoneBindDb,
  externalId: string,
): Promise<string | null> {
  const trimmed = externalId.trim();
  if (!trimmed) return null;
  try {
    const r = await runMergePgText<{ username: string | null; fullName: string | null }>(
      db,
      `SELECT NULLIF(TRIM(ucb.display_handle), '') AS username,
              NULLIF(TRIM(pu.display_name), '') AS "fullName"
       FROM public.user_channel_bindings ucb
       INNER JOIN public.platform_users pu ON pu.id = ucb.user_id
       WHERE ucb.channel_code = 'telegram' AND ucb.external_id = $1::text
       LIMIT 1`,
      [trimmed],
    );
    const row = r.rows[0];
    if (!row) return null;
    const un = row.username?.trim();
    if (un) return `@${un}`;
    const fn = row.fullName?.trim();
    return fn && fn.length > 0 ? fn : null;
  } catch {
    return null;
  }
}

async function resolveMaxMessengerPhoneHint(
  db: MessengerPhoneBindDb,
  platformUserId: string | null,
): Promise<string | null> {
  const id = platformUserId?.trim();
  if (!id) return null;
  const summary = await resolveCanonicalPlatformUserSummary(db, id);
  const p = summary?.phoneNormalized?.trim();
  return p && p.length > 0 ? p : null;
}

async function resolveCanonicalPlatformUserSummary(
  db: MessengerPhoneBindDb,
  id: string,
): Promise<MessengerBindAuditCandidateSummary | null> {
  let current = id.trim();
  const visited = new Set<string>();
  for (let depth = 0; depth < 32; depth++) {
    if (!current || visited.has(current)) return null;
    visited.add(current);
    const r = await runMergePgText<{
      id: string;
      merged_into_id: string | null;
      display_name: string;
      phone_normalized: string | null;
      email: string | null;
    }>(
      db,
      `SELECT pu.id::text,
              pu.merged_into_id::text AS merged_into_id,
              pu.display_name,
              phone.value_normalized AS phone_normalized,
              email.value_normalized AS email
       FROM public.platform_users pu
       LEFT JOIN public.user_contacts phone ON phone.platform_user_id = pu.id
         AND phone.contact_kind = 'phone' AND phone.is_primary = true
       LEFT JOIN public.user_contacts email ON email.platform_user_id = pu.id
         AND email.contact_kind = 'email' AND email.is_primary = true
       WHERE pu.id = $1::uuid`,
      [current],
    );
    const row = r.rows[0];
    if (!row) return null;
    if (row.merged_into_id == null || row.merged_into_id === '') {
      return {
        platformUserId: row.id,
        displayName: row.display_name?.trim() ? row.display_name.trim() : null,
        phoneNormalized: row.phone_normalized?.trim() ? row.phone_normalized.trim() : null,
        email: row.email?.trim() ? row.email.trim() : null,
      };
    }
    current = row.merged_into_id;
  }
  return null;
}

export type EnrichMessengerBindAuditDetailsArgs = {
  reason: string;
  candidateIds: string[];
  channelCode?: string;
  externalId?: string;
};

/** Serializable JSON fields merged into `admin_audit_log.details`. */
export async function enrichMessengerBindAuditDetailsFields(
  db: MessengerPhoneBindDb,
  args: EnrichMessengerBindAuditDetailsArgs,
): Promise<{
  candidates: MessengerBindAuditCandidateSummary[];
  initiator: MessengerBindAuditInitiatorSummary | null;
  reasonHumanRu: string;
}> {
  const uniq = [...new Set(args.candidateIds.map((x) => x.trim()).filter(Boolean))];
  const candidates: MessengerBindAuditCandidateSummary[] = [];
  for (const id of uniq) {
    const row = await resolveCanonicalPlatformUserSummary(db, id);
    if (row) candidates.push(row);
    else {
      candidates.push({
        platformUserId: id,
        displayName: null,
        phoneNormalized: null,
        email: null,
      });
    }
  }

  let initiator: MessengerBindAuditInitiatorSummary | null = null;
  const cc = args.channelCode?.trim();
  const ext = args.externalId != null ? String(args.externalId).trim() : '';
  if (cc && ext) {
    const bind = await runMergePgText<{ platform_user_id: string }>(
      db,
      `SELECT pu.id::text AS platform_user_id
       FROM public.user_channel_bindings ucb
       INNER JOIN public.platform_users pu ON pu.id = ucb.user_id
       WHERE ucb.channel_code = $1 AND ucb.external_id = $2
         AND pu.merged_into_id IS NULL
       LIMIT 1`,
      [cc, ext],
    );
    const puId = bind.rows[0]?.platform_user_id ?? null;
    const ccLower = cc.trim().toLowerCase();
    let messengerDisplayHint: string | null = null;
    if (ccLower === 'telegram') {
      messengerDisplayHint = await resolveTelegramMessengerDisplayHint(db, ext);
    } else if (ccLower === 'max') {
      messengerDisplayHint = await resolveMaxMessengerPhoneHint(db, puId);
    }
    initiator = {
      channelLabel: messengerChannelLabelRu(cc),
      channelCode: cc,
      externalId: ext,
      platformUserId: puId,
      ...(messengerDisplayHint ? { messengerDisplayHint } : {}),
    };
  }

  return {
    candidates,
    initiator,
    reasonHumanRu: messengerPhoneBindReasonHumanRu(args.reason),
  };
}
