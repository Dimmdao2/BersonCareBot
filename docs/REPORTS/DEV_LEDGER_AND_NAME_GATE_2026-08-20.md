# DEV: ledger миграций и gate имён — 2026-08-20

Проверка выполнена только чтением `bcb_webapp_dev`. Запросы к PostgreSQL ниже использовали
заданный privileged read-only шаблон; миграции, DDL и любые записи в БД не запускались.
`bersoncarebot_test` и PROD-хост не затрагивались.

## 1. Все ли миграции применены на DEV

**Да.** На диске 58 migration-файлов, в ledger 58 строк. Множества `disk − ledger` и
`ledger − disk` пусты; следовательно, файлов, присутствующих на диске, но отсутствующих в
ledger, нет.

Источник истины на диске прослежен от
`apps/webapp/scripts/run-webapp-drizzle-migrate.mjs`: он задаёт `migrationsFolder` как
`apps/webapp/db/drizzle-migrations` и вызывает `readMigrationFolder(migrationsFolder)`.
Импортируемый `deploy/postgres/privileges/migration-order.mjs` читает только `*.sql`, сортирует
их по имени и считает applied по `tag` из `drizzle.__drizzle_migrations`. Файл
`apps/webapp/db/drizzle-migrations/meta/_journal.json` остаётся legacy-map (`created_at → tag`)
для bootstrap старых строк, а не источником порядка.

Команда поиска исходников:

```bash
node /home/dev/brain/tools/code-search.mjs "run-webapp-drizzle-migrate journal migration file name validation check-drizzle-migration-order" --repo bcb -k 20
```

Вывод (релевантные результаты):

```text
• bcb/apps/webapp/scripts/run-webapp-drizzle-migrate.mjs:241-290
• bcb/deploy/postgres/privileges/migration-order.mjs:1-50
• bcb/apps/webapp/scripts/check-drizzle-migration-order.sh:81-95
```

Команда измерения (включая обе разности):

```bash
set -euo pipefail
migration_dir='apps/webapp/db/drizzle-migrations'
mapfile -t disk_tags < <(find "$migration_dir" -maxdepth 1 -type f -name '*.sql' -printf '%f\n' | sed 's/\.sql$//' | LC_ALL=C sort)
mapfile -t ledger_tags < <(sudo -n -u postgres psql -X -A -t -q -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -c 'SELECT tag FROM drizzle.__drizzle_migrations ORDER BY tag NULLS FIRST;')
printf 'migration_files_on_disk=%s\n' "${#disk_tags[@]}"
printf 'ledger_rows=%s\n' "${#ledger_tags[@]}"
printf '%s\n' "${disk_tags[@]}" > /dev/null
printf 'disk_not_in_ledger:\n'
comm -23 <(printf '%s\n' "${disk_tags[@]}") <(printf '%s\n' "${ledger_tags[@]}" | LC_ALL=C sort)
printf 'ledger_not_on_disk:\n'
comm -13 <(printf '%s\n' "${disk_tags[@]}") <(printf '%s\n' "${ledger_tags[@]}" | LC_ALL=C sort)
```

Вывод:

```text
migration_files_on_disk=58
ledger_rows=58
disk_not_in_ledger:
ledger_not_on_disk:
```

## 2. Orphans в ledger

**0.** Orphan определён как строка ledger, чей `tag` не соответствует ни одному `*.sql` на
диске. Пустой `ledger_not_on_disk` в измерении выше доказывает count=0, поэтому перечислять
`hash/tag/created_at` нечего и ничего не удалялось.

Для независимой фиксации всех полей строк ledger выполнена команда:

```bash
sudo -n -u postgres psql -X -A -t -q -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -c 'SELECT hash, tag, created_at FROM drizzle.__drizzle_migrations ORDER BY tag NULLS FIRST;'
```

Вывод (58 строк):

