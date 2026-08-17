# Скрипты webapp (`apps/webapp/scripts`)

Утилиты для миграций данных, сверок, разовых правок и админ-операций. Запуск — обычно через `pnpm --dir apps/webapp exec tsx scripts/<file> …` с корректным `DATABASE_URL` (см. шапки файлов и [`docs/ARCHITECTURE/SERVER CONVENTIONS.md`](../../../docs/ARCHITECTURE/SERVER%20CONVENTIONS.md)).

**Схема БД webapp:** канонический прогон — `pnpm --dir apps/webapp run migrate` (Drizzle через `run-webapp-drizzle-migrate.mjs`). Legacy SQL из каталога `apps/webapp/migrations/` — только emergency/bootstrap путь через `pnpm --dir apps/webapp run migrate:legacy` (`run-migrations.mjs`) с явным режимом `WEBAPP_LEGACY_MIGRATIONS_MODE=bootstrap|emergency`.

CI guardrail: `check-legacy-migrations-frozen.sh` блокирует добавление новых legacy-файлов с префиксом выше текущего baseline (`086_*`). Для штатных изменений схемы используйте только `apps/webapp/db/drizzle-migrations/*.sql`.

**Напоминания и админ-настройки (`reminder_*`, `system_settings`, projection):** канон DDL только Drizzle и согласование с integrator — см. [`docs/RULES/REMINDERS_SETTINGS_DRIZZLE_ONLY/README.md`](../../../docs/RULES/REMINDERS_SETTINGS_DRIZZLE_ONLY/README.md) и [`STAGE_PLAN.md`](../../../docs/RULES/REMINDERS_SETTINGS_DRIZZLE_ONLY/STAGE_PLAN.md).

**Процесс `pnpm worker:start` (integrator)** эти файлы **не запускает**. Он гоняет job queue и projection outbox → события уходят в webapp по HTTP и обрабатываются продуктовым кодом (tier/trust там же, что при webhook). Подробнее: [`PLATFORM_IDENTITY_OPS.md`](PLATFORM_IDENTITY_OPS.md) §3.

## Идентичность, телефон и tier patient (обход UI)

Любой SQL или скрипт, меняющий `platform_users` и телефон, может рассинхронизировать продуктовую модель **guest / onboarding / patient**, если не учесть колонку **`patient_phone_trust_at`**.

- **[PLATFORM_IDENTITY_OPS.md](PLATFORM_IDENTITY_OPS.md)** — обязательный чек-лист: когда выставлять доверие, предпочтение продуктовых путей merge/purge, что делать с backfill-скриптами.
- Карта trusted writers в коде и контекст: [`docs/ARCHITECTURE/PLATFORM_IDENTITY_SCENARIOS_AND_CODE_MAP.md`](../../../docs/ARCHITECTURE/PLATFORM_IDENTITY_SCENARIOS_AND_CODE_MAP.md) §8.
- Управление пользователем по номеру (очистка, перенос, integrator): **[user-phone-admin.ts](user-phone-admin.ts)** (в шапке — команды и переменные окружения).

Patient-invite disposable proof retired with the B0 baseline; no disposable bootstrap is an active script path.

## Прочие файлы

**SaaS S3 TEST fixture:** [`seed-saas-test-walkthrough-fixtures.ts`](seed-saas-test-walkthrough-fixtures.ts)
транзакционно и идемпотентно восстанавливает manifest v2: многопрофильную клинику A (управляющий и два
специалиста, пять пациентов) и соло-клинику B (один специалист, три пациента). Representative patient каждой
клиники имеет отдельный email-login; fixture также содержит услуги, прошлые/будущие записи, абонементы с
историей списаний, программы упражнений, разные варианты отметок выполнения и данные графиков. Очистка
ограничена repo-reserved персонами/ID и не удаляет произвольные строки всей клиники.
Shared patient состоит в обеих клиниках; public booking получает branch/availability/hours и два
deterministic legacy `branchServiceId` mapping, а System Health — отдельный global-admin login.
Shared patient также имеет свой reserved `.test` email/password credential; пароль повторно использует
защищённый Clinic A packet key, поэтому нового секрета нет. Детерминированные login/context/route/viewport
ссылки лежат в `SAAS_TEST_FIXTURE_MANIFEST.operatorRefs`; operator walkthrough описан в
[`ST-02_WALKTHROUGH.md`](../../../docs/_TODO/SAAS_FOUNDATION/OWNER_READY_TEST/ST-02_WALKTHROUGH.md).
Для U5A live recovery отдельный
[`patient-organization-test-lifecycle.ts`](patient-organization-test-lifecycle.ts) может обратимо перевести только
reserved shared-patient enrollment клиники B между `active` и `discharged`. Он требует exact
`bersoncarebot_test`, sanctioned `SAAS_ISOLATION_OPERATOR_DATABASE_URL`, явный `--execute` и закрытую ephemeral
capability от root-only wrapper `deploy/host/run-u5a-patient-organization-test-lifecycle.sh`. Operator login
из URL обязан совпасть с `session_user` и `current_user`, иметь только canonical
`saas_telemetry_operator` membership и не иметь прямых table grants. URI `options` запрещён до соединения, а
libpq `PG*` окружение очищается на каждой psql/Node границе. Operator вызывает только SECURITY DEFINER function;
wrapper снимает function в EXIT cleanup. Function использует существующий узкий `app_owner` ACL из canonical
patient-invites strict overlay; новых table grants, BYPASS-ролей и seeder elevation не создаёт.
`restore --execute` является обязательным data cleanup после проверки. Это TEST fixture control, не продуктовый
enrollment writer.
Store/payment использует только `fixture_noop`, уведомления выключены. Media rows имеют `s3_key IS NULL`
и ссылаются на коммиченный `public/test-fixtures/saas-exercise.svg`: `/api/media/[id]` отдаёт его
только для exact DB `bersoncarebot_test`, а playback descriptor возвращает same-origin URL. Внешние S3
и каналы доставки не вызываются.
Запускается только из `deploy/host/deploy-test-saas.sh` в узком controlled owner+BYPASSRLS reconciliation
window с обязательным cleanup, требует explicit
`SAAS_TEST_FIXTURE_ENABLED=1` и четыре credential key из защищённого внешнего TEST operator packet. Скрипт
проверяет `current_database() = bersoncarebot_test`, не делает внешних вызовов и не печатает реквизиты/ID.
Добавленные специалисты A и representative patients используют пароль своей клиники только внутри
зарезервированных `.test`-аккаунтов; secret packet остаётся неизменным.
Packet никогда не shell-source-ится: единый parser требует non-symlink `root:deploy 0640`, ровно пять
JSON-quoted ключей и отклоняет unknown/duplicate/malformed/shell-конструкции.
Канон: `docs/_TODO/SAAS_FOUNDATION/HARD_MIGRATION_PROTOCOL.md`.

