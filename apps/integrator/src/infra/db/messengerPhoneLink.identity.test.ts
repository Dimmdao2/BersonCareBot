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

type Tables = {
  identities: IdentityRow[];
  users: UserRow[];
  platformUsers: PlatformUserRow[];
  bindings: BindingRow[];
  contacts: ContactRow[];
  topics: TopicRow[];
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
    ...seed,
  };
}

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim().toLowerCase();

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
    if (q.includes('from public.user_channel_bindings ucb')) {
      const hit = tables.bindings.find((b) => b.channel_code === p[0] && b.external_id === p[1]);
      const pu = hit
        ? tables.platformUsers.find((u) => u.id === hit.user_id && u.merged_into_id === null)
        : undefined;
      return rows(pu ? [{ platform_user_id: pu.id, user_id: pu.id }] : []);
    }
    if (q.startsWith('insert into public.user_channel_bindings')) {
      const exists = tables.bindings.some(
        (b) => b.channel_code === p[1] && b.external_id === p[2],
      );
      if (exists) return rows([]);
      tables.bindings.push({ user_id: p[0]!, channel_code: p[1]!, external_id: p[2]! });
      return rows([{ user_id: p[0] }]);
    }

    // --- canonical platform_users ---------------------------------------------
    if (q.includes('from public.platform_users')) {
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
    if (q.startsWith('insert into public.platform_users')) {
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
    if (q.startsWith('update public.platform_users')) {
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
      // enrichPlatformUser
      const hit = tables.platformUsers.find((u) => u.id === p[0] && u.merged_into_id === null);
      if (!hit) return { rows: [] as T[], rowCount: 0 };
      if (hit.integrator_user_id === null) hit.integrator_user_id = at(6);
      if (hit.phone_normalized === null) hit.phone_normalized = at(4);
      return { rows: [] as T[], rowCount: 1 };
    }

    // --- notification topics / прочее -----------------------------------------
    if (q.startsWith('insert into public.user_notification_topics')) {
      tables.topics.push({ user_id: p[0]!, topic_code: p[1]!, is_enabled: p[2] === 'true' });
      return rows([]);
    }
    if (q.startsWith('insert into public.user_channel_preferences')) return rows([]);
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

  it('дано: интеграторская строка контакта занята другим человеком → СЕГОДНЯ она удаляется, и исход applied', async () => {
    // ФАКТ, а не одобрение. Шапка `setUserPhone` обещает «Safe against takeover: если телефон уже
    // привязан другому пользователю, обновление не применяется», но DELETE строкой выше сносит
    // чужую строку, и до охраняющего `ON CONFLICT … WHERE contacts.user_id = …` конфликт не
    // доезжает: исход `applied`, а `noop_conflict` остаётся страховкой для legacy-строк.
    // Защита «не попасть в чужой аккаунт» стоит выше по стеку — в каноне
    // (`applyMessengerPhonePublicBind`), а не здесь. Расхождение с картой — в отчёте.
    // арбитр: убрать DELETE — исход станет `noop_conflict`, чужая строка уцелеет
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

    await expect(setUserPhone(db, '555', PHONE)).resolves.toBe('applied');
    expect(contacts).toEqual([{ user_id: '1000', type: 'phone', value_normalized: PHONE }]);
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

  it('дано: канал привязан к чужому аккаунту, а своего у человека ещё нет → СЕГОДНЯ его настройки МОЛЧА уходят в чужой аккаунт', async () => {
    // ФАКТ, а не одобрение: отказа в коде нет, поэтому тест закрепляет фактический исход.
    // Карта требует здесь «отказ назван явно, не тихий noop» — расхождение вынесено в отчёт.
    // арбитр: убрать поиск кандидата по привязке канала в collectPlatformUserCandidates —
    // тогда человеку заведётся отдельный аккаунт (и это тоже поломка: раздвоение)
    const tables = emptyTables({
      platformUsers: [
        { id: 'pu-b', phone_normalized: null, integrator_user_id: '900', merged_into_id: null },
      ],
      bindings: [{ channel_code: 'telegram', external_id: '555', user_id: 'pu-b' }],
    });
    const db = makeDb(tables);

    const result = await writeIdentityAndPreferencesDirect(
      db,
      {
        channelCode: 'telegram',
        externalId: '555',
        topics: [{ topicCode: 'appointment_reminders', isEnabled: false }],
      },
      anchorFor('1000'),
    );

    expect(result.platformUserId).toBe('pu-b');
    expect(tables.topics).toEqual([
      { user_id: 'pu-b', topic_code: 'appointment_reminders', is_enabled: false },
    ]);
    // Интеграторский id чужого аккаунта при этом НЕ перезаписывается (COALESCE) —
    // то есть аккаунт остаётся аккаунтом B, а настройки в нём уже чужие.
    expect(tables.platformUsers[0]!.integrator_user_id).toBe('900');
  });
});
