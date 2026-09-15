# Адверсарный аудит Э4a, круг 4: ответ двери и состояние конфликта

Дата: 2026-09-15. Candidate: `a344c3b1a` поверх `7ef7abfba`.

Authority: `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md` §18б и brief этого аудита.
Классификация до проверки: пункты 1/2/3/5 — поведение + живая DEV-проба; пункт 4 — разовые
fault injection без сохранения новых тестов. Полный CI не запускался. Все тесты и обращения к DEV-БД
запущены через `/home/dev/brain/host-orch/run-tests.sh`.

## Вердикт

**FAIL.** Поведение candidate в названных сценариях корректно, но обязательная инъекция снятия
принадлежности врача организации не покраснила существующий набор: `3 pass / 0 fail`.

### F1 — набор не ловит снятие tenant-проверки двери

- Нарушенное требование: §18б — конфликт разбирает врач **той организации**, где он возник; brief,
  пункт 4 — каждая из трёх названных инъекций обязана покраснеть.
- Инъекция: в `app.transfer_staff_approved_platform_user_merge_data` строка
  `AND candidate.organization_id = v_organization_id` временно заменена на `AND TRUE`.
- Результат: существующий живой набор завершился `3 pass / 0 fail`.
- Достижимый неверный исход при таком regression: реальный `app_staff` с принятым контекстом чужой
  организации и известными `conflictId`/парой проходит SECURITY DEFINER-дверь чужого конфликта;
  дверь может перенести identity/auth и медицинские строки. Текущий candidate защищён проверкой,
  что отдельно доказано пунктом 5; finding относится к отсутствующему зубу regression-набора.

## 1. Штатная живая проба и остаток

Команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 DOCTOR_MEDICAL_MERGE_DOOR_ECHO=1 node --test deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs"
```

Полный вывод:

```text
[2026-09-15T04:54:08+03:00] pid=1826459 WAITING for test lock :: RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 DOCTOR_MEDICAL_MERGE_DOOR_ECHO=1 node --test deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs
[2026-09-15T04:59:21+03:00] pid=1826459 ACQUIRED test lock :: RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 DOCTOR_MEDICAL_MERGE_DOOR_ECHO=1 node --test deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs
TAP version 13
# connected: db=bcb_webapp_dev as=postgres
# candidate migration applied: 9 owner-ordered blocks
# candidate privileges applied: 422 generated statements
# fixture clinic=a0000000-0000-4000-8000-000000000001 doctor=b0021a38-fb86-45e9-9aec-d85014e932d4 login=bcb_dev_webapp_staff
# fixture rows inserted (2 accounts, clinical history on both sides, pending conflict)
# runtime role installed: session_user=bcb_dev_webapp_staff current_user=app_staff org=a0000000-0000-4000-8000-000000000001
# [platform-merge] [merge] merged duplicate into target {
#   targetId: '00000000-0000-4000-8000-00000000e1a1',
#   duplicateId: '00000000-0000-4000-8000-00000000e1a2',
#   reason: 'projection',
#   mergeContactsSaved: [],
#   mergeContext: {
#     actorId: 'b0021a38-fb86-45e9-9aec-d85014e932d4',
#     source: 'doctor_medical_conflict_review'
#   }
# }
# merge returned: {"targetId":"00000000-0000-4000-8000-00000000e1a1","duplicateId":"00000000-0000-4000-8000-00000000e1a2","mergeContactsSaved":[],"mergeOutcome":"merged"}
# after merge: {"duplicate_merged_into":"00000000-0000-4000-8000-00000000e1a1","duplicate_credentials":0,"target_visits":2,"conflict_status":"resolved"}
# RESULT: PASS — merge completed under the doctor runtime role, no privilege refusal
# rolled back; fixture rows left in the database: 0
# connected: db=bcb_webapp_dev as=postgres
# candidate migration applied: 9 owner-ordered blocks
# candidate privileges applied: 422 generated statements
# clinic 00000000-0000-4000-8000-0000000c1001 synthesized inside the rollback transaction (DEV has 1)
# clinic A=a0000000-0000-4000-8000-000000000001 doctor=b0021a38-fb86-45e9-9aec-d85014e932d4
# clinic B=00000000-0000-4000-8000-0000000c1001 doctor=00000000-0000-4000-8000-0000000c2001
# fixture inserted (2 accounts, clinical history in BOTH clinics, one pending row per clinic)
# doctor A runtime: session_user=bcb_dev_webapp_staff current_user=app_staff org=a0000000-0000-4000-8000-000000000001
# doctor A merge returned: {"targetId":"00000000-0000-4000-8000-00000000d1a1","duplicateId":"00000000-0000-4000-8000-00000000d1a2","mergeContactsSaved":[],"mergeOutcome":"awaiting_other_organization"}
# doctor A indicator still shows pending medical conflicts: 1
# doctor A still sees his conflict: yes, doctorApproved=true
# after doctor A pressed merge: {"duplicate_merged_into":null,"duplicate_credentials":1,"target_credentials":1,"clinic_a_row":"pending/true","clinic_b_row":"pending/null"}
# doctor B runtime: session_user=bcb_dev_webapp_staff current_user=app_staff org=00000000-0000-4000-8000-0000000c1001
# [platform-merge] [merge] merged duplicate into target {
#   targetId: '00000000-0000-4000-8000-00000000d1a1',
#   duplicateId: '00000000-0000-4000-8000-00000000d1a2',
#   reason: 'projection',
#   mergeContactsSaved: [],
#   mergeContext: {
#     actorId: '00000000-0000-4000-8000-0000000c2001',
#     source: 'doctor_medical_conflict_review'
#   }
# }
# doctor B merge returned: {"targetId":"00000000-0000-4000-8000-00000000d1a1","duplicateId":"00000000-0000-4000-8000-00000000d1a2","mergeContactsSaved":[],"mergeOutcome":"merged"}
# after doctor B pressed merge: {"duplicate_merged_into":"00000000-0000-4000-8000-00000000d1a1","duplicate_credentials":0,"clinic_a_row":"resolved","clinic_b_row":"resolved","target_visits":4}
# RESULT: PASS — the first clinic got a truthful refusal, the second one completed the merge
# rolled back; fixture rows left in the database: 0
# connected: db=bcb_webapp_dev as=postgres
# candidate migration applied: 9 owner-ordered blocks
# candidate privileges applied: 422 generated statements
# clinic=a0000000-0000-4000-8000-000000000001 doctor=b0021a38-fb86-45e9-9aec-d85014e932d4
# fixture inserted (2 outsiders: no enrollment in this clinic, no medical history)
# runtime role installed: session_user=bcb_dev_webapp_staff current_user=app_staff org=a0000000-0000-4000-8000-000000000001
# forgery refused: 42501 permission denied for table patient_merge_candidates
# after: {"tgt_creds":1,"dup_creds":1,"forged_rows":0}
# RESULT: PASS — app_staff cannot write the row the door trusts, and nothing moved
# rolled back; fixture rows left in the database: 0
# Subtest: врач сливает медицинский конфликт целиком под своей рантайм-ролью
ok 1 - врач сливает медицинский конфликт целиком под своей рантайм-ролью
  ---
  duration_ms: 2478.683076
  type: 'test'
  ...
# Subtest: конфликт в двух клиниках: первому врачу говорят правду, второй доводит слияние
ok 2 - конфликт в двух клиниках: первому врачу говорят правду, второй доводит слияние
  ---
  duration_ms: 2220.305713
  type: 'test'
  ...
# Subtest: роль врача не может выписать себе основание для двери
ok 3 - роль врача не может выписать себе основание для двери
  ---
  duration_ms: 2044.264015
  type: 'test'
  ...