**Protected product-smoke fixture — canonical public slots:** если versioned smoke contract добавил
`publicBookingBranchId` + `publicBookingClinicServiceId`, внешний `/run/bersoncarebot/saas-smoke.fixture` обновляется
только root/operator entrypoint `deploy/host/update-saas-product-smoke-fixture-canonical-slots.sh`. Он принимает
только exact TEST checkout/env/DB, выполняет read-only разрешение одной активной same-org canonical пары по уже
сохранённому public slug и legacy ref, не печатает opaque refs, прогоняет существующие metadata validator и offline
`--check-fixture`, сохраняет защищённый `.previous` и заменяет файл атомарно. Полная команда и recovery boundary:
`docs/_TODO/SAAS_FOUNDATION/SAAS_PRODUCT_SMOKE_FIXTURE_OPERATOR_PACKET.md`.

Остальные скрипты (`backfill-*`, `reconcile-*`, `*.sql`, …) — назначение и параметры в комментариях в начале каждого файла.

**Rubitime выведено 2026-07-27.** Старые mapping/CSV one-shot удалены из `apps/webapp/scripts` и не являются
доступными operator-командами. Исторические планы и результаты собраны только для чтения в
[`docs/archive/2026-07-rubitime-retirement/`](../../../docs/archive/2026-07-rubitime-retirement/README.md);
восстанавливать или запускать удалённые инструменты по архивным инструкциям нельзя.

**Фон CMS-медиа (превью):** [`media-preview-process-tick.ts`](media-preview-process-tick.ts) — батч `processMediaPreviewBatch` вне Next; запуск `pnpm run media-preview:tick` (см. `deploy/HOST_DEPLOY_README.md`, `docs/MEDIA_PREVIEW_PIPELINE.md`).

**Программы лечения — битые снимки после editor-batch:** [`backfill-treatment-program-editor-draft-snapshots.ts`](backfill-treatment-program-editor-draft-snapshots.ts) — пересборка `treatment_program_instance_stage_items.snapshot` из каталога (`buildSnapshot`); runbook: [`docs/OPERATIONS/TREATMENT_PROGRAM_EDITOR_DRAFT_SNAPSHOT_BACKFILL.md`](../../../docs/OPERATIONS/TREATMENT_PROGRAM_EDITOR_DRAFT_SNAPSHOT_BACKFILL.md). Команда: `pnpm run backfill-treatment-program-editor-draft-snapshots` (dry-run, `--commit` для записи; `--all` — все кандидаты батчами).

## SaaS isolation diagnostics

`report-saas-isolation-diagnostics.ts` accepts only closed, redacted classes and normalized route/job-family keys.
Event writes use the ambient EXECUTE-only writer role; `read` and `coverage` require the separate infrastructure
login in `SAAS_ISOLATION_OPERATOR_DATABASE_URL`. Ambient app/bootstrap roles cannot read, record coverage or resolve.
Run `pnpm --dir apps/webapp exec tsx scripts/report-saas-isolation-diagnostics.ts read`; coverage also requires a
caller-generated UUID `--id`. SQL, payloads and identity fields are never accepted.

For the owner-ready TEST walkthrough, the same CLI has a reversible protected scenario command:
`pnpm --dir apps/webapp run diagnostics:saas-isolation -- scenario --state <okay|incomplete|critical|clean>`.
The database function refuses every database except exact `bersoncarebot_test`, is executable only by the separate
operator role, and changes only reserved `test-fixture:v3:*` diagnostics rows and three reserved coverage UUIDs.
The executable wrapper
`pnpm --dir apps/webapp run diagnostics:saas-isolation:test-scenarios -- --execute` verifies
`okay → incomplete → critical` and always invokes `clean` plus a reserved-row count assertion in `finally`.
`--prove-cleanup-on-injected-failure` intentionally stops after `incomplete`, then proves the same cleanup path.
Both modes preflight exact `bersoncarebot_test` and the separate least-privilege operator membership before writes;
they never print the connection URL. Cleanup does not delete or resolve real diagnostics events. Because real active
events remain authoritative, `okay` intentionally cannot mask an existing genuine critical signal.

The shared TEST deploy closure invokes the generic `post-runtime-gate` command only after locked services, health,
nginx and product smoke have passed. It reads diagnostics before recording coverage, records all six required process
families, and rereads the exact fresh run. Active unexplained events fail before or after the write; output contains
only status/counts and never the coverage UUID, event identifiers, database URL, SQL or identity data.
