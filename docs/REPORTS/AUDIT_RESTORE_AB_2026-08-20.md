# Independent adversarial audit — восстановление машинерии A→B0 (два прохода)

**Дата:** 2026-08-20 · **Ветка:** `wt/restore-ab-20260820` · **Аудитор:** независимый гейт (Opus), НЕ автор работы.
**Под аудитом:** `d14daf8ad` (restore A→B0), `40dcd5897` (restore `deploy-test-saas.sh` −191), `2c9d7592e` (self-cert строка).
**Воркер:** claude-sonnet-5, два прохода, вердикт-строки писал себе сам (самосертификация — не считается).

## ВЕРДИКТ: **FAIL**

Причина одна и она решающая: **полный сброс TEST физически не доходит до конца — путь обрывается на нескольких
отсутствующих файлах.** Владельцев порядок (шаги 4–5: дамп → data-fix → бэкфилл ФИО → миграция) идёт именно этим
путём; путь не исполним → машинерия A→B0 не восстановлена как рабочая, только как частичный набор файлов. Бриф
question B заранее это и определил: «Если упадёт — это FAIL».

Оговорка честности: воркер НЕ прятал и НЕ вносил этот дефект — он его сам нашёл, назвал поимённо и вынес в
классификацию. Все восстановленные файлы корректны, замены реальны, запрещённое не вернулось. Но вердикт аудита —
про то, РАБОТАЕТ ЛИ путь, а не про честность отчёта. Путь не работает → FAIL. Ни один из A/C/D/E/F по отдельности
FAIL не даёт; FAIL целиком несёт только B.

---

## A. Не вернулось ли запрещённое — **PASS**

Команда:
```
git show --name-only --pretty=format: d14daf8ad 40dcd5897 \
  | grep -iE "drizzle-migrations|/migrations/|a0-greenfield|a1-rls|verify-a0|verify-a1|greenfield|migrations/core"
→ (пусто) NONE
```
Ни один из двух коммитов не касается путей исторической цепочки миграций, `meta/`-журнала, ядра интегратора,
семейства `a0-greenfield`/`a1-rls`/`verify-a0`/`verify-a1`/`greenfield`.

Возвращено поимённо (из `git show --stat`):
- `d14daf8ad`: `deploy/host/deploy-test-full-reset.sh`, `deploy/host/deploy-test-full-reset.test.mjs`,
  `deploy/host/restore-test-db-from-dump.sh`, `deploy/postgres/prod-to-target-cutover.sql`,
  `scripts/prod-to-target-baseline-policy.mjs`, `scripts/refresh-prod-to-target-cutover.mjs`,
  `docs/_TODO/SAAS_FOUNDATION/HARD_MIGRATION_PROTOCOL.md`, `package.json` (+2 pnpm-скрипта);
- `40dcd5897`: `deploy/host/deploy-test-saas.sh`.

Все — deploy/ops-скрипты и один `\ir`-секвенсер, НИ ОДНОГО файла миграции. Классификация воркера
(`B0_SALVAGE_DELETION_CLASSIFICATION_2026-08-20.md`) совпадает с реальным diff; воркер сам честно пометил, что
2 из 6 файлов первого прохода удалил не `609a19f94`, а следующий коммит `bfe6b48f0` — это точная атрибуция, не
подлог. Запрещённое не восстановлено.

## B. Проходит ли путь целиком — **FAIL** (несущая находка)

Основной поток full-reset (`deploy-test-saas.sh`) заканчивается на `run_port_context_test_release`
(`deploy-test-saas.sh:3578`). Проверены ВСЕ вызовы внешних файлов на исполняемом пути:

| файл (переменная) | строка вызова | существует? |
|---|---|---|
| `restore-test-db-from-dump.sh` (`$RESTORE`) | 3455 | ✅ есть |
| `consolidate-owner-identity.sql` (`$OWNER_IDENTITY_CONSOLIDATION`) | 3461 | ✅ есть |
| `p0-data-fix-doctor-admin-split.sql` (`$DATAFIX`) | 3465 | ✅ есть |
| `pre-cutover-data-stage-assertions.sql` (`$PRE_CUTOVER_DATA_ASSERTIONS`) | 3492 | ❌ **НЕТ** (удалён `bfe6b48f0`) |
| `prod-to-target-cutover.sql` (`$CUTOVER_MIGRATION`) | 3514 | ✅ есть, НО `\ir`-включает 7 отсутствующих файлов (ниже) |
| `test-settings-override.sql` (`$OVERRIDE`) | 3535 | ✅ есть |
| `converge-saas-smoke-login-passwords.mjs` (`$SAAS_SMOKE_PASSWORD_CONVERGER`) | 3571 | ✅ есть |
| `test-saas-isolation-telemetry-fixtures.sql` | 3255 | ✅ есть |
| **`cutover-postgres-port-context.sh`** | **3269** | ❌ **НЕТ** (удалён `9ebea6963`) |

