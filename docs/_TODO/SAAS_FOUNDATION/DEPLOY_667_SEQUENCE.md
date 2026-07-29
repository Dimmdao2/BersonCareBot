> SUPPORTING / NON-STANDALONE SEQUENCE. Current production entrypoint is
> `docs/_TODO/SAAS_FOUNDATION/SAAS_PROD_DEPLOY_PROCESS.md`. This file does not authorize a cutover or direct
> execution. PROD commands are valid only on `135.106.162.170` (`adelaide`) after explicit owner GO; current
> `151.241.228.122` is DEV/RELAY/TEST and must never source `*.prod` or touch PROD units.
>
> Historical verification snapshot 2026-07-23:
> `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/PRODUCTION_READINESS_LEDGER_2026-07-23.md`.

# ЦЕЛЬ #667 — одна чёткая последовательность деплоя SaaS-изоляции

**Цель:** собрать ОДНУ идемпотентную последовательность (скрипты + порядок), прогнать её на СВЕЖЕМ
прод-дампе до идеального сквозного прохода, чтобы прод потом был turnkey — без плясок с бубном.
Правило: прод НЕ трогаем, пока эта последовательность не проходит на копии ДВАЖДЫ (чистый прогон +
повтор = no-op). Сложный код — Codex (Sol) + регулярный аудит.

> **Текущий executable canon (2026-07-19):** канонический specialist —
> `c9515025-7224-4d9b-86b6-9cb7d26ea503`, одинаково в TEST fresh wrapper, Rubitime one-pass и #667.
> Упоминания `518ea988…` в датированных результатах 11/14 июля ниже сохранены как историческое evidence старого
> disposable прогона и не являются текущей командой. Миграция 0143 может временно seed-ить membership на
> `518ea988…`; текущий consolidation штатно переводит membership и все FK на `c951…`.

## Что уже готово и ПРОВЕРЕНО на копии прода (дамп 2026-07-11 22:15)

- [x] **Data-fix аккаунтов** `deploy/postgres/p0-data-fix-doctor-admin-split.sql` (Codex + мой фикс preflight).
      Прогон на копии: doctor=1, admin=1; b0021a38→doctor(yandex,+79643805480,integrator2);
      новый admin(gmail,без тел); client 1c312a64 (почта стёрта, приёмы удалены); пустые дубли снесены;
      a754c977 остаётся merged. Идемпотентно (повтор = no-op).
- [x] **Правка журнала** `apps/webapp/db/drizzle-migrations/meta/_journal.json` — when 0158–0175 подняты
      выше 0157 (Codex). + guard монотонности в `apps/webapp/scripts/check-drizzle-journal-sync.sh`.
- [x] **Фаза 1 (integrator base + pre-declare) и Фаза 2 (webapp ALL 0115–0175)** проходят на копии:
      webapp применено 176/176, 0143 seed проходит (1 doctor), RLS 0158–0175 включились.
- [x] **Историческое evidence слияния специалистов (устаревший canonical):** старый dry-run использовал
      `--canonical=518ea988` и видел `c9515025` дублем. Текущая executable chain намеренно сходится в обратную,
      уже установленную identity `c951…`; старую сконсолидированную disposable-БД нельзя переворачивать на месте —
      нужен новый fresh restore.

## Свежая проверка на dump 2026-07-14 04:15

- [x] `scripts/deploy-saas-667.sh` прошел полностью на disposable DB
      `bcb_webapp_dev_rubitime_fresh_20260714_041501_owner2`, восстановленной из
      `/opt/backups/postgres/hourly/unified_bcb_webapp_prod_20260714_041501.dump`.
- [x] `p0-data-fix-doctor-admin-split.sql` теперь до миграций архивирует только identifier-less active admin stubs:
      `role='admin'`, live, без `email_normalized`, `phone_normalized`, `integrator_user_id` и без login/channel/oauth/password/pin/token
      anchors. На свежем dump archived stubs = 2; итоговый active admin = 1.
- [x] Post-state assertions: doctor=1, admin=1, active specialist=1, Drizzle=181, required memberships=2,
      `contacts_null_org=0`, runtime-owner после trap = `NOSUPERUSER NOBYPASSRLS`.

## Порядок деплоя (option D — owner-мigration + временная эскалация)

1. Свежий прод-дамп → (на проде: сначала бэкап).
2. **Создать роли** `app_staff`/`app_patient` (`deploy/postgres/p0-5b-role-split-staff-patient.sql`) и
   app-owner роль для P2-B (по умолчанию `app_owner`), плюс `pgcrypto` в схеме `app_ext` — ДО migrate.
   На этом же superuser-шаге выдать `GRANT USAGE ON SCHEMA app_ext TO app_owner`, временно включить
   `BYPASSRLS` для runtime-owner мигратора и временно выдать ему membership в `app_owner`.
