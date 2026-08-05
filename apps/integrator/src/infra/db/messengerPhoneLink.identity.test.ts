/**
 * D20 уровень 1, пункт 6 — исходы привязки телефона к аккаунту:
 * `contracts/ports.ts → SetUserPhoneOutcome` (`noop_conflict` vs `applied`) и
 * `directPublic/writeIdentityAndPreferencesDirect.ts` (отказ при чужом якоре канала).
 *
 * Цена ошибки: телефон — ключ, по которому вебапп находит человека. Привязать чужой номер или
 * записать данные человека в чужой платформенный аккаунт = «вход не в тот аккаунт» буквально.
 *
 * КАК ПРОВЕРЯЕТСЯ. Предмет — «чей это аккаунт после операции», а не «что вернула функция», поэтому
 * тесты гоняют ЖИВОЙ путь `createDbWritePort().writeDb({type:'user.phone.link'})` на модели таблиц:
 * двойник `DbPort` разбирает приходящий SQL и применяет его к строкам в памяти
 * (`identities`, `users`, `public.platform_users`, `public.user_channel_bindings`, `contacts`).
 * Тот же приём, что на уровне 0 в `withClient.test.ts` (модель сессии PostgreSQL).
 * Неизвестный запрос модель НЕ проглатывает, а падает с его текстом — чтобы «зелено» не означало
 * «до этой строки просто не дошли».
 *
 * ГРАНИЦА ДОКАЗАННОГО: модель воспроизводит СМЫСЛ запросов (какие строки они выбирают и меняют),
 * но не сам PostgreSQL. Не доказано: уникальные индексы, RLS и то, что реальный
 * `ON CONFLICT … WHERE` отдаёт ровно 0 строк в конфликтном случае. См. отчёт, «что не покрыто».
 */
import { describe, expect, it } from 'vitest';
import type { DbPort, DbQueryResult } from '../../kernel/contracts/index.js';
import { createDbWritePort } from './writePort.js';
import { setUserPhone } from './repos/channelUsers.js';
import {
  DirectPublicWriteError,
  writeIdentityAndPreferencesDirect,
} from './directPublic/writeIdentityAndPreferencesDirect.js';

type IdentityRow = { resource: string; external_id: string; user_id: string };
type UserRow = { id: string; merged_into_user_id: string | null };
type PlatformUserRow = {
  id: string;
  phone_normalized: string | null;
  integrator_user_id: string | null;
  merged_into_id: string | null;
  display_name?: string | null;
};
type BindingRow = { channel_code: string; external_id: string; user_id: string };
type ContactRow = { user_id: string; type: string; value_normalized: string };
type TopicRow = { user_id: string; topic_code: string; is_enabled: boolean };
type PhoneHistoryRow = {
  platform_user_id: string;
  phone_normalized: string;
  valid_to: string | null;
  source: string;
};
type UserContactRow = {
  platform_user_id: string;
  contact_kind: string;
  channel_code: string | null;
  value_normalized: string;
  is_primary: boolean;
};

type Tables = {
  identities: IdentityRow[];
  users: UserRow[];
  platformUsers: PlatformUserRow[];
  bindings: BindingRow[];
  contacts: ContactRow[];
  topics: TopicRow[];
  /** D28: `user_phone_history` — confirmation ledger kept in sync with `platform_users.phone_normalized`. */
  phoneHistory: PhoneHistoryRow[];
  /** D15b/6: assembled contact mirror (`user_contacts`). */
  userContacts: UserContactRow[];
  /** Модель «legacy-строка контакта не отдаётся»: INSERT … ON CONFLICT … WHERE не задел ни строки. */
  contactsInsertBlocked?: boolean;
};

function emptyTables(seed: Partial<Tables> = {}): Tables {
  return {
    identities: [],
    users: [],
    platformUsers: [],
    bindings: [],
    contacts: [],
    topics: [],
    phoneHistory: [],
    userContacts: [],
    ...seed,
  };
}

// D15b/2: the shared `@bersoncare/platform-merge` identity-projection writers (now used for the
// INSERT/UPDATE on `platform_users` and the `user_channel_bindings`/`user_channel_preferences`
// upserts) address these tables unqualified — same convention `pgPlatformUserMerge.ts` already uses
// and that this test's `user.phone.link` path already exercises live. Stripping `public.` here makes
// the model schema-qualification-agnostic instead of asserting one specific SQL style.
const norm = (s: string): string =>
  s.replace(/\s+/g, ' ').trim().toLowerCase().replaceAll('public.', '');

/**
 * `DbPort` поверх модели таблиц. Транзакция — снимок: при исключении внутри `tx` состояние
 * откатывается целиком, как это делает PostgreSQL (иначе «откат» был бы недоказуем).
 */