`prod-to-target-cutover.sql` — чистый секвенсер, `\ir`-включает 7 файлов, ВСЕ отсутствуют:
```
MISSING prod-to-target-cutover-start.sql
MISSING generated/prod-to-target/schema-pre.sql
MISSING prod-to-target-cutover-data.sql
MISSING generated/prod-to-target/ledgers-and-baseline.sql
MISSING generated/prod-to-target/runtime-settings.sql
MISSING generated/prod-to-target/schema-post.sql
MISSING prod-to-target-cutover-finish.sql
```
Плюс сам preflight обёртки — `pnpm run check:prod-to-target-cutover`
(`deploy-test-full-reset.sh:37` → `refresh-prod-to-target-cutover.mjs --check`) — сверяет живой `bcb_webapp_dev`
против `generated/prod-to-target/*.sql`, которых нет, → падает ещё ДО начала разрушительного сброса.

Итог B: полный сброс TEST не доходит до конца. Он падает как минимум в четырёх точках (preflight-check,
`pre-cutover-data-stage-assertions.sql`, `\ir`-секвенсер cutover, `cutover-postgres-port-context.sh`). Шаги 4–5
владельца через этот путь пройти не могут. **FAIL.** (Ни один из недостающих файлов не в именованном скоупе миссии
воркера — их удалили `bfe6b48f0`/`9ebea6963`, а не адресуемый салваж `609a19f94`; воркер это задокументировал. Но
доставленное состояние путь не исполняет — это и есть предмет гейта.)

## C. 191 выброшенная строка — три замены реальны — **PASS**

1. `grant_migrator_app_owner_membership`/`revoke_*` → живой эфемерный аналог в
   `deploy/postgres/privileges/migrate-local.mjs:301` (`GRANT owner TO migrator WITH ADMIN FALSE, INHERIT FALSE,
   SET TRUE`) и `:347` (`REVOKE owner FROM migrator`) с проверкой членства. Дропнутый код к тому же был мёртв
   (ноль вызовов), проверено. ✅
2. Инлайн pgcrypto-move + `is_staff`/`current_*()` нормализация → `deploy/postgres/p2-b-protected-principal-context.sql`
   делает то же: pgcrypto→`app_ext` (строки 94–143) и `DROP`+`SET ROLE`+`CREATE` (со строки 65), которому
   предсуществующее владение не нужно; зовётся сразу следом. ✅
3. `grant_api_runtime_migration_ledger_read`/`assert_*` (сырой `GRANT USAGE ON SCHEMA integrator` +
   `GRANT SELECT ON integrator.schema_migrations`) → декларативный шов
   `app.read_integrator_migration_ledger()` в `deploy/postgres/privileges/declaration.ts:4256`:
   `security: 'DEFINER'`, `execute: ['app_service']`, `relationSurfaces` = `integrator.schema_migrations`
   (`version`, `applied_at`, только SELECT). Регистрируется как runtime-source `integrator_migration_ledger_read`
   (`declaration.ts:2309`). Шов есть, EXECUTE рантайм-роли `app_service` выдаётся, сырого relation-ACL больше нет. ✅

Особое внимание бриф-C (шов в `declaration.ts` и что права через него выдаются) — доказано выше.

## D. Обезличивания нет — **PASS**

```
grep -rniE "anonymiz|anonymis|обезлич|маскир|\bmask\b|pseudonym|scrub|redact|fake|faker" \
  restore-test-db-from-dump.sh deploy-test-saas.sh prod-to-target-cutover.sql \
  refresh-prod-to-target-cutover.mjs prod-to-target-baseline-policy.mjs
→ (пусто)
```
Путь дампа: restore → owner-identity consolidation → p0-data-fix → owner-reviewed FIO apply → legacy appointments
→ cutover. Нигде не вызывается анонимизация/маскировка ПДн. Соответствует указанию владельца «БЕЗ ОБЕЗЛИЧИВАНИЯ».

## E. ПРОД — **PASS** (к проду сам не ходил)

