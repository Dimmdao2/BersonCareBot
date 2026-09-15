# Э4a: дверь врача после слияния с приземлённым Э1 — разбор двух отказов 42501

Ветка `wt/merge-conflict-doctor`, клон `/home/dev/dev-projects/bcb-wt-merge-conflict`.
План этапа: `docs/_TODO/MERGE_MECHANISM_REWRITE_2026-09-14.md`, пункт «Э4a. Серверная механика разбора (Р3)».
Коммит правки: `f9bb0a32c`.

Гейт автоматического слияния из `d9d68368b` (версия Э1, побуквенно) не тронут: в движке правка ровно одна —
условие вокруг одного вызова. Ни списки `BlockingMedicalHistoryRecord`/`NonBlockingMergeRecord`, ни пробы по
`ANY(uuid[])`, ни условие соединения с NULL-организацией не менялись.

---

## Отказ 1 — `42501 permission denied for table test_results`

**Что исполнялось.** `reconcileOpenTestAttemptsForMerge` в `packages/platform-merge/src/pgPlatformUserMerge.ts`.
Он приехал в `feat` вместе с Э1 и соседними работами и встал ВЫШЕ обхода переноса зависимых строк — то есть
на пути двери врача, которого при написании двери на этом месте не было. Первый его стейтмент — `INSERT INTO
test_results … ON CONFLICT (attempt_id, test_id) DO UPDATE`, и идёт он под рантайм-ролью `app_staff`.

**Почему это неверно на пути двери.** Зависимые строки за дверью переносит `SECURITY DEFINER`-функция
`app.transfer_staff_approved_platform_user_merge_data`, и среди прочего она делает
`UPDATE public.test_attempts SET patient_user_id = p_target_user_id WHERE patient_user_id = p_duplicate_user_id`
(`apps/webapp/db/drizzle-migrations/20260914T220000_doctor_resolves_medical_merge_conflict.sql:607`) — КАЖДУЮ
попытку дубликата, без отбора. К моменту вызова `reconcileOpenTestAttemptsForMerge` строк с
`patient_user_id = duplicateId` в `test_attempts` не остаётся вовсе, поэтому его соединение
`target … INNER JOIN duplicate ON … duplicate.patient_user_id = $2` находит ноль пар и переносить ему нечего.
`test_results` за попыткой едут сами: они привязаны к `attempt_id`, а не к пациенту, и функция их не трогает
именно потому, что трогать не нужно.

Отказ при этом приходил на ЗАВЕДОМО ПУСТОЙ выборке: право на запись PostgreSQL проверяет при построении плана,
а не по найденным строкам. То есть шаг не делал никакой работы и всё равно ронял дверь.

**Что сделано.** Вызов ушёл под тот же `if (!options?.medicalConflictApproval)`, под которым уже живёт остальной
перенос зависимых строк. Вне двери (`projection`/`phone_bind`/`email_bind`/`manual` без одобрения врача) порядок
и поведение не изменились ни на шаг. Права роли врача не расширялись.

**Отдельно, в отчёт, а не в работу.** На `test_attempts` стоит уникальный частичный индекс
`idx_test_attempts_one_open_per_item_patient (instance_stage_item_id, patient_user_id) WHERE submitted_at IS NULL`.
Если у цели и у дубликата есть открытый черновик по ОДНОМУ пункту программы, слепой `UPDATE … SET
patient_user_id` внутри `app.transfer_staff_approved_platform_user_merge_data` упрётся в этот индекс и вернёт
23505 — то есть за дверью такая пара не сольётся, и врач получит ошибку, а не молчаливую порчу. Вне двери этот
случай раскладывает `reconcileOpenTestAttemptsForMerge`, за дверью — никто. В плане владельца требования на этот
счёт нет, поэтому это ВОПРОС к владельцу/ведущему, а не самовольно добавленный скоуп; трогать функцию я не стал.

---

## Отказ 2 — `42501 permission denied for table system_settings`

