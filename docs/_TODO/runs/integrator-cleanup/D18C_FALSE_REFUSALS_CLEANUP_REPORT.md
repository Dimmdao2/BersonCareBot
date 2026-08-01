# D18c — дочистка двух ложных отказов от конверсии

Продолжение `D18C_AUDIT_REPORT.md` (раздел 6): аудит установил, что отказы `broadcastChannelCounts.ts`
и `pgAdminPlatformUserStats.ts` («Drizzle не умеет `ANY($1::uuid[])`») опровергаются действующим кодом —
`pgDoctorClients.ts:322-325` делает ровно такой запрос через `runWebappPgText` в проде. Обе причины
устарели/неверны; файлы переведены на мост.

## Что сделано

- `apps/webapp/src/infra/repos/broadcastChannelCounts.ts` — `getChannelCountsByUserIds` переведена
  с `getPool().query(text, [ids])` на `runWebappPgText<T>(text, [ids])`. Убран `getPool` импорт (более
  не нужен в файле), убран ложный комментарий про «Drizzle ANY array workaround», локальный `parsePool`
  заменён на уже существующий в файле `parse` (структурно совместим: `WebappQueryResult<{cnt:string}>`
  подходит под `{ rows: unknown[] }`).
- `apps/webapp/src/infra/repos/pgAdminPlatformUserStats.ts` — общий хелпер `queryRows` переведён с
  `pool.query<T>(sql, params)` на `runWebappPgText<T>(sql, params)`; параметр `pool` убран из сигнатуры
  (текст/параметры собираются заранее в `withPuExclusion`/`appendExclusionClause`, транспорту передаётся
  только готовый `$n`-текст + массив значений — ровно то, что принимает `runWebappPgText`). Убран `getPool`
  импорт и оба вызова `const pool = getPool()`. Убран ложный комментарий-обоснование над `queryRows`.
- `scripts/check-no-new-raw-sql.mjs` — оба файла вычеркнуты из `webapp`-манифеста долга.

Соседние файлы не трогались. `directPublic/*` не трогался.

## Дословность SQL — построчная сверка

### `broadcastChannelCounts.ts`, `getChannelCountsByUserIds` (5 запросов)

Все пять `SELECT`-текстов и массивы `[ids]` — байт-в-байт те же строки, что были в `pool.query(...)`
аргументах; поменялся только вызов-обёртка (`pool.query` → `runWebappPgText`). Diff (см. ниже) это
показывает буквально: каждая пара строк отличается только именем функции.

```
- pool.query<{ cnt: string }>(
+ runWebappPgText<{ cnt: string }>(
    `SELECT COUNT(DISTINCT user_id)::text AS cnt FROM user_channel_bindings WHERE channel_code = 'telegram' AND user_id = ANY($1::uuid[])`,
    [ids],
  ),
```
(и так же для `max`, `phone_normalized`-каста в `platform_users`, `user_web_push_subscriptions`,
`email_verified_at`-каста в `platform_users`.) Один параметр на запрос, `$1` → `ids`, каст `::uuid[]`
сохранён во всех пяти.

### `pgAdminPlatformUserStats.ts`, `queryRows` — общий транспорт для 6 вызовов

`queryRows(sql, params)` теперь напрямую передаёт `sql`/`params` в `runWebappPgText(sql, params)` без
какой-либо пересборки — тот же принцип, что и выше. Тексты запросов (`totRegQ`, `totMergeQ`, `byRegQ`,
`byMergeQ`, `beforeSql`, `byDaySql`) и их `params`-массивы не менялись этим коммитом вообще: правка не
касается `withPuExclusion`/`appendExclusionClause`/`appendSqlExcludeUserIds`, которые строят `$n`-текст
и `params` заранее. Единственное изменение — сигнатура `queryRows` лишилась параметра `pool` (он больше
не нужен транспорту), вызовы `queryRows<T>(pool, sql, params)` → `queryRows<T>(sql, params)`, `const pool
= getPool()` убран из обоих методов порта.

