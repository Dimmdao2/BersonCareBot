---
name: Wave2 Phase03 Advisory locks
overview: Унифицировать pg advisory lock/unlock вызовы в integrator и webapp через Drizzle execute(sql) в существующей сессии транзакции где нужно; задокументировать session vs xact семантику.
status: completed
isProject: false
todos:
  - id: p03-integrator-locks
    content: "apps/integrator: rubitimeApiThrottle.ts, schedulerLocks.ts — перевести на execute(sql) с тем же ключом/порядком lock/unlock; не менять ключи advisory."
    status: completed
  - id: p03-webapp-locks
    content: "apps/webapp: userLifecycleLock.ts, multipartSessionLock.ts, pgOnlineIntake.ts, pgDiaryPurge.ts, strictPlatformUserPurge.ts, s3MediaStorage.ts — только advisory lock/unlock wrapper на Drizzle execute(sql); остальной SQL s3MediaStorage остаётся этапу 5."
    status: completed
  - id: p03-doc
    content: "Короткий абзац в LOG или ARCHITECTURE: какие lock transaction-level vs session-level; чеклист ревью для новых locks."
    status: completed
  - id: p03-verify
    content: "typecheck/test по затронутым пакетам (integrator + webapp fast/inprocess по политике репозитория); rg на оставшийся client.query с pg_advisory в зоне этапа."
    status: completed
---

# Wave 2 — этап 3: advisory locks

## Размер

**M** (мало файлов, но высокий риск дедлоков при ошибке порядка).

## Definition of Done

- [x] Нет прямого `client.query('SELECT pg_advisory...')` в зоне этапа, кроме явно оставленного с комментарием ADR.
- [x] Поведение lock/unlock совпадает с прежним (ключи, момент release).
- [x] Документирована семантика xact vs session для затронутых мест.

## Scope

**Разрешено:** перечисленные файлы в todos; не трогать бизнес-правила напоминаний/медиа beyond lock wrapper.

**Вне scope:** смена модели блокировок на Redis и т.п.; переписывание медиа-запросов `s3MediaStorage.ts` кроме advisory lock/unlock.

## Развод с этапом 5

Этап 3 отвечает только за семантику блокировок: ключ, session/xact режим, момент release и использование той же DB-сессии. Любые `SELECT`/`INSERT`/`UPDATE` вокруг медиа, pending-delete, multipart и preview pipeline остаются в этапе 5.

## Декомпозиция исполнения

### 1. Baseline lock inventory

- [x] Для каждого файла выписать: lock key expression, `pg_advisory_lock` vs `pg_advisory_xact_lock` vs `pg_try_advisory_lock`, unlock timing, connection lifetime.
- [x] Проверить, есть ли current tests на “второй процесс не проходит”; если нет, добавить unit-level assert на SQL/key или narrow integration-style test.
- [x] В LOG заранее перечислить session-level и transaction-level locks.

### 2. Integrator locks

- [x] `rubitimeApiThrottle.ts`: сохранить глобальный throttle key и session-level lock/unlock порядок; не переносить unlock за границы текущего try/finally.
- [x] `schedulerLocks.ts`: сохранить `try`-semantics, чтобы второй scheduler не выполнял тот же слот.
- [x] Использовать `drizzle(client).execute(sql)` на dedicated `PoolClient` (эквивалент `getIntegratorDrizzleSession` в TX; см. `pgAdvisoryLock.ts`).
- [x] Тесты: lock key не изменился; try-lock false path сохраняется; unlock вызывается в finally.

### 3. Webapp locks

- [x] `userLifecycleLock.ts`: сохранить xact/shared semantics по user id.
- [x] `multipartSessionLock.ts`: сохранить lock per multipart session id.
- [x] `pgOnlineIntake.ts`, `strictPlatformUserPurge.ts`: только lock call sites; `pgDiaryPurge.ts` — `withUserLifecycleLock` exclusive (advisory по user id, см. LOG).
- [x] `s3MediaStorage.ts`: менять только advisory wrapper; все media mutations остаются этапу 5.
- [x] Тесты: SQL содержит тот же advisory function; lock исполняется внутри tx там, где это было xact-lock.

### 4. Documentation and verification

- [x] Добавить в LOG таблицу: файл, lock type, key, release moment, reason.
- [x] `rg "pg_advisory" apps/integrator/src apps/webapp/src --glob "*.ts"` — остатки объяснены.
- [x] `pnpm --dir apps/integrator run typecheck && pnpm --dir apps/integrator run test`
- [x] Webapp: целевые tests/typecheck по затронутым файлам; не запускать весь CI без отдельного push-запроса.

## Решения по сложным местам

- Session-level locks (`pg_advisory_lock` / `pg_advisory_unlock`) выполняются на той же connection через тот же session wrapper; не переключать pool между lock/unlock.
- Xact locks (`pg_advisory_xact_lock`) вызываются только внутри уже открытой transaction; не создавать отдельную transaction ради lock, если раньше lock жил в caller tx.
- `pg_try_advisory_lock` остаётся non-blocking; не заменять на blocking-lock.
- `s3MediaStorage.ts`: в этом этапе менять только advisory wrapper. Любые media status mutations остаются этапу 5.

## Stop conditions

- Если для переноса lock нужно изменить ключ, hash-функцию или порядок lock acquisition, остановиться и оформить отдельный lock-ADR.
- Если тест не может доказать сохранение session/xact semantics, оставить raw `client.query` с ADR-комментарием до отдельного hardening.

## Закрытие (2026-06-05)

- **Хелперы:** `apps/integrator/src/infra/db/pgAdvisoryLock.ts`, `apps/webapp/src/infra/db/pgAdvisoryLock.ts`; webapp — `drizzleSqlDebugText.ts` для assert SQL в тестах.
- **Исправление постаудита:** `s3MediaStorage.deleteHard` — session lock + DML на одном `PoolClient` (не `drizzle(pool)` + `pool.query`).
- **Тесты:** integrator — `pgAdvisoryLock.test.ts`, `schedulerLocks.test.ts`, `rubitimeApiThrottle.test.ts`; webapp — `pgAdvisoryLock.test.ts`, `userLifecycleLock.test.ts`, `multipartSessionLock.test.ts`, `pgDiaryPurge.test.ts`, `pgOnlineIntake.advisoryLock.test.ts`, `strictPlatformUserPurge.test.ts`.
- **Документация:** `LOG.md` (таблица session/xact + чеклист), `RAW_SQL_INVENTORY.md` (строки P3 — **Wave 2 P3 done**).
- **Проверки:** `pnpm --dir apps/integrator run typecheck`, `test` — **1028 passed**, 6 skipped; webapp `tsc --noEmit`; vitest fast по файлам этапа — **23 passed**.
- **Остаток сырого `pg_advisory`:** `modules/auth/*RateLimit.ts`, `publicBookingRateLimit.ts` — **этап 7** Wave 2 (вне P3).
