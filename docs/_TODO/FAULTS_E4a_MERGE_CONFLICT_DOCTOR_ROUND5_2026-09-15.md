# Э4a, круг 5: набор краснеет на снятии проверки организации

Дата: 2026-09-15. Клон `/home/dev/dev-projects/bcb-wt-merge-conflict`, ветка `wt/merge-conflict-doctor`.
Оракул: `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md` §18б — конфликт разбирает врач СВОЕЙ организации.
Все прогоны — через общий замок хоста `/home/dev/brain/host-orch/run-tests.sh`. Полный CI не запускался.
Кандидатная миграция на DEV по-настоящему не применялась: она ставится внутри транзакции с `ROLLBACK`.

## Что закрывает

F1 круга 4 (`AUDIT_E4a_MERGE_CONFLICT_DOCTOR_ROUND4_ADVERSARIAL_2026-09-15.md`): инъекция
`AND candidate.organization_id = v_organization_id` → `AND TRUE` в
`app.transfer_staff_approved_platform_user_merge_data` оставляла набор зелёным — `3 pass / 0 fail`.
Дверь была защищена, но снос этой сверки прошёл бы молча.

## Названный отказ, который ловит новый сценарий

Врач клиники Б со своим ЗАКОННЫМ рантайм-контекстом (`app_staff`, `app.current_org_id() = Б`) и
известным ему `conflictId` клиники А проходит дверь чужого конфликта. Ошибки он не получает и ничего
не замечает; дверь от его имени ставит на строку клиники А отметку «врач одобрил». Следующим нажимом
(уже по своей строке) он снимает последний блокер, и пара сливается целиком — медицинские и учётные
строки двух людей съезжаются без решения той клиники, которая их вела. Согласие выглядит настоящим,
и ни один участник этого не видит. Дорогой и молчаливый одновременно.

Это ровно случай, разрешённый §10a: дверь — `SECURITY DEFINER`, RLS арендатора внутри неё уже не
действует, стена здесь — сама проверка принадлежности. Проверяется, что стена СТОИТ («снесли — набор
покраснел»), а не что СУБД умеет применять политику.

## Что добавлено

- `deploy/postgres/privileges/doctor-medical-merge-foreign-org.proofBody.mjs` — новое тело живой пробы.
  Фикстура намеренно совпадает с законным двухклиничным прогоном: у пары клиническая история и
  pending-строка `medical_history:%` в ОБЕИХ клиниках, у врача Б есть СВОЯ законная строка.
  Единственное отличие — какой `conflictId` он подаёт. Значит меряется ровно стена принадлежности.
  Ожидание: дверь отвечает `conflict_not_found`, строка клиники А остаётся `pending/null`,
  `merged_into_id` остаётся `NULL`, учётные строки не двигаются.
- `deploy/postgres/privileges/doctor-medical-merge-door.proofHarness.mjs` — слепая поломка
  `foreign-org-conflict` тем же механизмом, что `two-clinic-blindness`: патч текста кандидатной
  миграции перед установкой внутри rollback-транзакции. Новый способ не изобретался.
- `deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs` — четвёртый сценарий.

**Ветки «под этой поломкой ждём FAIL» у нового сценария намеренно НЕТ.** У трёх старых сценариев такая
ветка есть, и она инвертирует сигнал: под именованной поломкой прогон остаётся зелёным, а «поймана»
читается по тому, что тело напечатало `RESULT: FAIL`. Первый вариант нового сценария был написан по
этому же образцу и под инъекцией дал `4 pass / 0 fail` — формально «поймано», по факту бесполезно как
двоичное доказательство. Ветка убрана: сценарий обязан краснеть по-настоящему. Старые три не трогались —
это не предмет этой работы.

## Инъекции

Проведено инъекций: **1**. Не поймано: **0**.

| Инъекция | Точный patch | Результат |
|---|---|---|
| Снять принадлежность организации | migration: `AND candidate.organization_id = v_organization_id` → `AND TRUE` | **Поймана**, `3 pass / 1 fail`, красный именно новый сценарий |

Проверено также, что поломка изолирована в обе стороны: под `foreign-org-conflict` сценарии 1–3
остались зелёными, а новый сценарий зелёный под `privilege`, `two-clinic-blindness` и `staff-insert`
(он отказывает до того, как эти поверхности участвуют).

