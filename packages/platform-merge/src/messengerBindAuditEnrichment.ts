/**
 * Loads platform user summaries for messenger phone-bind audit / operator alerts (public schema).
 */
import type { MessengerPhoneBindDb } from "./messengerPhonePublicBind.js";
import {
  messengerChannelLabelRu,
  messengerPhoneBindReasonHumanRu,
  type MessengerBindAuditCandidateSummary,
  type MessengerBindAuditInitiatorSummary,
} from "./messengerBindAuditPresentation.js";

async function resolveTelegramMessengerDisplayHint(db: MessengerPhoneBindDb, externalId: string): Promise<string | null> {
  const trimmed = externalId.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  try {
    const r = await db.query<{ username: string | null; fullName: string | null }>(
      `SELECT NULLIF(TRIM(username), '') AS username,
              NULLIF(
                TRIM(BOTH FROM concat_ws(' ', NULLIF(TRIM(first_name), ''), NULLIF(TRIM(last_name), ''))),
                ''
              ) AS "fullName"
       FROM public.telegram_users
       WHERE telegram_id = $1::bigint
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

async function resolveCanonicalPlatformUserSummary(
  db: MessengerPhoneBindDb,
  id: string,
): Promise<MessengerBindAuditCandidateSummary | null> {
  let current = id.trim();
  const visited = new Set<string>();
  for (let depth = 0; depth < 32; depth++) {
    if (!current || visited.has(current)) return null;
    visited.add(current);
    const r = await db.query<{
      id: string;
      merged_into_id: string | null;
      display_name: string;
      phone_normalized: string | null;
      email: string | null;
    }>(
      `SELECT id::text,
              merged_into_id::text AS merged_into_id,
              display_name,
              phone_normalized,
              email
       FROM public.platform_users
       WHERE id = $1::uuid`,
      [current],
    );
    const row = r.rows[0];
    if (!row) return null;
    if (row.merged_into_id == null || row.merged_into_id === "") {
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
  const ext = args.externalId != null ? String(args.externalId).trim() : "";
  if (cc && ext) {
    const bind = await db.query<{ platform_user_id: string }>(
      `SELECT pu.id::text AS platform_user_id
       FROM public.user_channel_bindings ucb
       INNER JOIN public.platform_users pu ON pu.id = ucb.user_id
       WHERE ucb.channel_code = $1 AND ucb.external_id = $2
         AND pu.merged_into_id IS NULL
       LIMIT 1`,
      [cc, ext],
    );
    const puId = bind.rows[0]?.platform_user_id ?? null;
    const messengerDisplayHint =
      cc.trim().toLowerCase() === "telegram" ? await resolveTelegramMessengerDisplayHint(db, ext) : null;
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
