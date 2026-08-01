/**
 * D20 уровень 1, пункт 8 — `repos/mergeIntegratorUsers.ts` + `repos/canonicalUserId.ts`:
 * после слияния сообщения идут ЦЕЛЕВОМУ аккаунту.
 *
 * Цена ошибки: слияние выполняет интегратор по команде вебаппа. Если после него разрешение
 * канонического id продолжает указывать на исчезнувшую учётку, человек перестаёт получать
 * сообщения (они уходят в аккаунт-призрак) — и это не видно ничем.
 *
 * КАК ПРОВЕРЯЕТСЯ. Слияние и последующее разрешение id гоняются на ОДНОЙ модели таблицы `users`:
 * двойник `DbPort` применяет `UPDATE users SET merged_into_user_id` к строкам в памяти, а
 * `resolveCanonicalIntegratorUserId` затем читает те же строки. Так «сообщения идут целевому»
 * наблюдается сквозным путём, а не по возвращаемому значению одной функции.
 * ГРАНИЦА: строки-иждивенцы (identities/contacts/очередь проекции) модель не переносит — счётчики
 * переноса не проверяются, они целиком в SQL и требуют живой БД. См. отчёт.
 */
import { describe, expect, it } from 'vitest';
import type { DbPort, DbQueryResult } from '../../../kernel/contracts/index.js';
import { resolveCanonicalIntegratorUserId } from './canonicalUserId.js';
import { MergeIntegratorUsersError, mergeIntegratorUsers } from './mergeIntegratorUsers.js';

type UserRow = { id: string; merged_into_user_id: string | null };

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** Модель таблицы `users`: только то, что решает, чей аккаунт остался живым. */
function makeUsersDb(seed: UserRow[]): DbPort & { users: UserRow[]; reads: number } {
  const state = { users: seed.map((u) => ({ ...u })), reads: 0 };

  const port = {
    get users() {
      return state.users;
    },
    get reads() {
      return state.reads;
    },
    async query<T>(text: string, params: unknown[] = []): Promise<DbQueryResult<T>> {
      const q = norm(text);
      const p: (string | null)[] = params.map((v) =>
        v === null || v === undefined ? null : String(v),
      );

      if (q.startsWith('update users set merged_into_user_id')) {
        const row = state.users.find((u) => u.id === p[1]);
        if (!row) return { rows: [] as T[], rowCount: 0 };
        row.merged_into_user_id = p[0] ?? null;
        return { rows: [] as T[], rowCount: 1 };
      }
      if (q.includes('from users') && q.includes('where id = $1::bigint')) {
        state.reads += 1;
        const row = state.users.find((u) => u.id === p[0]);
        return {
          rows: (row ? [{ merged_into_user_id: row.merged_into_user_id }] : []) as T[],
          rowCount: row ? 1 : 0,
        };
      }
      if (q.includes('from users') && q.includes('id in (')) {
        const wanted = new Set(p);
        const rows = state.users
          .filter((u) => wanted.has(u.id))
          .map((u) => ({ id: u.id, merged_into_user_id: u.merged_into_user_id }));
        return { rows: rows as T[], rowCount: rows.length };
      }
      if (q.includes('from projection_outbox')) return { rows: [] as T[], rowCount: 0 };
      // Перенос строк-иждивенцев: модель их не держит, но и не скрывает — запрос считается
      // выполненным, затронуто 0 строк.
      if (
        q.startsWith('update ') ||
        q.startsWith('delete ') ||
        q.startsWith('select 1 ') ||
        q.includes('from identities li')
      ) {
        return { rows: [] as T[], rowCount: 0 };
      }
      throw new Error(`модель таблицы users не знает запроса: ${q}`);
    },
    async tx<T>(fn: (db: DbPort) => Promise<T>): Promise<T> {
      const snapshot = state.users.map((u) => ({ ...u }));
      try {
        return await fn(port as DbPort);
      } catch (err) {
        state.users = snapshot;
        throw err;
      }
    },
  };

  return port as DbPort & { users: UserRow[]; reads: number };
}

