/**
 * Closed capability for the email delivery adapter's restricted SMTP credential.
 *
 * The API base login receives EXECUTE on this argumentless SECURITY DEFINER
 * function, never ambient access to the underlying restricted settings table.
 */
import type { DbPort } from '../../kernel/contracts/index.js';

export async function readSmtpOutboundSettingValueJson(db: DbPort): Promise<unknown | null> {
  const result = await db.query<{ value_json: unknown }>(
    'SELECT app.read_integrator_smtp_outbound_setting() AS value_json',
  );
  return result.rows[0]?.value_json ?? null;
}