## 1. Чистый исходник — зелено

```bash
/home/dev/brain/host-orch/run-tests.sh "RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 node --test deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs"
```

```text
TAP version 13
# Subtest: врач сливает медицинский конфликт целиком под своей рантайм-ролью
ok 1 - врач сливает медицинский конфликт целиком под своей рантайм-ролью
  ---
  duration_ms: 2260.824807
  type: 'test'
  ...
# Subtest: конфликт в двух клиниках: первому врачу говорят правду, второй доводит слияние
ok 2 - конфликт в двух клиниках: первому врачу говорят правду, второй доводит слияние
  ---
  duration_ms: 2628.2131
  type: 'test'
  ...
# Subtest: роль врача не может выписать себе основание для двери
ok 3 - роль врача не может выписать себе основание для двери
  ---
  duration_ms: 2699.075634
  type: 'test'
  ...
# Subtest: врач чужой организации не проходит дверь конфликта соседней клиники
ok 4 - врач чужой организации не проходит дверь конфликта соседней клиники
  ---
  duration_ms: 2406.380413
  type: 'test'
  ...
1..4
# tests 4
# suites 0
# pass 4
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 10060.123726
[2026-09-15T05:39:54+03:00] pid=1996400 RELEASED test lock (rc=0, 10s)
```

Журнал самого нового сценария (тот же исходник, прогон с `DOCTOR_MEDICAL_MERGE_DOOR_ECHO=1`):

```text
# connected: db=bcb_webapp_dev as=postgres
# candidate migration applied: 9 owner-ordered blocks
# candidate privileges applied: 422 generated statements
# clinic 00000000-0000-4000-8000-0000000c1001 synthesized inside the rollback transaction (DEV has 1)
# clinic A (конфликт её) =a0000000-0000-4000-8000-000000000001 doctor=b0021a38-fb86-45e9-9aec-d85014e932d4
# clinic B (чужой врач)  =00000000-0000-4000-8000-0000000c1001 doctor=00000000-0000-4000-8000-0000000c2001
# fixture inserted (2 accounts, clinical history in BOTH clinics, one pending row per clinic)
# doctor B runtime: session_user=bcb_dev_webapp_staff current_user=app_staff org=00000000-0000-4000-8000-0000000c1001
# doctor B pressed merge on clinic A's conflict, door returned: {"targetId":"00000000-0000-4000-8000-00000000f1a1","duplicateId":"00000000-0000-4000-8000-00000000f1a2","mergeContactsSaved":[],"mergeOutcome":"conflict_not_found"}
# after the foreign attempt: {"duplicate_merged_into":null,"duplicate_credentials":1,"target_credentials":1,"clinic_a_row":"pending/null","clinic_b_row":"pending/null"}
# RESULT: PASS — a doctor of another organization is refused and clinic A's conflict is untouched
# rolled back; fixture rows left in the database: 0
```

## 2. С инъекцией — красный именно новый сценарий

```bash
/home/dev/brain/host-orch/run-tests.sh "RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 DOCTOR_MEDICAL_MERGE_DOOR_FAULT=foreign-org-conflict node --test deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs"
```