Полный diff обоих файлов приведён командой `git diff` в рамках этой задачи — 0 изменений текста SQL,
0 изменений порядка/состава `params`, касты (`::timestamptz`, `::uuid[]`, `::text`) сохранены везде.

## Проверка гейта

```
$ node scripts/check-no-new-raw-sql.mjs
check-no-new-raw-sql: OK (integrator manifest files: 13; webapp manifest files: 30)
```

Манифест вебаппа: 32 → 30, как требует пункт плана.

## Поломка → тест → красное/НЕ ПОЙМАНО → откат

Оба файла не имеют ни одного юнит- или интеграционного теста, ссылающегося на них напрямую (проверено
`grep` по `apps/webapp/src` — 0 совпадений на `broadcastChannelCounts`/`getChannelCountsByUserIds` и на
`pgAdminPlatformUserStats`/`createPgAdminPlatformUserStatsPort`/`getRegistrationStats`/
`getSubscriberBindingStats` в `*.test.ts`). Единственный способ узнать реальный охват — сломать код и
прогнать `vitest related` (собирает по графу импортов все тестовые файлы, транзитивно зависящие от
изменённого модуля).

| # | Файл / мутация | Команда | Результат | Откат |
|---|---|---|---|---|
| 1 | `broadcastChannelCounts.ts`: снят каст `::uuid[]` у `$1` в telegram-запросе (`ANY($1)` вместо `ANY($1::uuid[])`) | `npx vitest related src/infra/repos/broadcastChannelCounts.ts --run` | **НЕ ПОЙМАНО** — 44/44 файлов, 214/214 тестов прошли (тот же результат, что и до мутации) | ✅ откачено, `git diff` по файлу — 0 строк |
| 2 | `pgAdminPlatformUserStats.ts`: в `byRegQ` (`getRegistrationStats`) переставлены местами `iana`↔`startUtcIso` — `[startUtcIso, iana, endExclusiveUtcIso]` вместо `[iana, startUtcIso, endExclusiveUtcIso]` (тот же класс ошибки, что нашёл сам аудит в `writePort.ts`) | `npx vitest related src/infra/repos/pgAdminPlatformUserStats.ts --run` | **НЕ ПОЙМАНО** — 44/44 файлов, 214/214 тестов прошли | ✅ откачено, `git diff` по файлу — 0 строк |

**Итог:** файлы без покрытия. 44 «related»-файла в обоих прогонах — это тесты, зацепленные через граф DI
(`buildAppDeps.ts` и т.п.), а не функциональные тесты этих двух запросов; ни один не проверяет ни форму
возвращаемых счётчиков `getChannelCountsByUserIds`, ни агрегаты `getRegistrationStats`/
`getSubscriberBindingStats`. Счётчики рассылки и админская статистика — как и указано во владельческой
пометке к этому пункту — не тот случай, где нужен новый тест; факт «покрытия нет» зафиксирован здесь.

## Typecheck / eslint

```
$ pnpm --filter @bersoncare/webapp run typecheck
> tsc --noEmit
(без ошибок)

$ npx eslint src/infra/repos/broadcastChannelCounts.ts src/infra/repos/pgAdminPlatformUserStats.ts
(без предупреждений/ошибок)

$ npx eslint scripts/check-no-new-raw-sql.mjs
(без предупреждений/ошибок)
```

## Итог

Оба файла переведены на мост (`runWebappPgText`), семантика запросов (текст, касты, порядок параметров)
не изменена — подтверждено построчной сверкой и поломкой (оба сценария поломки НЕ ПОЙМАНЫ, файлы
подтверждённо без тестового покрытия). Манифест `check-no-new-raw-sql.mjs` ужат 32 → 30. Полный набор
тестов не гонялся — только `vitest related` по двум изменённым файлам (44/44 зелёных) и typecheck/eslint
в клоне.