**Что исполнялось.** Это НЕ шаг движка слияния. На `INSERT` в `public.be_organizations` висит триггер, тело
которого — `app.seed_reference_catalog_after_organization_insert()` (чужая свежая работа про настраиваемые
напоминания, `apps/webapp/db/drizzle-migrations/20260915T010500_configurable_appointment_reminders.sql:108`).
Он вписывает новой клинике её строку `doctor_appointment_reminder_offsets_minutes` в `system_settings`.

На пути двери он срабатывает потому, что фикстура сценариев «конфликт в двух клиниках» и «врач чужой
организации» заводит ВТОРУЮ клинику: живая на DEV одна, и `clinicsWithDoctors` синтезирует недостающую внутри
той же транзакции с `ROLLBACK`. Отказ приходил ещё до установки роли врача, под `postgres`.

**Кем.** Функция `SECURITY DEFINER` и принадлежит `app_seam_specialist_provision_owner` — отказ получает ЭТОТ
владелец шва, не `app_staff`. (В брифе оба отказа описаны как «под ролью `app_staff` врача»; для первого это
так, для второго — нет, и это меняет разбор: расширять права роли врача здесь нечего.)

**Почему это нужно по существу.** Дефект не имеет отношения к ветке и воспроизводится на DEV одной строкой без
единой строки её кода:

```
sudo -n -u postgres psql -d bcb_webapp_dev
BEGIN;
INSERT INTO public.be_organizations(id, title) VALUES ('…c1999'::uuid, 'probe clinic');
ERROR:  permission denied for table system_settings
CONTEXT:  SQL statement "INSERT INTO public.system_settings (…) VALUES ('doctor_appointment_reminder_offsets_minutes', …)
  ON CONFLICT (key, scope, organization_id) WHERE organization_id IS NOT NULL DO NOTHING"
PL/pgSQL function app.seed_reference_catalog_after_organization_insert() line 3 at SQL statement
ROLLBACK
```

То есть сегодня на DEV **создание клиники отбивается целиком**. Шаг обязан исполняться: без него новая клиника
остаётся без своей строки периодов напоминаний, а сам `INSERT` в `be_organizations` не проходит.

**Чего не хватало.** Декларация объявляла этому шву на `public.system_settings` только `INSERT`. Но
`ON CONFLICT (key, scope, organization_id) … DO NOTHING` — это вывод арбитра, и PostgreSQL требует на таком
стейтменте ещё и `SELECT` по колонкам арбитра. Разделено пробой на живой базе (те же три строки, что и выше,
под `SET LOCAL ROLE app_seam_specialist_provision_owner`): `INSERT` без `ON CONFLICT` проходит проверку прав
(упирается уже в FK), тот же `INSERT` с `ON CONFLICT … DO NOTHING` — `permission denied for table system_settings`.

Тот же вывод независимо даёт собственный лексический разбор репозитория: `extractRelationOperations`
(`deploy/postgres/privileges/function-body-surface.mjs`) на `on conflict ( … ) do nothing` добавляет `SELECT`.
То есть канон репозитория уже считал эту декларацию неполной.

**Что сделано.** В `deploy/postgres/privileges/declaration.ts` поверхность
`app.seed_reference_catalog_after_organization_insert() -> public.system_settings` получила операцию `SELECT`
и `operationColumns.SELECT = ['key','scope','organization_id']` — РОВНО три колонки арбитра. Значение настройки
(`value_json`), `updated_at` и `updated_by` шов на чтение не получает. Артефакты перегенерированы.
Итоговая строка в артефакте ровно одна:

```
GRANT SELECT ("key", "organization_id", "scope") ON TABLE "public"."system_settings" TO "app_seam_specialist_provision_owner";
```

**Почему это не расширяет стену арендатора.** Право уходит владельцу `SECURITY DEFINER`-шва, а не роли врача и
не роли рантайма. Единственные тела, исполняющиеся от этого владельца, — сам триггер и
`app.seed_reference_catalog_snapshot(uuid)`; `system_settings` из них читает только арбитр `ON CONFLICT`, по
трём колонкам ключа. У `app_staff` на `system_settings` как было `SELECT, DELETE`, так и осталось — проверено
на живой DEV. Привилегия объявлена в `declaration.ts`, в миграции её нет (§1).