1..3
# tests 3
# suites 0
# pass 3
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 6806.022651
[2026-09-15T04:59:28+03:00] pid=1826459 RELEASED test lock (rc=0, 7s)
```

Отдельный residual-check после пробы:

```bash
/home/dev/brain/host-orch/run-tests.sh "sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -Atc \"SELECT 'platform_users=' || count(*) FROM public.platform_users WHERE id::text IN ('00000000-0000-4000-8000-00000000e1a1','00000000-0000-4000-8000-00000000e1a2','00000000-0000-4000-8000-00000000d1a1','00000000-0000-4000-8000-00000000d1a2','00000000-0000-4000-8000-00000000d2a1','00000000-0000-4000-8000-00000000d2a2'); SELECT 'patient_merge_candidates=' || count(*) FROM public.patient_merge_candidates WHERE id::text IN ('00000000-0000-4000-8000-00000000e1c1','00000000-0000-4000-8000-00000000d1c1','00000000-0000-4000-8000-00000000d1c2','00000000-0000-4000-8000-00000000d2c1'); SELECT 'auto_merge_conflict=' || count(*) FROM public.admin_audit_log WHERE action = 'auto_merge_conflict' AND (target_id IN ('00000000-0000-4000-8000-00000000e1a1','00000000-0000-4000-8000-00000000d1a1','00000000-0000-4000-8000-00000000d2a1') OR details::text LIKE '%00000000-0000-4000-8000-00000000e1a1%' OR details::text LIKE '%00000000-0000-4000-8000-00000000d1a1%' OR details::text LIKE '%00000000-0000-4000-8000-00000000d2a1%');\""
```

Полный вывод:

```text
[2026-09-15T05:09:30+03:00] pid=1878730 ACQUIRED test lock :: sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -Atc "..."
platform_users=0
patient_merge_candidates=0
auto_merge_conflict=0
[2026-09-15T05:09:31+03:00] pid=1878730 RELEASED test lock (rc=0, 1s)
```

## 2, 3 и 5. Post-approval исходы, повтор/отказ и чужая организация

Одноразовый case был временно подключён к существующему proof harness и после прогона удалён. Он
работал в общей транзакции с итоговым `ROLLBACK`; кандидатная миграция на DEV не применялась.

Команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 DOCTOR_MEDICAL_MERGE_DOOR_ECHO=1 node --test --test-name-pattern='одноразовый adversarial' deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs"
```

Полный итоговый вывод:

```text
[2026-09-15T05:24:33+03:00] pid=1956039 WAITING for test lock :: RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 DOCTOR_MEDICAL_MERGE_DOOR_ECHO=1 node --test --test-name-pattern='одноразовый adversarial' deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs
[2026-09-15T05:24:33+03:00] pid=1956039 ACQUIRED test lock :: RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 DOCTOR_MEDICAL_MERGE_DOOR_ECHO=1 node --test --test-name-pattern='одноразовый adversarial' deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs
TAP version 13
# connected: db=bcb_webapp_dev as=postgres
# candidate migration applied: 9 owner-ordered blocks
# candidate privileges applied: 422 generated statements
# clinic 00000000-0000-4000-8000-0000000c1001 synthesized inside the rollback transaction (DEV has 1)
# clinic 00000000-0000-4000-8000-0000000c1002 synthesized inside the rollback transaction (DEV has 1)
# post-approval policy refusal surfaced: MergeConflictError: merge: two different non-null phone numbers
# after policy-refusal rollback: {"merged_into":null,"conflict":"pending/null","dup_creds":1}
# post-approval engine crash surfaced: P0001: audit injected final merge crash
# after engine-crash rollback: {"merged_into":null,"conflict":"pending/null","dup_creds":1}
# unrelated doctor runtime: session_user=bcb_dev_webapp_staff current_user=app_staff org=00000000-0000-4000-8000-0000000c1002
# unrelated doctor: list=0 read=null mergeOutcome=conflict_not_found
# same doctor presses twice: first=awaiting_other_organization second=awaiting_other_organization
# doctor B refused=true; after refusal: {"clinic_a":"pending/true","clinic_b":"escalated/null","merged_into":null,"admin_open":1}; doctor A indicator=1
# RESULT: PASS — post-approval failures are non-success and atomic; repeat/refusal/foreign-org state is honest
# rolled back; adversarial leftovers: {"users":0,"conflicts":0,"audit_rows":0}
# rolled back; fixture rows left in the database: 0
# Subtest: одноразовый adversarial state/tenant/post-approval probe
ok 1 - одноразовый adversarial state/tenant/post-approval probe
  ---
  duration_ms: 5773.687569
  type: 'test'
  ...
1..1
# tests 1
# suites 0
# pass 1
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 5842.812823
[2026-09-15T05:24:39+03:00] pid=1956039 RELEASED test lock (rc=0, 6s)
```

