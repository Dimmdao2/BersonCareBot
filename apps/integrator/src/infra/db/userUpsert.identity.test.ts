/**
 * D15b/2 — behavioral coverage for `user.upsert` (the mutation the census found had NO end-to-end
 * test before this slice: `writeIdentityAndPreferencesDirect` was only exercised through anchor-
 * resolution edge cases in `messengerPhoneLink.identity.test.ts`, never through a genuine
 * create-then-enrich path).
 *
 * Subject: after the integrator stopped owning its own `platform_users` INSERT/UPDATE (moved to the
 * shared `@bersoncare/platform-merge` `identityProjectionWrite`), a brand-new channel user must still
 * get a `platform_users` row + a bound channel, and a returning one must still get enriched — for BOTH
 * Telegram and MAX. `writeChannelAnchor` is stubbed (same convention as the neighboring anchor tests in
 * `messengerPhoneLink.identity.test.ts`): the retained integrator-only channel-anchor CTEs
 * (`upsertUser`/`ensureIdentityForMessenger`) are unchanged by D15b/2 and not this file's subject; the
 * two-webhook test below seeds `identities` to stand in for "webhook 1's anchor already ran", so the
 * continuity assertion is about the identity write this slice changed, not the anchor writer.
 *
 * КАК ПРОВЕРЯЕТСЯ: живой путь `createDbWritePort().writeDb({type:'user.upsert'})` /
 * `writeDb({type:'user.phone.link'})` на модели таблиц в памяти (тот же приём, что в соседнем файле).
 */
import { describe, expect, it } from 'vitest';
import type { DbPort, DbQueryResult } from '../../kernel/contracts/index.js';
import { createDbWritePort } from './writePort.js';

type IdentityRow = { resource: string; external_id: string; user_id: string };
type UserRow = { id: string; merged_into_user_id: string | null };
type PlatformUserRow = {
  id: string;
  phone_normalized: string | null;
  integrator_user_id: string | null;
  merged_into_id: string | null;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
};
type BindingRow = { channel_code: string; external_id: string; user_id: string };
type ChannelPrefRow = { user_id: string; channel_code: string };
type ContactRow = { user_id: string; type: string; value_normalized: string };

type Tables = {
  identities: IdentityRow[];
  users: UserRow[];
  platformUsers: PlatformUserRow[];
  bindings: BindingRow[];
  channelPrefs: ChannelPrefRow[];
  contacts: ContactRow[];
};

function emptyTables(seed: Partial<Tables> = {}): Tables {
  return {
    identities: [],
    users: [],
    platformUsers: [],
    bindings: [],
    channelPrefs: [],
    contacts: [],
    ...seed,
  };
}

// Same normalization as `messengerPhoneLink.identity.test.ts`: the shared package's own writes
// address tables unqualified; `messengerPhonePublicBind.ts` still qualifies with `public.` — the model
// is schema-qualification-agnostic so both conventions resolve to the same table.
const norm = (s: string): string =>
  s.replace(/\s+/g, ' ').trim().toLowerCase().replaceAll('public.', '');

