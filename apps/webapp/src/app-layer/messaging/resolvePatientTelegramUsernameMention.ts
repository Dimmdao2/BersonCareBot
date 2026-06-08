import { runWebappPgText } from "@/infra/db/runWebappSql";
import { formatTelegramUsernameMention } from "@/modules/messaging/patientTelegramUsernameMention";

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
