/**
 * Closed capability for the email delivery adapter's restricted SMTP credential.
 *
 * The API base login receives EXECUTE on this argumentless SECURITY DEFINER
 * function, never ambient access to the underlying restricted settings table.
 */
import { sql } from 'drizzle-orm';
import { runWithDbInfraPrincipal } from '@bersoncare/db-principal';
import type { DbPort } from '../../kernel/contracts/index.js';
import { runIntegratorNamedRoot } from './runIntegratorSql.js';

export async function readSmtpOutboundSettingValueJson(db: DbPort): Promise<unknown | null> {
  const result = await runWithDbInfraPrincipal({ source: 'integrator-server-runtime-config' }, () =>
    runIntegratorNamedRoot<{ value_json: unknown }>(
      db,
      'app.read_integrator_smtp_outbound_setting()',
      [],
      sql`SELECT app.read_integrator_smtp_outbound_setting() AS value_json`,
    ),
  );
  return result.rows[0]?.value_json ?? null;
}