Единственный контакт с продом — `deploy-test-saas.sh:3444`:
```
ssh -o BatchMode=yes -o ConnectTimeout=10 "$PROD_SSH" "sudo -u postgres pg_dump -Fc --no-owner --no-acl $PROD_DB" > "$DUMP"
```
Только чтение (`pg_dump`, поток в stdout, на проде файла не остаётся — коммент 3429). `PROD_SSH=bcb-clone`;
из `~/.ssh/config` (только чтение конфига, без коннекта) `bcb-clone → HostName 135.106.162.170` — совпадает с
названным в брифе продом. `refresh-prod-to-target-cutover.mjs` вопреки имени читает ЛОКАЛЬНЫЙ `bcb_webapp_dev`
(строка 21, сокет `/var/run/postgresql`, «never restores» — строка 5), не прод. Ни один восстановленный скрипт
не содержит записи в прод (нет `INSERT/UPDATE/psql -d prod`/scp/rsync в сторону прода).

## F. Права и миграции — **PASS**

- Ни одной миграции среди восстановленных файлов нет → правило «миграция не выдаёт права» неприменимо к скоупу,
  нарушить его нечем. `prod-to-target-cutover.sql` — `\ir`-секвенсер без GRANT.
- В восстановленном `deploy-test-saas.sh`: реального `CREATE ROLE` нет (единственное совпадение — коммент строки
  538). Все `ALTER ROLE … BYPASSRLS`/`GRANT $DBROLE TO …` — на роль-владельца/мигратора `$DBROLE=bersoncarebot_test`
  (не рантайм-роль `app_service`/`app_staff`/…), эфемерные, самоочищающиеся: `cleanup_elevation` (205) →
  `assert_cleanup_elevation` (185) снимает `NOBYPASSRLS` (151), `REVOKE` членства (178) и ассертит
  `rolbypassrls=false` (193). Тот же паттерн, что `migrate-local.mjs`, а не постоянная выдача прав рантайм-роли и
  не BYPASSRLS ради заглушки отказа. Массовые `GRANT`-строки в `run_strict_post_migration_closure()` — мёртвый код
  (достижим лишь через осиротевший `--post-migration-closure`, ни один живой вход не передаёт).

## Тест-половина (deploy-test-full-reset.test.mjs)

`node --test deploy/host/deploy-test-full-reset.test.mjs` → 4/4 pass. Тест покрывает ПОВЕДЕНИЕ обёртки и именно
то, что восстановление добавило: порядок preflight-перед-exec, проброс аргументов, owner-gate `--confirm-full-reset`,
и новый именной guard на отсутствующий движок (`exit 3`). Движок (`deploy-test-saas.sh`) в фикстуре заглушён — это
корректно для unit-теста обёртки, не «огрызок»: реальный 3579-строчный движок требует postgres/sudo/прод.

Внутренний порядок шагов раскатки внутри движка (дамп→consolidation→p0-data-fix→FIO→legacy→cutover — тот самый
владельцев порядок) тестом не защищён. Новый тест НЕ пишу: поведенчески его не проверить без живого окружения
(которое к тому же сейчас сломано, см. B), а grep-тест на порядок вызовов в исходнике нарушил бы AGENTS.md §10a
(«тест проверяет поведение, а не текст исходника»). Порядок держат инлайн-комментарии (3458/3467/3478) + живой
прогон; корректная защита появится, когда путь снова станет исполнимым, — и тогда через живой прогон, не через
статический тест. Это наблюдение, не отдельный FAIL.

## Что проверял, командами (воспроизводимость)

- `git log --oneline`, `git show --stat/-–name-only` по трём SHA;
- существование каждого файла исполняемого пути (`ls`/`[ -e ]`);
- `grep -n` определений путь-переменных и всех `ssh/pg_dump/PROD_*`;
- `declaration.ts:2309,4256` (шов+EXECUTE), `migrate-local.mjs:301,347` (эфемерное членство),
  `p2-b-protected-principal-context.sql:65,94–146` (pgcrypto/DROP-SET ROLE-CREATE);
- `~/.ssh/config` (только чтение) для `bcb-clone`;
- `bash -n` на трёх восстановленных .sh — чисто; `node --test` на восстановленном тесте — 4/4.
- `pnpm run ci` НЕ запускался (запрещён на время сведения веток, решение владельца 20.08).

## НЕ СДЕЛАНО / вне гейта

- Не проверял построчно 13 «прочих» удалений `bfe6b48f0` (D30/disposable-proof/`runs/**`) — вне именованной
  authority миссии; воркер тоже их не верифицировал построчно и честно это пометил.
- К проду не подключался (запрет брифа) — вывод E построен на чтении скриптов и `~/.ssh/config`.
- Полный сброс TEST живьём не гонял (запрет: против TEST/прода ничего не запускать) — вывод B статический, но
  однозначный: отсутствующие файлы делают падение детерминированным.