Интерпретация ответа двери:

- `merged` наблюдаемо соответствует слитой паре;
- `awaiting_other_organization` соответствует неслитой паре и штатный route отвечает `409`;
- естественный post-approval policy refusal и injected DB-crash пробрасываются ошибкой, транзакция
  откатывается, поэтому HTTP-success невозможен; route не перехватывает ошибку и отдаёт её в Next error boundary;
- одноразовый route-case исполнил это поведение напрямую:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run --project route 'src/app/api/doctor/account-merge-conflicts/[conflictId]/mergeConflictOutcome.route.test.ts' --reporter=verbose"
```

```text
[2026-09-15T05:25:52+03:00] pid=1960179 WAITING for test lock :: pnpm --dir apps/webapp exec vitest run --project route 'src/app/api/doctor/account-merge-conflicts/[conflictId]/mergeConflictOutcome.route.test.ts' --reporter=verbose
[2026-09-15T05:25:52+03:00] pid=1960179 ACQUIRED test lock :: pnpm --dir apps/webapp exec vitest run --project route 'src/app/api/doctor/account-merge-conflicts/[conflictId]/mergeConflictOutcome.route.test.ts' --reporter=verbose

 RUN  v5.0.0 /home/dev/dev-projects/bcb-wt-merge-conflict/apps/webapp

stdout | src/app/api/doctor/account-merge-conflicts/[conflictId]/mergeConflictOutcome.route.test.ts > врач нажал «слить» — ответ соответствует тому, что произошло (§18б) > одноразово: post-approval ошибка движка не превращается в успех
post-approval route outcome: rejected to Next error boundary (not HTTP success)

 ✓ |route| src/app/api/doctor/account-merge-conflicts/[conflictId]/mergeConflictOutcome.route.test.ts > врач нажал «слить» — ответ соответствует тому, что произошло (§18б) > слияние состоялось — врач получает успех 8ms
 ✓ |route| src/app/api/doctor/account-merge-conflicts/[conflictId]/mergeConflictOutcome.route.test.ts > врач нажал «слить» — ответ соответствует тому, что произошло (§18б) > слияния не было, ждём вторую клинику — врач НЕ получает успех 3ms
 ✓ |route| src/app/api/doctor/account-merge-conflicts/[conflictId]/mergeConflictOutcome.route.test.ts > врач нажал «слить» — ответ соответствует тому, что произошло (§18б) > незакрытого конфликта этой клиники нет — отказ 1ms
 ✓ |route| src/app/api/doctor/account-merge-conflicts/[conflictId]/mergeConflictOutcome.route.test.ts > врач нажал «слить» — ответ соответствует тому, что произошло (§18б) > одноразово: post-approval ошибка движка не превращается в успех 3ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
   Start at  05:25:53
   Duration  283ms (import 56%, transform 23%, tests 10%, setup 8%, worker 3%)

[2026-09-15T05:25:53+03:00] pid=1960179 RELEASED test lock (rc=0, 1s)
```

## 4. Таблица инъекций

| Инъекция | Точный временный patch | Результат |
|---|---|---|
| Вернуть булеву трактовку outcome | route: `const outcome` + две ветки → `const merged; if (!merged) 403; else 200` | **Поймана**, `2 failed / 1 passed` |
| Ответить 200 на ожидание | route: `{ status: 409 }` → `{ status: 200 }` | **Поймана**, `1 failed / 2 passed` |
| Снять принадлежность организации | migration: `AND candidate.organization_id = v_organization_id` → `AND TRUE` | **НЕ ПОЙМАНА**, `3 pass / 0 fail` — F1 |

### 4.1 Булева трактовка

Команда после временного patch:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run --project route 'src/app/api/doctor/account-merge-conflicts/[conflictId]/mergeConflictOutcome.route.test.ts'"
```

