# Исторические webapp-миграции выведены из активного контура — 20.08.2026

## Итог

После подтверждённого A→B cutover (reset run 4, `RESET_EXIT_CODE=0`) активный каталог, DEV ledger и generated target ledger приведены к одному набору из 8 timestamp-миграций 19–20 августа. 50 исторических `NNNN_*.sql` удалены. Legacy allowlist и историческая `when → tag` карта выведены из активного состояния.

## Почему historical replay больше не нужен

Проверены действующие entrypoint и TEST cutover:

```text
$ rg -n "historical|schema-pre|schema-post|ledgers-and-baseline|__drizzle_migrations|migrate|drizzle-migrations" deploy/host/deploy-test-saas.sh scripts/refresh-prod-to-target-cutover.mjs package.json deploy/postgres/prod-to-target-cutover.sql deploy/postgres/privileges/migrate-local.mjs deploy/host/migrate-dev.sh
deploy/postgres/prod-to-target-cutover.sql:4:-- data preparation first; this entrypoint replaces the historical migration chain.
deploy/postgres/prod-to-target-cutover.sql:6:\ir generated/prod-to-target/schema-pre.sql
deploy/postgres/prod-to-target-cutover.sql:8:\ir generated/prod-to-target/ledgers-and-baseline.sql
deploy/postgres/prod-to-target-cutover.sql:10:\ir generated/prod-to-target/schema-post.sql
deploy/host/deploy-test-saas.sh:2314:TEST writers stopped, and exits before schema migration. It never starts the historical migration runners.
deploy/host/deploy-test-saas.sh:2636:#    webapp/integrator migration runners are intentionally not invoked here.
deploy/host/deploy-test-saas.sh:2646:expected_ledger_rows="$(awk '/^INSERT INTO drizzle\.__drizzle_migrations / { count += 1 } END { print count + 0 }' "$DEPLOY_REPO/$TARGET_LEDGER_ARTIFACT")"
deploy/host/deploy-test-saas.sh:2648:CNT="$(sudo -u postgres psql -d "$DB" -tAc "SELECT count(*) FROM drizzle.__drizzle_migrations;")"
```

Schema B приезжает generated `schema-pre.sql` + `schema-post.sql`, а ledger — generated `ledgers-and-baseline.sql`. Живого пути, который проигрывает удалённые 50 файлов для A→B cutover, не найдено; TEST entrypoint прямо исключает historical runners.

## Проверенное исходное состояние

Команда:

```bash
printf 'SQL_FILES=' && find apps/webapp/db/drizzle-migrations -maxdepth 1 -type f -name '*.sql' -printf '%f\n' | wc -l
printf 'HISTORICAL_FILES=' && find apps/webapp/db/drizzle-migrations -maxdepth 1 -type f -name '[0-9][0-9][0-9][0-9]_*.sql' -printf '%f\n' | wc -l
printf 'TIMESTAMP_FILES=' && find apps/webapp/db/drizzle-migrations -maxdepth 1 -type f -regextype posix-extended -regex '.*/[0-9]{8}T[0-9]{6}_[a-z0-9_]+\.sql' -printf '%f\n' | wc -l
printf 'FROZEN_ENTRIES=' && jq '.entries | length' apps/webapp/db/drizzle-migrations/meta/_journal.frozen.json
printf 'LIVE_ENTRIES=' && jq '.entries | length' apps/webapp/db/drizzle-migrations/meta/_journal.json
printf 'LEGACY_NAME_LINES=' && wc -l < apps/webapp/db/drizzle-migrations/meta/_legacy_names.txt
printf 'DEV_LEDGER_ROWS=' && sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -qAt -c 'SELECT count(*) FROM drizzle.__drizzle_migrations;'
printf 'FILES_NOT_IN_LEDGER:\n' && comm -23 <(find apps/webapp/db/drizzle-migrations -maxdepth 1 -type f -name '*.sql' -printf '%f\n' | sed 's/\.sql$//' | sort) <(sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -qAt -c "SELECT tag FROM drizzle.__drizzle_migrations WHERE tag IS NOT NULL ORDER BY tag;")
printf 'LEDGER_NOT_IN_FILES:\n' && comm -13 <(find apps/webapp/db/drizzle-migrations -maxdepth 1 -type f -name '*.sql' -printf '%f\n' | sed 's/\.sql$//' | sort) <(sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -qAt -c "SELECT tag FROM drizzle.__drizzle_migrations WHERE tag IS NOT NULL ORDER BY tag;")
printf 'ARTIFACT_INSERTS=' && awk '/^INSERT INTO drizzle\.__drizzle_migrations / { count += 1 } END { print count + 0 }' deploy/postgres/generated/prod-to-target/ledgers-and-baseline.sql
```