3. **Data-fix аккаунтов** (`p0-data-fix-doctor-admin-split.sql`) — чтобы 0143 прошёл.
4. **migrate-all.sh** под runtime-owner ролью `bcb_webapp_prod` (3 фазы: integrator base → webapp ALL →
   integrator SaaS). Временный `BYPASSRLS` нужен только для integrator R2 backfill под включённым/FORCE RLS.
5. **Нормализовать ownership** после migrate: `ALTER SCHEMA app OWNER TO app_owner` и
   `ALTER FUNCTION app.is_staff() OWNER TO app_owner`, потому что 0175 временно оставляет их за
   `CURRENT_USER` мигратора.
6. **P2-B protected principal context** (`deploy/postgres/p2-b-protected-principal-context.sql`) с
   `p2_b_owner_role=app_owner`, `p2_b_staff_role=app_staff`, `p2_b_patient_role=app_patient`,
   `p2_b_signing_secret` из `P2_B_SIGNING_SECRET` / `DB_PRINCIPAL_SIGNING_SECRET` либо одноразовый для rehearsal.
7. **Слияние специалистов** (`consolidate-specialist-identity --canonical=c9515025-7224-4d9b-86b6-9cb7d26ea503 --commit`) — один активный специалист; старый `518…` становится неактивным дублем.
8. **Auto-revoke + post-state assertions**: снять `BYPASSRLS` и membership `app_owner` с мигратора
   (явно на success + `EXIT` trap на failure), затем проверять post-state через `SUPERUSER_URL`.

## Фаза 3 integrator / webapp owner DDL — РЕШЕНО (Option D)

- **Почему отдельная BYPASSRLS-роль больше не подходит:** prod baseline применяет 0115..0177 впервые,
  а таблицы prod принадлежат runtime-роли `bcb_webapp_prod`. Миграция 0140 делает
  `ALTER SEQUENCE ... OWNED BY be_patient_packages.display_number`, где PostgreSQL требует одного owner
  у sequence и table. Миграции 0160..0175 выполняют `ALTER TABLE`/`CREATE POLICY`, это owner-only DDL;
  `BYPASSRLS` не даёт права владельца.
- **Почему runtime-owner без эскалации тоже не подходит:** integrator R2 backfill должен видеть строки под
  включённым/FORCE RLS, иначе получаются NULL `organization_id` перед NOT NULL.
- **Решение:** вся цепочка `data-fix → migrate-all → p2-b → consolidation` идёт под `DATABASE_URL`,
  где `current_user` = owner репрезентативных prod-таблиц (`bcb_webapp_prod`). Внутри остановленного
  maintenance-window superuser-шаг временно делает `ALTER ROLE bcb_webapp_prod BYPASSRLS` и
  `GRANT app_owner TO bcb_webapp_prod`; скрипт снимает оба права через `EXIT` trap и явный финальный
  revoke перед post-state assertions.
- **End-state:** `bcb_webapp_prod` снова `NOBYPASSRLS` и не член `app_owner`; схема `app`,
  `app.is_staff()` и P2-B protected helpers принадлежат `app_owner` (`NOLOGIN`, trusted, `BYPASSRLS`).
  Runtime-роли `app_staff`/`app_patient` ничего не владеют.
- **Опционально на потом (подсказка владельца):** в integrator есть легаси-таблицы — можно пересмотреть R2
  и снять NOT NULL/исключить dead-таблицы из backfill. НЕ блокирует (в single-tenant org просто = дефолт-орг).

## REHEARSAL FACTS (дамп 2026-07-11 22:15)

Старый план с отдельной BYPASSRLS-ролью признан невалидным: он не проходит owner-only DDL в 0140 и
0160–0175. Prod-faithful rehearsal option D (migrate as runtime owner + temporary BYPASSRLS) прошёл
data-fix, все webapp Drizzle 0115–0177 и integrator I1–I4/R2, затем упал в P2-B на
`GRANT USAGE ON SCHEMA app_ext TO :"p2_b_owner_role"`: schema `app_ext` создаётся superuser-шагом, а
grant выполнялся уже non-superuser мигратором. Текущий фикс переносит этот grant в superuser Step 1 и
добавляет normalization/revoke assertions; после него нужен повторный clean + no-op rehearsal.

## Оставшиеся галочки до «готово»

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- [ ] Вся последовательность option D проходит на свежем дампе ДВАЖДЫ (чистый + повтор no-op) после
      переноса `app_ext` grant и normalization/revoke правок.