describe('после слияния сообщения идут целевому аккаунту', () => {
  it('дано: вебапп велел слить 1000 → 2000 → когда потом разрешаем СТАРЫЙ id → тогда получаем ЖИВОЙ аккаунт 2000', async () => {
    // арбитр: в mergeIntegratorUsers убрать финальный
    // `UPDATE users SET merged_into_user_id = winner WHERE id = loser` —
    // старый id останется «живым», и сообщения продолжат уходить в исчезнувшую учётку
    const db = makeUsersDb([
      { id: '1000', merged_into_user_id: null },
      { id: '2000', merged_into_user_id: null },
    ]);

    await mergeIntegratorUsers(db, '2000', '1000');

    await expect(resolveCanonicalIntegratorUserId(db, '1000')).resolves.toBe('2000');
    await expect(resolveCanonicalIntegratorUserId(db, '2000')).resolves.toBe('2000');
  });

  it('дано: старый id разрешают повторно → тогда путь тот же, второго канонического не появляется', async () => {
    // арбитр: в resolveCanonicalIntegratorUserId вернуть `integratorUserId` вместо `current`
    // при первом же чтении — половина вызовов начнёт указывать на исчезнувший аккаунт
    const db = makeUsersDb([
      { id: '1000', merged_into_user_id: null },
      { id: '2000', merged_into_user_id: null },
    ]);
    await mergeIntegratorUsers(db, '2000', '1000');

    const resolved = await Promise.all([
      resolveCanonicalIntegratorUserId(db, '1000'),
      resolveCanonicalIntegratorUserId(db, '1000'),
      resolveCanonicalIntegratorUserId(db, ' 1000 '),
    ]);

    expect(new Set(resolved)).toEqual(new Set(['2000']));
  });

  it('дано: слияние повторили той же командой → тогда идемпотентно: тот же победитель, ничего не переносится второй раз', async () => {
    // арбитр: убрать ветку `if (loserPointsTo === winner) return { alreadyMerged: true, … }` —
    // повторная команда вебаппа пойдёт переносить строки заново
    const db = makeUsersDb([
      { id: '1000', merged_into_user_id: null },
      { id: '2000', merged_into_user_id: null },
    ]);
    await mergeIntegratorUsers(db, '2000', '1000');

    const again = await mergeIntegratorUsers(db, '2000', '1000');

    expect(again.alreadyMerged).toBe(true);
    expect(again.winnerId).toBe('2000');
    expect(again.identitiesReassigned).toBe(0);
    await expect(resolveCanonicalIntegratorUserId(db, '1000')).resolves.toBe('2000');
  });

  it('дано: цепочка слияний 1000 → 2000 → 3000 → тогда разрешение доводит до последнего живого', async () => {
    // арбитр: в resolveCanonicalIntegratorUserId заменить цикл на одно чтение —
    // после второго слияния сообщения пойдут в аккаунт, которого уже нет
    const db = makeUsersDb([
      { id: '1000', merged_into_user_id: null },
      { id: '2000', merged_into_user_id: null },
      { id: '3000', merged_into_user_id: null },
    ]);

    await mergeIntegratorUsers(db, '2000', '1000');
    await mergeIntegratorUsers(db, '3000', '2000');

    await expect(resolveCanonicalIntegratorUserId(db, '1000')).resolves.toBe('3000');
  });

  it('дано: победитель сам оказался слитым в другого → тогда слияние ОТКАЗАНО, а не выполнено в исчезнувший аккаунт', async () => {
    // арбитр: убрать проверку `if (wRow.merged_into_user_id != null) throw ALREADY_MERGED_ALIAS` —
    // все сообщения проигравшего уедут в аккаунт-призрак
    const db = makeUsersDb([
      { id: '1000', merged_into_user_id: null },
      { id: '2000', merged_into_user_id: '3000' },
      { id: '3000', merged_into_user_id: null },
    ]);

    const err = await mergeIntegratorUsers(db, '2000', '1000').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(MergeIntegratorUsersError);
    expect((err as MergeIntegratorUsersError).code).toBe('ALREADY_MERGED_ALIAS');
    expect(db.users.find((u) => u.id === '1000')?.merged_into_user_id).toBeNull();
  });

  it('дано: проигравший уже слит в ДРУГОГО человека → тогда отказ, а не переклейка на нового победителя', async () => {
    // арбитр: заменить `throw ALREADY_MERGED_ALIAS` на продолжение слияния —
    // человек, уже слитый в аккаунт A, будет молча переписан в аккаунт B
    const db = makeUsersDb([
      { id: '1000', merged_into_user_id: '3000' },
      { id: '2000', merged_into_user_id: null },
      { id: '3000', merged_into_user_id: null },
    ]);

    const err = await mergeIntegratorUsers(db, '2000', '1000').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(MergeIntegratorUsersError);
    expect((err as MergeIntegratorUsersError).code).toBe('ALREADY_MERGED_ALIAS');
    await expect(resolveCanonicalIntegratorUserId(db, '1000')).resolves.toBe('3000');
  });

  it('дано: одного из двух аккаунтов не существует → тогда отказ с указанием, кого не нашли', async () => {
    // арбитр: убрать `if (usersRes.rows.length !== 2) throw USER_NOT_FOUND` —
    // слияние «выполнится» в несуществующий аккаунт
    const db = makeUsersDb([{ id: '2000', merged_into_user_id: null }]);

    const err = await mergeIntegratorUsers(db, '2000', '1000').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(MergeIntegratorUsersError);
    expect((err as MergeIntegratorUsersError).code).toBe('USER_NOT_FOUND');
    expect((err as MergeIntegratorUsersError).details?.missingIntegratorUserIds).toEqual(['1000']);
  });

  it('дано: команда слить аккаунт сам в себя или нечисловой id → тогда отказ до любых изменений', async () => {
    // арбитр: убрать `SAME_USER` / `assertNumericUserId` — слияние «в себя» проставит
    // merged_into_user_id на самого себя и сделает живой аккаунт недостижимым
    const db = makeUsersDb([{ id: '1000', merged_into_user_id: null }]);

    await expect(mergeIntegratorUsers(db, '1000', '1000')).rejects.toMatchObject({
      code: 'SAME_USER',
    });
    await expect(
      mergeIntegratorUsers(db, '1000', '00000000-0000-4000-8000-000000000001'),
    ).rejects.toMatchObject({ code: 'INVALID_USER_ID' });
    expect(db.users[0]!.merged_into_user_id).toBeNull();
  });

  it('дано: слияние запрошено в режиме проверки (dryRun) → тогда аккаунты остаются как были', async () => {
    // арбитр: убрать ранний возврат `if (options.dryRun)` — «примерка» станет настоящим слиянием
    const db = makeUsersDb([
      { id: '1000', merged_into_user_id: null },
      { id: '2000', merged_into_user_id: null },
    ]);

    const result = await mergeIntegratorUsers(db, '2000', '1000', { dryRun: true });

    expect(result.dryRun).toBe(true);
    expect(db.users.find((u) => u.id === '1000')?.merged_into_user_id).toBeNull();
    await expect(resolveCanonicalIntegratorUserId(db, '1000')).resolves.toBe('1000');
  });
});

