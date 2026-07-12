# ЦЕЛЬ #667 — одна чёткая последовательность деплоя SaaS-изоляции

**Цель:** собрать ОДНУ идемпотентную последовательность (скрипты + порядок), прогнать её на СВЕЖЕМ
прод-дампе до идеального сквозного прохода, чтобы прод потом был turnkey — без плясок с бубном.
Правило: прод НЕ трогаем, пока эта последовательность не проходит на копии ДВАЖДЫ (чистый прогон +
повтор = no-op). Сложный код — Codex (Sol) + регулярный аудит.

## Что уже готово и ПРОВЕРЕНО на копии прода (дамп 2026-07-11 22:15)
- [x] **Data-fix аккаунтов** `deploy/postgres/p0-data-fix-doctor-admin-split.sql` (Codex + мой фикс preflight).
      Прогон на копии: doctor=1, admin=1; b0021a38→doctor(yandex,+79643805480,integrator2);
      новый admin(gmail,без тел); client 1c312a64 (почта стёрта, приёмы удалены); пустые дубли снесены;
      a754c977 остаётся merged. Идемпотентно (повтор = no-op).
- [x] **Правка журнала** `apps/webapp/db/drizzle-migrations/meta/_journal.json` — when 0158–0175 подняты
      выше 0157 (Codex). + guard монотонности в `apps/webapp/scripts/check-drizzle-journal-sync.sh`.
- [x] **Фаза 1 (integrator base + pre-declare) и Фаза 2 (webapp ALL 0115–0175)** проходят на копии:
      webapp применено 176/176, 0143 seed проходит (1 doctor), RLS 0158–0175 включились.
- [x] **Слияние специалистов** `consolidate-specialist-identity.ts --canonical=518ea988` — скрипт готов/тестовый,
      dry-run на копии подтвердил primary=518ea988, dup=c9515025 (218 приёмов вливаются). Запускается ПОСЛЕ migrate.

## Порядок деплоя (черновик последовательности — доводим до «просто проскакивает»)
1. Свежий прод-дамп → (на проде: сначала бэкап).
2. **Создать роли** `app_staff`/`app_patient` (`deploy/postgres/p0-5b-role-split-staff-patient.sql`) и
   app-owner роль для P2-B (по умолчанию `app_owner`), плюс `pgcrypto` в схеме `app_ext` — ДО migrate.
3. **Data-fix аккаунтов** (`p0-data-fix-doctor-admin-split.sql`) — чтобы 0143 прошёл.
4. **migrate-all.sh** (3 фазы: integrator base → webapp ALL → integrator SaaS).
5. **P2-B protected principal context** (`deploy/postgres/p2-b-protected-principal-context.sql`) с
   `p2_b_owner_role=app_owner`, `p2_b_staff_role=app_staff`, `p2_b_patient_role=app_patient`,
   `p2_b_signing_secret` из `P2_B_SIGNING_SECRET` / `DB_PRINCIPAL_SIGNING_SECRET` либо одноразовый для rehearsal.
6. **Слияние специалистов** (`consolidate-specialist-identity --canonical=518ea988 --commit`) — один активный специалист.
7. Пост-проверки: 1 doctor, 1 admin, 1 active specialist, webapp=178+, RLS ENABLE + NO FORCE, org_enrollments заполнены.

## Фаза 3 integrator — РЕШЕНО (Option A), проверено на копии
- **Причина сбоя:** после Фазы 2 на integrator-таблицах FORCE RLS; мигратор `bcb_webapp_prod` (без BYPASSRLS)
  под FORCE RLS не видит строки → backfill писал 0 → `20260710_0001_r2_...not_null` падал на 69 NULL contacts.
- **Решение (Option A, стандарт):** миграции — привилегированная операция → гнать migrate-all под ролью с
  **BYPASSRLS**. Рантайм-безопасность не страдает: приложение после флипа ходит под `app_staff`/`app_patient`
  (без bypassrls), RLS для рантайма остаётся. На копии с BYPASSRLS-мигратором ВСЕ 3 фазы прошли, contacts
  null_org=0/69.