- [x] Роль для prod-migrate зафиксирована: runtime-owner `bcb_webapp_prod` с временной auto-revoked
      эскалацией `BYPASSRLS` + `app_owner` внутри stopped-writers окна.
- [x] Собрать ВСЮ последовательность в один скрипт с pre/post-проверками (Codex).
- [ ] Финальный аудит последовательности + кода (Codex Sol).
- [x] Прод-runbook (точные команды, порядок, роль, rollback) — готов к исполнению без импровизации.

## PROD EXECUTION

### TEST FIRST — обязательно

До планирования production-окна выполнить всю последовательность на TEST-сервере: остановить его
DB-writer units, восстановить TEST-БД из **свежего** production dump, запустить
`scripts/deploy-saas-667.sh` и проверить post-state. Production разрешён только после полного зелёного
TEST-прогона на этом dump и том же коммите. TEST и PROD используют свои env, БД и systemd units; prod env
на TEST не загружать.

### Preconditions

- TEST-first прогон на свежем production dump завершён успешно.
- `DATABASE_URL` указывает на runtime-owner роль `bcb_webapp_prod` в целевой БД. Скрипт preflight-проверкой
  сверяет `current_user` с owner таблицы `public.be_patient_packages`.
- `SUPERUSER_URL` указывает на ту же БД и нужен только для подготовки ролей/schema, временной эскалации,
  нормализации ownership, auto-revoke и post-state assertions.
- Команды выполняются из `/opt/projects/bersoncarebot` на нужном коммите. Скрипт идемпотентен и может
  быть запущен повторно.

### Maintenance window: stop all DB writers

До backup и запуска последовательности остановить все production units, способные писать в БД:

```bash
sudo systemctl stop bersoncarebot-webapp-prod.service \
  bersoncarebot-api-prod.service \
  bersoncarebot-worker-prod.service \
  bersoncarebot-scheduler-prod.service \
  bersoncarebot-media-worker-prod.service
sudo systemctl is-active bersoncarebot-webapp-prod.service \
  bersoncarebot-api-prod.service \
  bersoncarebot-worker-prod.service \
  bersoncarebot-scheduler-prod.service \
  bersoncarebot-media-worker-prod.service
```

Последняя команда должна вернуть `inactive` для каждого unit. Затем проверить отсутствие оставшихся
активных DB-writer sessions привилегированным соединением (разрешены только текущая `psql`-сессия и
явно известные operator/backup sessions; любые runtime sessions блокируют продолжение):

```bash
cd /opt/projects/bersoncarebot
set -a && source /opt/env/bersoncarebot/webapp.prod && set +a
read -rsp 'SUPERUSER_URL: ' SUPERUSER_URL && echo
export SUPERUSER_URL
psql "$SUPERUSER_URL" -X -v ON_ERROR_STOP=1 -P pager=off -c \
  "SELECT pid, usename, application_name, state FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND backend_type = 'client backend';"
unset SUPERUSER_URL
```

Если выборка не пуста и сессия не идентифицирована как operator/backup, остановить rollout и выяснить
источник. После этого сделать свежий pre-run backup и подтвердить наличие dump:

```bash
sudo /opt/backups/scripts/postgres-backup.sh pre-migrations
ls -lh /opt/backups/postgres/pre-migrations/*.dump
```

### Run

Источник runtime-env загружается явно до запуска. `DATABASE_URL` остаётся runtime-owner URL
(`bcb_webapp_prod`); отдельную BYPASSRLS-роль не использовать. `scripts/deploy-saas-667.sh` временно
эскалирует именно эту роль через `SUPERUSER_URL`, затем автоматически снимает эскалацию.
Значения URL ниже оператор подставляет из защищённого источника; в history их не сохранять.

```bash
cd /opt/projects/bersoncarebot
set -a && source /opt/env/bersoncarebot/api.prod && source /opt/env/bersoncarebot/webapp.prod && set +a
read -rsp 'SUPERUSER_URL: ' SUPERUSER_URL && echo
export SUPERUSER_URL
read -rsp 'P2_B_SIGNING_SECRET (optional for rehearsal, required to match locked prod env): ' P2_B_SIGNING_SECRET && echo
export P2_B_SIGNING_SECRET
export API_ENV_FILE=/nonexistent WEBAPP_ENV_FILE=/nonexistent
bash scripts/deploy-saas-667.sh
unset SUPERUSER_URL P2_B_SIGNING_SECRET
```

The version-matched `deploy-saas-667.sh` chain runs
`deploy/postgres/c4d-platform-lfk-media-owner-online-index.sql` immediately after the Drizzle chain commits and
while writers remain stopped. This is the mandatory one-time production-cutover path for the C4D
`media_files(owner_kind, organization_id, status, created_at DESC)` index: it is concurrent, idempotent and outside
the Drizzle transaction. The artifact fails closed on a valid same-name index with any other table, column order or
predicate instead of replacing it silently. Do not replace it with a blocking index inside migration `0217` or an
ad hoc SQL command.

