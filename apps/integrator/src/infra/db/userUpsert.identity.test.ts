/**
 * D25: the `writeDb({type:'user.upsert'})` / `writeDb({type:'user.phone.link'})` behavior this file
 * used to cover through a fake relational-table model of the retired `writeIdentityAndPreferencesDirect`
 * / `applyMessengerPhonePublicBind` relation-writers is now entirely delegated to the exact named
 * PostgreSQL roots `app.integrator_upsert_channel_identity` / `app.integrator_bind_bootstrap_channel_phone`
 * (SECURITY DEFINER functions already deployed — see `bootstrapChannelIdentityRoot.unit.test.ts` for the
 * chokepoint/result-shape coverage of that dispatch, both bootstrap and organization principal). Re-modeling the SQL functions' own create/enrich/handle-normalize/FIO-preserve/D28-revoke
 * semantics as a TS-level fake-table test would just re-implement the deployed function body in JS; that
 * class of coverage now belongs to a live DB proof, out of this slice's scope.
 *
 * What remains genuinely this file's subject: `upsertIdentityProjection` (`@bersoncare/platform-merge`),
 * called directly by webapp's OAuth/email projection callers (not through `writeDb` at all — Telegram/MAX
 * webhooks never carry a phone at first contact) — untouched by D25. §Р-D28 (WORK_ORDER.md): a brand-new
 * canonical person created WITH an already-confirmed phone must open its first active
 * `user_phone_history` spell immediately, or a later confirm/replace of that number has no prior row to
 * close.
 */
import { describe, expect, it } from 'vitest';
import type { DbPort, DbQueryResult } from '../../kernel/contracts/index.js';
import { upsertIdentityProjection } from '@bersoncare/platform-merge';

type PlatformUserRow = {
  id: string;
  merged_into_id: string | null;
};
type PhoneHistoryRow = {
  platform_user_id: string;
  phone_normalized: string;
  valid_to: string | null;
  source: string;
};
type UserContactRow = {
  platform_user_id: string;
  contact_kind: string;
  value_normalized: string;
  is_primary: boolean;
};

type Tables = {
  platformUsers: PlatformUserRow[];
  phoneHistory: PhoneHistoryRow[];
  userContacts: UserContactRow[];
};

const norm = (s: string): string =>
  s.replace(/\s+/g, ' ').trim().toLowerCase().replaceAll('public.', '');

function makeDb(tables: Tables): DbPort {
  const query = async <T>(text: string, params: unknown[] = []): Promise<DbQueryResult<T>> => {
    const q = norm(text);
    const p: (string | null)[] = params.map((v) =>
      v === null || v === undefined ? null : String(v),
    );
    const rows = (r: unknown[]): DbQueryResult<T> => ({ rows: r as T[], rowCount: r.length });

    // collectIdentityProjectionCandidates: by phone.
    if (q.includes('from platform_users')) {
      // `syncUserIdentityFioMirror`'s `INSERT INTO user_identity (...) SELECT ... FROM platform_users
      // WHERE id = $1 ...` also matches this branch (substring `from platform_users`); its result is
      // discarded by the caller, so an empty/irrelevant row set is harmless here.
      return rows([]);
    }
    if (q.includes('from user_contacts uc') && q.includes("contact_kind = 'phone'")) {
      const hits = tables.userContacts
        .filter((uc) => uc.contact_kind === 'phone' && uc.value_normalized === p[0])
        .map((uc) => {
          const pu = tables.platformUsers.find(
            (u) => u.id === uc.platform_user_id && u.merged_into_id === null,
          );
          return pu ? { id: pu.id } : null;
        })
        .filter(Boolean);
      return rows(hits as { id: string }[]);
    }

    if (q.startsWith('insert into platform_users')) {
      const id = `pu-new-${tables.platformUsers.length + 1}`;
      tables.platformUsers.push({
        id,
        merged_into_id: null,
      });
      return rows([{ id }]);
    }

    if (q.startsWith('insert into user_phone_history')) {
      tables.phoneHistory.push({
        platform_user_id: p[0]!,
        phone_normalized: p[1]!,
        valid_to: null,
        source: p[2] ?? 'projection',
      });
      return rows([]);
    }

    if (q.startsWith('with existing_value as materialized')) {
      const platformUserId = tables.platformUsers.find((user) => p.includes(user.id))?.id;
      const valueNormalized = p.find((value) => value?.startsWith('+')) ?? null;
      const kind = p.find((value) => value === 'phone' || value === 'email') ?? null;
      if (!platformUserId || !valueNormalized || !kind) return rows([]);
      const conflict = tables.userContacts.find(
        (contact) =>
          contact.contact_kind === kind &&
          contact.value_normalized === valueNormalized &&
          contact.platform_user_id !== platformUserId,
      );
      if (conflict) return rows([]);
      tables.userContacts.push({
        platform_user_id: platformUserId,
        contact_kind: kind,
        value_normalized: valueNormalized,
        is_primary: true,
      });
      return rows([{ id: 'canonical-contact' }]);
    }

    throw new Error(`модель таблиц не знает запроса: ${q}`);
  };

  return {
    query,
    async tx<T>(fn: (db: DbPort) => Promise<T>): Promise<T> {
      return fn(this as unknown as DbPort);
    },
  };
}

describe('D28: брошенный номер без какой-либо истории', () => {
  it('дано: с ним создаётся новый канонический человек через `upsertIdentityProjection` → тогда сразу открывается его первая активная запись подтверждения (иначе снятие/замена этого номера позже некому будет закрыть)', async () => {
    const tables: Tables = { platformUsers: [], phoneHistory: [], userContacts: [] };
    const db = makeDb(tables);

    const result = await upsertIdentityProjection(db, {
      phoneNormalized: '+79000000055',
      displayName: 'Анна Кузнецова',
      firstName: 'Анна',
      lastName: 'Кузнецова',
    });

    expect(tables.userContacts).toContainEqual(
      expect.objectContaining({
        platform_user_id: result.platformUserId,
        contact_kind: 'phone',
        value_normalized: '+79000000055',
        is_primary: true,
      }),
    );
    expect(tables.phoneHistory).toEqual([
      {
        platform_user_id: result.platformUserId,
        phone_normalized: '+79000000055',
        valid_to: null,
        source: 'projection',
      },
    ]);
  });
});