- **Для прода (ops-выбор, нужно подтверждение владельца):** migrate-all запускать под BYPASSRLS-ролью —
  либо `postgres`, либо отдельная migrator-роль с BYPASSRLS (НЕ давать bypassrls рантайм-роли приложения).
- **Опционально на потом (подсказка владельца):** в integrator есть легаси-таблицы — можно пересмотреть R2
  и снять NOT NULL/исключить dead-таблицы из backfill. НЕ блокирует (в single-tenant org просто = дефолт-орг).

## ПРОВЕРЕНО НА КОПИИ ПРОДА (дамп 2026-07-11 22:15), ДВАЖДЫ
Полная последовательность (роли → data-fix → migrate-all[bypassrls] → консолидация) прошла end-to-end:
doctors=1, admins=1, active_specialists=1 (518ea988=233 приёма), webapp=176/176, integrator SaaS=6/6,
integrator.contacts null_org=0/69, be_organization_members=2, FORCE RLS on. Повторный прогон = no-op (стабильно).

## Оставшиеся галочки до «готово»
- [x] Вся последовательность проходит на свежем дампе ДВАЖДЫ (чистый + повтор no-op).
- [ ] Подтверждение владельца: прод-migrate под BYPASSRLS-ролью (postgres / отдельный migrator).
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
- Выбрана миграционная роль с `BYPASSRLS`: `postgres` либо отдельная migrator-роль. Runtime-роль
  `bcb_webapp_prod` не подходит; ей `BYPASSRLS` не выдавать.
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

Источник runtime-env загружается явно до запуска. Затем `DATABASE_URL` заменяется URL привилегированного
мигратора; `scripts/deploy-saas-667.sh` сохраняет экспортированный URL и не даёт `migrate-all.sh` повторно
подхватить runtime DB URL. Значения URL ниже оператор подставляет из защищённого источника; в history их
не сохранять.

```bash
cd /opt/projects/bersoncarebot
set -a && source /opt/env/bersoncarebot/api.prod && source /opt/env/bersoncarebot/webapp.prod && set +a
read -rsp 'SUPERUSER_URL: ' SUPERUSER_URL && echo
read -rsp 'BYPASSRLS migrator DATABASE_URL: ' DATABASE_URL && echo
export SUPERUSER_URL DATABASE_URL
read -rsp 'P2_B_SIGNING_SECRET (optional for rehearsal, required to match locked prod env): ' P2_B_SIGNING_SECRET && echo
export P2_B_SIGNING_SECRET
export API_ENV_FILE=/nonexistent WEBAPP_ENV_FILE=/nonexistent
bash scripts/deploy-saas-667.sh
unset SUPERUSER_URL DATABASE_URL P2_B_SIGNING_SECRET
```

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
`DATABASE_URL` мигратора с `BYPASSRLS` не был заменён runtime URL.
`P2_B_OWNER_ROLE` можно переопределить, если app-owner роль уже выбрана оператором; по умолчанию скрипт
использует `app_owner`, создаёт её как `NOLOGIN NOBYPASSRLS` и выдаёт membership мигратору для `SET ROLE`
в P2-B. Для production `P2_B_SIGNING_SECRET` должен совпадать с будущим `DB_PRINCIPAL_SIGNING_SECRET`;
для rehearsal без locked-runtime допускается одноразовый auto-generated secret.

### Eyeball verification

После повторной загрузки prod env выполнить read-only проверки под той же `BYPASSRLS` migrator-ролью
(иначе FORCE RLS скроет строки integrator):

```bash
set -a && source /opt/env/bersoncarebot/webapp.prod && set +a
read -rsp 'BYPASSRLS migrator DATABASE_URL: ' DATABASE_URL && echo
export DATABASE_URL
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
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
unset DATABASE_URL
```

Ожидается: doctor=1, admin=1; один active specialist —
`518ea988-9b5e-4ad8-8194-a2d98f43bd7b` — с appointments > 0; Drizzle ≥176 и применены все теги
0115–0175; шесть SaaS-строк integrator; NULL `organization_id` отсутствуют во всех R2-таблицах;
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