function makeDb(tables: Tables): DbPort & { statements: string[] } {
  const statements: string[] = [];

  const query = async <T>(text: string, params: unknown[] = []): Promise<DbQueryResult<T>> => {
    const q = norm(text);
    statements.push(q);
    const p: (string | null)[] = params.map((v) =>
      v === null || v === undefined ? null : String(v),
    );
    const at = (i: number): string | null => p[i] ?? null;
    const rows = (r: unknown[]): DbQueryResult<T> => ({ rows: r as T[], rowCount: r.length });

    if (q.includes('pg_advisory_xact_lock')) return rows([]);

    /** Resolve-or-create the retained channel anchor (`upsertUser`/`ensureIdentityForMessenger`'s
     * combined CTE effect) — not this test's subject, but real `writePort.ts` always calls it. */
    const resolveOrCreateAnchor = (resource: string, externalId: string): string => {
      const existing = tables.identities.find(
        (i) => i.resource === resource && i.external_id === externalId,
      );
      if (existing) return existing.user_id;
      const userId = `u-${tables.users.length + 1}`;
      tables.users.push({ id: userId, merged_into_user_id: null });
      tables.identities.push({ resource, external_id: externalId, user_id: userId });
      return userId;
    };

    // --- retained channel anchor (upsertUser / ensureIdentityForMessenger CTEs) ---------------------
    if (q.includes('existing_identity')) {
      // upsertUser (telegram): channelId is the FIRST bound param (drizzle binds each interpolation
      // of `${channelId}` as its own param, even though it's the same JS value every time).
      const userId = resolveOrCreateAnchor('telegram', p[0]!);
      return rows([{ id: userId, channel_id: p[0] }]);
    }
    if (q.includes('with existing as (')) {
      // ensureIdentityForMessenger (max): returns void in real code; the model just needs the
      // side effect on `identities`/`users` before the caller's separate lookup below.
      resolveOrCreateAnchor(p[0]!, p[1]!);
      return rows([]);
    }
    if (q.includes('select user_id::text as user_id from identities') && !q.includes(' i ')) {
      // buildChannelAnchorWriter's post-`ensureIdentityForMessenger` lookup (max only, no alias).
      const hit = tables.identities.find((i) => i.resource === p[0] && i.external_id === p[1]);
      return rows(hit ? [{ user_id: hit.user_id }] : []);
    }

    // --- identities / merge chain (webhook 2's own direct queries in writePort.ts) -----------------
    if (q.includes('from identities i')) {
      const hit = tables.identities.find((i) => i.resource === p[0] && i.external_id === p[1]);
      return rows(hit ? [{ user_id: hit.user_id }] : []);
    }
    if (q.includes('merged_into_user_id') && q.includes('from users')) {
      const hit = tables.users.find((u) => u.id === p[0]);
      return rows(hit ? [{ merged_into_user_id: hit.merged_into_user_id }] : []);
    }

    // --- contacts (setUserPhone, webhook 2) -----------------------------------------------------
    if (q.startsWith('insert into contacts')) {
      const owner = p[0]!;
      const phone = p[1]!;
      const conflicting = tables.contacts.find(
        (c) => c.type === 'phone' && c.value_normalized === phone,
      );
      if (conflicting && conflicting.user_id !== owner) return rows([]);
      if (!conflicting) tables.contacts.push({ user_id: owner, type: 'phone', value_normalized: phone });
      return { rows: [] as T[], rowCount: 1 };
    }
    if (q.startsWith('delete from contacts')) return { rows: [] as T[], rowCount: 0 };

    // --- canonical channel binding ---------------------------------------------------------------
    if (q.includes('from user_channel_bindings ucb')) {
      const hit = tables.bindings.find((b) => b.channel_code === p[0] && b.external_id === p[1]);
      const pu = hit
        ? tables.platformUsers.find((u) => u.id === hit.user_id && u.merged_into_id === null)
        : undefined;
      return rows(pu ? [{ platform_user_id: pu.id, user_id: pu.id }] : []);
    }
    if (q.startsWith('insert into user_channel_bindings')) {
      const exists = tables.bindings.some((b) => b.channel_code === p[1] && b.external_id === p[2]);
      if (exists) return rows([]);
      tables.bindings.push({ user_id: p[0]!, channel_code: p[1]!, external_id: p[2]! });
      return rows([{ user_id: p[0] }]);
    }
    if (q.startsWith('insert into user_channel_preferences')) {
      tables.channelPrefs.push({ user_id: p[0]!, channel_code: p[1]! });
      return rows([]);
    }
    if (q.startsWith('insert into user_notification_topics')) return rows([]);

    // --- canonical platform_users ------------------------------------------------------------------
    if (q.includes('from platform_users')) {
      const live = tables.platformUsers.filter((u) => u.merged_into_id === null);
      if (q.includes('integrator_user_id = $1')) {
        const hit = live.filter((u) => u.integrator_user_id === p[0]);
        return rows(hit.map((u) => ({ id: u.id })));
      }
      if (q.includes('phone_normalized = $1')) {
        const hit = live.filter((u) => u.phone_normalized === p[0]);
        return rows(hit.map((u) => ({ id: u.id })));
      }
      const hit = live.find((u) => u.id === p[0]);
      return rows(hit ? [{ id: hit.id }] : []);
    }
    if (q.startsWith('insert into platform_users')) {
      const id = `pu-new-${tables.platformUsers.length + 1}`;
      tables.platformUsers.push({
        id,
        integrator_user_id: at(0),
        phone_normalized: at(1),
        display_name: at(2),
        first_name: at(3),
        last_name: at(4),
        merged_into_id: null,
      });
      return rows([{ id }]);
    }
    if (q.startsWith('update platform_users')) {
      // `applyMessengerPhonePublicBind`'s final phone-set UPDATE (3 params: id, phone, integratorId).
      if (q.includes('phone_normalized = $2')) {
        const hit = tables.platformUsers.find((u) => u.id === p[0] && u.merged_into_id === null);
        if (!hit) return { rows: [] as T[], rowCount: 0 };
        hit.phone_normalized = at(1);
        if (!hit.integrator_user_id) hit.integrator_user_id = at(2);
        return { rows: [] as T[], rowCount: 1 };
      }
      // `applyMessengerPhonePublicBind`'s realign UPDATE (stale integrator_user_id on a bound row).
      if (q.includes('set integrator_user_id = $1')) {
        const blocked = tables.platformUsers.some(
          (u) => u.integrator_user_id === p[0] && u.merged_into_id === null && u.id !== p[1],
        );
        const hit = tables.platformUsers.find(
          (u) => u.id === p[1] && u.merged_into_id === null && u.integrator_user_id === p[2],
        );
        if (blocked || !hit) return { rows: [] as T[], rowCount: 0 };
        hit.integrator_user_id = at(0);
        return { rows: [] as T[], rowCount: 1 };
      }
      // enrichIdentityProjection params: [platformUserId, displayName, firstName, lastName, email,
      // phoneNormalized, integratorUserId, channelCode]
      const hit = tables.platformUsers.find((u) => u.id === p[0] && u.merged_into_id === null);
      if (!hit) return { rows: [] as T[], rowCount: 0 };
      const [, displayName, firstName, lastName, , phoneNormalized, integratorUserId, channelCode] = p;
      const isMessenger = channelCode === 'telegram' || channelCode === 'max';
      if (displayName && firstName && lastName) hit.display_name = displayName;
      else if (!hit.display_name && displayName) hit.display_name = displayName;
      hit.first_name = isMessenger ? (hit.first_name ?? firstName ?? null) : (firstName ?? hit.first_name ?? null);
      hit.last_name = isMessenger ? (hit.last_name ?? lastName ?? null) : (lastName ?? hit.last_name ?? null);
      if (phoneNormalized) hit.phone_normalized = phoneNormalized;
      if (integratorUserId && !hit.integrator_user_id) hit.integrator_user_id = integratorUserId;
      return { rows: [] as T[], rowCount: 1 };
    }

    throw new Error(`модель таблиц не знает запроса: ${q}`);
  };

  const port: DbPort & { statements: string[] } = {
    statements,
    query,
    async tx<T>(fn: (db: DbPort) => Promise<T>): Promise<T> {
      const snapshot = JSON.parse(JSON.stringify(tables)) as Tables;
      try {
        return await fn(port);
      } catch (err) {
        Object.assign(tables, snapshot);
        throw err;
      }
    },
  };
  return port;
}

