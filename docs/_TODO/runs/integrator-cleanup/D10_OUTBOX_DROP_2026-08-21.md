# D10 — окончательный снос `integrator.projection_outbox` — 2026-08-21

## Итог

`integrator.projection_outbox` выведена из активной схемы, Drizzle, privilege declaration и deploy SQL.
Forward migration одновременно удаляет больше не используемый named root
`app.read_integrator_projection_health(integer)` и затем таблицу; оба `DROP` имеют `IF EXISTS`. Миграция не
применялась, к DEV/TEST/PROD и к любой базе этот ход не обращался.

## Zero-caller proof до удаления

Сначала был вызван обязательный индекс репозитория:

```text
$ node /home/dev/brain/tools/code-search.mjs "projection_outbox producer consumer insert update select worker" --repo bcb -k 30
# code-search: «projection_outbox producer consumer insert update select worker» · репо bcb · лексический BM25 · индекс 2026-08-20T20:45:03.427Z (24889 чанков)

• bcb/deploy/postgres/c4-operational-runtime.sql:441-490
• bcb/deploy/postgres/c4-operational-runtime.sql:1281-1330
• bcb/deploy/postgres/dev-c7-operational-delivery-worker-schema-table-grants.sql:41-75
• bcb/apps/integrator/src/infra/db/repos/outgoingDeliveryQueue.ts:81-130
• остальные выданные результаты — docs/archive/планы и исторические материалы
```

`code-search` сам обозначил режим как lexical BM25. Единственный `src`-результат был соседним
`outgoingDeliveryQueue.ts`, а не producer/consumer удаляемой таблицы.

Точный runtime-поиск был выполнен до первой правки:

```bash
rg -n --glob '*.{ts,tsx,mjs,js}' \
  --glob '!apps/integrator/src/infra/db/schema/**' \
  --glob '!apps/integrator/src/infra/db/integratorDrizzleSchema.ts' \
  --glob '!apps/webapp/db/schema/**' \
  'projection_outbox|projectionOutbox' apps/integrator/src apps/webapp/src
```

Реальный output: пусто. Runtime producer/consumer в `src` отсутствовал. Отдельный точный поиск SQL-callers
вне migrations/generated показал только удаляемые maintenance CLI:

```text
apps/webapp/scripts/seed-saas-test-walkthrough-fixtures.ts:1936:          + (SELECT count(*) FROM integrator.projection_outbox
apps/webapp/scripts/requeue-projection-outbox-dead.ts:34:      `SELECT count(*)::text AS c FROM projection_outbox
apps/webapp/scripts/requeue-projection-outbox-dead.ts:55:      `UPDATE projection_outbox
apps/webapp/scripts/requeue-projection-outbox-dead.ts:69:      `SELECT count(*)::text AS c FROM projection_outbox
apps/webapp/scripts/integrator-schema-cleanup/01_audit.ts:167:        `SELECT count(*)::text AS count FROM integrator.projection_outbox WHERE status IN ('done', 'cancelled')`,
apps/webapp/scripts/integrator-schema-cleanup/01_audit.ts:172:        `SELECT count(*)::text AS count FROM integrator.projection_outbox WHERE status = 'dead'`,
```

Это не живые producer/consumer: requeue был ручным инструментом снятой очереди, audit/seed только считали
строки. Все эти ссылки удалены.

## Release gates и `03_reconcile.ts`: до и после

До правки были прочитаны все файлы, полученные командой:

```bash
rg --files scripts | rg '/stage[^/]*-release-gate\.mjs$' | sort
```

Реальный список: `stage4`, `stage6`, `stage7`, `stage9`, `stage11`, `stage12`. Поиск вызовов показал:

```text
stage4  -> reconcile-person-domain
stage6  -> reconcile-communication-domain
stage7  -> reconcile-reminders-domain
stage9  -> reconcile-appointments-domain
stage11 -> reconcile-subscription-mailing-domain
stage12 -> не вызывает reconcile-команду
```

Ни один gate не вызывает `integrator-schema-cleanup/01_audit.ts`, `03_reconcile.ts`, seed или requeue. До
правки команда

```bash
pnpm --dir apps/webapp exec tsx scripts/integrator-schema-cleanup/03_reconcile.ts --repo-root ../..
```

завершилась `EXIT=0` и напечатала 5 элементов `results`, включая
`integrator.projection_outbox` с `referenceFileCount: 5`. После правки та же команда завершилась `EXIT=0` и
напечатала 4 элемента, без outbox. Уменьшился только собственный список исторического source-reconciler
`5 -> 4`; denominator ни одного release gate не изменился. Повторный точный поиск target-script names по всем
`scripts/stage*-release-gate.mjs` после правки снова дал пустой output.

## Что изменено

- Добавлена `20260820T210709_retire_projection_outbox.sql`: сначала удаляет retired projection-health named
  root, затем таблицу; migration owner markers и verify probe присутствуют, ACL/GRANT/REVOKE/POLICY отсутствуют.
- Удалены обе Drizzle-декларации и integrator re-export.
- Удалены requeue CLI и outbox-счётчики из audit/seed/reconcile.
- Исправлена `api.md` по фактическому `z.enum`: принимаются только `outgoing_delivery`,
  `integrator_push_outbox`, `outgoing_reminder_dispatch`; route не менялся.
- Из `declaration.ts` удалены table entry, function relation surfaces, production surface и retired capability;
  privilege и port-context artifacts перегенерированы штатным CLI.
- P0 grant artifact перегенерирован его собственным generator; immutable tier registry не переписывался — в
  generator добавлен retired-filter D10.
- Из C4/P0/DEV-C7 удалены только outbox ACL/проверки; комментарий DEV-C7 переписан под три оставшихся grant.
- Return-shape census научен учитывать `DROP FUNCTION` в последующем forward-файле, не считая тело из immutable
  PROD snapshot всё ещё живым. Тест одновременно удерживает случай `CREATE new overload + DROP old overload`.

Ничего под `deploy/postgres/generated/prod-to-target/` не изменено (`git status --short --` для каталога —
пусто).

## Финальный repo-wide `rg`

Запрошенная команда с исключением только `docs/` и PROD snapshots:

```bash
rg -n --hidden --glob '!node_modules/**' --glob '!dist/**' \
  --glob '!docs/**' --glob '!deploy/postgres/generated/prod-to-target/**' \
  'projection_outbox|projectionOutbox' .