Вывод:

```text
SQL_FILES=58
HISTORICAL_FILES=50
TIMESTAMP_FILES=8
FROZEN_ENTRIES=50
LIVE_ENTRIES=50
LEGACY_NAME_LINES=54
DEV_LEDGER_ROWS=58
FILES_NOT_IN_LEDGER:
LEDGER_NOT_IN_FILES:
ARTIFACT_INSERTS=58
```

Оба пустых блока разницы подтверждали точное соответствие исходных 58 файлов и 58 ledger rows.

## Выполненная последовательность

### 1. DEV ledger: 58 → 8 только через sanctioned wrapper

50 tag переданы собственной операции `migrate-local.mjs --drop-foreign`. Чтобы выполнить ledger-шаг до удаления tracked-файлов, wrapper получил временное представление каталога, содержащее только 8 surviving timestamp-файлов. Параметры `--db`, `--migrator`, `--drizzle-folder` и `--sudo-postgres` соответствуют вызову из `deploy/host/migrate-dev.sh`. Ручного `UPDATE`/`DELETE` не было.

Точная команда:

```bash
set -Eeuo pipefail
MIGRATIONS_DIR="$PWD/apps/webapp/db/drizzle-migrations"
CURATED_DIR="$(mktemp -d /tmp/bcb-retire-migrations.XXXXXX)"
cleanup_curated() {
  case "$CURATED_DIR" in
    /tmp/bcb-retire-migrations.*) rm -rf -- "$CURATED_DIR" ;;
    *) printf 'refusing unexpected cleanup path: %s\n' "$CURATED_DIR" >&2; exit 1 ;;
  esac
}
trap cleanup_curated EXIT
while IFS= read -r current_file; do
  install -m 0644 "$MIGRATIONS_DIR/$current_file" "$CURATED_DIR/$current_file"
done < <(find "$MIGRATIONS_DIR" -maxdepth 1 -type f -regextype posix-extended -regex '.*/[0-9]{8}T[0-9]{6}_[a-z0-9_]+\.sql' -printf '%f\n' | sort)
mapfile -t historical_tags < <(find "$MIGRATIONS_DIR" -maxdepth 1 -type f -name '[0-9][0-9][0-9][0-9]_*.sql' -printf '%f\n' | sed 's/\.sql$//' | sort)
[[ "$(find "$CURATED_DIR" -maxdepth 1 -type f -name '*.sql' -printf . | wc -c)" -eq 8 ]]
[[ "${#historical_tags[@]}" -eq 50 ]]
drop_args=()
for tag in "${historical_tags[@]}"; do
  drop_args+=(--drop-foreign "$tag")
done
printf 'CURATED_FILES=%s DROP_FOREIGN_TAGS=%s\n' "$(find "$CURATED_DIR" -maxdepth 1 -type f -name '*.sql' -printf . | wc -c)" "${#historical_tags[@]}"
node deploy/postgres/privileges/migrate-local.mjs \
  --db bcb_webapp_dev \
  --migrator bcb_dev_migrator \
  --drizzle-folder "$CURATED_DIR" \
  --sudo-postgres \
  "${drop_args[@]}"
```

Вывод (между показанными строками wrapper напечатал `DELETE 1` ровно 50 раз):

```text
CURATED_FILES=8 DROP_FOREIGN_TAGS=50
BEGIN
DELETE 1 × 50
SET
RESET
DO
COMMIT
Drizzle owner-ordered migration committed for "bcb_webapp_dev": pending=0 total=8 reapplied=0 foreign-ledger-rows=50 relabeled=0 dropped-foreign=50 dropped-foreign-by-hash=0 unapplied=0
```

Непосредственная проверка после wrapper:

```text
$ sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -qAt -c 'SELECT count(*) FROM drizzle.__drizzle_migrations;'
8
```

### 2. Удалённые migration-файлы

Удалены 50 файлов:

```text
0000_b0_baseline.sql
0001_patient_booking_runtime_capability.sql
0002_patient_booking_slot_snapshot_settings.sql
0003_patient_booking_lifecycle_capabilities.sql
0004_patient_booking_delegated_snapshot_context.sql
0005_patient_booking_payment_config_capability.sql
0006_patient_booking_prepayment_policy_capability.sql
0007_patient_booking_lifecycle_notification_setting.sql
0008_patient_booking_reminder_preference_capability.sql
0009_current_patient_lfk_session_capability.sql
0010_current_patient_staff_notification_profiles.sql
0011_current_patient_staff_notification_profiles_binding_order.sql
0012_integrator_web_push_delivery_capabilities.sql
0013_integrator_support_delivery_attempt_capability.sql
0014_patient_practice_and_material_rating_capabilities.sql
0015_patient_self_identity_capability.sql
0016_patient_self_action_capabilities.sql
0017_patient_shared_core_capabilities.sql
0018_clinic_owner_tariff_branch_quotas.sql
0019_patient_reminder_materialization_runtime_capabilities.sql
0020_patient_reminder_materialization_narrow_column_reads.sql
0021_patient_program_item_narrow_column_reads.sql
0022_quota_mechanics_have_no_off_state.sql
0023_purchased_tariff_invoice_refresh.sql
0024_first_tariff_choice_awaits_payment.sql
0025_definer_bodies_that_lived_only_in_dev.sql
0026_handwritten_login_gates_that_lived_only_in_dev.sql
0027_warmup_feeling_uses_the_whole_five_point_scale.sql
0028_port_context_rows_die_with_their_transaction.sql
0029_retention_of_the_failure_archive_is_not_tenant_work.sql
0030_a_delivery_audience_is_resolved_in_one_place.sql
0031_one_retention_root_with_a_closed_list_of_targets.sql
0032_a_shown_photo_is_our_own_re_encode.sql
0033_one_declared_root_puts_a_message_in_the_queue.sql
0034_a_new_clinic_needs_a_reference_catalog_to_copy.sql
0035_one_declared_root_replaces_a_reminder_generation.sql
0036_the_content_argument_cannot_survive_the_wire_as_jsonb.sql
0037_the_patient_reads_own_contacts_and_writes_own_booking_contact.sql
0038_a_star_takes_columns_the_seam_never_asked_for.sql
0039_the_operator_watchman_may_not_read_its_own_queue.sql
0040_two_machine_ticks_had_no_door_of_their_own.sql
0041_the_watchman_could_read_incidents_but_not_open_one.sql
0042_the_bridge_to_a_retired_system_is_not_a_bridge.sql
0043_a_clinic_name_must_not_shadow_a_product_route.sql
0044_a_link_to_a_video_host_is_a_kind_of_media.sql
0045_the_platform_dashboard_read_nineteen_tables_through_no_door.sql
0046_a_dead_row_from_june_is_not_todays_outage.sql
0047_the_opening_door_did_not_learn_the_new_alarm_words.sql
0047_the_public_funnel_had_no_door_of_its_own.sql
0049_a_clinic_had_a_booking_form_but_no_face.sql
```

### 3. Legacy-name и journal material

Удалены:

- `meta/_journal.frozen.json` — закрытый allowlist из 50 legacy-tag;
- `meta/_legacy_names.txt` — прежний список legacy-имён (54 строки);
- `meta/_journal.frozen` — больше никем не читаемый digest-пин исторической `when → tag` карты.

Сохранены:

- `meta/_journal.json` как валидный пустой Drizzle/bootstrap-файл с `entries: []`: `readLegacyJournalEntries` остаётся отдельным безопасным bootstrap-reader, но после сведения поддерживаемого ledger к tag-строкам ему не нужна ни одна историческая пара `when → tag`;
- `readLegacyJournalEntries`, `readFrozenLegacyMigrationNames` и тесты absent-file semantics: отсутствие frozen snapshot означает ноль grandfathered names, а отсутствие live journal по-прежнему даёт пустой bootstrap-map;
- `meta/0001_snapshot.json`, `0002_snapshot.json`, `0003_snapshot.json`: это schema snapshots, не legacy-name allowlist и не строки ledger; их удаление не входило в поручение;
- 8 timestamp SQL 19–20 августа.

Тест реального каталога изменил смысл без ослабления: прежнее утверждение «каждый реальный legacy-tag сортируется до timestamp» потеряло предмет после удаления всех legacy-файлов; теперь оно требует, чтобы каждый файл реального непустого каталога проходил timestamp-only правило с пустым allowlist.

### 4. Generated target ledger

Команда выполнена только после сведения DEV ledger к 8 и удаления legacy material:

```text
$ pnpm run refresh:prod-to-target-cutover
refreshed schema-pre.sql
refreshed schema-post.sql
refreshed ledgers-and-baseline.sql
refreshed runtime-settings.sql
prod-to-target cutover snapshot refreshed from current DEV schema B
```