```text
1a9c925f2f5b411bca309187d06cdaaec198602fd51e85e6d9554943d9ba7963|0000_b0_baseline|1800000000000
80525a18ff84fa71e77a6f768951fec3567dbb5a252f4f28dca8cb65d652ce9c|0001_patient_booking_runtime_capability|1800000001000
9a60ef246a7a1bf4d9f3c97ad71c1be477f3f7156eddce7169a7769fc45bd37c|0002_patient_booking_slot_snapshot_settings|1800000002000
3243113c84e12a515f210c7c45376c93d64e6bdaad024676e3a8b648f75f5f07|0003_patient_booking_lifecycle_capabilities|1800000003000
55c318b4d5836a0d8c6c57e53a282d8d668c6467e7cfcd4ecbc6757e32bc034d|0004_patient_booking_delegated_snapshot_context|1800000004000
855e8941d3aae907b17e0fcc3130101cf5530b818ccfb949fd281090906114b6|0005_patient_booking_payment_config_capability|1800000005000
63f992ffb95136968dd11abfce5d62d93b50a20f391da849c8cb2c528dca7610|0006_patient_booking_prepayment_policy_capability|1800000006000
36c04954b270fa7488d15521e7368a992b7074240270ff2ebf78842bff35e60f|0007_patient_booking_lifecycle_notification_setting|1800000007000
8077c27c8069fc6d47490650798acf4a036c466b67b5c2f303aa07b9bf4577ac|0008_patient_booking_reminder_preference_capability|1800000008000
ddec35db1dcb505a77360b09e0dbc65ec0bc313403c119514306b5883c5d14e5|0009_current_patient_lfk_session_capability|1800000009000
72e0f148e2e88386207494df86d756a2d6c9d955d7ab5d2e2547ac7a6802fd72|0010_current_patient_staff_notification_profiles|1800000010000
2c78a1950d9d5a6da1d5a7ce66d6819b645f2610b63a80fa23ed195ce2a6c11e|0011_current_patient_staff_notification_profiles_binding_order|1800000011000
483f6433670a2041962ced55a9ffe6361da7cd19cd20979e3a8f6e0834c2848e|0012_integrator_web_push_delivery_capabilities|1800000012000
316546c88fccefe5255319347f91eabc4d408b9b98434d93a96c3d3f29df71d6|0013_integrator_support_delivery_attempt_capability|1800000013000
932e94a5868b4ac0545f29e4cedda24b20e7b8ac79d5c699ee79c8daed490da2|0014_patient_practice_and_material_rating_capabilities|1800000014000
2b563309105100435994606dd64006f5ac6f02769bb0569fb7c938ccb73f315c|0015_patient_self_identity_capability|1800000015000
ce2d3c3a3b7af9964f955bc802633fcb32b645ef8a11eb3c7b7757d3f5aec121|0016_patient_self_action_capabilities|1800000016000
deb3c6c187bd9a511a9b0244d5716dc8355df257976bd1f97dba59b0911735f8|0017_patient_shared_core_capabilities|1800000017000
58d7226a3e4281b35be8c543bad43051eaa529a2b742d1634942d14713ef467d|0018_clinic_owner_tariff_branch_quotas|1800000018000
2c9ec12402f84db364402f5f890e26fa7130ada12408ddba841d43415274da0a|0019_patient_reminder_materialization_runtime_capabilities|1800000019000
1607be2abcc3f4f6675722b8916343ef38aa306b56d4a0434074c6e42f9f8313|0020_patient_reminder_materialization_narrow_column_reads|1800000020000
688b6c79fc588dd26bb076f70f3425567efd17931aca03c61d55b2d47c422b32|0021_patient_program_item_narrow_column_reads|1800000021000
249e2378e4155bf7801b6e2601daface031cc2dc3591b4eb46fd3f8eb35d2840|0022_quota_mechanics_have_no_off_state|1800000022000
0c3b0092360f3e18ed9b4f632ca9e32e0133b20671cbf6e3a81840bb08be2e50|0023_purchased_tariff_invoice_refresh|1800000023000
083028c8ef013b3193ce6823294855da63388d6d28f95b8ffb76e466f1a56c3e|0024_first_tariff_choice_awaits_payment|1800000024000
6210b85489b25af1b31eb177665fcc8aadb6273ceac2a27bbb9a5941b78fac89|0025_definer_bodies_that_lived_only_in_dev|1800000025000
3734710934d83f176fed9d849a208ab16ecd0a763470cc2739bd8b75e7906972|0026_handwritten_login_gates_that_lived_only_in_dev|1800000027000
06b2a5142ae7d927115fdfb7d2e9927aba7f45e9c9010645836e50b8cac26f96|0027_warmup_feeling_uses_the_whole_five_point_scale|1800000028000
fbb6ea2cb07984cf722e5a135614471f296784c4e5e6cb4b1078f3065023b990|0028_port_context_rows_die_with_their_transaction|1800000029000
f26955d80f2c4d66e9d780880701c0a6d11a36495d9f44b0d50c7b6f40617d26|0029_retention_of_the_failure_archive_is_not_tenant_work|1800000030000
a2b79f9b8c0cd60e1aa79170e434162852dc27f250ecf79d7722c6ea3fd7fc9d|0030_a_delivery_audience_is_resolved_in_one_place|1800000031000
26ea73b932009bcd273022eaca027581de9e9318197394043eac748173d6e8d6|0031_one_retention_root_with_a_closed_list_of_targets|1800000032000
4644af260c7f207ea497bed9be829151d919fc41020acc268a2568a8faac53b4|0032_a_shown_photo_is_our_own_re_encode|1800000033000
f74c179275c58710365801f157d955460c46e1f7080f5f7279f164f8efc22396|0033_one_declared_root_puts_a_message_in_the_queue|1800000034000
5b280c80c2d7befdbd8a31a01eac6d607eae9511f45137c5b09e713775124b18|0034_a_new_clinic_needs_a_reference_catalog_to_copy|1800000035000
5b280c80c2d7befdbd8a31a01eac6d607eae9511f45137c5b09e713775124b18|0035_one_declared_root_replaces_a_reminder_generation|1800000036000
8038c228d569f33cb99667954063074514df12579f541826dc1d0e9bb31d1693|0036_the_content_argument_cannot_survive_the_wire_as_jsonb|1800000037000
f7aa2607e09f16e8b542a9e51e7a5ac8bdf4b6d172722933667eab01c9add17b|0037_the_patient_reads_own_contacts_and_writes_own_booking_contact|1800000038000
6d638023ac727b89accc02d4a3f9862e2e64a078194e8699f52a7ab5a30dc552|0038_a_star_takes_columns_the_seam_never_asked_for|1800000039000
0e1ba0b116c2e12f1a341b39b1b63183153c309e5913893f5fdd9a74a82ed8fa|0039_the_operator_watchman_may_not_read_its_own_queue|1800000040000
7060b811d4c0c83d3bea1d6d4c1630fc1a48454ff45a79c44a8919f13daaf5bc|0040_two_machine_ticks_had_no_door_of_their_own|1800000041000
3f7f0ef33c32bc1e6d412e8f6e293dc6a219fbc19f858e88e2340c4465f2ef29|0041_the_watchman_could_read_incidents_but_not_open_one|1800000042000
ca24ee92b5c24c031cb1c891319ffbd38e696cf3aa18f5cb384478fb7fe60f62|0042_the_bridge_to_a_retired_system_is_not_a_bridge|1800000043000
55a2540d35f8842988b3ff8958688d803e37503db497415ed7ad9b2460aa9187|0043_a_clinic_name_must_not_shadow_a_product_route|1800000044000
5957d9789c00a500f50e5bf17dd152516aaafe71e1e9d3188ed60db3edcee109|0044_a_link_to_a_video_host_is_a_kind_of_media|1800000045000
f0ec345f5b982fe0df7a504b2f8e667f72b1ac64f7d59d7bab37383618df15fc|0045_the_platform_dashboard_read_nineteen_tables_through_no_door|1800000046000
d5bacb2a2238dd8edf23469d1d1f4aa3a878b329fcbe6954675f14426cc221f2|0046_a_dead_row_from_june_is_not_todays_outage|1800000047000
38625073a05661ddd3b0c90ed24bf19f6208d6a0b9f412e632bf8ae0b26a4e0c|0047_the_opening_door_did_not_learn_the_new_alarm_words|1800000051000
47aaa1a7696311cd3f09b865c4b98c758fa9e75758872d722531970597586ec1|0047_the_public_funnel_had_no_door_of_its_own|1800000048000
74b391b139769ec18509f5d8646147b746b3c9384c1a16b2b94dd0438f46401f|0049_a_clinic_had_a_booking_form_but_no_face|1800000050000
efdb857d09bcf0f22b53737b36fa639cbb09a49099e4f45f67568c6e47426914|20260819T163536_a_failed_public_booking_must_not_leave_a_client|1800000055000
ba4a69129732ff76f639cf0459697fcf9e13b59a3a77069c0fe7496880492b9f|20260819T170216_a_public_visitor_becomes_a_client_when_identified|1800000053000
228d8d4d652bca0248b084e6d69d5ee59dca3c8eb6108f9eca339f38de4c49dd|20260819T180713_a_lifetime_allowance_counted_by_join_is_not_lifetime|1800000060000
556c698a61df85ef709c67c4959fd5861143d1119c0237787bee0a61374dbfc8|20260819T182039_a_visitor_booking_spends_no_tariff_seat|1800000056000
7f78a9b99869994799081d8cd17282adc0e7850d818509201353a57b85bf1091|20260819T204355_a_seat_invoice_is_not_cancelled_it_is_reissued|1800000071000
66db5bf7824af292e1a0ec2fc5bac40c76c602a03cf248098f19d1f5b93369dc|20260819T205420_the_transcode_queue_dispatcher_had_no_door|1800000072000
d6b739a9e3c12bb5a796c9b1ac9298bb82f634ea3fed17866e02e566711292cd|20260819T210005_a_clinic_is_billed_for_seats_not_for_people|1800000073000
83df3f21ecb97fa497a471dea38f88806c5138cb2cb6d9e33d6c5da2a5e6ea25|20260820T010127_the_platform_admin_could_read_org_active_but_not_flip_it|1800000074000
```

