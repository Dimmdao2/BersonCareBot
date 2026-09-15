Классификация (§24.4): **повторяемое поведение** — конечный список предикатов допуска проверен живой DEV-БД и fault injection; **качество разового действия** — §1/миграции и мета-якоря проверены чтением итогового состояния, точным поиском и одноразовыми runtime-check.

# Независимый аудит Э4c, круг 8 — конечный список предикатов допуска

Кандидат: `749bbd85f1455ec727b8b8a4f7f52a7182d1d89a`, ветка `wt/leads-kpi-live`.

Authority:

- `docs/_TODO/MERGE_MECHANISM_REWRITE_2026-09-14.md`, Э4c: оба решения врача требуют комментарий; отказ оставляет след; отправку администраторам решает врач.
- `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md`, §18б: медицинский конфликт внутри организации разбирает врач этой организации; решение относится к своей точной строке/паре, соседняя клиника решает сама.
- `AGENTS.md` §1, §10a, §10b, §24.4-§24.7.

## Вердикт: **PASS**

Конечный список предикатов допуска закрыт. Штатная сохранённая матрица на чистом кандидате дала
`faults=29 caught=29 missed=0 marker_missing=0 unexpected_rc=0 rollback_bad=0`, все 29 fault-ов имеют маркер
внесения и rollback `7/7`. Шесть пропусков круга 6 закрыты; новых пропущенных предикатов допуска в активных телах
дверей не нашёл. MUST FIX нет.

Строка вердикта для ведущего: `Э4c round 8 PASS — конечный список предикатов допуска закрыт; MUST FIX нет; commit <этого отчёта>.`

## Активные тела

Живая introspection была сделана после rollback-only установки кандидатных миграций и прав, через тот же harness,
что и proof-set. Временный audit-only proof-body был удалён после прогона.

Команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 DOCTOR_MEDICAL_MERGE_DOOR_ECHO=1 node --test --test-name-pattern='аудит снимает активные тела' deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs"
```

Результат: `tests=1 pass=1 fail=0`, `ROLLBACK_FACTS: {"fixtureRows":0}`. `ACTIVE_DOOR_DEFS` содержал четыре
сигнатуры:

- `app.read_staff_patient_medical_merge_refusal(uuid)`;
- `app.refuse_staff_patient_medical_merge_conflict(uuid,uuid,text,boolean)`;
- `app.transfer_staff_approved_platform_user_merge_data(uuid,uuid,uuid,uuid)`;
- `app.transfer_staff_approved_platform_user_merge_data(uuid,uuid,uuid,uuid,text)`.

## Предикаты допуска

| Активная дверь / предикат | Fault | Результат |
|---|---|---|
| read refusal: `id = p_conflict_id` | `refusal-read-any-row` | пойман |
| read refusal: `organization_id = app.current_org_id()` | `refusal-read-any-org` | пойман |
| read refusal: `status IN ('dismissed','escalated')` | `refusal-read-any-status` | пойман |
| read refusal: `reason LIKE 'medical_history:%'` | `refusal-read-any-reason` | пойман |
| refuse: обязательный комментарий | `refusal-comment-optional` | пойман |
| refuse: `id = p_conflict_id` | `refusal-write-any-row` | пойман наблюдаемым `FACTS.neighbourRows`, не `P0003` |
| refuse: `organization_id = app.current_org_id()` | `refusal-write-any-org` | пойман |
| refuse: `status = 'pending'` | `refusal-write-any-status` | пойман |
| refuse: `reason LIKE 'medical_history:%'` | `refusal-write-any-reason` | пойман |
| refuse: запись комментария | `comment-not-saved` | пойман |
| refuse: явный признак поддержки | `support-always-escalates` | пойман |
| refuse: гашение pending-индикатора | `decision-stays-pending` | пойман |
| approve 5 args: обязательный комментарий | `approval-comment-optional` | пойман |
| approve 5 args: запись комментария | `approval-comment-not-saved` | пойман |
| approve 5 args: `candidate.id = p_conflict_id` при записи | `approval-write-any-row` | пойман |
| approve 5 args: текущая организация при записи | `approval-comment-foreign-row` | пойман |
| approve 5 args: `candidate.status = 'pending'` | `approval-any-status` | пойман |
| approve 5 args: `candidate.reason LIKE 'medical_history:%'` | `approval-any-reason` | пойман |
| approve 5 args: неупорядоченная пара `anchor/candidate` | `approval-write-any-pair` | пойман |
| approve 5 args: обе tenant-стены сразу | `foreign-org-conflict` | пойман |
| approve 5 args: перенос ответа человека по ФИО через defer | `fio-decision-not-persisted` | пойман |
| transfer 4 args: медицинский блокер другой клиники | `two-clinic-blindness` | пойман |
| transfer 4 args: признание соседнего решения — организация | `neighbour-approval-any-org` | пойман |
| transfer 4 args: признание соседнего решения — статус | `neighbour-approval-any-status` | пойман |
| transfer 4 args: признание соседнего решения — причина | `neighbour-approval-any-reason` | пойман |
| transfer 4 args: признание соседнего решения — `doctorApproved` | `neighbour-approval-not-required` | пойман |
| transfer 4 args: признание соседнего решения — неупорядоченная пара | `neighbour-approval-any-pair` | пойман |
| роль врача не может изготовить основание | `staff-insert` | пойман |
| seam owner имеет нужные права исполнения | `privilege` | пойман |

Не считаю отдельной публичной поверхностью повтор тех же row/status/reason/pair-предикатов во внутренней
4-аргументной функции: она `invocation: internal`, `execute: []`, а публичная 5-аргументная дверь уже проверяет
точную строку и пару до вызова. Единственная уникальная часть внутренней двери — признание решения другой клиники;
она закрыта пятью decoy-строками. Предикаты переноса данных после уже принятого решения не входят в критерий
допуска Э4c и проверяются результатом слияния, а не отдельной строкой этой матрицы.

## Штатная матрица

Команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "bash deploy/postgres/privileges/doctor-medical-merge-door.fault-matrix.sh"
```