Полный вывод:

```text
[2026-09-15T05:19:30+03:00] pid=1914822 ACQUIRED test lock :: pnpm --dir apps/webapp exec vitest run --project route 'src/app/api/doctor/account-merge-conflicts/[conflictId]/mergeConflictOutcome.route.test.ts'

 RUN  v5.0.0 /home/dev/dev-projects/bcb-wt-merge-conflict/apps/webapp

 ❯ |route| src/app/api/doctor/account-merge-conflicts/[conflictId]/mergeConflictOutcome.route.test.ts (3 tests | 2 failed) 101ms
   ❯ врач нажал «слить» — ответ соответствует тому, что произошло (§18б) (3)
     × слияния не было, ждём вторую клинику — врач НЕ получает успех 10ms
     × незакрытого конфликта этой клиники нет — отказ 3ms

 FAIL  |route| src/app/api/doctor/account-merge-conflicts/[conflictId]/mergeConflictOutcome.route.test.ts > врач нажал «слить» — ответ соответствует тому, что произошло (§18б) > слияния не было, ждём вторую клинику — врач НЕ получает успех
AssertionError: expected true not to be true // Object.is equality
 ❯ src/app/api/doctor/account-merge-conflicts/[conflictId]/mergeConflictOutcome.route.test.ts:70:33

 FAIL  |route| src/app/api/doctor/account-merge-conflicts/[conflictId]/mergeConflictOutcome.route.test.ts > врач нажал «слить» — ответ соответствует тому, что произошло (§18б) > незакрытого конфликта этой клиники нет — отказ
AssertionError: expected 200 to be 403 // Object.is equality

- Expected
+ Received

- 403
+ 200

 Test Files  1 failed (1)
      Tests  2 failed | 1 passed (3)
   Duration  818ms (import 51%, tests 24%, transform 21%, setup 3%, worker 2%)
[2026-09-15T05:19:33+03:00] pid=1914822 RELEASED test lock (rc=1, 3s)
```

### 4.2 HTTP 200 на ожидание

Команда та же после временной замены `409` на `200`.

Полный вывод:

```text
[2026-09-15T05:20:08+03:00] pid=1945888 WAITING for test lock :: pnpm --dir apps/webapp exec vitest run --project route 'src/app/api/doctor/account-merge-conflicts/[conflictId]/mergeConflictOutcome.route.test.ts'
[2026-09-15T05:20:08+03:00] pid=1945888 ACQUIRED test lock :: pnpm --dir apps/webapp exec vitest run --project route 'src/app/api/doctor/account-merge-conflicts/[conflictId]/mergeConflictOutcome.route.test.ts'

 RUN  v5.0.0 /home/dev/dev-projects/bcb-wt-merge-conflict/apps/webapp

 ❯ |route| src/app/api/doctor/account-merge-conflicts/[conflictId]/mergeConflictOutcome.route.test.ts (3 tests | 1 failed) 87ms
   ❯ врач нажал «слить» — ответ соответствует тому, что произошло (§18б) (3)
     × слияния не было, ждём вторую клинику — врач НЕ получает успех 77ms

 FAIL  |route| src/app/api/doctor/account-merge-conflicts/[conflictId]/mergeConflictOutcome.route.test.ts > врач нажал «слить» — ответ соответствует тому, что произошло (§18б) > слияния не было, ждём вторую клинику — врач НЕ получает успех
AssertionError: expected 200 not to be 200 // Object.is equality
 ❯ src/app/api/doctor/account-merge-conflicts/[conflictId]/mergeConflictOutcome.route.test.ts:71:32

 Test Files  1 failed (1)
      Tests  1 failed | 2 passed (3)
   Duration  972ms (import 63%, tests 18%, transform 15%, setup 3%, worker 2%)
[2026-09-15T05:20:11+03:00] pid=1945888 RELEASED test lock (rc=1, 3s)
```

