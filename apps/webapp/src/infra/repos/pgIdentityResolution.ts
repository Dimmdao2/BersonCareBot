import { sql } from 'drizzle-orm';
/**
 * Wave 3 phase 12B — Class C transport: `client.query("BEGIN"|"COMMIT"|"ROLLBACK")`.
 * Domain SQL — `runIdentityClientSql`; row-shape — Zod in `identityPhoneRowSchemas`.
 */
import { getPool } from '@/infra/db/client';
import type { SessionUser } from '@/shared/types/session';
import type { IdentityResolutionPort } from '@/modules/auth/identityResolutionPort';
import { resolveCanonicalUserId } from '@/infra/repos/pgCanonicalPlatformUser';
import {
  bindingsFromRows,
  parseChannelBindingLookupParams,
  parseResolveByChannelBindingParams,
  parseIdentityRow,
  parseUserRole,
  preSessionChannelBindingSessionRowSchema,
  userIdRowSchema,
} from '@/infra/repos/identityPhoneRowSchemas';
import { runIdentityClientSql } from '@/infra/repos/identityPhoneSql';
import { withPoolTransaction } from '@/infra/db/withClient';
import { getWebappSqlDb, runWebappNamedRoot } from '@/infra/db/runWebappSql';
import { loadSessionIdentityUser } from '@/infra/repos/pgUserByPhone';

async function loadSessionUserForId(
  userId: string,
  _externalIdForDisplay: string,
): Promise<SessionUser> {
  const canonicalId = (await resolveCanonicalUserId(getWebappSqlDb(), userId)) ?? userId;
  const user = await loadSessionIdentityUser(canonicalId);
  if (!user) throw new Error(`identity_resolution: user ${canonicalId} is archived`);
  return user;
}

export const pgIdentityResolutionPort: IdentityResolutionPort = {
  /**
   * Messenger entry is exact-binding-only. A signed token, phone or display name is never an
   * alternate account locator and never authorizes creating or attaching a binding.
   */
  async resolveByChannelBinding(params) {
    const parsed = parseResolveByChannelBindingParams(params);
    const pool = getPool();
    const txResult = await withPoolTransaction(pool, async (client) => {
      const existing = await runIdentityClientSql(
        client,
        sql`SELECT user_id FROM user_channel_bindings WHERE channel_code = ${parsed.channelCode} AND external_id = ${parsed.externalId} FOR UPDATE`,
      );

      const row = existing.rows[0];
      return row
        ? { userId: parseIdentityRow(userIdRowSchema, row, 'existing_binding').user_id }
        : null;
    });
    if (!txResult) return null;
    return {
      user: await loadSessionUserForId(txResult.userId, parsed.externalId),
      // Resolve-only: this port can no longer report a freshly created account.
      accountOutcome: 'linked_existing',
    };
  },

  async findByChannelBinding(params): Promise<SessionUser | null> {
    const parsed = parseChannelBindingLookupParams(params);
    const result = await runWebappNamedRoot(
      getWebappSqlDb(),
      'app.auth_channel_binding_session(text,text)',
      [parsed.channelCode, parsed.externalId],
      sql`SELECT * FROM app.auth_channel_binding_session(
        ${parsed.channelCode}::text,
        ${parsed.externalId}::text
      )`,
    );
    if (result.rows.length === 0) return null;
    const rows = result.rows.map((row, index) =>
      parseIdentityRow(
        preSessionChannelBindingSessionRowSchema,
        row,
        `find_by_channel_binding[${index}]`,
      ),
    );
    const first = rows[0]!;
    return {
      userId: first.user_id,
      role: parseUserRole(first.role, 'find_by_channel_binding.role'),
      displayName: first.display_name ?? parsed.externalId,
      contacts: first.phone_normalized
        ? [
            {
              kind: 'phone',
              value: first.phone_normalized,
              isPrimary: true,
              sourceOrigin: 'platform_users',
            },
          ]
        : [],
      phone: first.phone_normalized ?? undefined,
      bindings: bindingsFromRows(rows),
    };
  },
};