```text
# Subtest: врач сливает медицинский конфликт целиком под своей рантайм-ролью
ok 1 - врач сливает медицинский конфликт целиком под своей рантайм-ролью
  ---
  duration_ms: 2310.71632
  type: 'test'
  ...
# Subtest: конфликт в двух клиниках: первому врачу говорят правду, второй доводит слияние
ok 2 - конфликт в двух клиниках: первому врачу говорят правду, второй доводит слияние
  ---
  duration_ms: 2159.65606
  type: 'test'
  ...
# Subtest: роль врача не может выписать себе основание для двери
ok 3 - роль врача не может выписать себе основание для двери
  ---
  duration_ms: 2423.321084
  type: 'test'
  ...
# Subtest: врач чужой организации не проходит дверь конфликта соседней клиники
not ok 4 - врач чужой организации не проходит дверь конфликта соседней клиники
  ---
  duration_ms: 2656.391753
  type: 'test'
  location: '/home/dev/dev-projects/bcb-wt-merge-conflict/deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs:161:1'
  failureType: 'testCodeFailure'
  error: |-
    connected: db=bcb_webapp_dev as=postgres
    candidate migration applied: 9 owner-ordered blocks
    FAULT INJECTED: the door no longer checks that the conflict belongs to the doctor's organization
    candidate privileges applied: 422 generated statements
    clinic 00000000-0000-4000-8000-0000000c1001 synthesized inside the rollback transaction (DEV has 1)
    clinic A (конфликт её) =a0000000-0000-4000-8000-000000000001 doctor=b0021a38-fb86-45e9-9aec-d85014e932d4
    clinic B (чужой врач)  =00000000-0000-4000-8000-0000000c1001 doctor=00000000-0000-4000-8000-0000000c2001
    fixture inserted (2 accounts, clinical history in BOTH clinics, one pending row per clinic)
    doctor B runtime: session_user=bcb_dev_webapp_staff current_user=app_staff org=00000000-0000-4000-8000-0000000c1001
    doctor B pressed merge on clinic A's conflict, door returned: {"targetId":"00000000-0000-4000-8000-00000000f1a1","duplicateId":"00000000-0000-4000-8000-00000000f1a2","mergeContactsSaved":[],"mergeOutcome":"awaiting_other_organization"}
    after the foreign attempt: {"duplicate_merged_into":null,"duplicate_credentials":1,"target_credentials":1,"clinic_a_row":"pending/true","clinic_b_row":"pending/null"}
    RESULT: FAIL — the door answered 'awaiting_other_organization' to a doctor of another organization, expected 'conflict_not_found'
    rolled back; fixture rows left in the database: 0

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  operator: 'match'
  ...
1..4
# tests 4
# suites 0
# pass 3
# fail 1
# cancelled 0
# skipped 0
# todo 0
# duration_ms 9610.861506
[2026-09-15T05:39:41+03:00] pid=1995330 RELEASED test lock (rc=1, 9s)
```

Строка `"clinic_a_row":"pending/true"` под инъекцией — это и есть названный отказ в живом виде: врач
чужой организации поставил отметку «врач одобрил» на строку клиники А.

## 3. Остаток в базе и состояние DEV

```bash
/home/dev/brain/host-orch/run-tests.sh "sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -Atc \"...\""
```

```text
platform_users=0
merge_candidates=0
proof_orgs=0
door_tenant_check=0
```

`door_tenant_check=0` — это не отсутствующая проверка: самой функции на DEV нет вовсе, отдельный
запрос даёт `door_exists_on_dev=0`. Кандидатная миграция живёт только внутри rollback-транзакции
прогона, как и было задумано. Синтезированная клиника Б (`…0000000c1001`) тоже не осталась.

Продуктовый исходник не тронут: в миграции по-прежнему ровно одно вхождение
`AND candidate.organization_id = v_organization_id`, инъекция живёт только в оснастке как именованная
слепая поломка.

## Строка вердикта для ведущего (сам не заношу — работаю в ветке)

`Э4a круг 5 — F1 закрыт: набор краснеет на снятии tenant-проверки двери (3 pass / 1 fail, красный именно новый сценарий), чистый исходник 4 pass / 0 fail, остаток на DEV = 0.`

## НЕ СДЕЛАНО

- Полный CI (`pnpm run ci`) не запускался — прямо запрещено брифом, гоняет ведущий после приземления.
- Продуктовый код двери не трогался: брифом объявлен корректным и вне предмета.
- Строка вердикта в `feat` не занесена — её заносит ведущий; подпись в собственной ветке не считается.
- Галочка Э4a в `docs/_TODO/MERGE_MECHANISM_REWRITE_2026-09-14.md` оставлена `[ ]`: приёмка этапа за
  ведущим и владельцем, не за исполнителем коррекции.
- Инвертирующая ветка «под поломкой ждём FAIL» у трёх СТАРЫХ сценариев не снималась. Она ослабляет их
  как двоичное доказательство тем же образом, но это находка, а не пункт плана владельца — выношу
  вопросом ведущему, скоуп сам не завожу.
- Живая проверка в браузере не проводилась: предмет этапа — SQL-дверь, экраны врача это Э4b.