## 3. Migration-name gate

Gate найден в `apps/webapp/scripts/check-drizzle-migration-order.sh`; он вызывает
`findMigrationNameViolations` и `findJournalGrowth` из
`deploy/postgres/privileges/migration-order.mjs`. Тот же `findMigrationNameViolations` вызывается
самим `apps/webapp/scripts/run-webapp-drizzle-migrate.mjs` до открытия соединения с БД. Правило:
имя либо присутствует в закрытом legacy allowlist `meta/_journal.frozen.json`, либо соответствует
`YYYYMMDDTHHMMSS_lower_snake_case.sql`.

### a) Фактическое дерево

Команда:

```bash
bash apps/webapp/scripts/check-drizzle-migration-order.sh; status=$?; printf 'exit_code=%s\n' "$status"
```

Вывод:

```text
run-webapp-drizzle-migrate transaction-safe migration layout check: OK
check-drizzle-migration-order: OK
exit_code=0
```

### b) Плохое имя вне репозитория

Следующая команда скопировала только нужные файлы в новый каталог `/tmp`, создала там
`0099_bad_name.sql`, выполнила тот же gate, сохранила его ненулевой код и безусловно удалила scratch
каталог через `trap`. Рабочее дерево не менялось.

```bash
set -u
tmp_dir="$(mktemp -d /tmp/bcb-migration-name-gate.XXXXXX)"
cleanup() { rm -rf "$tmp_dir"; }
trap cleanup EXIT
mkdir -p "$tmp_dir/apps/webapp" "$tmp_dir/deploy/postgres/privileges"
cp -a apps/webapp/scripts "$tmp_dir/apps/webapp/"
cp -a apps/webapp/db "$tmp_dir/apps/webapp/"
cp -a deploy/postgres/privileges/migration-order.mjs deploy/postgres/privileges/migrate-local-parse.mjs "$tmp_dir/deploy/postgres/privileges/"
ln -s "$PWD/node_modules" "$tmp_dir/node_modules"
touch "$tmp_dir/apps/webapp/db/drizzle-migrations/0099_bad_name.sql"
set +e
(
  cd "$tmp_dir"
  bash apps/webapp/scripts/check-drizzle-migration-order.sh
)
status=$?
set -e
printf 'scratch_dir=%s\n' "$tmp_dir"
printf 'exit_code=%s\n' "$status"
if [ "$status" -eq 0 ]; then
  printf 'ERROR: expected name gate to reject 0099_bad_name.sql\n' >&2
  exit 1
fi
```

Вывод:

```text
check-drizzle-migration-order: 0099_bad_name.sql is not named YYYYMMDDTHHMMSS_lower_snake_case, and the frozen legacy snapshot does not know it as a legacy name
New migrations are named db/drizzle-migrations/YYYYMMDDTHHMMSS_name.sql (UTC); nothing hands out a number.
meta/_journal.frozen.json is the closed legacy-name allowlist; meta/_journal.json is live ledger-backfill bookkeeping only.
scratch_dir=/tmp/bcb-migration-name-gate.6Klt2r
exit_code=1
```

Команда проверки удаления scratch-каталога:

```bash
if [ ! -e /tmp/bcb-migration-name-gate.6Klt2r ]; then printf 'scratch_cleanup=OK\n'; else printf 'scratch_cleanup=FAILED\n'; exit 1; fi
```

Вывод:

```text
scratch_cleanup=OK
```

## НЕ ПРОВЕРЕНО

- Семантика и фактическое применение SQL каждой из 58 миграций не проверялись: scope ограничен
  read-only сравнением файлов и ledger, а запуск мигратора был бы write-операцией.
- Не проверялись `bersoncarebot_test` и PROD: они прямо исключены brief.