```

Активных ссылок нет. Выжили только обязательные/immutable записи; реальная агрегация output:

```text
      1 ./.cursor/plans/archive/README.md
      1 ./.cursor/plans/archive/cron_and_system_health.plan.md
     11 ./.cursor/plans/archive/health_ui_operator_actions.plan.md
      8 ./.cursor/plans/archive/health_ui_operator_actions_c49ffef4.plan.md
      3 ./.cursor/plans/archive/integrator_drizzle_migration_master.plan.md
      1 ./.cursor/plans/archive/integrator_drizzle_phase_1_simple_repos.plan.md
     13 ./.cursor/plans/archive/integrator_drizzle_phase_2_outbox_job_queue.plan.md
      2 ./apps/webapp/db/drizzle-migrations/20260820T210709_retire_projection_outbox.sql
```

`.cursor/plans/archive/**` — исторические планы, которые repo canon запрещает переписывать; migration обязана
назвать объект в verify probe и `DROP TABLE`. Контроль активной поверхности той же командой с дополнительными
исключениями этих архивов и самой migration дал пустой output, `ACTIVE_SURFACE_RG_EXIT=1` (ноль совпадений).

## Сохранность соседних grant/revoke — statement-by-statement

Проверено по `git diff -- deploy/postgres/c4-operational-runtime.sql deploy/postgres/p0-5b-grants.sql
deploy/postgres/dev-c7-operational-delivery-worker-schema-table-grants.sql`:

1. C4 initial capability-role `REVOKE ALL`: из первого элемента удалён только outbox; остались
   `integrator.idempotency_keys`, `integrator.user_reminder_occurrences`, `public.outgoing_delivery_queue`,
   `broadcast_audit`, `operator_incidents`, `media_transcode_jobs`, `media_files`, `app_runtime_settings`.
2. C4 login-role `REVOKE ALL`: сохранён тот же соседний набор плюс `public.reminder_rules`.
3. C4 per-table revoke: удалён только отдельный outbox statement; отдельные statements для idempotency,
   delivery queue, media и reminder/incident tables не менялись.
4. C4 positive grants: удалены только два outbox grants. Сохранены `SELECT, UPDATE` на
   `public.outgoing_delivery_queue`, scheduler DML на `integrator.idempotency_keys`, reminder read и media grants.
5. C4 login direct-ACL deny-list: удалено только первое outbox value; все соседние values сохранены.
6. C4 `expected_base`: удалены три outbox ACL rows; `public.outgoing_delivery_queue` SELECT/UPDATE и остальные
   expected rows сохранены.
7. P0 generated table list: между сохранёнными `delivery_attempt_logs`, `idempotency_keys`,
   `integration_data_quality_incidents`, `user_reminder_delivery_logs`, `user_reminder_occurrences` удалена только
   outbox row.
8. DEV-C7: сохранены USAGE на `app`/`integrator`, `SELECT, UPDATE` на `public.outgoing_delivery_queue` и его
   assertion; удалены только outbox grant/assertion.

`integrator.delivery_attempt_logs`, `app.record_operator_delivery_attempt`,
`integrator.direct_public_write_retries`, обе idempotency/delivery очереди не изменялись.

## Проверки

Обязательные проверки брифа:

| Команда | Реальный exit | Результат |
| --- | ---: | --- |
| `node deploy/postgres/privileges/generate-cli.mjs --check` | 0 | обе privileges + allowlist пары совпали побайтно |
| `node scripts/check-c4-migration-owned-function-bodies.mjs` | 0 | `OK` |
| `pnpm --dir apps/integrator exec tsc --noEmit -p tsconfig.json` | 0 | без output |
| `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/integrator exec vitest run"` | 0 | inner command: 99 passed files, 502 passed tests; 4 files/16 tests skipped, 2 expected fail |
| `pnpm --dir apps/webapp exec tsc --noEmit -p tsconfig.json` | 2 | нетронутый `scripts/check-s4-entitlement-coverage.ts:252:6`, TS2352 `null` -> `string` |
| `pnpm --dir apps/webapp run lint` | 0 | 0 errors, 2 warnings в нетронутом `AppointmentPaymentSection.tsx`; все structural gates зелёные |
| `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run"` | 0 | inner command: 413 passed files / 1907 passed tests; 4 files/12 tests skipped |

Дополнительные затронутые гейты:

| Команда | Реальный exit | Результат |
| --- | ---: | --- |
| `node --test deploy/postgres/privileges/function-census.test.mjs` | 0 | 19/19 passed после учёта forward DROP |
| `node deploy/postgres/privileges/generate-cli.mjs --census` | 0 | 218 ACTIVE relations / 3250 source files для каждой из двух managed DB declarations |
| `git diff --check` | 0 | чисто |

Дополнительный полный `tsc -p deploy/postgres/privileges` завершился exit 2 на существующем нетронутом
`declaration.ts` evidence literal (`"exact UPDATE in migration 0050"`). Совмещённый запуск
`port-context-callsite-catalog.test.mjs` завершился exit 1 на существующем dynamic named-root в нетронутом
`operatorDeliveryAttempts.ts:59`; D10 function-census из этого запуска после исправления отдельно прогнан зелёным.

## NOT DONE

- Миграция не применялась; состояние DEV/TEST/PROD не менялось. Её применение и live postcheck выполняет lead.
- Deploy/merge/push не выполнялись.
- Обязательный webapp typecheck остаётся красным на нетронутом baseline-файле, указанном выше; D10 diff его не
  меняет (`git diff --quiet -- scripts/check-s4-entitlement-coverage.ts` -> exit 0).
- Baseline-красные privilege TypeScript/callsite-oracle проверки, не входившие в обязательный список брифа,
  не исправлялись вне D10 scope.

## Независимый аудит commit `5c24a29e4` — 2026-08-21
**Вердикт: PASS. Findings: 0.** Branch patch после merge побайтно соответствует product commit по stable patch-id.
- PASS — один последний timestamp-forward удаляет retired health root и `integrator.projection_outbox`; owner/verify markers есть, ACL/role/policy statements отсутствуют.
- PASS — обе Drizzle-декларации и active caller/producer/consumer/maintenance/deploy references удалены; exact active-surface search пуст.
- PASS — сохранены idempotency, `outgoing_delivery_queue`, direct-write retries, delivery logs, `app.record_operator_delivery_attempt` и посторонние HTTP/service paths.
- PASS — C4/P0/DEV-C7 GRANT/REVOKE просмотрены statement-by-statement: удалены только outbox entries; declaration-derived artifacts byte-consistent.
- PASS — `git diff --name-status feat/doctor-ui-rebuild...HEAD | wc -l` → exit 0, `22`; все paths проверены, immutable `generated/prod-to-target/**` не менялся, history не считалась runtime callers.
- `git diff feat/doctor-ui-rebuild...HEAD | wc -l` → exit 0, `7195`; `git diff --check feat/doctor-ui-rebuild...HEAD` → exit 0.
- `node deploy/postgres/privileges/generate-cli.mjs --check` → 0; `... --all --port-context-only --check` → 0; `node docs/_TODO/SAAS_FOUNDATION/scripts/check-saas-d3-4-bootstrap-base-login-grants.mjs` → 0.
- `node scripts/check-c4-migration-owned-function-bodies.mjs` → 0; `node --test deploy/postgres/privileges/function-census.test.mjs` → 0 (19/19).
- Integrator: `pnpm --dir apps/integrator exec tsc --noEmit -p tsconfig.json` → 0; targeted ESLint/queue-boundary/no-legacy-producer gates → 0/0/0.
- `pnpm --dir apps/integrator run lint` → 1 только на нетронутом `legacyAppointmentProjectionTransport.contract.test.ts`; exact file/config diff proof → 0.
- Webapp: `pnpm --dir apps/webapp run lint` → 0; changed-TS ESLint → 0; `pnpm --dir apps/webapp exec tsc --noEmit -p tsconfig.json` → 1 только на нетронутом `check-s4-entitlement-coverage.ts`; exact file/config diff proof → 0.
- `rg -n --hidden --glob '!.git/**' --glob '!node_modules/**' --glob '!dist/**' --glob '!docs/**' --glob '!.cursor/plans/archive/**' --glob '!apps/webapp/db/drizzle-migrations/**' --glob '!deploy/postgres/generated/prod-to-target/**' 'projection_outbox|projectionOutbox|read_integrator_projection_health' .` → 1 (0 matches).
- Fault injection `forward_drop_ignored`: test exit 1, затем restore-diff 0 и test exit 0; **killed 1, missed 0**.
### NOT DONE
- Full CI не запускался; миграция не применялась; DEV/TEST/PROD не менялись; deploy/merge/push не выполнялись.