**Живая проверка права (транзакция с `ROLLBACK`):** с кандидатным грантом тот же `INSERT INTO be_organizations`
проходит, и строка `doctor_appointment_reminder_offsets_minutes / doctor / <org> / {"value": [1440, 120]}`
появляется. Постоянных изменений на DEV не оставлено.

**Оснастка пробы.** `candidatePrivilegeStatements` в `doctor-medical-merge-door.proofHarness.mjs` пропускает в
транзакцию права только владельца двери. Кандидатный грант на `system_settings` добавлен в тот же пропуск по
уже записанному там принципу («иначе прогон меряет старое состояние базы вместо кандидатного»): без него
фикстура краснеет на синтезе второй клиники, не дойдя до предмета проверки. Ни одного утверждения проб это не
касается — в артефакт-фильтре ровно одна дополнительная строка, счётчик прогона вырос с 422 до 423.

---

## Проба не ослаблялась

Сценарии проб не правились. Все четыре слепые поломки двери прогнаны ПОСЛЕ правки и по-прежнему кусаются
(`privilege`, `two-clinic-blindness`, `staff-insert` — у них в файле есть ветка «под этой поломкой ждём FAIL», и
зелёный прогон под ними означает, что поломка поймана; `foreign-org-conflict` такой ветки намеренно не имеет и
обязан краснеть по-настоящему):

```
=== FAULT=privilege ===            # pass 4  # fail 0
=== FAULT=two-clinic-blindness === # pass 4  # fail 0
=== FAULT=staff-insert ===         # pass 4  # fail 0
=== FAULT=foreign-org-conflict === # pass 3  # fail 1
```

---

## Доказательства

### 1. Живая проба двери (`# pass 4 # fail 0`)

```
/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-merge-conflict && RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 node --test deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs"
```

```
# candidate privileges applied: 423 generated statements
# runtime role installed: session_user=bcb_dev_webapp_staff current_user=app_staff org=a0000000-0000-4000-8000-000000000001
# merge returned: {"targetId":"00000000-0000-4000-8000-00000000e1a1","duplicateId":"00000000-0000-4000-8000-00000000e1a2","mergeContactsSaved":[],"mergeOutcome":"merged"}
# after merge: {"duplicate_merged_into":"00000000-0000-4000-8000-00000000e1a1","duplicate_credentials":0,"target_visits":2,"conflict_status":"resolved"}
# RESULT: PASS — merge completed under the doctor runtime role, no privilege refusal
# rolled back; fixture rows left in the database: 0
# clinic 00000000-0000-4000-8000-0000000c1001 synthesized inside the rollback transaction (DEV has 1)
# doctor A merge returned: {"targetId":"…d1a1","duplicateId":"…d1a2","mergeContactsSaved":[],"mergeOutcome":"awaiting_other_organization"}
# doctor A still sees his conflict: yes, doctorApproved=true
# after doctor A pressed merge: {"duplicate_merged_into":null,"duplicate_credentials":1,"target_credentials":1,"clinic_a_row":"pending/true","clinic_b_row":"pending/null"}
# doctor B merge returned: {"targetId":"…d1a1","duplicateId":"…d1a2","mergeContactsSaved":[],"mergeOutcome":"merged"}
# after doctor B pressed merge: {"duplicate_merged_into":"…d1a1","duplicate_credentials":0,"clinic_a_row":"resolved","clinic_b_row":"resolved","target_visits":4}
# RESULT: PASS — the first clinic got a truthful refusal, the second one completed the merge
# forgery refused: 42501 permission denied for table patient_merge_candidates
# after: {"tgt_creds":1,"dup_creds":1,"forged_rows":0}
# RESULT: PASS — app_staff cannot write the row the door trusts, and nothing moved
# RESULT: PASS — a doctor of another organization is refused and clinic A's conflict is untouched
# rolled back; fixture rows left in the database: 0
1..4
# tests 4
# suites 0
# pass 4
# fail 0
```

Для сравнения — тот же прогон ДО правки: `# pass 1 # fail 3`,
`RESULT: FAIL — 42501 permission denied for table test_results` и
`RESULT: FAIL — 42501 permission denied for table system_settings` (дважды).