### 4.3 Снятие tenant-проверки

Точный временный patch:

```diff
-       AND candidate.organization_id = v_organization_id
+       AND TRUE -- AUDIT FAULT: foreign-organization conflict accepted
```

Команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 DOCTOR_MEDICAL_MERGE_DOOR_ECHO=1 node --test deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs"
```

Полный вывод:

```text
[2026-09-15T05:20:39+03:00] pid=1946743 WAITING for test lock :: RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 DOCTOR_MEDICAL_MERGE_DOOR_ECHO=1 node --test deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs
[2026-09-15T05:20:39+03:00] pid=1946743 ACQUIRED test lock :: RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 DOCTOR_MEDICAL_MERGE_DOOR_ECHO=1 node --test deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs
TAP version 13
# connected: db=bcb_webapp_dev as=postgres
# candidate migration applied: 9 owner-ordered blocks
# candidate privileges applied: 422 generated statements
# fixture clinic=a0000000-0000-4000-8000-000000000001 doctor=b0021a38-fb86-45e9-9aec-d85014e932d4 login=bcb_dev_webapp_staff
# fixture rows inserted (2 accounts, clinical history on both sides, pending conflict)
# runtime role installed: session_user=bcb_dev_webapp_staff current_user=app_staff org=a0000000-0000-4000-8000-000000000001
# [platform-merge] [merge] merged duplicate into target {
#   targetId: '00000000-0000-4000-8000-00000000e1a1',
#   duplicateId: '00000000-0000-4000-8000-00000000e1a2',
#   reason: 'projection',
#   mergeContactsSaved: [],
#   mergeContext: { actorId: 'b0021a38-fb86-45e9-9aec-d85014e932d4', source: 'doctor_medical_conflict_review' }
# }
# merge returned: {"targetId":"00000000-0000-4000-8000-00000000e1a1","duplicateId":"00000000-0000-4000-8000-00000000e1a2","mergeContactsSaved":[],"mergeOutcome":"merged"}
# after merge: {"duplicate_merged_into":"00000000-0000-4000-8000-00000000e1a1","duplicate_credentials":0,"target_visits":2,"conflict_status":"resolved"}
# RESULT: PASS — merge completed under the doctor runtime role, no privilege refusal
# rolled back; fixture rows left in the database: 0
# connected: db=bcb_webapp_dev as=postgres
# candidate migration applied: 9 owner-ordered blocks
# candidate privileges applied: 422 generated statements
# clinic 00000000-0000-4000-8000-0000000c1001 synthesized inside the rollback transaction (DEV has 1)
# clinic A=a0000000-0000-4000-8000-000000000001 doctor=b0021a38-fb86-45e9-9aec-d85014e932d4
# clinic B=00000000-0000-4000-8000-0000000c1001 doctor=00000000-0000-4000-8000-0000000c2001
# fixture inserted (2 accounts, clinical history in BOTH clinics, one pending row per clinic)
# doctor A runtime: session_user=bcb_dev_webapp_staff current_user=app_staff org=a0000000-0000-4000-8000-000000000001
# doctor A merge returned: {"targetId":"00000000-0000-4000-8000-00000000d1a1","duplicateId":"00000000-0000-4000-8000-00000000d1a2","mergeContactsSaved":[],"mergeOutcome":"awaiting_other_organization"}
# doctor A indicator still shows pending medical conflicts: 1
# doctor A still sees his conflict: yes, doctorApproved=true
# after doctor A pressed merge: {"duplicate_merged_into":null,"duplicate_credentials":1,"target_credentials":1,"clinic_a_row":"pending/true","clinic_b_row":"pending/null"}
# doctor B runtime: session_user=bcb_dev_webapp_staff current_user=app_staff org=00000000-0000-4000-8000-0000000c1001
# [platform-merge] [merge] merged duplicate into target {
#   targetId: '00000000-0000-4000-8000-00000000d1a1',
#   duplicateId: '00000000-0000-4000-8000-00000000d1a2',
#   reason: 'projection',
#   mergeContactsSaved: [],
#   mergeContext: { actorId: '00000000-0000-4000-8000-0000000c2001', source: 'doctor_medical_conflict_review' }
# }
# doctor B merge returned: {"targetId":"00000000-0000-4000-8000-00000000d1a1","duplicateId":"00000000-0000-4000-8000-00000000d1a2","mergeContactsSaved":[],"mergeOutcome":"merged"}
# after doctor B pressed merge: {"duplicate_merged_into":"00000000-0000-4000-8000-00000000d1a1","duplicate_credentials":0,"clinic_a_row":"resolved","clinic_b_row":"resolved","target_visits":4}
# RESULT: PASS — the first clinic got a truthful refusal, the second one completed the merge
# rolled back; fixture rows left in the database: 0
# connected: db=bcb_webapp_dev as=postgres
# candidate migration applied: 9 owner-ordered blocks
# candidate privileges applied: 422 generated statements
# clinic=a0000000-0000-4000-8000-000000000001 doctor=b0021a38-fb86-45e9-9aec-d85014e932d4
# fixture inserted (2 outsiders: no enrollment in this clinic, no medical history)
# runtime role installed: session_user=bcb_dev_webapp_staff current_user=app_staff org=a0000000-0000-4000-8000-000000000001
# forgery refused: 42501 permission denied for table patient_merge_candidates
# after: {"tgt_creds":1,"dup_creds":1,"forged_rows":0}
# RESULT: PASS — app_staff cannot write the row the door trusts, and nothing moved
# rolled back; fixture rows left in the database: 0
# Subtest: врач сливает медицинский конфликт целиком под своей рантайм-ролью
ok 1 - врач сливает медицинский конфликт целиком под своей рантайм-ролью
  ---
  duration_ms: 8805.546571
  type: 'test'
  ...
