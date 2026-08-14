import { sql } from 'drizzle-orm';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { runIntegratorNamedRoot } from '../runIntegratorSql.js';

export type BootstrapMessengerPhoneBindResult = {
  platformUserId: string | null;
  applied: boolean;
  failureCode: string | null;
};

export async function bindBootstrapMessengerPhone(
  db: DbPort,
  input: {
    channelCode: 'telegram' | 'max';
    externalId: string;
    phoneNormalized: string;
    preferredPlatformUserId?: string | null;
  },
): Promise<BootstrapMessengerPhoneBindResult> {
  const preferredPlatformUserId = input.preferredPlatformUserId?.trim() || null;
  const result = await runIntegratorNamedRoot<{
    platform_user_id: string | null;
    applied: boolean;
    failure_code: string | null;
  }>(
    db,
    'app.integrator_bind_bootstrap_channel_phone(text,text,text,uuid)',
    [input.channelCode, input.externalId, input.phoneNormalized, preferredPlatformUserId],
    sql`SELECT * FROM app.integrator_bind_bootstrap_channel_phone(
      ${input.channelCode}::text,
      ${input.externalId}::text,
      ${input.phoneNormalized}::text,
      ${preferredPlatformUserId}::uuid
    )`,
  );
  const row = result.rows[0];
  if (!row) throw new Error('bootstrap_messenger_phone_bind_missing_result');
  return {
    platformUserId: row.platform_user_id,
    applied: row.applied,
    failureCode: row.failure_code,
  };
}