describe('разрешение канонического id: чужие ключи и битые данные', () => {
  it('дано: id вебаппа (UUID), а не интеграторский → тогда он возвращается как есть, без похода в users', async () => {
    // арбитр: убрать проверку `BIGINT_STRING.test(trimmed)` — запрос `id = $1::bigint` с UUID
    // упадёт в рантайме на живой БД
    const db = makeUsersDb([]);

    await expect(
      resolveCanonicalIntegratorUserId(db, '00000000-0000-4000-8000-000000000001'),
    ).resolves.toBe('00000000-0000-4000-8000-000000000001');
    expect(db.reads).toBe(0);
  });

  it('дано: учётки с таким id вообще нет → тогда возвращается запрошенный id, а не пусто', async () => {
    // арбитр: вернуть `null`/'' при отсутствии строки — вызывающий начнёт писать в «никуда»
    const db = makeUsersDb([]);

    await expect(resolveCanonicalIntegratorUserId(db, '1000')).resolves.toBe('1000');
  });

  it('дано: в данных возник цикл слияний 1000 ↔ 2000 → тогда разрешение завершается, а не ходит по кругу', async () => {
    // арбитр: убрать `visited`-проверку — обход упрётся в потолок глубины и сделает 32 запроса
    // к БД на каждое входящее сообщение
    const db = makeUsersDb([
      { id: '1000', merged_into_user_id: '2000' },
      { id: '2000', merged_into_user_id: '1000' },
    ]);

    await expect(resolveCanonicalIntegratorUserId(db, '1000')).resolves.toBe('1000');
    expect(db.reads).toBeLessThanOrEqual(4);
  });
});
