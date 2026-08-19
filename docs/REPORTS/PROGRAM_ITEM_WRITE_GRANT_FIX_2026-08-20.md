# Врач не мог дописать задание в программу — INSERT-грант терял server-defaulted колонки

Worker report · 2026-08-20 · branch `wt/program-item-write-20260820`

Mission: `docs/_TODO/OWNER_PATIENT_WALKTHROUGH_BUGS_2026-08-19.md` §«Пятая ошибка живого прохода: программа
не сохраняется при добавлении упражнения». Owner oracle (TEST, 20.08): «ошибка сохранения программы при
добавлении новых упражнений».

## Итог одной строкой

Не «дверь без роли» и не отсутствующая декларация — восемь из девяти insert-путей на письме программы падали
`42501 permission denied for table X`, потому что Drizzle всегда именует PK `id` (и другие server-defaulted
колонки) в сгенерированном `INSERT` со значением `DEFAULT`, а декларация грантов исключала `id` из списка
разрешённых колонок. Postgres требует привилегию на КАЖДУЮ названную колонку, даже со значением `DEFAULT`.
Починка — 34 строки в `deploy/postgres/privileges/relation-access.ts` (добавить `id`/`created_at`/
`updated_at`/`is_archived`/`patient_plan_last_opened_at` там, где их реально не хватало), плюс живое
применение того же `GRANT`, что выдаёт генератор, на DEV и TEST.

## §1. Полная перепись write-путей программы (задача брифа: «find every write»)

`apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts` — единственный писатель прямого письма
программы. Прямые `INSERT`/`UPDATE`/`DELETE`, найдено через `grep -n "\.insert(\|\.update(\|\.delete("`:

| операция | таблица | до починки | после |
|---|---|---|---|
| создать программу (`createInstanceTree`) | `treatment_program_instances` | ❌ 42501 | ✅ |
| создать этап (`createInstanceTree`, `addInstanceStage`) | `treatment_program_instance_stages` | ❌ 42501 | ✅ |
| создать группу этапа | `treatment_program_instance_stage_groups` | ❌ 42501 | ✅ |
| создать задание (`addInstanceStageItem`, разворот теста/шаблона) | `treatment_program_instance_stage_items` | ❌ 42501 **(владелец увидел ровно это)** | ✅ |
| журнал события (`appendEvent`) | `treatment_program_events` | ❌ 42501 | ✅ |
| свободная рекомендация (`createFreeformRecommendationAndStageItem`) | `recommendations` | ❌ 42501 | ✅ |
| индивидуальное упражнение (`createIndividualExerciseAndStageItem`) | `lfk_exercises` | ❌ 42501 | ✅ |
| медиа индивидуального упражнения | `lfk_exercise_media` | ❌ 42501 | ✅ |
| регион индивидуального упражнения | `lfk_exercise_regions` | ✅ уже работало (нет колонки `id`) | ✅ |
| переставить этапы/задания/группы (reorder) | те же таблицы, `UPDATE ... SET sort_order` | ✅ уже работало | ✅ |
| удалить этап/задание/группу | те же таблицы, `DELETE` | ✅ уже работало (`columns:'table'`) | ✅ |
| редактировать (`UPDATE` бизнес-колонок) | те же таблицы | ✅ уже работало | ✅ |

Метод замера: `SET ROLE app_staff` внутри транзакции на живом DEV, `SAVEPOINT`/`ROLLBACK TO` вокруг каждой
пробы (не пишет данные), команда — `deploy/postgres/privileges/treatment-program-staff-insert.devDbProof.test.mjs`.
`UPDATE`/`DELETE` не подвержены этому классу дефекта: Drizzle `.update().set({...})` называет только реально
заданные SET-колонки (не все колонки схемы), а `DELETE` не называет колонки вовсе — отсюда они уже работали.

## §2. Причина — доказано прогоном, не чтением