async function upsertUser(
  db: DbPort,
  params: {
    resource: 'telegram' | 'max';
    externalId: string;
    firstName?: string;
    lastName?: string;
  },
) {
  const writePort = createDbWritePort({ db });
  return writePort.writeDb({
    type: 'user.upsert',
    params: {
      resource: params.resource,
      externalId: params.externalId,
      firstName: params.firstName,
      lastName: params.lastName,
    },
  });
}

const CHANNELS: Array<'telegram' | 'max'> = ['telegram', 'max'];

describe('user.upsert: новый человек на первом вебхуке', () => {
  for (const channel of CHANNELS) {
    it(`дано: ${channel}-id никогда не писал → когда приходит первое сообщение → тогда создаётся один platform_users и канал привязан`, async () => {
      // Genuinely new: no `identities`/`users` seed — `resolveOrCreateAnchor` models the real
      // `upsertUser`/`ensureIdentityForMessenger` CTE creating both on first contact.
      const tables = emptyTables();
      const db = makeDb(tables);
      await upsertUser(db, { resource: channel, externalId: '777', firstName: 'Иван', lastName: 'Петров' });

      expect(tables.platformUsers).toHaveLength(1);
      const pu = tables.platformUsers[0]!;
      expect(tables.identities).toEqual([{ resource: channel, external_id: '777', user_id: pu.integrator_user_id }]);
      expect(tables.bindings).toEqual([{ channel_code: channel, external_id: '777', user_id: pu.id }]);
      expect(tables.channelPrefs).toEqual([{ user_id: pu.id, channel_code: channel }]);
    });
  }

  it('дано: тот же канальный id шлёт второе сообщение → тогда НЕ создаётся вторая строка, существующая обогащается', async () => {
    const tables = emptyTables();
    const db = makeDb(tables);

    await upsertUser(db, { resource: 'telegram', externalId: '777', firstName: 'Иван', lastName: 'Петров' });
    expect(tables.platformUsers).toHaveLength(1);
    const firstId = tables.platformUsers[0]!.id;

    // Second message from the same channel identity — same anchor, same candidate via channel binding.
    await upsertUser(db, { resource: 'telegram', externalId: '777', firstName: 'Иван', lastName: 'Петров' });

    expect(tables.platformUsers).toHaveLength(1);
    expect(tables.platformUsers[0]!.id).toBe(firstId);
    expect(tables.bindings).toHaveLength(1);
  });

  it('дано: имя уже поправлено вручную в приложении → когда тот же max-канал снова пишет со старым именем из профиля мессенджера → тогда ФИО в базе НЕ затирается', async () => {
    // `enrichIdentityProjection`: for messenger channels, first_name/last_name prefer the EXISTING
    // value — a human correction in the app must survive a stale Telegram/MAX profile name.
    const tables = emptyTables({
      identities: [{ resource: 'max', external_id: '42', user_id: '6000' }],
      users: [{ id: '6000', merged_into_user_id: null }],
      platformUsers: [
        {
          id: 'pu-existing',
          integrator_user_id: '6000',
          phone_normalized: '+79180000099',
          display_name: 'Мария Иванова',
          first_name: 'Мария',
          last_name: 'Иванова',
          merged_into_id: null,
        },
      ],
    });
    const db = makeDb(tables);

    await upsertUser(db, { resource: 'max', externalId: '42', firstName: 'MariaOldProfileName', lastName: 'Smirnova' });

    expect(tables.platformUsers).toHaveLength(1);
    const pu = tables.platformUsers[0]!;
    expect(pu.id).toBe('pu-existing');
    expect(pu.first_name).toBe('Мария');
    expect(pu.last_name).toBe('Иванова');
    expect(pu.phone_normalized).toBe('+79180000099');
    expect(tables.bindings).toEqual([{ channel_code: 'max', external_id: '42', user_id: 'pu-existing' }]);
  });
});

