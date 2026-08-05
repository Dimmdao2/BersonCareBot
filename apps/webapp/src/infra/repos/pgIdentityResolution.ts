import type { PoolClient } from 'pg';
/**
 * Wave 3 phase 12B — Class C transport: `client.query("BEGIN"|"COMMIT"|"ROLLBACK")`.
 * Domain SQL — `runIdentityClientPgText` / `runIdentityPoolPgText`; row-shape — Zod in `identityPhoneRowSchemas`.
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
  platformUserProfileRowSchema,
  userIdRowSchema,
  platformUserIdRowSchema,
} from '@/infra/repos/identityPhoneRowSchemas';
import { runIdentityClientPgText, runIdentityPoolPgText } from '@/infra/repos/identityPhoneSql';
import { upsertBroadcastDefaultsAfterChannelBind } from '@/infra/upsertBroadcastDefaultsAfterChannelBind';
import { withPoolTransaction } from '@/infra/db/withClient';
import { getWebappSqlDb, getWebappSqlFromPgClient } from '@/infra/db/runWebappSql';
import {
  FIO,
  syncUserIdentityFioMirrorWebapp,
  USER_IDENTITY_FIO_JOIN,
} from '@/infra/repos/userIdentityFioSql';
import {
  CONTACTS,
  syncUserContactsMirrorWebapp,
  USER_CONTACTS_PRIMARY_PHONE_LATERAL,
} from '@/infra/repos/userContactsSql';

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
  externalIdForDisplay: string,
): Promise<SessionUser> {
  const canonicalId = (await resolveCanonicalUserId(getWebappSqlDb(), userId)) ?? userId;
  const userRow = await runIdentityPoolPgText(
    `SELECT ${FIO.displayName} AS display_name, pu.role, ${CONTACTS.phoneNormalized} AS phone_normalized
     FROM platform_users pu
     ${USER_IDENTITY_FIO_JOIN}
     ${USER_CONTACTS_PRIMARY_PHONE_LATERAL}
     WHERE pu.id = $1`,
    [canonicalId],
  );
  const u = userRow.rows[0]
    ? parseIdentityRow(platformUserProfileRowSchema, userRow.rows[0], 'platform_user_profile')
    : null;
  const bindingsRows = await runIdentityPoolPgText(
    'SELECT channel_code, external_id FROM user_channel_bindings WHERE user_id = $1',
    [canonicalId],
  );
  const bindings = bindingsFromRows(bindingsRows.rows);
  return {
    userId: canonicalId,
    role: u ? parseUserRole(u.role, 'platform_user_profile.role') : 'client',
    displayName: u?.display_name ?? externalIdForDisplay,
    phone: u?.phone_normalized ?? undefined,
    bindings,
  };
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
    const existing = await runIdentityPoolPgText(
      'SELECT user_id FROM user_channel_bindings WHERE channel_code = $1 AND external_id = $2',
      [parsed.channelCode, parsed.externalId],
    );
    if (existing.rows.length === 0) return null;
    const userId = parseIdentityRow(
      userIdRowSchema,
      existing.rows[0],
      'find_by_channel_binding',
    ).user_id;
    return loadSessionUserForId(userId, parsed.externalId);
  },
};