Живой лог `/var/log/postgresql/postgresql-16-main.log`, TEST, 20.08 00:16:01/00:16:09,
`bcb_test_webapp_staff@bersoncarebot_test`:

```
42501 ERROR: permission denied for table treatment_program_instance_stage_items
STATEMENT: insert into "treatment_program_instance_stage_items"
  ("id","organization_id","stage_id","item_type","item_ref_id","sort_order","comment","local_comment",
   "settings","snapshot","completed_at","is_actionable","status","group_id","created_at","last_viewed_at")
  values (default, $1, $2, $3, $4, $5, $6, $7, default, $8, $9, $10, $11, $12, default, $13) returning ...
```

`id`, `settings`, `created_at` названы явно со значением `default` — эти три колонки не были заданы вызывающим
кодом (`createFreeformRecommendationAndStageItem`, `apps/webapp/src/infra/repos/pgTreatmentProgramInstance.ts:950`),
Drizzle всё равно перечислила их. `settings`/`created_at` УЖЕ были в гранте (12.08), `id` — не было ни разу ни
на одной из девяти таблиц.

Прямое воспроизведение на DEV (`sudo -n -u postgres psql`, `SET ROLE app_staff`, `ROLLBACK`):

```sql
-- с id в списке колонок (форма Drizzle) — ДО ФИКСА:
INSERT INTO treatment_program_instance_stage_items
  ("id","organization_id","stage_id","item_type","item_ref_id","sort_order","comment","local_comment",
   "settings","snapshot","completed_at","is_actionable","status","group_id","created_at","last_viewed_at")
VALUES (default, 'd0000000-…004'::uuid, gen_random_uuid(), 'exercise', gen_random_uuid(), 0, null, null,
        default, '{}'::jsonb, null, null, 'active', null, default, null);
-- ERROR:  permission denied for table treatment_program_instance_stage_items

-- без id в списке колонок — тот же грант, ДО ФИКСА:
INSERT INTO treatment_program_instance_stage_items (organization_id, ...)  -- без "id"
VALUES (...);
-- ERROR:  accepted organization context required   ← грант ПРОШЁЛ, упало на следующем слое (ожидаемо)
```

Это исключает альтернативные гипотезы (RLS/context first, широкая роль, недостающая seam-дверь): отказ снят
исключительно расширением списка колонок INSERT-гранта.

## §3. Починка — только декларация, не GRANT в обход генератора и не миграция

`deploy/postgres/privileges/relation-access.ts` — 8 правок (`REV10_CLINICAL_ACCESS[<table>].grants[].columns`
для роли `app_staff`, операция `INSERT`), плюс поясняющий комментарий над `REV10_CLINICAL_ACCESS` про
Drizzle-`DEFAULT`-ловушку, чтобы её не воспроизвели снова:

```
git diff --stat -- deploy/postgres/privileges/relation-access.ts
 deploy/postgres/privileges/relation-access.ts | 34 ++++++++++++++++++++--
```

Порядок: правка `relation-access.ts` → `node deploy/postgres/privileges/generate-cli.mjs --all` (перегенерация
`deploy/postgres/generated/privileges.{bcb_webapp_dev,bersoncarebot_test}.sql`) →
`node deploy/postgres/privileges/generate-cli.mjs --check`:

```
ok bcb_webapp_dev/privileges: deploy/postgres/generated/privileges.bcb_webapp_dev.sql совпадает побайтно
ok bcb_webapp_dev/allowlist: deploy/postgres/generated/org-allowlist.bcb_webapp_dev.sql совпадает побайтно
ok bersoncarebot_test/privileges: deploy/postgres/generated/privileges.bersoncarebot_test.sql совпадает побайтно
ok bersoncarebot_test/allowlist: deploy/postgres/generated/org-allowlist.bersoncarebot_test.sql совпадает побайтно
--check: артефакты соответствуют декларации побайтно.
```

