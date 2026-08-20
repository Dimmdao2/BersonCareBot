# Независимый аудит вывода исторических webapp-миграций — 20.08.2026

## Вердикт: FAIL

Проверен commit `8723645ad06d803be6f56d8b66f4eef23e143470` против его parent. Само удаление 50 ledger rows согласовано с 50 удалёнными файлами, все 8 оставшихся строк DEV побайтно совпадают с 8 файлами и generated artifact, а artifact потерял только эти 50 webapp INSERT. Однако изменение оставило два достижимых разрыва:

1. активный CI-gate `function-census.test.mjs` всё ещё читает два удалённых файла и после retirement падает в трёх тестах;
2. legacy-name exception не выведен как механизм: действующий lint/migrator по-прежнему принимает `NNNN_*`, если вернуть удалённый `_journal.frozen.json`, а канон прямо велит хранить 50 файлов и frozen-пин «навсегда».

Это аудит разового состояния по AGENTS.md §24.4. Постоянный тест на отсутствие файлов/строк не создавался. Базы не изменялись и не создавались; `bersoncarebot_test` и PROD не открывались.

## Findings

### F1 — active function-census CI gate требует удалённые migration sources

**Где:**

- `deploy/postgres/privileges/function-census.test.mjs:32-43` — `CURRENT_PATIENT_MIGRATIONS` жёстко открывает удалённые `0016_patient_self_action_capabilities.sql` и `0017_patient_shared_core_capabilities.sql`; `B0_FORWARD_MIGRATIONS` теперь видит только 8 timestamp-файлов;
- `deploy/postgres/privileges/function-census.test.mjs:109-140` — три production-facing census используют этот исчезнувший source surface;
- `package.json:33,55` — файл входит в `test:db-privileges`, а тот входит в полный CI.

**Что ломается:** `pnpm test:db-privileges` и полный CI на этом SHA красные. Это не безвредная ссылка в комментарии: direct test получает `ENOENT`, а два соседних census теряют определения функций, которые раньше восстанавливались из удалённой цепочки.

Команда:

```bash
node --test deploy/postgres/privileges/function-census.test.mjs
function_census_exit=$?
printf 'FUNCTION_CENSUS_EXIT_CODE=%s\n' "$function_census_exit"
```

Существенный вывод:

```text
not ok 1 - the current-patient B0-forward roots are exactly the recorded set with exact executable relation-operation surfaces
error: ENOENT: no such file or directory, open '.../0016_patient_self_action_capabilities.sql'
not ok 2 - all latest active B0-forward definers have exact executable relation-operation surfaces
latest active B0-forward definer bodies in numbered migrations: recorded name census "b0ForwardArtifactRoots" diverged
not ok 3 - every declared function has the exact source-reconstructed base type and set-returning flag, and no body is undeclared
# tests 19
# pass 16
# fail 3
FUNCTION_CENSUS_EXIT_CODE=1
```

### F2 — exception list удалён как файл, но остаётся активным принимаемым путём и каноном

**Где:**

- `deploy/postgres/privileges/migration-order.mjs:83-96,193-202` — `findMigrationNameViolations` по-прежнему освобождает от timestamp-правила любой tag из `_journal.frozen.json`, а reader автоматически оживает при возврате файла;
- `apps/webapp/scripts/check-drizzle-migration-order.sh:8-15,33-56,86-89` — действующий lint-gate называет frozen snapshot «kept forever» и сам предлагает grandfather старого имени в удалённом файле;
- `AGENTS.md:371-380,391-395,418-422` — активный канон требует сохранять удалённые 50 файлов «навсегда» и двигать удалённый frozen-пин;
- `docs/ARCHITECTURE/DB_DUMPS/README.md:3-7` — текущий architecture entry всё ещё называет удалённый `0000_b0_baseline.sql` единственным активным начальным контрактом.

**Что ломается:** owner-decision «старые миграции и exception list — в корзину» не закрыт. Обычный будущий diff может вернуть `_journal.frozen.json`, добавить туда новое `NNNN_*` и пройти используемую обоими runners проверку имён. Одновременно следующие агенты получают противоположное указание из единственного канона.

Минимальная проверка ровно используемой функции:

```bash
node --input-type=module -e "import { findMigrationNameViolations } from './deploy/postgres/privileges/migration-order.mjs'; const candidate=[{tag:'0099_reintroduced_exception'}]; const frozen=[{tag:'0099_reintroduced_exception'}]; console.log(JSON.stringify(findMigrationNameViolations(candidate, frozen)));"
```

Вывод:

```text
[]
```

Пустой список означает, что новое староформатное имя принято. Это не спор о стиле текста: активная gate-функция сохраняет удалённое исключение как достижимое поведение.

## Проверки без дополнительных findings

### 1. Поиск ссылок на удалённые файлы и meta material

Сначала выполнен lexical `code-search`, затем точный поиск по дереву самого `8723645ad`, чтобы поздний merge документации в текущем HEAD не влиял на результат:

```bash
node /home/dev/brain/tools/code-search.mjs "_journal.frozen.json _legacy_names.txt" --repo bcb -k 30
node /home/dev/brain/tools/code-search.mjs "readLegacyJournalEntries renderLedgerBootstrapSql" --repo bcb -k 30
git grep -n -F -f <(
  git diff --diff-filter=D --name-only 8723645ad^ 8723645ad \
    -- 'apps/webapp/db/drizzle-migrations/*.sql' |
  xargs -n1 basename | sed 's/\.sql$//'
) 8723645ad -- apps deploy scripts package.json
git grep -n -E '_journal\.frozen(\.json)?|_legacy_names\.txt' \
  8723645ad -- apps deploy scripts package.json
```

Результат по исполняемым поверхностям:

```text
deploy/postgres/privileges/function-census.test.mjs:33 .../0016_patient_self_action_capabilities.sql
deploy/postgres/privileges/function-census.test.mjs:34 .../0017_patient_shared_core_capabilities.sql
apps/webapp/scripts/check-drizzle-migration-order.sh:44 ... meta/_journal.frozen.json
apps/webapp/scripts/run-webapp-drizzle-migrate.mjs:278 ... meta/_journal.frozen.json
deploy/postgres/privileges/migrate-local.mjs:239 ... meta/_journal.frozen.json
deploy/postgres/privileges/migration-order.mjs:200 ... meta/_journal.frozen.json
```

Две ссылки в unit-тестах booking, ссылка из surviving migration на `0022` и два fixture-tag в `migrate-local-parse.test.mjs` являются комментариями/данными теста и файл не открывают. `core:20260816_0000_b0_baseline.sql` в generated artifact — отдельный integrator tag, не удалённый webapp-файл. `_legacy_names.txt` в active source/deploy не найден. Реально ломающие ссылки — F1; активный meta-path — F2.

### 2. Ledger уменьшен ровно на эти 50 строк

Команда сравнения удалённых файлов и удалённых artifact rows:

```bash
printf 'DELETED_FILE_TAGS=%s\n' "$(
  git diff --diff-filter=D --name-only 8723645ad^ 8723645ad \
    -- 'apps/webapp/db/drizzle-migrations/*.sql' | wc -l
)"
printf 'REMOVED_ARTIFACT_ROWS=%s\n' "$(
  git diff --unified=0 8723645ad^ 8723645ad \
    -- deploy/postgres/generated/prod-to-target/ledgers-and-baseline.sql |
  awk '/^-INSERT INTO drizzle\.__drizzle_migrations / { count++ } END { print count+0 }'
)"
comm -3 \
  <(git diff --diff-filter=D --name-only 8723645ad^ 8723645ad \
      -- 'apps/webapp/db/drizzle-migrations/*.sql' |
    xargs -n1 basename | sed 's/\.sql$//' | sort) \
  <(git diff --unified=0 8723645ad^ 8723645ad \
      -- deploy/postgres/generated/prod-to-target/ledgers-and-baseline.sql |
    awk -F"'" '/^-INSERT INTO drizzle\.__drizzle_migrations / { print $4 }' | sort)
```

Вывод:

```text
DELETED_FILE_TAGS=50
REMOVED_ARTIFACT_ROWS=50
# comm: пусто
```

Точный исчезнувший set:

```text
0000_b0_baseline
0001_patient_booking_runtime_capability
0002_patient_booking_slot_snapshot_settings
0003_patient_booking_lifecycle_capabilities
0004_patient_booking_delegated_snapshot_context
0005_patient_booking_payment_config_capability
0006_patient_booking_prepayment_policy_capability
0007_patient_booking_lifecycle_notification_setting
0008_patient_booking_reminder_preference_capability
0009_current_patient_lfk_session_capability
0010_current_patient_staff_notification_profiles
0011_current_patient_staff_notification_profiles_binding_order
0012_integrator_web_push_delivery_capabilities
0013_integrator_support_delivery_attempt_capability
0014_patient_practice_and_material_rating_capabilities
0015_patient_self_identity_capability
0016_patient_self_action_capabilities
0017_patient_shared_core_capabilities
0018_clinic_owner_tariff_branch_quotas
0019_patient_reminder_materialization_runtime_capabilities
0020_patient_reminder_materialization_narrow_column_reads
0021_patient_program_item_narrow_column_reads
0022_quota_mechanics_have_no_off_state
0023_purchased_tariff_invoice_refresh
0024_first_tariff_choice_awaits_payment
0025_definer_bodies_that_lived_only_in_dev
0026_handwritten_login_gates_that_lived_only_in_dev
0027_warmup_feeling_uses_the_whole_five_point_scale
0028_port_context_rows_die_with_their_transaction
0029_retention_of_the_failure_archive_is_not_tenant_work
0030_a_delivery_audience_is_resolved_in_one_place
0031_one_retention_root_with_a_closed_list_of_targets
0032_a_shown_photo_is_our_own_re_encode
0033_one_declared_root_puts_a_message_in_the_queue
0034_a_new_clinic_needs_a_reference_catalog_to_copy
0035_one_declared_root_replaces_a_reminder_generation
0036_the_content_argument_cannot_survive_the_wire_as_jsonb
0037_the_patient_reads_own_contacts_and_writes_own_booking_contact
0038_a_star_takes_columns_the_seam_never_asked_for
0039_the_operator_watchman_may_not_read_its_own_queue
0040_two_machine_ticks_had_no_door_of_their_own
0041_the_watchman_could_read_incidents_but_not_open_one
0042_the_bridge_to_a_retired_system_is_not_a_bridge
0043_a_clinic_name_must_not_shadow_a_product_route
0044_a_link_to_a_video_host_is_a_kind_of_media
0045_the_platform_dashboard_read_nineteen_tables_through_no_door
0046_a_dead_row_from_june_is_not_todays_outage
0047_the_opening_door_did_not_learn_the_new_alarm_words
0047_the_public_funnel_had_no_door_of_its_own
0049_a_clinic_had_a_booking_form_but_no_face
```

Read-only DEV query:

```bash
sudo -n -u postgres psql -X -A -t -q -h /var/run/postgresql -p 5432 \
  -d bcb_webapp_dev \
  -c "SELECT id::text || '|' || tag || '|' || hash || '|' || created_at::text
      FROM drizzle.__drizzle_migrations ORDER BY tag;"
```

Вывод:

```text
588|20260819T163536_a_failed_public_booking_must_not_leave_a_client|efdb857d09bcf0f22b53737b36fa639cbb09a49099e4f45f67568c6e47426914|1800000055000
587|20260819T170216_a_public_visitor_becomes_a_client_when_identified|ba4a69129732ff76f639cf0459697fcf9e13b59a3a77069c0fe7496880492b9f|1800000053000
585|20260819T180713_a_lifetime_allowance_counted_by_join_is_not_lifetime|228d8d4d652bca0248b084e6d69d5ee59dca3c8eb6108f9eca339f38de4c49dd|1800000060000
589|20260819T182039_a_visitor_booking_spends_no_tariff_seat|556c698a61df85ef709c67c4959fd5861143d1119c0237787bee0a61374dbfc8|1800000056000
619|20260819T204355_a_seat_invoice_is_not_cancelled_it_is_reissued|7f78a9b99869994799081d8cd17282adc0e7850d818509201353a57b85bf1091|1800000071000
620|20260819T205420_the_transcode_queue_dispatcher_had_no_door|66db5bf7824af292e1a0ec2fc5bac40c76c602a03cf248098f19d1f5b93369dc|1800000072000
621|20260819T210005_a_clinic_is_billed_for_seats_not_for_people|d6b739a9e3c12bb5a796c9b1ac9298bb82f634ea3fed17866e02e566711292cd|1800000073000
624|20260820T010127_the_platform_admin_could_read_org_active_but_not_flip_it|83df3f21ecb97fa497a471dea38f88806c5138cb2cb6d9e33d6c5da2a5e6ea25|1800000074000
```

Полные `id|tag|hash|created_at` из target artifact сравнены с этим query через `comm -3`: вывод пуст. Отдельно `sha256sum` каждого из 8 файлов сравнён с DB `tag|hash`: вывод пуст. `SELECT count(*) ... WHERE tag IS NULL` вернул `0`. Следовательно, survivors не были изменены или заменены при сокращении ledger.

Поиск добавленного вручную ledger DML в commit, за исключением generated artifact и отчёта исполнителя:

```bash
git diff --unified=0 8723645ad^ 8723645ad -- . \
  ':(exclude)deploy/postgres/generated/prod-to-target/ledgers-and-baseline.sql' \
  ':(exclude)docs/REPORTS/HISTORICAL_MIGRATIONS_RETIRED_2026-08-20.md' |
rg -n '^\+.*(INSERT|UPDATE|DELETE).*drizzle\.__drizzle_migrations|^\+.*drizzle\.__drizzle_migrations.*(INSERT|UPDATE|DELETE)'
```

Вывод пуст. В diff нет hand-written DML; единственная зафиксированная writer-команда в отчёте исполнителя — sanctioned `migrate-local.mjs --drop-foreign`. Post-state сохраняет все четыре поля каждой из восьми surviving rows в точности как parent artifact. Следов удаления иной ledger row не найдено.

### 3. Generated artifact потерял только 50 webapp ledger INSERT

Команды:

```bash
git diff --numstat 8723645ad^ 8723645ad \
  -- deploy/postgres/generated/prod-to-target/ledgers-and-baseline.sql
git show 8723645ad^:deploy/postgres/generated/prod-to-target/ledgers-and-baseline.sql |
  sed '/^INSERT INTO drizzle\.__drizzle_migrations /d' | sha256sum
git show 8723645ad:deploy/postgres/generated/prod-to-target/ledgers-and-baseline.sql |
  sed '/^INSERT INTO drizzle\.__drizzle_migrations /d' | sha256sum
```

Вывод:

```text
0  50  deploy/postgres/generated/prod-to-target/ledgers-and-baseline.sql
ab39bf6209b93226fb102e43f5f7e494f64e26944a23e45c0c3e57189d3495c1  -
ab39bf6209b93226fb102e43f5f7e494f64e26944a23e45c0c3e57189d3495c1  -
```

Parent содержал 58 webapp INSERT, target — 8. Нормализованный файл после удаления всех webapp ledger INSERT побайтно одинаков. Значит не изменились header/DDL, integrator ledger, integrator baseline, settings или порядок оставшихся строк; каждая из 50 изменённых строк — удалённый webapp ledger INSERT, additions/rewrites отсутствуют.

### 4. Empty journal, bootstrap и базы, которые больше нельзя мигрировать цепочкой

Команда:

```bash
node --input-type=module -e "
  import { readLegacyJournalEntries, renderLedgerBootstrapSql }
    from './deploy/postgres/privileges/migration-order.mjs';
  const entries=readLegacyJournalEntries('./apps/webapp/db/drizzle-migrations');
  console.log('JOURNAL_ENTRIES='+entries.length);
  console.log(renderLedgerBootstrapSql(entries));
"
```

Вывод:

```text
JOURNAL_ENTRIES=0
DO $bcb_ledger$
BEGIN
  IF to_regnamespace('drizzle') IS NULL THEN CREATE SCHEMA drizzle; END IF;
  IF to_regclass('drizzle.__drizzle_migrations') IS NULL THEN
    CREATE TABLE drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint);
  END IF;
  ... ADD COLUMN tag text ...
  ... CREATE UNIQUE INDEX drizzle_migrations_tag_key ...
END
$bcb_ledger$;
```

Пустой journal корректно создаёт ledger structure, но не вставляет ни одной строки. Это то же bootstrap-состояние, что missing journal: `readLegacyJournalEntries` возвращает `[]` в обоих случаях.

Дальше `selectPendingMigrations(readMigrationFolder(...), [])` возвращает все 8 tags:

```text
PENDING_WITH_EMPTY_LEDGER=8
20260819T163536_a_failed_public_booking_must_not_leave_a_client
20260819T170216_a_public_visitor_becomes_a_client_when_identified
20260819T180713_a_lifetime_allowance_counted_by_join_is_not_lifetime
20260819T182039_a_visitor_booking_spends_no_tariff_seat
20260819T204355_a_seat_invoice_is_not_cancelled_it_is_reissued
20260819T205420_the_transcode_queue_dispatcher_had_no_door
20260819T210005_a_clinic_is_billed_for_seats_not_for_people
20260820T010127_the_platform_admin_could_read_org_active_but_not_flip_it
```

Webapp migrate entrypoint затем применяет их (`run-webapp-drizzle-migrate.mjs:288-328`). Это не schema bootstrap: первый файл уже на `apps/webapp/db/drizzle-migrations/20260819T163536_a_failed_public_booking_must_not_leave_a_client.sql:57` выполняет `ALTER TABLE public.org_enrollments`. На действительно пустой БД relation отсутствует, поэтому entrypoint создаст ledger, затем упадёт на первом survivor.

