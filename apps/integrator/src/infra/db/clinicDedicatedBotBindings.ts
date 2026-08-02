import { sql } from 'drizzle-orm';
import type { DbPort } from '../../kernel/contracts/index.js';
import { runIntegratorSql } from './runIntegratorSql.js';

export type DedicatedClinicBotChannel = 'telegram' | 'max';

/**
 * Resolves only the immutable fingerprint placed in a dedicated bot's webhook path.
 * The database function exposes neither credentials nor a fallback organization; an unknown,
 * disabled, duplicated, or malformed bot instance is therefore unrouteable.
 */
export async function resolveDedicatedClinicBotOrganization(
  db: DbPort,
  channel: DedicatedClinicBotChannel,
  credentialFingerprint: string,
): Promise<string | null> {
  if (!/^[a-f0-9]{64}$/.test(credentialFingerprint)) return null;
  const result = await runIntegratorSql<{ organization_id: string | null }>(
    db,
    sql`
      SELECT app.resolve_clinic_dedicated_bot_organization(
        ${channel},
        ${credentialFingerprint}
      )::text AS organization_id
    `,
  );
  return result.rows[0]?.organization_id ?? null;
}