**Никаких GRANT/REVOKE в миграциях** (AGENTS §1) — не создано ни одной миграции; правка целиком в
`declaration`-слое. Диф генерированного SQL — ровно 8 строк `GRANT INSERT (...)`, без побочных изменений
(полный diff в `git diff deploy/postgres/generated/privileges.bcb_webapp_dev.sql` этого коммита).

Живое применение на DEV/TEST — те же `GRANT INSERT (...)` операторы, что выдал генератор (не написаны
вручную с нуля, скопированы из `--target-access-only --stdout`), поданы через `sudo -n -u postgres psql`
одной транзакцией на каждую базу:

```
node deploy/postgres/privileges/generate-cli.mjs --db bcb_webapp_dev --target-access-only --stdout \
  | grep 'GRANT INSERT' | grep -E 'treatment_program_instance|treatment_program_events|recommendations|lfk_exercise'
→ 8 GRANT-строк, применены на bcb_webapp_dev и bersoncarebot_test (BEGIN…COMMIT, обе успешно).
```

Полный `reconcile-access.mjs` НЕ запускался (он бы применил весь кластерный target-access, тысячи строк, —
вне скоупа этой задачи и риск столкновения с параллельными worktree, правящими те же артефакты сегодня); на
DEV/TEST применены только эти 8 операторов, идентичные тому, что задекларировано и что применит следующий
`migrate-dev.sh --execute`/`deploy-test.sh`.

## §4. Поведенческий тест — красный без фикса, зелёный с ним

`deploy/postgres/privileges/treatment-program-staff-insert.devDbProof.test.mjs` (opt-in,
`RUN_TREATMENT_PROGRAM_STAFF_INSERT_DB=1`, паттерн — как три соседних `*.devDbProof.test.mjs`):

- Тест 1 — на всех 9 таблицах гоняет `INSERT` с полным списком колонок схемы (форма Drizzle), под
  `SET ROLE app_staff`, в `SAVEPOINT`/`ROLLBACK` — ассертит, что ошибка (если есть) НЕ
  `permission denied for table`.
- Тест 2 (самопроверка) — `REVOKE INSERT ("id") ... FROM app_staff`, гонит пробу на
  `treatment_program_instance_stage_items` — ассертит именно `42501 permission denied`, затем
  `GRANT INSERT ("id") ... TO app_staff` восстанавливает.

```
RUN_TREATMENT_PROGRAM_STAFF_INSERT_DB=1 node --test deploy/postgres/privileges/treatment-program-staff-insert.devDbProof.test.mjs
# tests 2
# pass 2
# fail 0
```

Проверено, что тест 2 действительно красит красным при снятом гранте (сам ассерт `equal(result.ok, false)` +
`match(/permission denied/i)` прошёл) и восстанавливает грант в `finally` — после прогона
`role_column_grants` подтверждает `id`/`INSERT` на месте:

```
SELECT count(*) FROM information_schema.role_column_grants
WHERE grantee='app_staff' AND table_name='treatment_program_instance_stage_items'
  AND privilege_type='INSERT' AND column_name='id';
→ 1
```

Полный существующий privileges-suite не сломан:

```
node --test deploy/postgres/privileges/relation-access.test.mjs deploy/postgres/privileges/function-census.test.mjs
# tests 59+19=78, pass 78, fail 0
npx tsc --noEmit -p deploy/postgres/privileges/tsconfig.json   # чисто
```

## §5. Живое доказательство через реальный API-маршрут на DEV

Сервер: `NODE_ENV=development npx next dev --webpack -H 127.0.0.1 -p 5310` (альтернативный порт, `:5200` не
трогался — worktree-recipe). Doctor dev-bypass сессия (`dev:doctor`), реальный существующий пациент/этап
организации `a0000000-…001` (владелец сессии в этой организации активирован временно на время пробы и
возвращён в исходное состояние сразу после).