describe('два вебхука подряд: создание на первом, доверие к телефону только на втором', () => {
  it('дано: новый telegram-пользователь → когда шлёт /start, затем делится контактом → тогда person создан на первом, phone trust — только на втором', async () => {
    const tables = emptyTables();
    const db = makeDb(tables);
    const writePort = createDbWritePort({ db, authChannelPolicy: async () => true });

    // Webhook 1 — user.upsert (the plain incoming message, no phone).
    await writePort.writeDb({
      type: 'user.upsert',
      params: { resource: 'telegram', externalId: '888', firstName: 'Олег' },
    });
    expect(tables.platformUsers).toHaveLength(1);
    const pu = tables.platformUsers[0]!;
    expect(pu.phone_normalized).toBeNull();
    expect(tables.bindings).toEqual([{ channel_code: 'telegram', external_id: '888', user_id: pu.id }]);
    const integratorUserId = pu.integrator_user_id!;

    // Webhook 2 — user.phone.link (the reply to the "share contact" prompt).
    const linkResult = await writePort.writeDb({
      type: 'user.phone.link',
      params: { resource: 'telegram', channelUserId: '888', phoneNormalized: '+79170000022' },
    });

    expect(linkResult).toEqual({ userPhoneLinkApplied: true });
    expect(tables.platformUsers).toHaveLength(1);
    expect(tables.platformUsers[0]!.id).toBe(pu.id);
    expect(tables.platformUsers[0]!.phone_normalized).toBe('+79170000022');
    expect(tables.contacts).toEqual([
      { user_id: integratorUserId, type: 'phone', value_normalized: '+79170000022' },
    ]);
  });
});
