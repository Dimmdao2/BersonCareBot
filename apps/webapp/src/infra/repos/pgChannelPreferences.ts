/**
 * Wave 3 phase 14D — domain SQL via `runWebappPgText`; Class C TX on `setPreferredAuthChannel`.
 */
import { sql } from 'drizzle-orm';
import { getCurrentDbPrincipal } from '@bersoncare/db-principal';
import { getPool } from '@/infra/db/client';
import {
  getWebappSqlDb,
  getWebappSqlFromPgClient,
  runWebappNamedRoot,
  runWebappPgText,
} from '@/infra/db/runWebappSql';
import { withPoolTransaction } from '@/infra/db/withClient';
import type { BroadcastNotificationPrefsFlags } from '@/modules/doctor-broadcasts/ports';
import type { ChannelPreferencesPort } from '@/modules/channel-preferences/ports';
import {
  assertChannelAllowedForPreferredAuth,
  isChannelAllowedForPreferredAuth,
} from '@/modules/channel-preferences/preferredAuthChannelPolicy';
import type { ChannelCode, ChannelPreference } from '@/modules/channel-preferences/types';
import type { PoolClient } from 'pg';

const CODES: ChannelCode[] = ['telegram', 'max', 'vk', 'sms', 'email', 'web_push'];

function userMatchSql(paramIndex: number): string {
  return `(platform_user_id = $${paramIndex}::uuid OR (platform_user_id IS NULL AND user_id = $${paramIndex}::text))`;
}

function txPgText<T = unknown>(
  client: PoolClient,
  queryText: string,
  values: readonly unknown[] = [],
) {
  return runWebappPgText<T>(queryText, values, getWebappSqlFromPgClient(client));
}

function rowToPreference(row: {
  channel_code: string;
  is_enabled_for_messages: boolean;
  is_enabled_for_notifications: boolean;
  is_preferred_for_auth?: boolean;
}): ChannelPreference {
  const channelCode = row.channel_code as ChannelCode;
  return {
    channelCode,
    isEnabledForMessages: row.is_enabled_for_messages,
    isEnabledForNotifications: row.is_enabled_for_notifications,
    isPreferredForAuth:
      Boolean(row.is_preferred_for_auth) && isChannelAllowedForPreferredAuth(channelCode),
  };
}

