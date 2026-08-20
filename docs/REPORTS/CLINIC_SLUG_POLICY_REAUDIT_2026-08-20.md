# Переаудит `1462b777d` + `2aef51058` — 20.08

**Вердикт: PASS по обоим фиксам (Ф2, Ф3), F1 повторно измерена и остаётся незакрытой той же чужой
причиной.** Свежих регрессий не найдено. Найдена одна деталь окружения этого воркдерева (устаревший
`.next/dev/types`), не связанная с аудируемыми коммитами — задокументирована отдельно и не блокирует.

Ветка: `wt/clinic-public-page-20260819`, `/home/dev/dev-projects/bcb-wt-clinic-public-page-20260819`,
голова на момент прохода — `8f54b5047`. Оракул — `docs/_TODO/CLINIC_PUBLIC_PAGE_AND_URL_FLIP_2026-08-19.md`
§14. Проверялись коммиты `1462b777d` (фикс) и `2aef51058` (запись в аудит-документ).

---

## 1. Ф1 переизмерена — вывод не изменился, но причина проверена живьём заново

Утверждение `2aef51058`: reconcile внутри `migrate-dev.sh --execute` падает ДО изменения прав на
четырёх SECURITY DEFINER функциях публичной воронки бронирования, которые есть в живом DEV, но не
объявлены ни в этой ветке, ни в `feat/doctor-ui-rebuild`.

**Замер сегодня, не по памяти.**

```
grep -c "enroll_current_patient_in_public_booking_clinic\|resolve_public_booking_client_by_phone\|revoke_public_booking_enrollment\|assert_org_patient_count_quota_available" deploy/postgres/privileges/declaration.ts
→ 0
```

```sql
select p.proname, p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='app' and p.proname in (
 'enroll_current_patient_in_public_booking_clinic','resolve_public_booking_client_by_phone',
 'revoke_public_booking_enrollment','assert_org_patient_count_quota_available');
→ все четыре, prosecdef=t (живы на bcb_webapp_dev)
```

`git log --oneline --all | grep public-booking-write` показывает ветку `wt/public-booking-write-20260819`
живой и с коммитами, но **ни одного `merge(public-booking-write...)` в историю `feat/doctor-ui-rebuild`
нет** — ровно то расхождение, что описал `2aef51058`, сегодня физически не изменилось: чужая ветка всё
ещё не в `feat`.

**Живой прогон census-проверки** (тот же блок SQL, что генератор кладёт в
`deploy/postgres/generated/privileges.bcb_webapp_dev.sql:7930-7978`, вырезан и прогнан в
`BEGIN…ROLLBACK`, ничего не меняет):

```
psql:/tmp/census_full.sql:439: ERROR:  function census catalog mismatch:
...
undeclared SECURITY DEFINER function: app.assert_org_patient_count_quota_available(uuid)
undeclared SECURITY DEFINER function: app.enroll_current_patient_in_public_booking_clinic(uuid,text)
undeclared SECURITY DEFINER function: app.resolve_public_booking_client_by_phone(text,text,boolean)
undeclared SECURITY DEFINER function: app.revoke_public_booking_enrollment(uuid)
```

**F1 подтверждена НЕ закрытой сегодня**, той же причиной, что и вчера: ветка-источник этих функций не
влита в `feat`, поэтому reconcile на DEV не пройдёт никто, и колоночный `INSERT (initiated_by)` для
`app_staff` не будет выдан.

**Побочная находка (не Ф1, не блокер этого прохода — фиксирую честно).** Та же живая проверка
одновременно вскрыла ВТОРУЮ, независимую причину, по которой reconcile сегодня тоже упадёт: восемь
gap-строк по `app_seam_public_clinic_card_owner` (`current_actor_user_id`, `current_org_id`,
`read_public_clinic_card`, `save_public_clinic_card` и другие — фактический владелец на DEV всё ещё
`app_seam_public_slug_owner`, декларация этой ветки уже ждёт `app_seam_public_clinic_card_owner`). Это
СОБСТВЕННАЯ незаведённая работа этой ветки (Ш2 визитки клиники), а не чужое расхождение — reconcile на
DEV сегодня упал бы даже без ветки `public-booking-write`. К вопросу «закрываема ли F1 сейчас» это
ничего не меняет (ответ всё равно «нет»), но означает, что когда чужая ветка сведётся, останется ещё один
самостоятельный шаг — привести владельца этих функций в декларации в соответствие с DEV или наоборот.

