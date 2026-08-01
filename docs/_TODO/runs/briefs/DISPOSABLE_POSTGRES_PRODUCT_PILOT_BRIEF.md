# Б1/Б3 — первый product-test на disposable PostgreSQL (#1081)

Прочитать `AGENTS.md` §1b.3/§5/§10/§24, authority
`docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md` Б1/Б3 и существующие harness/audit artifacts
`docs/_TODO/runs/testsuite-v2/DISPOSABLE_POSTGRES_HARNESS_BLIND_AUDIT_REPORT.md`.
Product base — свежий descendant `wt/single-entry-integration`, где исправленный harness уже принят коммитом
`30411dbc4`; перед сдачей включить актуальный migration tail этой ветки.

Источник оракула: `AGENTS.md` §1b.3 — disposable PostgreSQL нужен, чтобы «доказать
transaction/concurrency/parallel-test isolation без влияния общего состояния»; продуктовый oracle существующего
`pgEmailOtpPublicAtomicConsume.devDb.integration.test.ts` — «из двух конкурентных consume ровно один успех».

## Последствие

Harness занимает 7 путей / 1239 строк (`wc -l`), но текущий
`find apps/webapp/src -name '*.postgres.integration.test.ts'` показывает только два self-test файла и ноль
product-test после исключения `pgDisposableHarness*`. Поэтому он пока не защищает пользователя: атомарность
одноразового email-кода остаётся opt-in тестом общей DEV-БД, а CI postgres project вообще не запускает.

## Scope

1. Сначала на свежей базе ветки запустить без правок:
   `pnpm run check:saas-a0-greenfield-baseline` и `pnpm run test:webapp:postgres`; записать точные manifest/pending
   counts, время и результат. Если current migration tail не replay-ится — чинить только доказанный harness defect,
   не миграции продукта и не ACL локальными GRANT/BYPASS.
2. Перенести ровно один существующий тест
   `pgEmailOtpPublicAtomicConsume.devDb.integration.test.ts` в разрешённую категорию
   `*.postgres.integration.test.ts`. Удалить DEV/scratch allowlist и env opt-in: per-file clone уже выдаётся setup.
   Fixture/query выполнять через существующий webapp Drizzle/DB-port path; новый raw `pg.Pool.query`/SQL-text
   bypass и allowlist гейта не добавлять. Для двух независимых транзакций переиспользовать существующий способ
   получить отдельные подключения; вторую DB-абстракцию не строить.
3. Сохранить поведенческий барьер без sleep: первая транзакция удерживает principal-row lock, вторая достигает
   ожидания, после release ровно один consume `ok`, повтор получает `expired_code`, challenge удалён. Fixture всегда
   очищается владельцем конкретного file-clone.
4. Один раз доказать oracle fault injection: ослабить atomic consume до достижимого read-then-delete/снять
   решающий lock в disposable clone, тест обязан red; production migration/function после прогона восстановить.
   Историческую migration в коммите не менять. Записать exact mutation и red output в report.
5. Подключить существующую `pnpm run test:webapp:postgres` отдельным CI job/step с PostgreSQL 16. Не включать её в
   fast Vitest shards и не строить второй runner/config. Исполнение, а не только `vitest list`, должно быть видно в
   `.github/workflows/ci.yml`.
6. Исправить только ложные активные записи Б1–Б3: Б2 больше не объявляет harness несобираемым; различить готовый
   project/visibility и новый CI execution; `wt/testsuite-b` v1 не переносить. Комментарии, обещающие A0-harness как
   В1/V9б RLS proof, привести к A1/TEST contract. Б3 остаётся открытым: пилот — 1 из 22, массового переноса нет.

## Стоп-условие

Если для product-test требуется новая ACL/bootstrap модель, локальный GRANT/BYPASS или ручная подгонка A0 под
runtime-role, не расширять harness: вернуть FAIL с доказательством, тогда harness-кандидат удаляется как непригодный.
DEV/TEST/PROD/deploy/taskdb не трогать.

## Приёмка worker

- latest-tail baseline и postgres project green; file census = 3 total / 1 product;
- product-test виден `vitest list`, запускается без DEV env/opt-in и краснеет на named atomicity fault;
- raw-SQL gate, runner visibility, scoped lint/typecheck, YAML parse/CI inspection, `git diff --check` green;
- report `docs/_TODO/runs/testsuite-v2/DISPOSABLE_POSTGRES_PRODUCT_PILOT_REPORT.md` с exact commands/counts;
- commit разрешённый scope без plan checkbox, push/DB/deploy запрещены.

После worker — один независимый behavior + infrastructure audit. Только после PASS лид решает land harness в
single-entry integration; остальные 21 legacy DB-test этим не считаются перенесёнными.