export const pgChannelPreferencesPort: ChannelPreferencesPort = {
  async getPreferences(userId) {
    const result = await runWebappPgText<{
      channel_code: string;
      is_enabled_for_messages: boolean;
      is_enabled_for_notifications: boolean;
      is_preferred_for_auth: boolean;
    }>(
      `SELECT channel_code, is_enabled_for_messages, is_enabled_for_notifications, is_preferred_for_auth
       FROM user_channel_preferences WHERE ${userMatchSql(1)}`,
      [userId],
    );
    const byCode = new Map<string, ChannelPreference>();
    for (const row of result.rows) {
      byCode.set(row.channel_code, rowToPreference(row));
    }
    return CODES.map(
      (code) =>
        byCode.get(code) ?? {
          channelCode: code,
          isEnabledForMessages: true,
          isEnabledForNotifications: true,
          isPreferredForAuth: false,
        },
    );
  },

  async upsertPreference(params) {
    if (getCurrentDbPrincipal()?.kind === 'patient') {
      const args = [
        params.channelCode,
        params.isEnabledForMessages,
        params.isEnabledForNotifications,
      ] as const;
      const result = await runWebappNamedRoot<{
        preference: {
          channel_code: string;
          is_enabled_for_messages: boolean;
          is_enabled_for_notifications: boolean;
          is_preferred_for_auth: boolean;
        };
      }>(
        getWebappSqlDb(),
        'app.save_current_patient_channel_preference(text,boolean,boolean)',
        args,
        sql`SELECT app.save_current_patient_channel_preference(
          ${params.channelCode}::text,
          ${params.isEnabledForMessages}::boolean,
          ${params.isEnabledForNotifications}::boolean
        ) AS preference`,
      );
      const row = result.rows[0]?.preference;
      if (!row) throw new Error('current_patient_channel_preference_rejected');
      return rowToPreference(row);
    }
    const now = new Date();
    await runWebappPgText(
      `INSERT INTO user_channel_preferences (
         user_id, platform_user_id, channel_code, is_enabled_for_messages, is_enabled_for_notifications, updated_at
       )
       VALUES ($1::text, $1::uuid, $2, $3, $4, $5)
       ON CONFLICT (user_id, channel_code) DO UPDATE SET
         platform_user_id = COALESCE(user_channel_preferences.platform_user_id, EXCLUDED.platform_user_id),
         is_enabled_for_messages = EXCLUDED.is_enabled_for_messages,
         is_enabled_for_notifications = EXCLUDED.is_enabled_for_notifications,
         updated_at = EXCLUDED.updated_at`,
      [
        params.userId,
        params.channelCode,
        params.isEnabledForMessages,
        params.isEnabledForNotifications,
        now,
      ],
    );
    const result = await runWebappPgText<{
      channel_code: string;
      is_enabled_for_messages: boolean;
      is_enabled_for_notifications: boolean;
      is_preferred_for_auth: boolean;
    }>(
      `SELECT channel_code, is_enabled_for_messages, is_enabled_for_notifications, is_preferred_for_auth
       FROM user_channel_preferences WHERE ${userMatchSql(1)} AND channel_code = $2`,
      [params.userId, params.channelCode],
    );
    return rowToPreference(result.rows[0]!);
  },

  async getBroadcastNotificationFlagsBatch(
    platformUserIds,
  ): Promise<Map<string, BroadcastNotificationPrefsFlags>> {
    const out = new Map<string, BroadcastNotificationPrefsFlags>();
    for (const id of platformUserIds) {
      out.set(id, { telegram: true, max: true, sms: true });
    }
    if (platformUserIds.length === 0) return out;

    const result = await runWebappPgText<{
      platform_user_id: string;
      channel_code: string;
      is_enabled_for_notifications: boolean;
    }>(
      `SELECT platform_user_id, channel_code, is_enabled_for_notifications
       FROM user_channel_preferences
       WHERE platform_user_id = ANY($1::uuid[])
         AND channel_code = ANY(ARRAY['telegram'::text, 'max'::text, 'sms'::text])`,
      [platformUserIds],
    );
    for (const row of result.rows) {
      const cur = out.get(row.platform_user_id);
      if (!cur) continue;
      if (row.channel_code === 'telegram') cur.telegram = row.is_enabled_for_notifications;
      else if (row.channel_code === 'max') cur.max = row.is_enabled_for_notifications;
      else if (row.channel_code === 'sms') cur.sms = row.is_enabled_for_notifications;
    }
    return out;
  },

  async getPreferredAuthChannelCode(userId) {
    // Pre-session callers (phone/start's automatic-channel resolution) reach this before a
    // principal/role is established, so this goes through the narrow SECURITY DEFINER accessor
    // (migration 0357) rather than a direct table SELECT -- the bootstrap login has no table grant
    // on `user_channel_preferences` and a direct SELECT raises 42501 there.
    const result = await runWebappPgText<{ get_preferred_auth_channel_code: string | null }>(
      `SELECT app.get_preferred_auth_channel_code($1::uuid)`,
      [userId],
    );
    const code = result.rows[0]?.get_preferred_auth_channel_code as ChannelCode | undefined;
    if (code != null && !isChannelAllowedForPreferredAuth(code)) return null;
    return code ?? null;
  },

  async setPreferredAuthChannel(userId, channelCode) {
    assertChannelAllowedForPreferredAuth(channelCode);
    if (getCurrentDbPrincipal()?.kind === 'patient') {
      const result = await runWebappNamedRoot<{ updated: boolean }>(
        getWebappSqlDb(),
        'app.set_current_patient_preferred_auth_channel(text)',
        [channelCode],
        sql`SELECT app.set_current_patient_preferred_auth_channel(
          ${channelCode}::text
        ) AS updated`,
      );
      if (result.rows[0]?.updated !== true) {
        throw new Error('current_patient_preferred_auth_channel_rejected');
      }
      return;
    }
    const pool = getPool();
    const now = new Date();
    await withPoolTransaction(pool, async (client) => {
      await txPgText(
        client,
        `UPDATE user_channel_preferences SET is_preferred_for_auth = false WHERE ${userMatchSql(1)}`,
        [userId],
      );
      if (channelCode == null) {
        return;
      }
      await txPgText(
        client,
        `INSERT INTO user_channel_preferences (
           user_id, platform_user_id, channel_code, is_enabled_for_messages, is_enabled_for_notifications, is_preferred_for_auth, updated_at
         )
         VALUES ($1::text, $1::uuid, $2, true, true, true, $3)
         ON CONFLICT (user_id, channel_code) DO UPDATE SET
           platform_user_id = COALESCE(user_channel_preferences.platform_user_id, EXCLUDED.platform_user_id),
           is_preferred_for_auth = true,
           updated_at = EXCLUDED.updated_at`,
        [userId, channelCode, now],
      );
    });
  },

  async getDefaultAuthOtpChannel(userId) {
    // IDENTITY_AND_MERGE_SCHEME.md §3.1: default is the channel that confirmed the CURRENT phone,
    // recorded on the active user_phone_history row's confirming_channel (migration 0341) at the
    // moment of confirmation. Only telegram/max/email are eligible (SMS is bootstrap-only, never a
    // default — mirrors the historical fallback below).
    const confirmed = await runWebappPgText<{ confirming_channel: string | null }>(
      `SELECT confirming_channel FROM user_phone_history
       WHERE platform_user_id = $1::uuid AND valid_to IS NULL
       LIMIT 1`,
      [userId],
    );
    const confirmedChannel = confirmed.rows[0]?.confirming_channel;
    if (confirmedChannel === 'telegram' || confirmedChannel === 'max' || confirmedChannel === 'email') {
      return confirmedChannel;
    }

    // Historical fallback: rows written before migration 0341, or whose source isn't a channel
    // confirmation (merge/admin/projection), have confirming_channel = NULL — approximate with the
    // previous heuristic (earliest-linked Telegram/Max binding or verified email) rather than
    // inventing a provenance value for them.
    const result = await runWebappPgText<{ code: string }>(
      `SELECT code FROM (
         SELECT channel_code AS code, created_at AS at
         FROM user_channel_bindings
         WHERE user_id = $1::uuid AND channel_code IN ('telegram', 'max')
         UNION ALL
         SELECT 'email' AS code, email_verified_at AS at
         FROM platform_users
         WHERE id = $1::uuid AND email_verified_at IS NOT NULL
       ) first_verified
       ORDER BY at ASC
       LIMIT 1`,
      [userId],
    );
    const code = result.rows[0]?.code;
    return code === 'telegram' || code === 'max' || code === 'email' ? code : null;
  },
};