Конкретно больше нельзя провести historical runner до schema B для:

- пустой/greenfield webapp database;
- любой pre-B0 database;
- любой частично мигрированной database, которой для достижения B нужен хотя бы один из tags `0000`–`0049`.

Это не отдельный finding: такие базы и historical/disposable replay прямо исключены AGENTS.md §1b.3a. Поддерживаемые пути не зависят от удалённой цепочки:

- существующая `bcb_webapp_dev` уже находится на B и имеет точный ledger из 8 строк;
- reset `bersoncarebot_test` вызывает `deploy/postgres/prod-to-target-cutover.sql`, а не webapp historical runner;
- переход живой schema A к B выполняется тем же generated cutover, где `schema-pre.sql`, data-stage, 8-row `ledgers-and-baseline.sql`, settings и `schema-post.sql` идут одной последовательностью (`deploy/postgres/prod-to-target-cutover.sql:3-10`);
- `deploy/host/deploy-test-saas.sh:2636-2651` прямо не вызывает historical runners и после cutover требует target ledger.

То есть ledger-bootstrap reader остался работоспособным как DDL ledger, но migration folder больше не является bootstrap схемы; schema B и её ledger должны прибыть вместе generated cutover.

### 5. Восемь survivors согласованы с schema B, а не с empty schema

Ни один survivor не содержит `\ir`/include на удалённый файл. Точные совпадения удалённых имён внутри восьми файлов — только narrative comments (`0022` в `20260819T210005...sql:52`). Реальные зависимости — существующие объекты schema B: например `public.org_enrollments`, `public.organization_slug_rename_events`, `public.saas_billing_invoices`, `public.saas_tariffs`, `public.saas_org_entitlement_overrides` и media-transcode relations.

Из всех восьми файлов тем же parser, который используют runners, получены 22 ожидаемых end-state объекта. Сгенерированный им SELECT выполнен read-only на `bcb_webapp_dev`:

```bash
bcb_probe_sql="$(node --input-type=module -e "
  import { readMigrationFolder, collectExpectedObjects, renderObjectPresenceSql }
    from './deploy/postgres/privileges/migration-order.mjs';
  process.stdout.write(renderObjectPresenceSql(collectExpectedObjects(
    readMigrationFolder('./apps/webapp/db/drizzle-migrations'))) ?? '');
")"
[[ "$bcb_probe_sql" == SELECT* ]]
sudo -n -u postgres psql -X -A -t -q -h /var/run/postgresql -p 5432 \
  -d bcb_webapp_dev -c "$bcb_probe_sql"
```

Вывод:

```text
0|t
1|t
2|t
3|t
4|t
5|t
6|t
7|t
8|t
9|t
10|t
11|t
12|t
13|t
14|t
15|t
16|t
17|t
18|t
19|t
20|t
21|t
```

Проверенная assumption: восемь файлов являются forward-delta поверх уже установленной schema B/base objects; они не должны и не могут воспроизвести объекты удалённых 50 на empty DB. На поддерживаемом B-state их собственные 22 следа присутствуют, а их восемь хешей побайтно совпадают с файлами, DEV ledger и target artifact.

## ВНЕ ДИФФА

`docs/ARCHITECTURE/DB_DUMPS/README.md:42` предлагает команду `node scripts/check-b0-migration-baseline.mjs`, но файла нет ни в parent, ни в target:

```bash
for revision in 8723645ad^ 8723645ad; do
  git cat-file -e "$revision:scripts/check-b0-migration-baseline.mjs" 2>/dev/null \
    && printf '%s PRESENT\n' "$revision" \
    || printf '%s ABSENT\n' "$revision"
done
```

```text
8723645ad^ ABSENT
8723645ad ABSENT
```

Это существовало до проверяемого diff и не расширяет его scope; вопрос владельцу, не работа этого аудита.

## Выполненные проверки и границы

- Прочитаны AGENTS.md §1/§1b/§6/§7/§10/§24, `README.md`, server/local-dev/deploy docs и отчёт исполнителя.
- Exact range: `8723645ad^..8723645ad`; поздний merge текущего HEAD не использован для оценки diff.
- `node --test deploy/postgres/privileges/function-census.test.mjs` — FAIL, 16/19, F1.
- Все DB-команды — только `SELECT` через заданный socket/port/database. Ни один DDL/DML wrapper не запускался.
- `bersoncarebot_test`, PROD, reset, deploy, migration execute, full CI и push не запускались.
- Постоянные тесты и продуктовые исправления не создавались.