Фактический diff generated artifacts затронул только `deploy/postgres/generated/prod-to-target/ledgers-and-baseline.sql`: из него удалены 50 historical Drizzle INSERT.

## Финальные доказательства

### Файлы, DEV ledger, обе разницы и target artifact

Команда:

```bash
printf 'SQL_FILES=' && find apps/webapp/db/drizzle-migrations -maxdepth 1 -type f -name '*.sql' -printf '%f\n' | wc -l
printf 'NON_TIMESTAMP_FILES:\n' && find apps/webapp/db/drizzle-migrations -maxdepth 1 -type f -name '*.sql' -printf '%f\n' | awk '$0 !~ /^[0-9]{8}T[0-9]{6}_[a-z0-9_]+\.sql$/ { print }'
printf 'DEV_LEDGER_ROWS=' && sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -qAt -c 'SELECT count(*) FROM drizzle.__drizzle_migrations;'
printf 'FILES_NOT_IN_LEDGER:\n' && comm -23 <(find apps/webapp/db/drizzle-migrations -maxdepth 1 -type f -name '*.sql' -printf '%f\n' | sed 's/\.sql$//' | sort) <(sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -qAt -c "SELECT tag FROM drizzle.__drizzle_migrations WHERE tag IS NOT NULL ORDER BY tag;")
printf 'LEDGER_NOT_IN_FILES:\n' && comm -13 <(find apps/webapp/db/drizzle-migrations -maxdepth 1 -type f -name '*.sql' -printf '%f\n' | sed 's/\.sql$//' | sort) <(sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -qAt -c "SELECT tag FROM drizzle.__drizzle_migrations WHERE tag IS NOT NULL ORDER BY tag;")
printf 'ARTIFACT_INSERTS=' && awk '/^INSERT INTO drizzle\.__drizzle_migrations / { count += 1 } END { print count + 0 }' deploy/postgres/generated/prod-to-target/ledgers-and-baseline.sql
```

Вывод:

```text
SQL_FILES=8
NON_TIMESTAMP_FILES:
DEV_LEDGER_ROWS=8
FILES_NOT_IN_LEDGER:
LEDGER_NOT_IN_FILES:
ARTIFACT_INSERTS=8
```

Оба направления set difference пусты; непрошедших timestamp-regex файлов нет.

### Name gate

Команда запущена без pipeline, exit code напечатан отдельной строкой:

```bash
bash apps/webapp/scripts/check-drizzle-migration-order.sh
migration_order_exit=$?
printf 'MIGRATION_ORDER_EXIT_CODE=%s\n' "$migration_order_exit"
exit "$migration_order_exit"
```

```text
run-webapp-drizzle-migrate transaction-safe migration layout check: OK
check-drizzle-migration-order: OK
MIGRATION_ORDER_EXIT_CODE=0
```

### Migration-order tests

```bash
node --test deploy/postgres/privileges/migration-order.test.mjs
migration_test_exit=$?
printf 'MIGRATION_ORDER_TEST_EXIT_CODE=%s\n' "$migration_test_exit"
exit "$migration_test_exit"
```

```text
...
ok 18 - every real migration has a timestamp name without a legacy allowlist
...
1..20
# tests 20
# suites 0
# pass 20
# fail 0
# cancelled 0
# skipped 0
# todo 0
MIGRATION_ORDER_TEST_EXIT_CODE=0
```

Итог остался 20/20. Изменён только смысл real-folder теста №18, описанный выше; absent-file и остальные behavioural tests не ослаблены.

### Generated cutover consistency

```text
$ pnpm run check:prod-to-target-cutover
ok schema-pre.sql
ok schema-post.sql
ok ledgers-and-baseline.sql
ok runtime-settings.sql
prod-to-target cutover snapshot matches current DEV schema B
```

## НЕ СДЕЛАНО

- `bersoncarebot_test` не открывалась и не изменялась; `deploy/host/deploy-test-full-reset.sh` не запускался.
- `deploy/host/deploy-test-saas.sh` и `deploy/postgres/prod-to-target-cutover.sql` не изменялись.
- PROD не открывался и не изменялся.
- Disposable/A0/A1/greenfield базы не создавались; historical replay не запускался.
- Ручного DML против `drizzle.__drizzle_migrations` не было; ledger изменён только sanctioned `migrate-local.mjs --drop-foreign`.
- `GRANT`, `REVOKE`, role/policy DDL не выполнялись.
- Полный `pnpm run ci` не запускался: поручение задаёт точечные gates, а §9–§10 не дают отдельного непокрытого repo-level риска для full CI.
- Push не выполнялся.