### 2. Проба гейта Э1 (`proof_status=PASS`, 21 сценарий, `residual_rows=0`)

```
/home/dev/brain/host-orch/run-tests.sh "sudo -n bash -lc 'cd /home/dev/dev-projects/bcb-wt-merge-conflict && RUN_PLATFORM_USER_MERGE_DB=1 exec apps/webapp/node_modules/.bin/tsx --test deploy/postgres/privileges/platform-user-merge.devDbProof.test.mjs'"
```

```
# proof_status=PASS scenarios=21 rollback=complete residual_rows=0
# tests 2
# pass 2
# fail 0
```

(Файл вызван так, как написано в его заголовке — через `sudo -n bash -lc`, — но из ЭТОГО клона.)

### 3. Типы

```
apps/webapp/node_modules/.bin/tsc -p apps/webapp/tsconfig.json --noEmit
TSC_EXIT=0
```

### 4. Генерация привилегий сходится побайтно

```
node deploy/postgres/privileges/generate-cli.mjs                            → EXIT=0
node deploy/postgres/privileges/generate-cli.mjs --all --port-context-only  → EXIT=0
node deploy/postgres/privileges/generate-cli.mjs --check                    → «--check: артефакты соответствуют декларации побайтно.» EXIT=0
node deploy/postgres/privileges/generate-cli.mjs --all --port-context-only --check → то же, EXIT=0
node deploy/postgres/privileges/generate-cli.mjs --census                   → ok ×6, EXIT=0
```

Диффом в артефактах — ровно две строки на базу: операция `SELECT` в контракте поверхности и один `GRANT SELECT`
по трём колонкам. Файлы `port-context-capabilities.*` не изменились.

---

## НЕ СДЕЛАНО

1. **Полный CI не гонялся** — запрещён брифом; его запускает ведущий после приземления.
2. **Унаследованный красный в `deploy/postgres/privileges/definer-tenant-predicate.test.mjs`** (сценарий
   «пометка crossesTenantWall не живёт там, где предикат на месте»): записанная перепись
   `definerRootsCrossingTenantWall` разошлась на одной паре —
   `vanished (1): app.read_current_patient_booking_creation_snapshot(uuid,uuid,text,text) -> public.be_specialists`.
   Это приехало из той же чужой работы про настраиваемые напоминания (она переписала
   `app.read_current_patient_booking_creation_snapshot`), перепись за ней не обновили. К правке отношения не имеет:
   в моём диффе `declaration.ts` нет ни одного упоминания `be_specialists`, и на состоянии `HEAD~1` (мой
   `declaration.ts` откачен, остальное то же) тот же прогон даёт РОВНО ту же строку `vanished (1): …` и
   `# pass 13 # fail 1`. Перепись НЕ регенерировал: в плане владельца этого требования нет, а
   `BCB_UPDATE_NAME_CENSUS=1` молча узаконил бы чужое изменение поверхности прав. Остальной набор
   `node --test deploy/postgres/privileges/*.test.mjs` — `# tests 388 # pass 187 # fail 1 # skipped 200`.
3. **Открытые черновики одного пункта программы за дверью** — описано выше в отказе 1 как вопрос, не как работа.
4. **Миграции на DEV по-настоящему не применялись**: обе пробы и обе ручные проверки шли транзакцией с
   `ROLLBACK`, постоянных строк и постоянных грантов на DEV не оставлено.

---

## Строка вердикта (в очередь заносит ведущий, не автор)

Э4a: дверь врача возвращена в зелёное поверх приземлённого Э1 — `reconcileOpenTestAttemptsForMerge` ушёл под
обход двери как повтор работы `app.transfer_staff_approved_platform_user_merge_data`; шву
`app_seam_specialist_provision_owner` дописан объявленный `SELECT` по трём колонкам арбитра
`ON CONFLICT` на `public.system_settings` (без него на DEV не создаётся клиника). Живая проба двери
`# pass 4 # fail 0` при всех четырёх кусающихся слепых поломках, проба гейта Э1 `proof_status=PASS scenarios=21
residual_rows=0`, `tsc --noEmit` EXIT=0, генерация привилегий сходится побайтно. Коммит `f9bb0a32c`.
