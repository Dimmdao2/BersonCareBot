> **Retired-path notice.** Any command or path below that targets a pre-B0 retired database executor is preserved only as historical evidence; it is not runnable or current guidance. Other content in this document is unchanged. See [the current B0 retirement rule](/docs/archive/2026-08-no-disposable-db-retirement/RETIREMENT.md).

# Б1 — свежий перенос общего disposable PostgreSQL harness

## Роль и канон

Ты bounded worker. Прочитай `AGENTS.md` по маршруту: §1, §6, §7, §9, §10/§10a/§10b и §24. Authority —
`docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md`, блок Б, пункт Б1. Работа только в выданной ветке/клоне;
DEV/TEST/PROD, общую PostgreSQL бокса, deploy и push не трогать.

Источник оракула: `docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md`, Б1 — «Общий harness строит один template из
`a0-greenfield` + pending webapp Drizzle migrations и даёт отдельный clone тесту; A0/A1 остаются отдельными
repo-level gates»; «битая migration → red; `\l` до/после не содержит утечек; два параллельных clone-теста
зелёные; пилотный DB-тест зелёный и виден runner».

## Человеческий разрыв

DB-тесты В2–В8 сейчас либо не видны раннеру, либо могут писать в общую DEV-базу. Поэтому тест одного разработчика
может менять данные другого, а конкурентность/транзакции нельзя воспроизводимо проверить. Нужен один приватный
кластер на прогон, один template из канонического A0 + текущего хвоста webapp Drizzle и отдельный clone каждому
test-file. Это не RLS-proof: В1/В9б остаются на A1/реальных non-owner login roles.

## Вход, который можно использовать, но нельзя принять на веру

Старый изолированный клон `/home/dev/dev-projects/bcb-wt-testsuite-harness`, коммиты `9a0b514c3` и
`5aec73dd8`. Не cherry-pick целиком: первый коммит удаляет 12 существующих `*.devDb.integration.test.ts`, что
принадлежит Б3, а не Б1. Перенеси только необходимый harness-код/конфиг/pilot и заново разреши его против свежего
`feat`.

Кандидат уже использует `pnpm run migrate` → `apps/webapp/scripts/run-webapp-drizzle-migrate.mjs`; legacy
`run-migrations.mjs`/`loadCutoverEnv()` не чинить и не вызывать. Переиспользуй
`resolveTrustedPostgresBinaries`/A0 package; второго механизма поднятия PostgreSQL рядом не строй.

## Обязательный объём

1. На свежем `feat` перенести минимальные файлы Б1:
   - `apps/webapp/scripts/postgres-integration/{harness-lib.ts,cli.ts}`;
   - `apps/webapp/vitest.postgres.{config.ts,globalSetup.ts,setup.ts}`;
   - pilot `*.postgres.integration.test.ts`;
   - только необходимые script entries в `apps/webapp/package.json` и корневом `package.json`;
   - существующий `apps/webapp/src/app-layer/testing/pg-harness.ts` не дублировать: либо использовать как
     контракт/guard, либо минимально свести с реализацией.
2. Сохранить все текущие `*.devDb.integration.test.ts` как есть. Их судьба — отдельный Б3.
3. Template строится только из committed A0 schema/manifest/seed + текущих pending webapp Drizzle migrations.
   Integrator migration contour не втягивать.
4. Кластер: private temp dir mode 0700, Unix socket, TCP off, trusted absolute PostgreSQL binaries, очищенные
   `PG*`/`DATABASE_URL`. До передачи URL тесту реальным `select current_database()` доказать `^pbt_...$` и
   отказать на DEV/TEST/PROD-looking имени.
5. Каждый test-file получает отдельный clone. Два параллельных test-files/clones не сталкиваются.
6. Cleanup обязан пережить: ошибку setup/migration, падение теста и штатный teardown; удаляется только точный
   guarded private temp dir. Не делать destructive cleanup по glob/env/unresolved path.
7. Runner обязан видеть pilot через отдельный postgres project/job. Не включай тяжёлый DB-run в обычный unit
   project, если существующий канон его разделяет.

## Доказательства до коммита

- `pnpm run check:saas-a0-greenfield-baseline` — PASS на этом HEAD.
- build-template дважды; normalized schema diff пуст.
- временная заведомо битая pending migration красит build, после полного отката зелёный.
- `vitest list` показывает pilot.
- pilot зелёный.
- два независимых тест-файла/clone одновременно зелёные; временный второй probe убрать до коммита, если он не
  несёт отдельного постоянного поведения.
- до/после снять список БД именно внутри приватного кластера и список `pbt_*` scratch dirs; после success и
  injected failure утечек 0.
- self-test guard: заранее выставленный защищённый `DATABASE_URL` не используется; подмена clone URL на доступную
  non-`pbt_` служебную БД падает до первого запроса теста; мутацию полностью откатить.
- `pnpm --dir apps/webapp typecheck`, targeted eslint/prettier и `git diff --check`.

Числа в отчёте приводить только рядом с точной командой. Не заявлять RLS, DEV/TEST parity или перенос Б3.

## Сдача

Один содержательный коммит `#1081`, чистое дерево. Отчёт:
`docs/_TODO/runs/testsuite-v2/DISPOSABLE_POSTGRES_HARNESS_TRANSPLANT_REPORT.md` с разделами: итог, точный diff,
red/green evidence, parallel-clone evidence, cleanup evidence, runner visibility, время, `НЕ СДЕЛАНО`.
Галочку Б1 не ставить — её ставит оркестратор только после независимого blind audit.