Units остаются остановленными до успешного завершения всех post-state assertions. После `✅ ALL GREEN`
запустить writers и проверить их состояние:

```bash
sudo systemctl start bersoncarebot-api-prod.service \
  bersoncarebot-worker-prod.service \
  bersoncarebot-scheduler-prod.service \
  bersoncarebot-webapp-prod.service \
  bersoncarebot-media-worker-prod.service
sudo systemctl is-active bersoncarebot-api-prod.service \
  bersoncarebot-worker-prod.service \
  bersoncarebot-scheduler-prod.service \
  bersoncarebot-webapp-prod.service \
  bersoncarebot-media-worker-prod.service
```

`BOOKING_URL` приходит из prod env. Для rehearsal скрипт по умолчанию ставит
`BOOKING_URL=http://localhost:3000` и оба env-path в `/nonexistent`; это предотвращает случайное чтение
prod env. На prod env загружается блоком выше, а повторное sourcing отключается специально, чтобы
`DATABASE_URL` runtime-owner мигратора не был заменён другим env-файлом во время chain.
`P2_B_OWNER_ROLE` можно переопределить, если app-owner роль уже выбрана оператором; по умолчанию скрипт
использует `app_owner`, создаёт её как `NOLOGIN BYPASSRLS`, выдаёт membership мигратору только внутри
stopped-writers окна и снимает membership до post-state assertions. Для production `P2_B_SIGNING_SECRET` должен совпадать
с будущим `DB_PRINCIPAL_SIGNING_SECRET`;
для rehearsal без locked-runtime допускается одноразовый auto-generated secret.

### Eyeball verification

После повторной загрузки prod env выполнить read-only проверки через `SUPERUSER_URL`, потому что
`BYPASSRLS` у runtime-owner уже должен быть снят:

```bash
set -a && source /opt/env/bersoncarebot/webapp.prod && set +a
read -rsp 'SUPERUSER_URL: ' SUPERUSER_URL && echo
export SUPERUSER_URL
psql "$SUPERUSER_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
SELECT role, count(*)
FROM public.platform_users
WHERE role IN ('doctor', 'admin') AND merged_into_id IS NULL AND is_archived IS FALSE
GROUP BY role ORDER BY role;

SELECT s.id, s.is_active, count(a.id) AS appointments
FROM public.be_specialists s
LEFT JOIN public.be_appointments a ON a.specialist_id = s.id
GROUP BY s.id, s.is_active ORDER BY s.is_active DESC, s.id;

SELECT count(*) AS drizzle_migrations FROM drizzle.__drizzle_migrations;

SELECT version
FROM integrator.schema_migrations
WHERE regexp_replace(version, '^core:', '') IN (
  '20260707_0001_p0_4_i0_integrator_org_columns_predeclare.sql',
  '20260708_0001_p0_4_i1_integrator_direct_user_org.sql',
  '20260708_0002_p0_4_i2_integrator_identity_path_org.sql',
  '20260708_0003_p0_4_i3_integrator_parent_denorm_org.sql',
  '20260708_0004_p0_4_i4_integrator_mailings_org.sql',
  '20260710_0001_r2_integrator_scoped_org_not_null.sql'
) ORDER BY version;

SELECT count(*) AS contacts_null_org FROM integrator.contacts WHERE organization_id IS NULL;
SELECT count(*) AS organization_members FROM public.be_organization_members;
SQL
unset SUPERUSER_URL
```

Ожидается: doctor=1, admin=1; один active specialist —
`518ea988-9b5e-4ad8-8194-a2d98f43bd7b` — с appointments > 0; Drizzle ≥178 и применены все теги
0115–0177; шесть SaaS-строк integrator; NULL `organization_id` отсутствуют во всех R2-таблицах;
обязательные doctor/admin memberships корректны (дополнительные легитимные members допустимы).

### Rollback

Data-fix, миграции и consolidation считаются одним логическим изменением: при необходимости отката
остановить rollout и восстановить БД целиком из pre-run backup. Не пытаться откатывать части вручную.

Dormant-роли P0.5b имеют отдельный down mode (запускать суперпользователем после восстановления БД):

```bash
cd /opt/projects/bersoncarebot
read -rsp 'SUPERUSER_URL: ' SUPERUSER_URL && echo
psql "$SUPERUSER_URL" -X -v ON_ERROR_STOP=1 -v p0_5b_down=1 \
  -f deploy/postgres/p0-5b-role-split-staff-patient.sql
unset SUPERUSER_URL
```