# Subtest: конфликт в двух клиниках: первому врачу говорят правду, второй доводит слияние
ok 2 - конфликт в двух клиниках: первому врачу говорят правду, второй доводит слияние
  ---
  duration_ms: 8873.49688
  type: 'test'
  ...
# Subtest: роль врача не может выписать себе основание для двери
ok 3 - роль врача не может выписать себе основание для двери
  ---
  duration_ms: 5323.305466
  type: 'test'
  ...
1..3
# tests 3
# suites 0
# pass 3
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 23141.085485
[2026-09-15T05:21:02+03:00] pid=1946743 RELEASED test lock (rc=0, 23s)
```

## Финальное восстановление

Все fault-инъекции и одноразовые probe-файлы возвращены/удалены. Штатный route-тест после возврата:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run --project route 'src/app/api/doctor/account-merge-conflicts/[conflictId]/mergeConflictOutcome.route.test.ts'"
```

```text
[2026-09-15T05:25:21+03:00] pid=1958736 WAITING for test lock :: pnpm --dir apps/webapp exec vitest run --project route 'src/app/api/doctor/account-merge-conflicts/[conflictId]/mergeConflictOutcome.route.test.ts'
[2026-09-15T05:25:21+03:00] pid=1958736 ACQUIRED test lock :: pnpm --dir apps/webapp exec vitest run --project route 'src/app/api/doctor/account-merge-conflicts/[conflictId]/mergeConflictOutcome.route.test.ts'

 RUN  v5.0.0 /home/dev/dev-projects/bcb-wt-merge-conflict/apps/webapp

 Test Files  1 passed (1)
      Tests  3 passed (3)
   Start at  05:25:22
   Duration  279ms (import 68%, transform 11%, setup 9%, tests 8%, worker 4%)

[2026-09-15T05:25:22+03:00] pid=1958736 RELEASED test lock (rc=0, 1s)
```

Строка для ведущего (сам аудитор план не меняет):

`FAIL — обязательная tenant-membership fault injection не поймана существующим набором; две route-инъекции пойманы, штатное и adversarial runtime-поведение candidate корректно, DEV cleanup = 0.`