function makeDb(tables: Tables): DbPort & { statements: string[] } {
  const statements: string[] = [];

  const query = async <T>(text: string, params: unknown[] = []): Promise<DbQueryResult<T>> => {
    const q = norm(text);
    statements.push(q);
    const p: (string | null)[] = params.map((v) =>
      v === null || v === undefined ? null : String(v),
    );
    /** Значение параметра `$n` (1-based индекс — 0-based смещение), всегда `string | null`. */
    const at = (i: number): string | null => p[i] ?? null;
    const rows = (r: unknown[]): DbQueryResult<T> => ({
      rows: r as T[],
      rowCount: r.length,
    });

    // --- integrator contacts (первым: внутри INSERT есть подзапрос по platform_users) ---------
    if (q.startsWith('delete from contacts')) {
      const before = tables.contacts.length;
      tables.contacts = tables.contacts.filter(
        (c) => !(c.type === 'phone' && c.value_normalized === p[0] && c.user_id !== p[1]),
      );
      return { rows: [] as T[], rowCount: before - tables.contacts.length };
    }
    if (q.startsWith('insert into contacts')) {
      const owner = p[0]!;
      const phone = p[1]!;
      const conflicting = tables.contacts.find(
        (c) => c.type === 'phone' && c.value_normalized === phone,
      );
      if (tables.contactsInsertBlocked || (conflicting && conflicting.user_id !== owner)) {
        // `ON CONFLICT … DO UPDATE … WHERE contacts.user_id = <owner>` не задел ни одной строки.
        return { rows: [] as T[], rowCount: 0 };
      }
      if (!conflicting) {
        tables.contacts.push({ user_id: owner, type: 'phone', value_normalized: phone });
      }
      return { rows: [] as T[], rowCount: 1 };
    }

    // --- integrator identities -------------------------------------------------
    if (q.includes('from identities i')) {
      // writePort: `i.resource = $2 AND i.external_id = $1`; setUserPhone: обратный порядок.
      const resourceFirst = q.includes('i.resource = $1');
      const resource = resourceFirst ? p[0] : p[1];
      const externalId = resourceFirst ? p[1] : p[0];
      const hit = tables.identities.find(
        (i) => i.resource === resource && i.external_id === externalId,
      );
      return rows(hit ? [{ user_id: hit.user_id }] : []);
    }

    // --- merge chain -----------------------------------------------------------
    if (q.includes('merged_into_user_id') && q.includes('from users')) {
      const hit = tables.users.find((u) => u.id === p[0]);
      return rows(hit ? [{ merged_into_user_id: hit.merged_into_user_id }] : []);
    }

    // --- canonical channel binding --------------------------------------------
    if (q.includes('from user_channel_bindings ucb')) {
      const hit = tables.bindings.find((b) => b.channel_code === p[0] && b.external_id === p[1]);
      const pu = hit
        ? tables.platformUsers.find((u) => u.id === hit.user_id && u.merged_into_id === null)
        : undefined;
      return rows(pu ? [{ platform_user_id: pu.id, user_id: pu.id }] : []);
    }
    if (q.startsWith('insert into user_channel_bindings')) {
      const exists = tables.bindings.some(
        (b) => b.channel_code === p[1] && b.external_id === p[2],
      );
      if (exists) return rows([]);
      tables.bindings.push({ user_id: p[0]!, channel_code: p[1]!, external_id: p[2]! });
      return rows([{ user_id: p[0] }]);
    }

    // --- D15b/6: user_contacts mirror + canonical phone lookup ----------------------------
    if (q.includes('from user_contacts uc') && q.includes("contact_kind = 'phone'")) {
      const hits = tables.userContacts
        .filter(
          (uc) =>
            uc.contact_kind === 'phone' &&
            uc.value_normalized === p[0] &&
            uc.platform_user_id !== p[1],
        )
        .map((uc) => {
          const pu = tables.platformUsers.find(
            (u) => u.id === uc.platform_user_id && u.merged_into_id === null,
          );
          return pu ? { id: pu.id } : null;
        })
        .filter(Boolean);
      return rows(hits.slice(0, 1) as { id: string }[]);
    }
    if (q.startsWith('delete from user_contacts')) {
      const before = tables.userContacts.length;
      tables.userContacts = tables.userContacts.filter((uc) => uc.platform_user_id !== p[0]);
      return { rows: [] as T[], rowCount: before - tables.userContacts.length };
    }
    if (q.startsWith('insert into user_contacts')) {
      const pu = tables.platformUsers.find((u) => u.id === p[0] && u.merged_into_id === null);
      if (!pu?.phone_normalized) return { rows: [] as T[], rowCount: 0 };
      const conflict = tables.userContacts.find(
        (uc) => uc.contact_kind === 'phone' && uc.value_normalized === pu.phone_normalized,
      );
      if (conflict && conflict.platform_user_id !== pu.id) {
        const err = Object.assign(new Error('uq_user_contacts_phone'), {
          code: '23505',
          constraint: 'uq_user_contacts_phone',
        });
        throw err;
      }
      tables.userContacts = tables.userContacts.filter((uc) => uc.platform_user_id !== pu.id);
      tables.userContacts.push({
        platform_user_id: pu.id,
        contact_kind: 'phone',
        channel_code: null,
        value_normalized: pu.phone_normalized,
        is_primary: true,
      });
      return { rows: [] as T[], rowCount: 1 };
    }

    // --- canonical platform_users ---------------------------------------------
    if (q.includes('from platform_users')) {
      const live = tables.platformUsers.filter((u) => u.merged_into_id === null);
      if (q.includes('existing_int_uid')) {
        const hit = live.find((u) => u.id === p[0]);
        return rows(hit ? [{ existing_int_uid: hit.integrator_user_id }] : []);
      }
      if (q.includes('phone_normalized = $1')) {
        const hit = live.filter((u) => u.phone_normalized === p[0] && u.id !== p[1]);
        return rows(hit.map((u) => ({ id: u.id })));
      }
      if (q.includes('integrator_user_id = $1')) {
        const hit = live.filter((u) => u.integrator_user_id === p[0] && u.id !== (p[1] ?? null));
        return rows(hit.map((u) => ({ id: u.id })));
      }
      // loadPickCandidate / прочие точечные чтения строки
      const hit = live.find((u) => u.id === p[0]);
      return rows(
        hit
          ? [
              {
                id: hit.id,
                phone_normalized: hit.phone_normalized,
                integrator_user_id: hit.integrator_user_id,
                created_at: new Date('2026-01-01T00:00:00.000Z'),
              },
            ]
          : [],
      );
    }
    if (q.startsWith('insert into platform_users')) {
      const id = `pu-new-${tables.platformUsers.length + 1}`;
      tables.platformUsers.push({
        id,
        integrator_user_id: at(0),
        phone_normalized: at(1),
        display_name: at(2),
        merged_into_id: null,
      });
      return rows([{ id }]);
    }
    if (q.startsWith('update platform_users')) {
      if (
        q.includes('phone_normalized = $1') &&
        q.includes('patient_phone_trust_at') &&
        q.includes('id = $3')
      ) {
        const hit = tables.platformUsers.find((u) => u.id === p[2] && u.merged_into_id === null);
        if (!hit) return rows([]);
        hit.phone_normalized = at(0);
        if (hit.integrator_user_id === null) hit.integrator_user_id = at(1);
        return { rows: [] as T[], rowCount: 1 };
      }
      if (q.includes('phone_normalized = $2')) {
        const hit = tables.platformUsers.find((u) => u.id === p[0] && u.merged_into_id === null);
        if (!hit) return rows([]);
        hit.phone_normalized = at(1);
        if (hit.integrator_user_id === null) hit.integrator_user_id = at(2);
        return { rows: [] as T[], rowCount: 1 };
      }
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
      // enrichIdentityProjection (shared package): params are
      // [platformUserId, displayName, firstName, lastName, email, phoneNormalized, integratorUserId, channelCode]
      const hit = tables.platformUsers.find((u) => u.id === p[0] && u.merged_into_id === null);
      if (!hit) return { rows: [] as T[], rowCount: 0 };
      if (hit.integrator_user_id === null) hit.integrator_user_id = at(6);
      if (hit.phone_normalized === null) hit.phone_normalized = at(5);
      return { rows: [] as T[], rowCount: 1 };
    }

    // --- D28: user_phone_history sync (`syncPlatformUserPhoneHistoryOnConfirm`) -----------------
    if (q.startsWith('update user_phone_history')) {
      for (const h of tables.phoneHistory) {
        if (h.platform_user_id === p[0] && h.valid_to === null) h.valid_to = 'closed';
      }
      return { rows: [] as T[], rowCount: 1 };
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

    // --- notification topics / прочее -----------------------------------------
    if (q.startsWith('insert into user_notification_topics')) {
      tables.topics.push({ user_id: p[0]!, topic_code: p[1]!, is_enabled: p[2] === 'true' });
      return rows([]);
    }
    if (q.startsWith('insert into user_channel_preferences')) return rows([]);
    if (q.includes('pg_advisory_xact_lock')) return rows([]);

    throw new Error(`модель таблиц не знает запроса: ${q}`);
  };

  const port: DbPort & { statements: string[] } = {
    statements,
    query,
    async tx<T>(fn: (db: DbPort) => Promise<T>): Promise<T> {
      const snapshot = JSON.parse(
        JSON.stringify({
          identities: tables.identities,
          users: tables.users,
          platformUsers: tables.platformUsers,
          bindings: tables.bindings,
          contacts: tables.contacts,
          topics: tables.topics,
          phoneHistory: tables.phoneHistory,
          userContacts: tables.userContacts,
        }),
      ) as Tables;
      try {
        return await fn(port);
      } catch (err) {
        tables.identities = snapshot.identities;
        tables.users = snapshot.users;
        tables.platformUsers = snapshot.platformUsers;
        tables.bindings = snapshot.bindings;
        tables.contacts = snapshot.contacts;
        tables.topics = snapshot.topics;
        tables.phoneHistory = snapshot.phoneHistory;
        tables.userContacts = snapshot.userContacts;
        throw err;
      }
    },
  };
  return port;
}

/** Живой путь привязки телефона: ровно та мутация, которую шлёт `user.phone.link` из исполнителя. */
async function linkPhone(
  db: DbPort,
  params: { externalId: string; phone: string; channelEnabled?: boolean },
) {
  const writePort = createDbWritePort({
    db,
    authChannelPolicy: async () => params.channelEnabled ?? true,
  });
  return writePort.writeDb({
    type: 'user.phone.link',
    params: {
      resource: 'telegram',
      channelUserId: params.externalId,
      phoneNormalized: params.phone,
    },
  });
}

const PHONE = '+79180000011';

describe('привязка телефона: в чей аккаунт он попадёт', () => {
  it('дано: у мессенджер-id нет канонической привязки → когда человек шлёт контакт → тогда отказ НАЗВАН, и телефон не попал ни в чей аккаунт', () => {
    // арбитр: вместо `throw new MessengerPhoneLinkError('no_channel_binding')` в
    // applyMessengerPhonePublicBind взять первый попавшийся platform_users по телефону
    const tables = emptyTables({
      identities: [{ resource: 'telegram', external_id: '555', user_id: '1000' }],
      users: [{ id: '1000', merged_into_user_id: null }],
      platformUsers: [
        {
          id: 'pu-stranger',
          phone_normalized: PHONE,
          integrator_user_id: '900',
          merged_into_id: null,
        },
      ],
    });
    const db = makeDb(tables);

    return linkPhone(db, { externalId: '555', phone: PHONE }).then((result) => {
      expect(result).toEqual({
        userPhoneLinkApplied: false,
        phoneLinkReason: 'no_channel_binding',
      });
      expect(tables.platformUsers.map((u) => u.integrator_user_id)).toEqual(['900']);
      expect(tables.contacts).toEqual([]);
    });
  });

  it('дано: интегратор не знает этой мессенджер-идентичности → тогда отказ назван, и в канон не ушло ничего', async () => {
    // арбитр: убрать ранний возврат `if (!rawUid)` в writePort — привязка пойдёт дальше
    // с неразрешённым человеком
    const tables = emptyTables({
      platformUsers: [
        { id: 'pu-a', phone_normalized: null, integrator_user_id: '1000', merged_into_id: null },
      ],
      bindings: [{ channel_code: 'telegram', external_id: '555', user_id: 'pu-a' }],
    });
    const db = makeDb(tables);

    const result = await linkPhone(db, { externalId: '555', phone: PHONE });

    expect(result).toEqual({
      userPhoneLinkApplied: false,
      phoneLinkReason: 'no_integrator_identity',
    });
    expect(tables.platformUsers[0]!.phone_normalized).toBeNull();
  });

  it('дано: канал входа выключен в настройках → тогда телефон не привязывается и причина названа', async () => {
    // арбитр: убрать проверку `if (!(await authChannelPolicy(resource)))` в writePort
    const tables = emptyTables({
      identities: [{ resource: 'telegram', external_id: '555', user_id: '1000' }],
      users: [{ id: '1000', merged_into_user_id: null }],
      platformUsers: [
        { id: 'pu-a', phone_normalized: null, integrator_user_id: '1000', merged_into_id: null },
      ],
      bindings: [{ channel_code: 'telegram', external_id: '555', user_id: 'pu-a' }],
    });
    const db = makeDb(tables);

    const result = await linkPhone(db, {
      externalId: '555',
      phone: PHONE,
      channelEnabled: false,
    });

    expect(result).toEqual({
      userPhoneLinkApplied: false,
      phoneLinkReason: 'auth_channel_disabled',
    });
    expect(tables.platformUsers[0]!.phone_normalized).toBeNull();
  });

  it('дано: свой аккаунт и свой канал → когда человек подтверждает номер → тогда телефон записан ему, и это сказано вызывающему', async () => {
    // арбитр: в writePort вернуть `{ userPhoneLinkApplied: false }` на успешном пути —
    // человек привязал номер, а бот отвечает «не получилось»
    const tables = emptyTables({
      identities: [{ resource: 'telegram', external_id: '555', user_id: '1000' }],
      users: [{ id: '1000', merged_into_user_id: null }],
      platformUsers: [
        { id: 'pu-a', phone_normalized: null, integrator_user_id: '1000', merged_into_id: null },
      ],
      bindings: [{ channel_code: 'telegram', external_id: '555', user_id: 'pu-a' }],
    });
    const db = makeDb(tables);

    const result = await linkPhone(db, { externalId: '555', phone: PHONE });

    expect(result).toEqual({ userPhoneLinkApplied: true });
    expect(tables.platformUsers[0]!.phone_normalized).toBe(PHONE);
    expect(tables.contacts).toEqual([{ user_id: '1000', type: 'phone', value_normalized: PHONE }]);
    expect(tables.userContacts).toEqual([
      {
        platform_user_id: 'pu-a',
        contact_kind: 'phone',
        channel_code: null,
        value_normalized: PHONE,
        is_primary: true,
      },
    ]);
  });

  it('дано: интеграторская учётка слита в другую → когда привязка → тогда телефон уходит ЦЕЛЕВОЙ учётке, не исчезнувшей', async () => {
    // арбитр: убрать `resolveCanonicalIntegratorUserId` из writePort (писать rawUid) —
    // телефон запишется в аккаунт, которого уже нет
    const tables = emptyTables({
      identities: [{ resource: 'telegram', external_id: '555', user_id: '1000' }],
      users: [
        { id: '1000', merged_into_user_id: '2000' },
        { id: '2000', merged_into_user_id: null },
      ],
      platformUsers: [
        { id: 'pu-a', phone_normalized: null, integrator_user_id: '2000', merged_into_id: null },
      ],
      bindings: [{ channel_code: 'telegram', external_id: '555', user_id: 'pu-a' }],
    });
    const db = makeDb(tables);

    const result = await linkPhone(db, { externalId: '555', phone: PHONE });

    expect(result).toEqual({ userPhoneLinkApplied: true });
    expect(tables.contacts).toEqual([{ user_id: '2000', type: 'phone', value_normalized: PHONE }]);
  });

  it('дано: этот номер уже принадлежит другому каноническому аккаунту → тогда телефон НЕ дописывается второму аккаунту и «привязано» человеку не говорят', async () => {
    // Наблюдаемое, ради которого тест написан: НЕ БЫВАЕТ двух живых аккаунтов с одним телефоном —
    // иначе резолв получателя (уровень 0) начнёт выбирать между ними «первого попавшегося».
    // Код обязан заметить чужого владельца номера и уйти в каноническое слияние
    // (`findOtherPlatformUserWithSamePhone` → `mergePlatformUsersInTransaction`).
    // ГРАНИЦА: чем кончается само слияние, здесь НЕ проверяется — модель таблиц его не
    // воспроизводит, попытка слияния упирается в незнакомый запрос и вся привязка откатывается.
    // Доказано: путь записи телефона не проходит мимо чужого владельца. См. отчёт.
    // арбитр: убрать блок `if (otherPhone) { … }` в applyMessengerPhonePublicBind — финальный
    // UPDATE запишет номер второму аккаунту, и оба останутся живыми с одним номером
    const tables = emptyTables({
      identities: [{ resource: 'telegram', external_id: '555', user_id: '1000' }],
      users: [{ id: '1000', merged_into_user_id: null }],
      platformUsers: [
        { id: 'pu-a', phone_normalized: null, integrator_user_id: '1000', merged_into_id: null },
        { id: 'pu-b', phone_normalized: PHONE, integrator_user_id: '900', merged_into_id: null },
      ],
      bindings: [{ channel_code: 'telegram', external_id: '555', user_id: 'pu-a' }],
    });
    const db = makeDb(tables);

    const result = await linkPhone(db, { externalId: '555', phone: PHONE });

    expect(result).toMatchObject({ userPhoneLinkApplied: false });
    expect(
      tables.platformUsers
        .filter((u) => u.merged_into_id === null && u.phone_normalized === PHONE)
        .map((u) => u.id),
    ).toEqual(['pu-b']);
  });

  it('дано: владелец номера только в user_contacts (legacy колонка пуста) → тогда телефон НЕ дописывается второму аккаунту', async () => {
    const tables = emptyTables({
      identities: [{ resource: 'telegram', external_id: '555', user_id: '1000' }],
      users: [{ id: '1000', merged_into_user_id: null }],
      platformUsers: [
        { id: 'pu-a', phone_normalized: null, integrator_user_id: '1000', merged_into_id: null },
        { id: 'pu-b', phone_normalized: null, integrator_user_id: '900', merged_into_id: null },
      ],
      userContacts: [
        {
          platform_user_id: 'pu-b',
          contact_kind: 'phone',
          channel_code: null,
          value_normalized: PHONE,
          is_primary: true,
        },
      ],
      bindings: [{ channel_code: 'telegram', external_id: '555', user_id: 'pu-a' }],
    });
    const db = makeDb(tables);

    const result = await linkPhone(db, { externalId: '555', phone: PHONE });

    expect(result).toMatchObject({ userPhoneLinkApplied: false });
    expect(tables.platformUsers.find((u) => u.id === 'pu-a')?.phone_normalized).toBeNull();
    expect(
      tables.userContacts.filter((uc) => uc.contact_kind === 'phone' && uc.value_normalized === PHONE),
    ).toHaveLength(1);
  });

  it('дано: строку контакта отдать нельзя (она за другим человеком) → тогда отказ назван и КАНОНИЧЕСКАЯ запись телефона откачена', async () => {
    // Это тот самый исход `SetUserPhoneOutcome = noop_conflict` из карты: человек НЕ должен
    // остаться наполовину привязанным к чужому номеру.
    // арбитр: в writePort убрать `if (outcome === 'noop_conflict') throw …` —
    // канонический аккаунт останется с чужим телефоном, а вызывающему скажут «привязано»
    const tables = emptyTables({
      identities: [{ resource: 'telegram', external_id: '555', user_id: '1000' }],
      users: [{ id: '1000', merged_into_user_id: null }],
      platformUsers: [
        { id: 'pu-a', phone_normalized: null, integrator_user_id: '1000', merged_into_id: null },
      ],
      bindings: [{ channel_code: 'telegram', external_id: '555', user_id: 'pu-a' }],
      contactsInsertBlocked: true,
    });
    const db = makeDb(tables);

    const result = await linkPhone(db, { externalId: '555', phone: PHONE });

    expect(result).toEqual({
      userPhoneLinkApplied: false,
      phoneLinkReason: 'legacy_contacts_conflict',
    });
    expect(tables.platformUsers[0]!.phone_normalized).toBeNull();
    expect(tables.contacts).toEqual([]);
  });
});

describe('SetUserPhoneOutcome: applied против noop_conflict', () => {
  /** Двойник, отвечающий на любой SELECT одной строкой identity и управляющий строками INSERT. */
  function dbForOutcome(insertRowCount: number): DbPort {
    return {
      async query<T>(text: string): Promise<DbQueryResult<T>> {
        const q = norm(text);
        if (q.includes('from identities i')) {
          return { rows: [{ user_id: '1000' }] as T[], rowCount: 1 };
        }
        if (q.includes('merged_into_user_id')) return { rows: [] as T[], rowCount: 0 };
        if (q.startsWith('delete from contacts')) return { rows: [] as T[], rowCount: 1 };
        if (q.startsWith('insert into contacts')) {
          return { rows: [] as T[], rowCount: insertRowCount };
        }
        throw new Error(`неожиданный запрос: ${q}`);
      },
      async tx(fn) {
        return fn(this);
      },
    };
  }

  it('дано: строка контакта НЕ отдалась (0 изменённых строк) → тогда исход noop_conflict, а не applied', async () => {
    // арбитр: `return (res.rowCount ?? 0) > 0 ? 'applied' : 'noop_conflict'` → `return 'applied'`
    await expect(setUserPhone(dbForOutcome(0), '555', PHONE)).resolves.toBe('noop_conflict');
  });

  it('дано: строка контакта записана → тогда исход applied', async () => {
    // арбитр: `return 'noop_conflict'` безусловно — привязка перестанет работать вообще у всех
    await expect(setUserPhone(dbForOutcome(1), '555', PHONE)).resolves.toBe('applied');
  });

  it('дано: телефон занят другим человеком, привязка гонки произошла МЕЖДУ удалением чужой legacy-строки и записью своей → тогда чужая привязка НЕ перезаписывается, исход noop_conflict', async () => {
    // B1 (аудит `runs/briefs/audit-d20-level1.log`, единственная непойманная поломка): защита
    // ON CONFLICT (type, value_normalized) DO UPDATE … WHERE contacts.user_id = ${userId}::bigint
    // (repos/channelUsers.ts:871) — единственный барьер, который у setUserPhone вообще есть против
    // захвата чужого телефона. Он не проверяется обычным путём: предшествующий безусловный DELETE
    // (:851-856) в НЕ-гоночном случае уже сносит чужую строку раньше, чем INSERT дойдёт до guard'а
    // (см. переписанный тест ниже и находку в отчёте). Guard реально работает только в окне ГОНКИ
    // внутри ОДНОЙ транзакции setUserPhone (`db.tx` в writePort.ts): между нашим DELETE и нашим
    // INSERT конкурентная транзакция другого человека успевает закоммитить владение этим же
    // телефоном — Postgres read-committed берёт свежий снимок на каждый оператор, поэтому наш INSERT
    // увидит новую чужую строку и упрётся в guard.
    // арбитр: убрать `WHERE contacts.user_id = ${userId}::bigint` в ON CONFLICT DO UPDATE —
    // тогда чужая строка, появившаяся в этом окне, будет захвачена: исход `applied`, номер уезжает
    // человеку 1000, хотя телефон только что закрепился за человеком 900.
    const RACING_OWNER = '900';
    const contacts: ContactRow[] = [];
    const db: DbPort = {
      async query<T>(text: string, params: unknown[] = []): Promise<DbQueryResult<T>> {
        const q = norm(text);
        const p = params.map((v) => (v === null || v === undefined ? null : String(v)));
        if (q.startsWith('delete from contacts')) {
          const before = contacts.length;
          for (let i = contacts.length - 1; i >= 0; i -= 1) {
            const c = contacts[i]!;
            if (c.type === 'phone' && c.value_normalized === p[0] && c.user_id !== p[1]) {
              contacts.splice(i, 1);
            }
          }
          const deletedCount = before - contacts.length;
          // Симуляция гонки: ровно в этом окне (между DELETE и INSERT одной транзакции)
          // конкурентная транзакция другого человека успела закоммитить привязку того же номера.
          contacts.push({ user_id: RACING_OWNER, type: 'phone', value_normalized: p[0]! });
          return { rows: [] as T[], rowCount: deletedCount };
        }
        if (q.startsWith('insert into contacts')) {
          const hasOwnerGuard = q.includes('where contacts.user_id');
          const conflicting = contacts.find(
            (c) => c.type === 'phone' && c.value_normalized === p[1],
          );
          if (conflicting) {
            if (hasOwnerGuard && conflicting.user_id !== p[0]) {
              return { rows: [] as T[], rowCount: 0 };
            }
            conflicting.user_id = p[0]!;
            return { rows: [] as T[], rowCount: 1 };
          }
          contacts.push({ user_id: p[0]!, type: 'phone', value_normalized: p[1]! });
          return { rows: [] as T[], rowCount: 1 };
        }
        if (q.includes('from identities i')) {
          return { rows: [{ user_id: '1000' }] as T[], rowCount: 1 };
        }
        if (q.includes('merged_into_user_id')) return { rows: [] as T[], rowCount: 0 };
        throw new Error(`неожиданный запрос: ${q}`);
      },
      async tx(fn) {
        return fn(this);
      },
    };

    await expect(setUserPhone(db, '555', PHONE)).resolves.toBe('noop_conflict');
    expect(contacts).toEqual([{ user_id: RACING_OWNER, type: 'phone', value_normalized: PHONE }]);
  });

  // ДЕФЕКТ, зарегистрирован против `D20_INTEGRATOR_MAP.md` п.6 («чужая привязка телефона НЕ
  // перезаписывается» — часть решения Р-D20). Оракул здесь план, а не нынешняя реализация
  // (`.cursor/rules/test-execution-policy.md`, «проверяемая реализация не может сама придумать
  // ожидаемый результат»): шапка `setUserPhone` буквально обещает «Safe against takeover: если
  // телефон уже привязан другому пользователю, обновление не применяется», и этот тест требует
  // ровно того, что обещано. it.fails — тест ОБЯЗАН падать на нынешнем коде: набор остаётся
  // зелёным, но дефект виден в отчёте прогона, а не потерян. Починка — отдельная работа (не эта):
  // либо привести DELETE в соответствие с обещанием (перестать сносить чужую строку без разбора),
  // либо честно переписать комментарий функции, если продукт решит сохранить нынешнее поведение.
  it.fails('дано: телефон уже занят строкой контакта другого человека → тогда чужая привязка НЕ перезаписывается, исход noop_conflict (план: D20_INTEGRATOR_MAP.md п.6)', async () => {
    // ФАКТ на сегодня (не то, что проверяет этот тест): DELETE строкой выше сносит чужую строку
    // безусловно, и до охраняющего `ON CONFLICT … WHERE contacts.user_id = …` конфликт не
    // доезжает — реальный исход `applied`, чужая строка исчезает. См. B1-тест выше: тот же guard
    // реально удерживает захват только в окне гонки между DELETE и INSERT одной транзакции.
    const contacts: ContactRow[] = [
      { user_id: '900', type: 'phone', value_normalized: PHONE },
    ];
    const db: DbPort = {
      async query<T>(text: string, params: unknown[] = []): Promise<DbQueryResult<T>> {
        const q = norm(text);
        const p = params.map((v) => (v === null || v === undefined ? null : String(v)));
        if (q.startsWith('delete from contacts')) {
          const before = contacts.length;
          for (let i = contacts.length - 1; i >= 0; i -= 1) {
            const c = contacts[i]!;
            if (c.type === 'phone' && c.value_normalized === p[0] && c.user_id !== p[1]) {
              contacts.splice(i, 1);
            }
          }
          return { rows: [] as T[], rowCount: before - contacts.length };
        }
        if (q.startsWith('insert into contacts')) {
          const conflicting = contacts.find(
            (c) => c.type === 'phone' && c.value_normalized === p[1],
          );
          if (conflicting && conflicting.user_id !== p[0]) {
            return { rows: [] as T[], rowCount: 0 };
          }
          if (!conflicting) {
            contacts.push({ user_id: p[0]!, type: 'phone', value_normalized: p[1]! });
          }
          return { rows: [] as T[], rowCount: 1 };
        }
        if (q.includes('from identities i')) {
          return { rows: [{ user_id: '1000' }] as T[], rowCount: 1 };
        }
        if (q.includes('merged_into_user_id')) return { rows: [] as T[], rowCount: 0 };
        throw new Error(`неожиданный запрос: ${q}`);
      },
      async tx(fn) {
        return fn(this);
      },
    };

    await expect(setUserPhone(db, '555', PHONE)).resolves.toBe('noop_conflict');
    expect(contacts).toEqual([{ user_id: '900', type: 'phone', value_normalized: PHONE }]);
  });

  it('дано: интегратор не знает этой мессенджер-идентичности → тогда исход failed, а не applied', async () => {
    // арбитр: `if (!rawUserId) return 'failed'` → `return 'applied'`
    const db: DbPort = {
      async query<T>(): Promise<DbQueryResult<T>> {
        return { rows: [] as T[], rowCount: 0 };
      },
      async tx(fn) {
        return fn(this);
      },
    };

    await expect(setUserPhone(db, '555', PHONE)).resolves.toBe('failed');
  });
});

describe('чужой якорь канала при записи идентичности в канон', () => {
  const anchorFor = (integratorUserId: string) => ({
    writeChannelAnchor: async () => ({ integratorUserId }),
  });

  it('дано: канал привязан к аккаунту B, а по интеграторскому id находится аккаунт A → тогда ЯВНЫЙ отказ, и ничего не записано', async () => {
    // арбитр: в defaultMergeCandidateIds вернуть `uniq[0]` вместо
    // `throw new DirectPublicWriteError('ambiguous_platform_user_candidates')`
    const tables = emptyTables({
      platformUsers: [
        { id: 'pu-a', phone_normalized: null, integrator_user_id: '1000', merged_into_id: null },
        { id: 'pu-b', phone_normalized: null, integrator_user_id: '900', merged_into_id: null },
      ],
      bindings: [{ channel_code: 'telegram', external_id: '555', user_id: 'pu-b' }],
    });
    const db = makeDb(tables);

    const failure = await writeIdentityAndPreferencesDirect(
      db,
      {
        channelCode: 'telegram',
        externalId: '555',
        topics: [{ topicCode: 'appointment_reminders', isEnabled: false }],
      },
      anchorFor('1000'),
    ).catch((err: unknown) => err);

    expect(failure).toBeInstanceOf(DirectPublicWriteError);
    expect((failure as DirectPublicWriteError).code).toBe('ambiguous_platform_user_candidates');
    expect((failure as DirectPublicWriteError).candidateIds).toEqual(['pu-a', 'pu-b']);
    expect(tables.topics).toEqual([]);
  });

  it('дано: якорь канала не разрешился → тогда отказ назван, и в канон не ушло ничего', async () => {
    // арбитр: убрать `throw new DirectPublicWriteError('channel_anchor_unresolved')` —
    // запись пойдёт с пустым интеграторским id
    const tables = emptyTables();
    const db = makeDb(tables);

    const failure = await writeIdentityAndPreferencesDirect(
      db,
      { channelCode: 'telegram', externalId: '555', topics: [] },
      { writeChannelAnchor: async () => null },
    ).catch((err: unknown) => err);

    expect(failure).toBeInstanceOf(DirectPublicWriteError);
    expect((failure as DirectPublicWriteError).code).toBe('channel_anchor_unresolved');
    expect(tables.platformUsers).toEqual([]);
  });

  // ДЕФЕКТ, зарегистрирован против карты (раздел «Порядок написания тестов», Уровень 1, п.6:
  // «отказ при чужом якоре канала — назван явно, не тихий noop») и решения Р-D20. Оракул — план,
  // не нынешняя реализация. it.fails — тест ОБЯЗАН падать на нынешнем коде: набор остаётся
  // зелёным, но дефект виден в отчёте прогона, а не потерян. Минимальная правка (не сделана,
  // решение владельца, см. `D20_LEVEL1_TESTS_REPORT.md` «Что НЕ покрыто» п.5.2): в
  // `collectPlatformUserCandidates`/`writeIdentityAndPreferencesDirect` — если единственный
  // кандидат пришёл ТОЛЬКО из привязки канала и его `integrator_user_id` непуст и не равен
  // каноническому — отказывать явным кодом (например `channel_anchor_owned_by_other_user`), как
  // уже делает `applyMessengerPhonePublicBind` для похожего случая.
  it('дано: канал привязан к чужому аккаунту, а своего у человека ещё нет → тогда ЯВНЫЙ отказ, и настройки НЕ уходят в чужой аккаунт (план: D20_INTEGRATOR_MAP.md, Уровень 1 п.6)', async () => {
    // ФАКТ на сегодня (не то, что проверяет этот тест): отказа в коде нет — единственным
    // кандидатом становится чужой аккаунт, и настройки молча пишутся в него.
    const tables = emptyTables({
      platformUsers: [
        { id: 'pu-b', phone_normalized: null, integrator_user_id: '900', merged_into_id: null },
      ],
      bindings: [{ channel_code: 'telegram', external_id: '555', user_id: 'pu-b' }],
    });
    const db = makeDb(tables);

    const failure = await writeIdentityAndPreferencesDirect(
      db,
      {
        channelCode: 'telegram',
        externalId: '555',
        topics: [{ topicCode: 'appointment_reminders', isEnabled: false }],
      },
      anchorFor('1000'),
    ).catch((err: unknown) => err);

    expect(failure).toBeInstanceOf(DirectPublicWriteError);
    expect(tables.topics).toEqual([]);
    // Аккаунт B остаётся аккаунтом B — ничьи настройки в него не попали.
    expect(tables.platformUsers[0]!.integrator_user_id).toBe('900');
  });
});