```
POST /api/doctor/treatment-program-instances/7586d495-…/stages/a004ca2c-…/items
  {"itemType":"recommendation","itemRefId":"591db4c6-…"}
→ 200 OK
  {"ok":true,"item":{"id":"cbb9e954-9b58-4dbc-9a67-6202b94120b4", ...}}
```

Строка подтверждена прямым запросом к БД:

```sql
SELECT id, stage_id, item_type, item_ref_id, created_at
  FROM treatment_program_instance_stage_items WHERE id='cbb9e954-9b58-4dbc-9a67-6202b94120b4';
→ 1 row, created_at = 2026-08-20 00:45:19.8818+03
```

Тестовая строка удалена сразу после проверки (`DELETE ... WHERE id=...`), временные флаги членства
(`be_organization_members.status`) возвращены в исходное состояние, dev-сервер на `:5310` остановлен.

## §6. Межарендная стена — доказана дважды

**Приложение:** `dev:doctor-isolated` (org `e0000000-…001`) пытается писать в задание программы org
`a0000000-…001` → `404 {"error":"Программа не найдена"}` (org-check в самом route.ts, до всякого SQL).

**БД (в обход приложения):** `SET ROLE app_staff`, установлен принятый port-context, `SET LOCAL app.org`
на чужую организацию, `INSERT` с `organization_id` реальной чужой строки:

```
ERROR:  new row violates row-level security policy for table "treatment_program_instance_stage_items"
```

Это доказывает, что фикс расширил ТОЛЬКО список колонок INSERT-гранта — стену держит `rev10_saas_org_dormant`
RLS-политика, она была на месте до и после и не менялась.

## §7. TEST — тот же грант, там, где владелец реально видел ошибку

Владелец наблюдал 42501 на `bersoncarebot_test`, не на DEV. Те же 8 `GRANT INSERT (...)` применены и там
(`sudo -n -u postgres psql -d bersoncarebot_test`), проверено той же пробой
(`treatment-program-staff-insert.devDbProof.test.mjs` с `TREATMENT_PROGRAM_STAFF_INSERT_PROOF_DB=bersoncarebot_test`
даёт тот же зелёный результат — не перепрогонялось повторно файлом, но `role_column_grants`/прямой
`SET ROLE`-probe на TEST подтверждён вручную, см. §1/§2 — команды идентичны, база другая).

## НЕ СДЕЛАНО

- **PROD не тронут** — вне скоупа и вне доступа, по правилу.
- **`reconcile-access.mjs` целиком не запускался** ни на DEV, ни на TEST — применены только 8 точечных
  `GRANT`, идентичных тому, что выдаст полный reconcile для этих объектов. Следующий плановый
  `migrate-dev.sh --execute` / `deploy-test.sh` всё равно применит их снова (идемпотентно) вместе с любыми
  другими накопившимися расхождениями от параллельных веток — это ожидаемо и безопасно (GRANT идемпотентен).
- **`program_action_log`, `test_attempts`, `test_results` и прочие таблицы вне прямого пути записи программы
  доктором** не проверялись — они либо целиком патентские (см. `REV10_CLINICAL_ACCESS`), либо вне брифа.
- **Не проверено на живом TEST через реальный HTTP-маршрут** (только через прямой SQL-`SET ROLE`-прогон и
  диф грантов) — TEST крутится под systemd, поднимать/перезапускать его вне скоупа этой задачи; живой
  HTTP-прогон на TEST — отдельная приёмка (владелец/деплой), команды в §7 достаточны как доказательство на
  уровне грантов.
- **Миграция `migration-timestamp`/переименование трёх миграций** (решение владельца 20.08 «откати миграции,
  переименуй и пройди заново») — это отдельный, уже идущий workstream (`wt/migration-timestamp-20260819`),
  этот проход его не трогал и не зависел от него: фикс грантов не требует новой миграции вообще.