Результат: `SUMMARY faults=29 caught=29 missed=0 marker_missing=0 unexpected_rc=0 rollback_bad=0`; wrapper
вернул `rc=0`.

| Fault | Внесено | Поймано | Не поймано | Путь отчёта по непойманной |
|---|---:|---:|---:|---|
| `privilege` | 7 | 1 | 0 | — |
| `two-clinic-blindness` | 7 | 1 | 0 | — |
| `staff-insert` | 7 | 1 | 0 | — |
| `foreign-org-conflict` | 14 | 1 | 0 | — |
| `fio-decision-not-persisted` | 7 | 1 | 0 | — |
| `support-always-escalates` | 7 | 1 | 0 | — |
| `decision-stays-pending` | 7 | 1 | 0 | — |
| `comment-not-saved` | 7 | 1 | 0 | — |
| `approval-comment-not-saved` | 7 | 1 | 0 | — |
| `refusal-read-any-org` | 7 | 1 | 0 | — |
| `refusal-write-any-org` | 7 | 1 | 0 | — |
| `refusal-read-any-status` | 7 | 1 | 0 | — |
| `refusal-read-any-reason` | 7 | 1 | 0 | — |
| `approval-comment-foreign-row` | 7 | 1 | 0 | — |
| `approval-comment-optional` | 7 | 1 | 0 | — |
| `refusal-comment-optional` | 7 | 1 | 0 | — |
| `refusal-write-any-row` | 7 | 1 | 0 | — |
| `refusal-write-any-status` | 7 | 1 | 0 | — |
| `refusal-write-any-reason` | 7 | 1 | 0 | — |
| `approval-any-status` | 7 | 1 | 0 | — |
| `approval-any-reason` | 7 | 1 | 0 | — |
| `approval-write-any-row` | 7 | 1 | 0 | — |
| `approval-write-any-pair` | 7 | 1 | 0 | — |
| `refusal-read-any-row` | 7 | 1 | 0 | — |
| `neighbour-approval-any-org` | 7 | 1 | 0 | — |
| `neighbour-approval-any-status` | 7 | 1 | 0 | — |
| `neighbour-approval-any-reason` | 7 | 1 | 0 | — |
| `neighbour-approval-not-required` | 7 | 1 | 0 | — |
| `neighbour-approval-any-pair` | 7 | 1 | 0 | — |