---

## 2. Миграция `0048`: состояние DEV идентично файлу, порядок безопасен

### 2a. DEV не разошёлся с файлом

```
sha256sum apps/webapp/db/drizzle-migrations/0048_a_lifetime_allowance_counted_by_join_is_not_lifetime.sql
→ 228d8d4d652bca0248b084e6d69d5ee59dca3c8eb6108f9eca339f38de4c49dd
```
```sql
select hash from drizzle.__drizzle_migrations where created_at=1800000060000;  -- bcb_webapp_dev
→ 228d8d4d652bca0248b084e6d69d5ee59dca3c8eb6108f9eca339f38de4c49dd   -- побайтное совпадение
```
Колонка и CHECK на DEV читаются побайтно как в файле:
```
initiated_by | NO (not null) | 'clinic'::text | text
organization_slug_rename_events_initiated_by_check: CHECK ((initiated_by = ANY (ARRAY['clinic'::text, 'platform_admin'::text])))
```
Живые строки (2 шт.) — обе `initiated_by='clinic'`. **Дрейфа нет.**

### 2b. Номер 0048 меньше уже применённого 0049 — не опасно, и не по случайности

С прошлого аудита порядок применения миграций **переписан** (ветка `wt/migration-timestamp-20260819`,
влита в `feat`, коммит `dc4d046fa` и переименования `063950f82`/`039fb1fa6` в этой истории). Новый
источник истины — `deploy/postgres/privileges/migration-order.mjs`:

> «ORDER IS THE FILE NAME... APPLIED IS "THE LEDGER NAMES IT"... A migration that arrives from a branch
> with a name BELOW everything already applied is therefore ordinary pending work, not a permanent hole.»

Раньше (что и поймал первый аудит) применение шло по водяному знаку `created_at`, и файл с меньшим
номером, но большим `when`, требовал ОСОБОГО порядка. Сейчас `pending` считается по имени тега в
леджере, а не по `when` — старый класс опасности («номер меньше, а уже применённое новее») закрыт самой
архитектурой, а не соглашением.

Замер (реальный раннер, не журнал-скрипт из старого отчёта):
```
node deploy/postgres/privileges/migrate-local.mjs --sudo-postgres --db bcb_webapp_dev \
  --migrator bcb_dev_migrator --drizzle-folder apps/webapp/db/drizzle-migrations --rollback-only
→ Drizzle owner-ordered migration already current for "bcb_webapp_dev": pending=0 total=54 verified-objects=83 foreign-ledger-rows=5

node deploy/postgres/privileges/migrate-local.mjs --sudo-postgres --db bersoncarebot_test \
  --migrator bcb_test_migrator --drizzle-folder apps/webapp/db/drizzle-migrations --rollback-only
→ Drizzle owner-ordered migration validated and rolled back for "bersoncarebot_test": pending=4 total=54 reapplied=0 foreign-ledger-rows=0
```
На TEST реально pending — `0048` и три файла соседних веток с таймштамп-именами (все лексикографически
после `0048`, применяются следом). `--rollback-only` прогнал полный DDL всех четырёх в одной транзакции
и откатил её — единственные `NOTICE` были ожидаемые `constraint ... does not exist, skipping` от
`DROP CONSTRAINT IF EXISTS` на ещё не созданных объектах. Ноль ошибок. **Применение `0048` после `0049`
безопасно, доказано живым прогоном, не только по коду.**

(Побочно: прямой вызов `readMigrationFolder`/`selectPendingMigrations` в обход `bootstrapLedger` на DEV
даёт ложный `pending=1` — потому что леджерная строка `0048` на DEV легла ДО того, как в базу приехала
колонка `tag`, и осталась непомечена. Настоящий раннер сначала гоняет `bootstrapLedger`, который метит
её по частотной карте `meta/_journal.json` — после него `pending=0`, что и показал прогон выше. Не
находка против кода, только против ручного вызова функций без обвязки.)

---

## 3. Бэкфилл идемпотентен — доказано и живым прогоном, и независимой инъекцией

