# Независимая проверка Э4a, круг 5: tenant-стена двери конфликта

Дата: 2026-09-15. Candidate: `e7dd2adfee642aebc0bfa664399e4e252104be47`
(`5a5ab5831`, `e7dd2adfe`) поверх `bb934462b88576df63e8f2d2f11933d6ab485212`.

Authority: `docs/_TODO/MERGE_MECHANISM_REWRITE_2026-09-14.md`, этап Э4;
`docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md` §18б — конфликт разбирает врач **той организации**,
где он возник. Классификация: повторяемое security-поведение SECURITY DEFINER-двери, поэтому
поведенческий тест и живая проба на именованной DEV-БД оправданы по `AGENTS.md` §10a/§10b и §24.4.

Все тесты и обращения к DEV-БД выполнены через общий замок
`/home/dev/brain/host-orch/run-tests.sh`. Кандидатная миграция ставилась только внутри транзакции
с обязательным `ROLLBACK`; `--execute` и полный CI не запускались. Продуктовый код не менялся.

## Вердикт

**PASS.** Новый сценарий действительно держит tenant-стену двери:

- чистый candidate: `4 pass / 0 fail`;
- точечная инъекция `AND candidate.organization_id = v_organization_id` → `AND TRUE`:
  `3 pass / 1 fail`, упал только новый foreign-organization сценарий;
- отказ чистого candidate вызван именно сверкой организации: тот же законный runtime-контекст
  `bcb_dev_webapp_staff → app_staff` под инъекцией успешно исполнил дверь и изменил существующую
  чужую строку, поэтому ни недостаток прав, ни отсутствие строки причиной зелёного отказа быть не могут;
- после обоих прогонов fixture-строк и кандидатной функции в DEV нет;
- коммиты круга 5 меняют только proof-оснастку и отчёт, не продуктовый код двери.

Findings: **0**. Инъекций: **1**. Непойманных инъекций: **0**.

## Таблица инъекций

| Инъекция | Точный временный patch | Результат |
|---|---|---|
| Снять принадлежность конфликта организации врача | копия candidate migration: `AND candidate.organization_id = v_organization_id` → `AND TRUE` | **Поймана**: `3 pass / 1 fail`; сценарии 1–3 зелёные, упал только сценарий 4; чужая строка стала `pending/true` |

## 1. Живая проба целиком и остаток после ROLLBACK

Команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 DOCTOR_MEDICAL_MERGE_DOOR_ECHO=1 node --test deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs"
```

Вывод (полные наблюдаемые исходы и TAP-итог):

```text
[2026-09-15T05:51:30+03:00] pid=2025021 ACQUIRED test lock
# RESULT: PASS — merge completed under the doctor runtime role, no privilege refusal
# rolled back; fixture rows left in the database: 0
# RESULT: PASS — the first clinic got a truthful refusal, the second one completed the merge
# rolled back; fixture rows left in the database: 0
# RESULT: PASS — app_staff cannot write the row the door trusts, and nothing moved
# rolled back; fixture rows left in the database: 0
# doctor B runtime: session_user=bcb_dev_webapp_staff current_user=app_staff org=00000000-0000-4000-8000-0000000c1001
# doctor B pressed merge on clinic A's conflict, door returned: {"targetId":"00000000-0000-4000-8000-00000000f1a1","duplicateId":"00000000-0000-4000-8000-00000000f1a2","mergeContactsSaved":[],"mergeOutcome":"conflict_not_found"}
# after the foreign attempt: {"duplicate_merged_into":null,"duplicate_credentials":1,"target_credentials":1,"clinic_a_row":"pending/null","clinic_b_row":"pending/null"}
# RESULT: PASS — a doctor of another organization is refused and clinic A's conflict is untouched
# rolled back; fixture rows left in the database: 0
ok 1 - врач сливает медицинский конфликт целиком под своей рантайм-ролью
ok 2 - конфликт в двух клиниках: первому врачу говорят правду, второй доводит слияние
ok 3 - роль врача не может выписать себе основание для двери
ok 4 - врач чужой организации не проходит дверь конфликта соседней клиники
1..4
# tests 4
# pass 4
# fail 0
# duration_ms 14135.194435
[2026-09-15T05:51:45+03:00] pid=2025021 RELEASED test lock (rc=0, 15s)
```

Отдельный residual-check перечисляет fixture-ID всех четырёх сценариев и синтезированной клиники.

Команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -Atc \"SELECT 'platform_users=' || count(*) FROM public.platform_users WHERE id::text IN ('00000000-0000-4000-8000-00000000e1a1','00000000-0000-4000-8000-00000000e1a2','00000000-0000-4000-8000-00000000d1a1','00000000-0000-4000-8000-00000000d1a2','00000000-0000-4000-8000-00000000d2a1','00000000-0000-4000-8000-00000000d2a2','00000000-0000-4000-8000-00000000f1a1','00000000-0000-4000-8000-00000000f1a2','00000000-0000-4000-8000-0000000c2001'); SELECT 'merge_candidates=' || count(*) FROM public.patient_merge_candidates WHERE id::text IN ('00000000-0000-4000-8000-00000000e1c1','00000000-0000-4000-8000-00000000d1c1','00000000-0000-4000-8000-00000000d1c2','00000000-0000-4000-8000-00000000d2c1','00000000-0000-4000-8000-00000000f1c1','00000000-0000-4000-8000-00000000f1c2'); SELECT 'proof_orgs=' || count(*) FROM public.be_organizations WHERE id = '00000000-0000-4000-8000-0000000c1001'::uuid; SELECT 'proof_visits=' || count(*) FROM public.clinical_visit WHERE patient_user_id::text IN ('00000000-0000-4000-8000-00000000e1a1','00000000-0000-4000-8000-00000000e1a2','00000000-0000-4000-8000-00000000d1a1','00000000-0000-4000-8000-00000000d1a2','00000000-0000-4000-8000-00000000f1a1','00000000-0000-4000-8000-00000000f1a2'); SELECT 'door_exists_on_dev=' || (to_regprocedure('app.transfer_staff_approved_platform_user_merge_data(uuid,uuid,uuid,uuid)') IS NOT NULL)::int;\""
```

Вывод:

```text
[2026-09-15T05:53:13+03:00] pid=2027865 ACQUIRED test lock
platform_users=0
merge_candidates=0
proof_orgs=0
proof_visits=0
door_exists_on_dev=0
[2026-09-15T05:53:13+03:00] pid=2027865 RELEASED test lock (rc=0, 0s)
```

`door_exists_on_dev=0` означает, что кандидатная функция после транзакции отсутствует на DEV: миграция
не была применена по-настоящему.

## 2. Точечная инъекция: красный именно новый сценарий

Инъекцию выполнил независимо этим запуском. Harness прочитан: он требует наличие точного marker и
заменяет только первое вхождение в копии миграции, которую ставит внутри rollback-транзакции.

Команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 DOCTOR_MEDICAL_MERGE_DOOR_FAULT=foreign-org-conflict DOCTOR_MEDICAL_MERGE_DOOR_ECHO=1 node --test deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs"
```

Вывод:

```text
[2026-09-15T05:51:59+03:00] pid=2026388 ACQUIRED test lock
# FAULT INJECTED: the door no longer checks that the conflict belongs to the doctor's organization
ok 1 - врач сливает медицинский конфликт целиком под своей рантайм-ролью
ok 2 - конфликт в двух клиниках: первому врачу говорят правду, второй доводит слияние
ok 3 - роль врача не может выписать себе основание для двери
# doctor B runtime: session_user=bcb_dev_webapp_staff current_user=app_staff org=00000000-0000-4000-8000-0000000c1001
# doctor B pressed merge on clinic A's conflict, door returned: {"targetId":"00000000-0000-4000-8000-00000000f1a1","duplicateId":"00000000-0000-4000-8000-00000000f1a2","mergeContactsSaved":[],"mergeOutcome":"awaiting_other_organization"}
# after the foreign attempt: {"duplicate_merged_into":null,"duplicate_credentials":1,"target_credentials":1,"clinic_a_row":"pending/true","clinic_b_row":"pending/null"}
# RESULT: FAIL — the door answered 'awaiting_other_organization' to a doctor of another organization, expected 'conflict_not_found'
# rolled back; fixture rows left in the database: 0
not ok 4 - врач чужой организации не проходит дверь конфликта соседней клиники
1..4
# tests 4
# pass 3
# fail 1
# duration_ms 12192.643752
[2026-09-15T05:52:11+03:00] pid=2026388 RELEASED test lock (rc=1, 12s)
```

Красный только сценарий 4. Инъекция не красит соседние сценарии и не маскируется специальной веткой
«под fault ожидать FAIL»: настоящий test process завершился `rc=1`.

## 3. Почему отказ — tenant-проверка, а не права или отсутствующая строка

Использована та же команда инъекции из пункта 2; её вывод разводит причины наблюдаемым поведением:

| Возможная причина | Что было бы видно | Что видно фактически |
|---|---|---|
| У врача нет runtime-прав | `42501 permission denied`, дверь не меняет строку | Ошибки прав нет; дверь вернула штатный `awaiting_other_organization` |
| Конфликтной строки нет | Нечего обновить; `clinic_a_row` не мог бы стать `pending/true` | До вызова вставлена pending-строка А; после вызова она прочитана как `pending/true` |
| Tenant-предикат стоит | `conflict_not_found`, строка А `pending/null` | Таков вывод чистого candidate в пункте 1 |
| Tenant-предикат снят | Чужая дверь проходит и штампует одобрение | Таков вывод инъекции: тот же `app_staff`, `awaiting_other_organization`, `pending/true` |

Следовательно, новый сценарий зелёный не по посторонней причине: его сигнал меняется только вместе с
проверяемой стеной организации, а роль и строка достаточны для достижения опасного действия.

## 4. Прежние сценарии и отсутствие правок продуктовой двери

Прежние сценарии остались зелёными и на чистом candidate (`ok 1`–`ok 3` в пункте 1), и под новой
инъекцией (`ok 1`–`ok 3` в пункте 2).

Команды и вывод проверки diff:

```bash
git diff --name-only bb934462b..e7dd2adfe
```

```text
deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs
deploy/postgres/privileges/doctor-medical-merge-door.proofHarness.mjs
deploy/postgres/privileges/doctor-medical-merge-foreign-org.proofBody.mjs
docs/_TODO/FAULTS_E4a_MERGE_CONFLICT_DOCTOR_ROUND5_2026-09-15.md
```

```bash
git diff --name-only 5a5ab5831^..e7dd2adfe -- apps/webapp packages
```

```text
(пусто)
```

Коммиты `5a5ab5831` и `e7dd2adfe` не трогали `apps/webapp/**`, `packages/**` или миграцию двери.
Инъекция существует только в proof-harness и применяется к временной копии candidate migration.

## Строка вердикта для ведущего

`Э4a круг 5 — PASS: чистый набор 4 pass / 0 fail; снятие tenant-предиката двери даёт 3 pass / 1 fail и красит только новый foreign-org сценарий; законный app_staff-контекст под инъекцией меняет чужую строку pending/null → pending/true, поэтому зуб проверяет именно организацию, не права/наличие строки; остаток DEV = 0; продуктовый код в 5a5ab5831/e7dd2adfe не менялся.`

## НЕ СДЕЛАНО

- Полный CI (`pnpm run ci`, `scripts/ci-record.mjs`) не запускался — запрещён brief.
- Миграция на DEV по-настоящему не применялась; PROD не затрагивался.
- Продуктовый код и тесты не менялись; добавлен только независимый audit-artifact.
- Строка вердикта в `feat` и галочка Э4a не изменялись — это делает ведущий после landing.
