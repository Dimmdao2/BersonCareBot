# TEST full reset, попытка 4 — 2026-08-20

## Итог

**PASS.** Разрешённая destructive TEST migration rehearsal завершилась с кодом `0`. Wrapper восстановил
свежий PROD dump непосредственно в `bersoncarebot_test`, выполнил owner-reviewed FIO stage, перенос legacy
appointments, атомарный A → B cutover, declarative privilege reconcile, port-context cutover и запуск TEST.

Первые три blocker больше не воспроизвелись. Финальный wrapper verdict:

```text
== [deploy-test-saas] TEST port-context release: PASS ==
== [deploy-test-saas] DONE — TEST DB/schema/runtime ready (reviewed FIO + port-context runtime verified); external delivery unverified ==
```

Полный transcript: `/tmp/bcb-test-full-reset-20260820-run4.log`.

Во время этого прохода не создавались роли, не выполнялись ручные `GRANT`/`REVOKE`, не выдавался
`BYPASSRLS`, не редактировался `/opt/env` вручную, не изменялся ledger вручную и не создавались disposable/A0/A1
базы. `bcb_webapp_dev` не изменялся. Контакт с PROD был только через встроенный read-only `pg_dump` wrapper'а.
Анонимизация не применялась: wrapper восстановил свежий PROD dump без промежуточного masking/scrambling stage.

## R1 — точная reset-команда и код завершения

Команда выполнена из `/home/dev/dev-projects/BersonCareBot`; код взят отдельной строкой без pipeline:

```bash
set +e
bash deploy/host/deploy-test-full-reset.sh --confirm-full-reset \
  --fio-manifest=/tmp/bcb-cutover-inputs/fio-owner-reviewed-test-20260820-merge-preserve.manifest.json \
  --fio-manifest-file-sha256=0842f3d942d31bfaf228694512874b73d5809f2060824e6af314509fe4790d51 \
  --fio-manifest-sha256=436e8fe7c75f8a771e520a043803c548b5724492ed35d97edf43ad631ec719da \
  --fio-review-source-sha256=56fa7fc7dbdd6caacdb6bb1350a4d891fdff6fc7b7e679803396181983c99700 \
  > /tmp/bcb-test-full-reset-20260820-run4.log 2>&1
reset_rc=$?
printf 'RESET_EXIT_CODE=%s\n' "$reset_rc"
```

Вывод:

```text
RESET_EXIT_CODE=0
```

## R2 — какой HEAD был развёрнут

Команда:

```bash
sed -n '1,40p' /tmp/bcb-test-full-reset-20260820-run4.log
```

Релевантный дословный вывод:

```text
== [deploy-test-full-reset] same-checkout cutover snapshot preflight ==

> berson-care-bot@1.0.0 check:prod-to-target-cutover /home/dev/dev-projects/BersonCareBot
> node scripts/refresh-prod-to-target-cutover.mjs --check

ok schema-pre.sql
ok schema-post.sql
ok ledgers-and-baseline.sql
ok runtime-settings.sql
prod-to-target cutover snapshot matches current DEV schema B

== [deploy-test-saas] DESTRUCTIVE full-reset confirmation + owner input preflight ==
   FIO manifest: protected input + SHA-256 OK
port-context TEST env bootstrap preflight: OK (no files written; secrets redacted)

== [deploy-test-saas] TEST runtime mode preflight ==
   api:       DB_PRINCIPAL_CONTEXT_MODE=port-context (strict TEST runtime)
   webapp:    DB_PRINCIPAL_CONTEXT_MODE=port-context (strict TEST runtime)

== [deploy-test-saas] bundle + checkout feat/doctor-ui-rebuild -> /opt/projects/bersoncarebot-test ==
From /tmp/bcb-test-deploy.bundle
 * branch                    feat/doctor-ui-rebuild -> FETCH_HEAD
Reset branch 'feat/doctor-ui-rebuild'
   HEAD: 41e9d6c46d8
```