Штатный прогон:
```
RUN_MIGRATION_BACKFILL_DB=1 node --test deploy/postgres/privileges/migration-backfill-idempotence.devDbProof.test.mjs
→ tests 2, pass 2, fail 0
```
`ok 1` — второй прогон миграции не переписывает уже проставленный штамп. `ok 2` — самопроверка пробы:
встроенный в тест исторический безусловный `UPDATE` красит её и называет ровно одну строку.

**Независимая инъекция (не встроенная самопроверка теста, а правка настоящего файла миграции).** В
`0048_a_lifetime_allowance_counted_by_join_is_not_lifetime.sql` дописан хвостом тот самый безусловный
`UPDATE … CASE WHEN EXISTS (…членство…)`, прогнан тот же тест:
```
expected: []
actual: 0: 'c49f6c19-ff73-4128-bd7f-5b28df4fe48f:clinic->platform_admin'
tests 2, pass 1, fail 1
```
Тест красный и называет строку — свойство ловится не только через встроенную самопроверку, но и через
правку реального файла. Откат:
```
cp /tmp/0048.orig.sql apps/webapp/db/drizzle-migrations/0048_a_lifetime_allowance_counted_by_join_is_not_lifetime.sql
git status --short   → пусто
```
Дерево чистое.

---

## 4. Запрет GRANT/REVOKE/роль/политика в миграции — держит

```
grep -niE "^\s*(GRANT|REVOKE|CREATE ROLE|ALTER ROLE|ALTER DEFAULT PRIVILEGES|CREATE POLICY|DROP ROLE)" \
  0048_*.sql 0049_*.sql
→ (пусто, exit 1 — совпадений нет)

node scripts/check-migration-privileges.mjs
→ check-migration-privileges: OK (55 migration files)
```

---

## 5. Скоуп-гейт: lint + typecheck + затронутые тесты

```
npx eslint apps/webapp/src/app/app/settings/ClinicSlugSection.tsx           → чисто (webapp-конфиг)
npx eslint --no-ignore deploy/postgres/privileges/migration-backfill-idempotence.devDbProof.test.mjs → чисто

cd apps/webapp && pnpm run typecheck (tsc --noEmit)  → PASS (после уборки ниже)

cd apps/webapp && npx vitest run \
  src/modules/clinic-directory/selfRenameAllowance.unit.test.ts \
  src/app/api/clinic/slug/route.route.test.ts \
  src/infra/repos/specialistSignupSlugOrder.unit.test.ts
→ 3 test files passed, 14 tests passed
```

**Побочная находка окружения, не от аудируемых коммитов.** Первый прогон `typecheck` падал на
`.next/dev/types/routes.d.ts` — файл был физически повреждён (дублирующийся, оборванный фрагмент,
`mtime` 19.08 20:45, задолго до этого прохода). Причина: `tsconfig.json` включает `**/*.ts` без
исключения `.next/dev`, и битый файл старого `next dev` сессии в этом воркдереве подхватывался
компилятором. Проверено, что ни один живой сервер этот каталог не использует (`readlink
/proc/<pid>/cwd` единственного живого `next-server` указал на `/opt/projects/bersoncarebot-test`, чужой
чекаут), поэтому удалён только каталог `.next/dev/types` (gitignore'ится, `git status` не менялся).
После этого `typecheck` зелёный. К Ф2/Ф3 отношения не имеет — фиксирую, чтобы следующий агент не тратил
время на то же самое.

---

## Итог по пунктам брифа

| # | Пункт | Вердикт |
|---|---|---|
| 1 | Ф1 переизмерена | **не закрыта**, причина не изменилась (чужая ветка не влита); плюс вскрыта вторая, собственная причина того же отказа |
| 2a | DEV идентичен файлу | **PASS** — sha256 и содержимое совпадают побайтно |
| 2b | Безопасность порядка 0048 после 0049 | **PASS** — архитектура применения миграций переписана (имя файла + тег), старый класс риска закрыт конструкцией, подтверждено живым `--rollback-only` |
| 3 | Идемпотентность бэкфилла | **PASS** — 2/2 штатно, плюс независимая инъекция в реальный файл красит тест и называет строку |
| 4 | Запрет GRANT/REVOKE/роль/политика | **PASS** |
| 5 | Скоуп-гейт (lint/typecheck/тесты) | **PASS** (после уборки не связанного с аудитом мусора `.next/dev/types`) |

Полный `pnpm run ci` не гонялся — брифом запрещено.
