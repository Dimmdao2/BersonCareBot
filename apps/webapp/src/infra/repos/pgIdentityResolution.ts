import type { PoolClient } from 'pg';
import { sql } from 'drizzle-orm';
/**
 * Wave 3 phase 12B — Class C transport: `client.query("BEGIN"|"COMMIT"|"ROLLBACK")`.
 * Domain SQL — `runIdentityClientPgText`; row-shape — Zod in `identityPhoneRowSchemas`.
 */
import { getPool } from '@/infra/db/client';
import type { SessionUser } from '@/shared/types/session';
import type {
  IdentityResolutionPort,
  MessengerIdentityResolutionHints,
} from '@/modules/auth/identityResolutionPort';
import {
  findCanonicalUserIdByIntegratorId,
  findTrustedCanonicalUserIdByPhone,
  resolveCanonicalUserId,
} from '@/infra/repos/pgCanonicalPlatformUser';
import { mergeCanonicalPlatformUserCandidates } from '@/infra/repos/pgUserProjection';
import { isPlatformUserUuid } from '@/shared/platform-user/isPlatformUserUuid';
import {
  bindingsFromRows,
  parseChannelBindingLookupParams,
  parseFindOrCreateByChannelBindingParams,
  parseIdentityRow,
  parseMessengerIdentityResolutionHints,
  parseUserRole,
  preSessionChannelBindingSessionRowSchema,
  userIdRowSchema,
  platformUserIdRowSchema,
} from '@/infra/repos/identityPhoneRowSchemas';
import { runIdentityClientPgText } from '@/infra/repos/identityPhoneSql';
import { upsertBroadcastDefaultsAfterChannelBind } from '@/infra/upsertBroadcastDefaultsAfterChannelBind';
import { withPoolTransaction } from '@/infra/db/withClient';
import {
  getWebappSqlDb,
  getWebappSqlFromPgClient,
  runWebappNamedRoot,
} from '@/infra/db/runWebappSql';
import { syncUserIdentityFioMirrorWebapp } from '@/infra/repos/userIdentityFioSql';
import { syncUserContactsMirrorWebapp } from '@/infra/repos/userContactsSql';
import { loadSessionIdentityUser } from '@/infra/repos/pgUserByPhone';

async function collectMessengerResolutionCandidates(
  client: PoolClient,
  hints: MessengerIdentityResolutionHints | undefined,
): Promise<string[]> {
  const parsedHints = parseMessengerIdentityResolutionHints(hints);
  if (!parsedHints) return [];
  const ids: string[] = [];
  const sub = parsedHints.platformUserSub?.trim();
  if (sub && isPlatformUserUuid(sub)) {
    const canon = await resolveCanonicalUserId(getWebappSqlFromPgClient(client), sub);
    if (canon) ids.push(canon);
  }
  const intId = parsedHints.integratorUserId?.trim();
  if (intId) {
    const byInt = await findCanonicalUserIdByIntegratorId(getWebappSqlFromPgClient(client), intId);
    if (byInt) ids.push(byInt);
  }
  const phone = parsedHints.phoneNormalized?.trim();
  if (phone) {
    const byTrustedPhone = await findTrustedCanonicalUserIdByPhone(getWebappSqlFromPgClient(client), phone);
    if (byTrustedPhone) ids.push(byTrustedPhone);
  }
  return [...new Set(ids)];
}

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
  async findOrCreateByChannelBinding(params) {
    const parsed = parseFindOrCreateByChannelBindingParams(params);
    const pool = getPool();
    const txResult = await withPoolTransaction(pool, async (client) => {
      const existing = await runIdentityClientPgText(
        client,
        'SELECT user_id FROM user_channel_bindings WHERE channel_code = $1 AND external_id = $2 FOR UPDATE',
        [parsed.channelCode, parsed.externalId],
      );

      let userId: string;
      let accountOutcome: 'created' | 'linked_existing' = 'linked_existing';

      if (existing.rows.length > 0) {
        userId = parseIdentityRow(userIdRowSchema, existing.rows[0], 'existing_binding').user_id;
        if (process.env.NODE_ENV !== 'test') {
          console.info(
            '[identity_resolution] path=existing_binding channel=%s',
            parsed.channelCode,
          );
        }
      } else {
        let insertedNewPlatformUser = false;
        const hintCandidates = await collectMessengerResolutionCandidates(
          client,
          parsed.resolutionHints,
        );
        if (hintCandidates.length > 0) {
          userId = await mergeCanonicalPlatformUserCandidates(client, hintCandidates, 'projection');
          const dn = parsed.displayName?.trim();
          if (dn) {
            await runIdentityClientPgText(
              client,
              `UPDATE platform_users SET
                 display_name = $2::text,
                 updated_at = now()
               WHERE id = $1::uuid`,
              [userId, dn],
            );
            await syncUserIdentityFioMirrorWebapp(client, userId);
          }
          if (process.env.NODE_ENV !== 'test') {
            console.info(
              '[identity_resolution] path=merge_before_bind channel=%s hint_candidates=%d',
              parsed.channelCode,
              hintCandidates.length,
            );
          }
        } else {
          if (process.env.NODE_ENV !== 'test') {
            console.info('[identity_resolution] path=insert_new channel=%s', parsed.channelCode);
          }
          const insertUser = await runIdentityClientPgText(
            client,
            `INSERT INTO platform_users (display_name, role) VALUES ($1, $2) RETURNING id`,
            [parsed.displayName ?? parsed.externalId, parsed.role ?? 'client'],
          );
          userId = parseIdentityRow(
            platformUserIdRowSchema,
            insertUser.rows[0],
            'insert_platform_user',
          ).id;
          insertedNewPlatformUser = true;
          await syncUserIdentityFioMirrorWebapp(client, userId);
          await syncUserContactsMirrorWebapp(client, userId);
        }
        const insBinding = await runIdentityClientPgText(
          client,
          `INSERT INTO user_channel_bindings (user_id, channel_code, external_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (channel_code, external_id) DO NOTHING
           RETURNING user_id`,
          [userId, parsed.channelCode, parsed.externalId],
        );
        if (insBinding.rows.length > 0) {
          await upsertBroadcastDefaultsAfterChannelBind(getWebappSqlFromPgClient(client), userId, parsed.channelCode);
          await syncUserContactsMirrorWebapp(client, userId);
          if (insertedNewPlatformUser) {
            accountOutcome = 'created';
          }
        } else {
          const reread = await runIdentityClientPgText(
            client,
            'SELECT user_id FROM user_channel_bindings WHERE channel_code = $1 AND external_id = $2 FOR UPDATE',
            [parsed.channelCode, parsed.externalId],
          );
          const ownerId = reread.rows[0]
            ? parseIdentityRow(userIdRowSchema, reread.rows[0], 'binding_reread').user_id
            : null;
          if (!ownerId) {
            throw new Error('findOrCreateByChannelBinding: binding missing after conflict');
          }
          if (insertedNewPlatformUser) {
            await runIdentityClientPgText(client, 'DELETE FROM platform_users WHERE id = $1', [
              userId,
            ]);
          }
          userId = ownerId;
        }
      }
      return {
        accountOutcome,
        userId,
      };
    });
    return {
      user: await loadSessionUserForId(txResult.userId, parsed.externalId),
      accountOutcome: txResult.accountOutcome,
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