Фактически развёрнут `41e9d6c46d8b2a5a00f0ca1c6bd13809ad17d6bb`. По authority brief это тот же
source-код, который прошёл зелёный full CI на `d509c4fd1`: изменения между ним и deployed HEAD — только
документация, без source changes. Новый full CI в этом docs/report-only проходе не запускался.

## R3 — ключевые стадии data cutover

Команда:

```bash
sed -n '798,920p' /tmp/bcb-test-full-reset-20260820-run4.log
```

Релевантный дословный вывод:

```text
== [deploy-test-saas] version-matched owner-reviewed FIO manifest verification (no DB) ==
{"command":"verify","verified":true,"rows":169,"manifestSha256":"436e8fe7c75f8a771e520a043803c548b5724492ed35d97edf43ad631ec719da","reviewSourceSha256":"56fa7fc7dbdd6caacdb6bb1350a4d891fdff6fc7b7e679803396181983c99700"}

== [deploy-test-saas] pull FRESH dump from live prod (bcb-clone:bersoncarebot) → /tmp/bcb-prod-fresh.dump ==

== [deploy-test-saas] restore bersoncarebot_test from bcb-prod-fresh.dump (60M) ==
restore-test-db-from-dump: PASS (platform_users=299 integrator_schema_migrations=68 public_tables=187)

== [deploy-test-saas] owner-reviewed FIO manifest apply (pre-migration) ==
{"command":"apply","target":"TEST","total":170,"eligibleUpdates":161,"alreadyMatched":3,"expectedMissing":1,"preservedCurrent":5,"unexpectedMissing":0,"unexpectedDrift":0,"artifactCreated":true,"artifactSha256":"fef47310227d130eb989c0b52e7ab82b611428b0c1cff32873729bb00cd01c04"}

== [deploy-test-saas] carry unresolved legacy appointment history (pre-assertion cutover data stage) ==
 legacy_appointments_inserted
------------------------------
                          123
(1 row)

{"status" : "pass", "deduplicationKey" : "md5(legacy-appointment-record:<appointment_records.id>)", "legacyCandidates" : 123, "legacyDirectLinks" : 123, "canonicalRows" : 123, "patientBookingDirectLinks" : 1}
```

Команда:

```bash
sed -n '4898,4970p' /tmp/bcb-test-full-reset-20260820-run4.log
```

Релевантный дословный вывод:

```text
{"status" : "pass", "platformUsers" : 308, "userIdentities" : 262, "appointments" : 486, "activeCanonicalClientMembershipExpected" : 260, "patientDomainReferenceExpected" : 143, "activeEnrollments" : 260, "reminderHistoryAttributed" : 2085, "reminderHistoryHonestlyUnmapped" : 0, "preservedMessageDrafts" : 19, "attributedDeliveryAttempts" : 8583, "attributedPlaybackHourlyRows" : 579, "calendarMappings" : 214, "pendingDeliveryQueue" : 14}

   drizzle migrations = 58 (target ledger rows = 58; org columns present)

== [deploy-test-saas] verify end-state ==
   OK: 1 active specialist · 486 appointments on canonical (23 future) · doctor role held · admin_phones=[]
```

## Q1 — read-only snapshot ledger, appointments и reminders

Команда выполнена через локальный administrative socket внутри `BEGIN READ ONLY`:

```bash
sudo -u postgres psql -X -h /var/run/postgresql -p 5432 \
  -d bersoncarebot_test -v ON_ERROR_STOP=1 -At -c "BEGIN READ ONLY;
SELECT json_build_object(
  'drizzleLedgerRows', (SELECT count(*) FROM drizzle.__drizzle_migrations),
  'integratorLedgerRows', (SELECT count(*) FROM integrator.schema_migrations),
  'beAppointmentsTotal', (SELECT count(*) FROM public.be_appointments),
  'legacyCarried', (SELECT count(*) FROM public.be_appointments
                    WHERE attribution_json->>'sourceTable'='appointment_records'),
  'legacySourceIds', (SELECT count(DISTINCT attribution_json->>'legacyAppointmentRecordId')
                      FROM public.be_appointments
                      WHERE attribution_json->>'sourceTable'='appointment_records'),
  'legacyDuplicateGroups', (SELECT count(*) FROM (
    SELECT attribution_json->>'legacyAppointmentRecordId'
    FROM public.be_appointments
    WHERE attribution_json->>'sourceTable'='appointment_records'
    GROUP BY 1 HAVING count(*)>1
  ) dups),
  'appointmentReminderRows', (SELECT count(*) FROM public.outgoing_delivery_queue
                              WHERE event_id LIKE 'appointment_reminder:%'),
  'appointmentReminderPurposes', (SELECT json_agg(DISTINCT payload_json->>'purpose')
                                  FROM public.outgoing_delivery_queue
                                  WHERE event_id LIKE 'appointment_reminder:%'),
  'appointmentReminderEarliestRetryAt', (SELECT min(next_retry_at) FROM public.outgoing_delivery_queue
                                         WHERE event_id LIKE 'appointment_reminder:%'),
  'appointmentReminderLatestRetryAt', (SELECT max(next_retry_at) FROM public.outgoing_delivery_queue
                                       WHERE event_id LIKE 'appointment_reminder:%')
);
COMMIT;"
```

Вывод:

```text
BEGIN
{"drizzleLedgerRows" : 58, "integratorLedgerRows" : 1, "beAppointmentsTotal" : 486, "legacyCarried" : 123, "legacySourceIds" : 123, "legacyDuplicateGroups" : 0, "appointmentReminderRows" : 14, "appointmentReminderPurposes" : ["appointment_reminder"], "appointmentReminderEarliestRetryAt" : "2026-08-21T11:59:59.601393+03:00", "appointmentReminderLatestRetryAt" : "2026-08-29T16:59:59.706473+03:00"}
COMMIT
```

Факты из этой команды:

- `drizzle.__drizzle_migrations`: **58** строк; `integrator.schema_migrations`: **1** строка.
- `be_appointments`: **486** всего; **123** перенесены из `appointment_records`; distinct legacy source ids:
  **123**; duplicate legacy groups: **0**.
- Step 7 data stage перенёс **14** reminder rows. Единственный purpose — `appointment_reminder`.
  `next_retry_at`: от `2026-08-21 11:59:59.601393+03` до `2026-08-29 16:59:59.706473+03`.

## P1 — privilege reconcile

Команда:

```bash
rg -n 'BCB_LEGACY_ROLE_QUARANTINE_RECONCILED|BCB_SHARED_ROLE_BASELINE_RECONCILED|access reconcile committed|cutover-postgres-port-context: PASS|TEST port-context release: PASS|DONE — TEST DB' /tmp/bcb-test-full-reset-20260820-run4.log
```

Вывод:

```text
1211:NOTICE:  BCB_LEGACY_ROLE_QUARANTINE_RECONCILED
1213:NOTICE:  BCB_SHARED_ROLE_BASELINE_RECONCILED
5260:NOTICE:  BCB_LEGACY_ROLE_QUARANTINE_RECONCILED
5262:NOTICE:  BCB_SHARED_ROLE_BASELINE_RECONCILED
5264:access reconcile committed: env=test database=bersoncarebot_test; local admin socket=/run/postgresql
5269:cutover-postgres-port-context: PASS (environment=test database=bersoncarebot_test backup=/var/backups/bersoncarebot-test-portctx/bersoncarebot_test-pre-access-20260820T112324Z.dump)
5279:== [deploy-test-saas] TEST port-context release: PASS ==
5281:== [deploy-test-saas] DONE — TEST DB/schema/runtime ready (reviewed FIO + port-context runtime verified); external delivery unverified ==
```

Итог privilege stage: reconcile закоммичен, legacy-role quarantine и shared-role baseline подтверждены,
port-context cutover завершился `PASS`. В отличие от attempts 2–3, retired `app_owner` не остановил reset.

## H1 — пять TEST unit'ов и live HTTP

Команды:

```bash
set +e
systemctl is-active \
  bersoncarebot-api-test.service \
  bersoncarebot-worker-test.service \
  bersoncarebot-scheduler-test.service \
  bersoncarebot-webapp-test.service \
  bersoncarebot-media-worker-test.service
units_rc=$?
printf 'SYSTEMCTL_IS_ACTIVE_EXIT_CODE=%s\n' "$units_rc"
curl -k -sS --max-time 15 \
  -w '\nHTTP_STATUS=%{http_code}\n' \
  https://test.bersoncare.ru/api/health
http_rc=$?
printf 'CURL_EXIT_CODE=%s\n' "$http_rc"
```

Вывод:

```text
active
active
active
active
active
SYSTEMCTL_IS_ACTIVE_EXIT_CODE=0
{"ok":true,"db":"up"}
HTTP_STATUS=200
CURL_EXIT_CODE=0
```

Все пять TEST unit'ов active; live TEST entrypoint вернул application health JSON и HTTP `200`, а не
maintenance HTML.

## Известная слабость preflight — не исправлялась

Команды:

```bash
node -e "const pkg=require('./package.json'); console.log(pkg.scripts['check:prod-to-target-cutover'])"
if [[ -e scripts/prod-to-target-cutover-executable-gate.mjs ]]; then
  printf 'EXECUTABLE_GATE_PRESENT=yes\n'
else
  printf 'EXECUTABLE_GATE_PRESENT=no\n'
fi
rg -n -C 2 'prod-to-target-cutover-executable-gate|snapshot half|weaker|слаб' \
  docs/_TODO/SAAS_FOUNDATION/B0_SALVAGE_DELETION_CLASSIFICATION_2026-08-20.md
```

Вывод:

```text
node scripts/refresh-prod-to-target-cutover.mjs --check
EXECUTABLE_GATE_PRESENT=no
132-  `bcb_webapp_dev`; not regenerated in this pass (would require running `pnpm run
133-  refresh:prod-to-target-cutover`, out of scope for a restoration pass — see Definition of Done notes).
134:- `scripts/prod-to-target-baseline-policy.test.mjs`, `scripts/prod-to-target-cutover-executable-gate.mjs`,
135-  `scripts/prod-to-target-cutover-contract.test.mjs` — the stricter check `check:prod-to-target-cutover`
136-  used to run (the historical `package.json` chained `refresh-prod-to-target-cutover.mjs --check &&
137:  prod-to-target-cutover-executable-gate.mjs`); this pass registers `check:prod-to-target-cutover` as
138:  only the first half, which is weaker than the original gate — flagged, not silently claimed equivalent.
139-
140-The other 13 `bfe6b48f0` deletions (D30 disposable-concurrency check scripts, disposable-proof `.mjs`
```

Следовательно, `check:prod-to-target-cutover` перед этим destructive run проверил только snapshot half.
Synthetic F1–F5 executable fixtures/mutants не запускались, потому что
`scripts/prod-to-target-cutover-executable-gate.mjs` отсутствует после `bfe6b48f0`. Gate не восстанавливался:
это вернуло бы запрещённую A0/greenfield family. Run сознательно вошёл с более слабым preflight, как уже
зафиксировано в `B0_SALVAGE_DELETION_CLASSIFICATION_2026-08-20.md`.

## НЕ ПРОВЕРЕНО

- Реальная внешняя отправка сообщений не выполнялась: финальный wrapper выводит `external delivery unverified`.
- Synthetic executable F1–F5 preflight и его six mutants не проверены: executable gate отсутствует; фактически
  выполнена только snapshot-половина `check:prod-to-target-cutover`.
- Не выполнялось отдельное post-restore сравнение каждой TEST-строки с PROD: дополнительный доступ к PROD был
  запрещён brief'ом. Источник и restore подтверждены transcript'ом встроенного fresh `pg_dump` path; требуемые
  data-survival агрегаты измерены локально на `bersoncarebot_test` в `BEGIN READ ONLY`.
- Новый full CI для `41e9d6c46` не запускался: по owner brief после зелёного `d509c4fd1` менялась только
  документация; runtime rehearsal проверила фактически развёрнутый HEAD.
