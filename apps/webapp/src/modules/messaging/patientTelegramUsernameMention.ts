import { runWebappPgText } from "@/infra/db/runWebappSql";

export function formatTelegramUsernameMention(rawUsername: string | null | undefined): string | null {
  const trimmed = rawUsername?.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/^@+/, "");
  if (!normalized) return null;
  return `@${normalized}`;
}

export function appendTelegramUsernameMentionToLabel(
  label: string,
  mention: string | null | undefined,
): string {
  const formatted = mention?.trim() ?? "";
  if (!formatted) return label;
  const withAt = formatted.startsWith("@") ? formatted : `@${formatted}`;
  if (label.includes(withAt)) return label;
  return `${label} ${withAt}`;
}

export function buildPatientNotifyFromLine(
  patientLabel: string,
  telegramUsernameMention?: string | null,
): string {
  const base = patientLabel.trim() || "Пациент";
  return `От: ${appendTelegramUsernameMentionToLabel(base, telegramUsernameMention)}`;
}

export async function resolvePatientTelegramUsernameMention(platformUserId: string): Promise<string | null> {
  try {
    const result = await runWebappPgText<{ username: string | null }>(
      `SELECT COALESCE(
         NULLIF(TRIM(ts.username), ''),
         NULLIF(TRIM(tu.username), '')
       ) AS username
       FROM public.user_channel_bindings ucb
       LEFT JOIN integrator.identities i
         ON i.resource = 'telegram' AND i.external_id = ucb.external_id
       LEFT JOIN integrator.telegram_state ts ON ts.identity_id = i.id
       LEFT JOIN public.telegram_users tu ON tu.telegram_id = (ucb.external_id)::bigint
       WHERE ucb.user_id = $1::uuid AND ucb.channel_code = 'telegram'
       LIMIT 1`,
      [platformUserId],
    );
    return formatTelegramUsernameMention(result.rows[0]?.username);
  } catch {
    return null;
  }
}