`foreign-org-conflict` имеет `Внесено=14`, потому что один fault намеренно снимает две tenant-стены в каждом из
семи proof-body. У остальных режимов `Внесено=7`: один центральный маркер после успешной замены/изменения на
каждый proof-body.

## Честность новых поломок

`refusal-write-any-row` проверен отдельно, чтобы исключить старый ложный `P0003`.

Команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 DOCTOR_MEDICAL_MERGE_DOOR_ECHO=1 DOCTOR_MEDICAL_MERGE_DOOR_FAULT=refusal-write-any-row node --test --test-name-pattern='врач чужой организации не читает' deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs"
```

Результат: wrapper `rc=1`, `FAULT INJECTED: refusal-write-any-row`, `ROLLBACK_FACTS: {"fixtureRows":0}`.
Красный факт наблюдаемый: `FACTS.neighbourRows.ownResolved` остался `pending/null`, а
`FACTS.neighbourRows.pending` стал `dismissed` с комментарием `Клиника А: это разные люди, я их обоих веду` и
`resolvedBy="clinicA_doctor"`. `P0003` в выводе нет.

Пять decoy-строк соседней клиники проверены штатной матрицей: все `neighbour-approval-*` краснеют в subtest
`конфликт в двух клиниках...`, то есть не приписывают поверхность read/refusal-дверям и не дублируют один
status/reason-класс.

## Мета-инъекция якоря

Проверил, что отказ `replaceOnce` не считается пойманной поломкой. Для этого временно испортил anchor
`approval-comment-foreign-row` в `doctor-medical-merge-door.proofHarness.mjs` и запустил сохранённую матрицу.
Временная правка после прогона удалена; `git diff` по proof-файлам пустой.

Команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "bash deploy/postgres/privileges/doctor-medical-merge-door.fault-matrix.sh"
```

Результат мета-прогона: `SUMMARY faults=29 caught=28 missed=0 marker_missing=1 unexpected_rc=0 rollback_bad=0`;
wrapper вернул `rc=1`. Строка fault-а: `approval-comment-foreign-row rc=1 marker=0 rollback=7/7`. Значит матрица
не засчитала отказ якоря как caught и остановила gate.

## Baseline и §1

Baseline:

```bash
/home/dev/brain/host-orch/run-tests.sh "RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 DOCTOR_MEDICAL_MERGE_DOOR_ECHO=1 node --test deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs"
```

Результат: `tests=7 pass=7 fail=0`, семь строк `ROLLBACK_FACTS: {"fixtureRows":0}`.

Проверка §1:

```bash
rg -n "\b(GRANT|REVOKE|CREATE POLICY)\b" apps/webapp/db/drizzle-migrations/20260914T220000_doctor_resolves_medical_merge_conflict.sql apps/webapp/db/drizzle-migrations/20260915T102455_doctor_merge_decision_has_a_record.sql apps/webapp/db/drizzle-migrations/20260915T150000_the_person_fio_answer_survives_the_doctor_defer.sql
```

Результат: пустой вывод, `exit 1` от `rg` как «совпадений нет». Команда `git diff --name-only HEAD^ HEAD`
показывает, что коммит `749bbd85f` меняет только proof/test/report-файлы круга 7; миграции в этом коммите не
трогались.

## MUST FIX

Нет.

## ВОПРОСЫ ВЛАДЕЛЬЦУ

Нет.

## НЕ СДЕЛАНО

- Product-код, миграции, декларацию прав и generated-артефакты не менял.
- Миграции из клона на DEV не накатывал; все DB-проверки шли rollback-only через `RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1`.
- Полный CI не запускал.
- UI, браузер и второй Next-сервер не запускал.
- TEST, старый PROD и новый PROD не трогал; TEST-режим не менял.
- Строку вердикта в `feat`, landing, push и taskdb-статусы не выполнял.
