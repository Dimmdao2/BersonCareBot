Классификация (§24.4): **повторяемое поведение** — двери и доказательный набор проверены живой DEV-БД и fault injection; **качество разового действия** — отсутствие прав в миграциях проверено итоговым diff и точным поиском.

# Независимый аудит Э4c, круг 6 — доказательный набор дверей решения врача

Кандидат: `f2095e94b3990e274b96d18cc754c953f28b0fd0`, ветка `wt/leads-kpi-live`.

Authority:

- `docs/_TODO/MERGE_MECHANISM_REWRITE_2026-09-14.md`, Э4c: комментарий обязателен у обоих решений; отказ оставляет след; отправку администраторам решает врач;
- `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md`, §18б: конфликт разбирает врач своей организации, решение относится к одной точной паре/строке, соседняя клиника принимает собственное решение;
- `AGENTS.md` §1, §10a, §10b, §24.4–§24.7.

## Вердикт: **FAIL**

Чистый набор зелёный `7/7`, а все 21 встроенная мутация дают ненулевой код. Но это не закрывает собственный
критерий набора «каждый предикат допуска к решению»: шесть снятых предикатов доехали в активные тела и оставили
набор зелёным. Ещё два предиката случайно ловятся существующими сценариями, но не имеют обещанного поимённого
fault-а. Кроме того, для десяти встроенных мутаций матрица не умеет отличить красное поведение от отказавшего
якоря, а `refusal-write-any-row` краснеет не на заявленном наблюдаемом факте.

## Активные тела, а не старые редакции миграций

Кандидатный harness применяет миграции по имени внутри транзакции и затем откатывает. Через
`pg_get_functiondef` после этого получены именно четыре активные сигнатуры:

- `app.transfer_staff_approved_platform_user_merge_data(uuid,uuid,uuid,uuid,text)`;
- `app.transfer_staff_approved_platform_user_merge_data(uuid,uuid,uuid,uuid)`;
- `app.refuse_staff_patient_medical_merge_conflict(uuid,uuid,text,boolean)`;
- `app.read_staff_patient_medical_merge_refusal(uuid)`.

Команда живой интроспекции (временная печать `ACTIVE_DOOR_PREDICATES` была снята после прогона):

```bash
/home/dev/brain/host-orch/run-tests.sh "RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 DOCTOR_MEDICAL_MERGE_DOOR_ECHO=1 node --test --test-name-pattern='врач чужой организации не читает' deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs"
```

Результат: `tests=1 pass=1 fail=0`, `ROLLBACK_FACTS.fixtureRows=0`; список `identities` содержит четыре сигнатуры
выше. Предикаты ниже разобраны из этих тел после последнего `CREATE OR REPLACE`, а не из вытесненной первой
редакции отказа.

## Предикаты допуска → fault

| Активная дверь / предикат | Fault набора или аудита | Результат |
|---|---|---|
| read refusal: `c.id = p_conflict_id` | **нет встроенного**; аудит `audit-refusal-read-any-row` | красный, но обещанного имени в наборе нет |
| read refusal: текущая организация | `refusal-read-any-org` | красный |
| read refusal: `status IN ('dismissed','escalated')` | `refusal-read-any-status` | красный |
| read refusal: `reason LIKE 'medical_history:%'` | `refusal-read-any-reason` | красный |
| refuse: `id = p_conflict_id` | `refusal-write-any-row` | красный **нечестно**: `P0003`, см. F3 |
| refuse: текущая организация | `refusal-write-any-org` | красный |
| refuse: `status = 'pending'` | `refusal-write-any-status` | красный |
| refuse: `reason LIKE 'medical_history:%'` | `refusal-write-any-reason` | красный |
| refuse: обязательный комментарий | `refusal-comment-optional` | красный |
| accept 5 arg: `candidate.id = p_conflict_id` | **нет**; аудит `audit-approval-any-row` | **зелёный** |
| accept 5 arg: текущая организация | `approval-comment-foreign-row`; обе стены — `foreign-org-conflict` | красный |
| accept 5 arg: `candidate.status = 'pending'` | `approval-any-status` | красный |
| accept 5 arg: `candidate.reason LIKE 'medical_history:%'` | `approval-any-reason` | красный |
| accept 5 arg: обе половины неупорядоченной пары | **нет**; аудит `audit-approval-any-pair` | **зелёный** |
| accept 5 arg: обязательный комментарий | `approval-comment-optional` | красный |
| внутренний transfer: конфликт обеих учёток в другой организации | `two-clinic-blindness` | красный |
| признание решения соседней строки: та же организация | **нет**; аудит `audit-neighbour-any-org` | **зелёный** |
| признание решения соседней строки: `pending/resolved` | **нет**; аудит `audit-neighbour-any-status` | **зелёный** |
| признание решения соседней строки: медицинская причина | **нет**; аудит `audit-neighbour-any-reason` | **зелёный** |
| признание решения соседней строки: `doctorApproved=true` | **нет встроенного**; аудит `audit-neighbour-approval-not-required` | красный, но обещанного имени в наборе нет |
| признание решения соседней строки: та же неупорядоченная пара | **нет**; аудит `audit-neighbour-any-pair` | **зелёный** |
| роль врача не может изготовить основание | `staff-insert` | красный |
| владелец двери имеет объявленные права исполнения | `privilege` | красный |

`v_organization_id IS NULL` и повторные id/status/reason/pair-проверки внутренней 4-аргументной функции не
считаю отдельной публичной поверхностью: декларация задаёт ей `execute: []`, `invocation: internal`, а публичная
5-аргументная оболочка уже закрывает тот же логический допуск. Это не оправдывает пропуски выше: предикаты
признания решения **другой** клиники находятся только во внутреннем теле и определяют, можно ли сливать сейчас.

Ограничение комментария в 2000 символов не превращал в новый тестовый контракт: owner-источник требует
комментарий, но не задаёт это число; проверка точного лимита копировала бы реализацию вопреки §10a.

## MUST FIX

### F1. Шесть предикатов допуска снимаются, а набор остаётся зелёным

Временный аудиторский инъектор добавил восемь fault-имён в существующую оснастку и для каждого применил
`replaceOnce()` к полному уникальному фрагменту активного тела. Поэтому нулевой код означает именно зелёный набор
после единственной успешной замены, а не попадание в старую редакцию.

| Инъекция | Внесено | Поймано | Не поймано | Путь отчёта |
|---|---:|---:|---:|---|
| `audit-approval-any-row` | 1 предикат в каждом из 7 proof-body | 0 | **1** | `docs/_TODO/AUDIT_E4C_ROUND6_2026-09-15.md`, F1 |
| `audit-approval-any-pair` | 1 составной предикат в каждом из 7 proof-body | 0 | **1** | `docs/_TODO/AUDIT_E4C_ROUND6_2026-09-15.md`, F1 |
| `audit-refusal-read-any-row` | 1 предикат в каждом из 7 proof-body | **1** | 0 | — |
| `audit-neighbour-any-org` | 1 предикат в каждом из 7 proof-body | 0 | **1** | `docs/_TODO/AUDIT_E4C_ROUND6_2026-09-15.md`, F1 |
| `audit-neighbour-any-status` | 1 предикат в каждом из 7 proof-body | 0 | **1** | `docs/_TODO/AUDIT_E4C_ROUND6_2026-09-15.md`, F1 |
| `audit-neighbour-any-reason` | 1 предикат в каждом из 7 proof-body | 0 | **1** | `docs/_TODO/AUDIT_E4C_ROUND6_2026-09-15.md`, F1 |
| `audit-neighbour-any-pair` | 1 составной предикат в каждом из 7 proof-body | 0 | **1** | `docs/_TODO/AUDIT_E4C_ROUND6_2026-09-15.md`, F1 |
| `audit-neighbour-approval-not-required` | 1 предикат в каждом из 7 proof-body | **1** | 0 | — |

Точная команда:

```bash
/home/dev/brain/host-orch/run-tests.sh 'set -u; faults="audit-approval-any-row audit-approval-any-pair audit-refusal-read-any-row audit-neighbour-any-org audit-neighbour-any-status audit-neighbour-any-reason audit-neighbour-any-pair audit-neighbour-approval-not-required"; total=0; caught=0; missed=0; unexpected_rc=0; for fault in $faults; do total=$((total + 1)); set +e; output="$(env RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 DOCTOR_MEDICAL_MERGE_DOOR_ECHO=1 DOCTOR_MEDICAL_MERGE_DOOR_FAULT="$fault" node --test deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs 2>&1)"; rc=$?; set -e; injected=$(grep -c "FAULT INJECTED: $fault" <<<"$output" || true); failures=$(grep -E "^not ok [0-9]+" <<<"$output" | paste -sd, -); if [ "$rc" -eq 0 ]; then missed=$((missed + 1)); else caught=$((caught + 1)); fi; if [ "$rc" -ne 0 ] && [ "$rc" -ne 1 ]; then unexpected_rc=$((unexpected_rc + 1)); fi; printf "AUDIT_FAULT name=%s rc=%s injected=%s failures=%s\n" "$fault" "$rc" "$injected" "${failures:-none}"; done; printf "AUDIT_SUMMARY faults=%s caught=%s missed=%s unexpected_rc=%s\n" "$total" "$caught" "$missed" "$unexpected_rc"'
```

Результат этой команды: `faults=8 caught=2 missed=6 unexpected_rc=0`. Каждая зелёная инъекция напечатала
`injected=7`, то есть `replaceOnce()` успешно дошёл в каждый из семи независимых proof-body. Временный инъектор
после прогона удалён.

Impact: зелёный proof-set допускает регрессию, при которой комментарий ложится не в тот конфликт/пару либо
неодобренная, закрытая, немедицинская или чужая строка соседней клиники считается решением врача. Тогда пара может
слиться без решения нужной клиники. Это напрямую нарушает Э4c/§18б и собственный конечный критерий шапки.

Минимальные обязательные имена для коррекции:

- `approval-write-any-row`;
- `approval-write-any-pair`;
- `refusal-read-any-row`;
- `neighbour-approval-any-org`;
- `neighbour-approval-any-status`;
- `neighbour-approval-any-reason`;
- `neighbour-approval-not-required`;
- `neighbour-approval-any-pair`.

### F2. Десять встроенных мутаций считают отказ якоря пойманной поломкой

Полная штатная матрица дала `faults=21 caught=21 missed=0`, но одновременно
`marker_missing=10`. Без `FAULT INJECTED` красный код не доказывает применение мутации: `replaceOnce()` при
нулевом/двойном совпадении сам бросает исключение, и та же матрица считает этот красный код `caught`.

Это доказано мета-инъекцией: у `approval-any-status` якорь временно заменён на отсутствующий
`candidate.no_such_status`, после чего исполнена точная команда:

```bash
/home/dev/brain/host-orch/run-tests.sh 'set +e; output="$(env RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 DOCTOR_MEDICAL_MERGE_DOOR_ECHO=1 DOCTOR_MEDICAL_MERGE_DOOR_FAULT=approval-any-status node --test deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs 2>&1)"; rc=$?; set -e; marker=$(grep -c "FAULT INJECTED" <<<"$output" || true); anchor_error=$(grep -c "marker matched 0 times" <<<"$output" || true); caught=0; if [ "$rc" -ne 0 ]; then caught=1; fi; printf "ANCHOR_META_FAULT rc=%s counted_caught=%s marker=%s anchor_error=%s\n" "$rc" "$caught" "$marker" "$anchor_error"'
```

Результат: `rc=1 counted_caught=1 marker=0 anchor_error=14`. То есть заведомо **не внесённая** поломка выглядит
для текущего счётчика пойманной. Временная мета-инъекция удалена.

Десять режимов без маркера: `refusal-read-any-status`, `refusal-read-any-reason`,
`approval-comment-foreign-row`, `approval-comment-optional`, `refusal-comment-optional`,
`refusal-write-any-row`, `refusal-write-any-status`, `refusal-write-any-reason`, `approval-any-status`,
`approval-any-reason`.

Impact: следующий сдвиг/перенос SQL-якоря даст красный прогон, который сводка ложно запишет как доказательство
зубов. Коррекция должна печатать по одному подтверждению после успешной установки **каждого** fault-а и считать
`marker_missing != 0` отдельным провалом матрицы, а не caught.

### F3. `refusal-write-any-row` краснеет на `P0003`, а не на `neighbourRows/FACTS`

Якорь честно попал в актуальную 4-аргументную дверь отказа: он включает новую колонку
`support_requested`, поэтому старая редакция из первой миграции не совпадает. Но снятие `id = p_conflict_id`
обновляет две подходящие pending medical-строки, и `UPDATE ... RETURNING ... INTO` немедленно падает
`P0003 query returned more than one row`. Proof-body завершается до `admission`, `neighbourRows` и `FACTS`;
внешний тест краснеет лишь потому, что строки `FACTS` нет.

Точная команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 DOCTOR_MEDICAL_MERGE_DOOR_ECHO=1 DOCTOR_MEDICAL_MERGE_DOOR_FAULT=refusal-write-any-row node --test deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs"
```

Результат: `tests=7 pass=6 fail=1`; целевой proof напечатал
`RESULT: FAIL — P0003 query returned more than one row`, затем `ROLLBACK_FACTS.fixtureRows=0`, но не напечатал
`FACTS`. Это громкое самообнаруживаемое падение, а заявленный fault обещает наблюдать, что врач закрыл **не ту**
строку. По линейке §10a эти вещи не взаимозаменяемы.

Impact: зелёных ложных доказательств здесь нет, но строка матрицы приписывает набору защиту наблюдаемого
row-selection поведения, которого фактически не проверяет. Нужна мутация/фикстура, при которой неверно выбирается
ровно одна соседняя строка и тест краснеет на её `status/comment/resolvedBy` в `neighbourRows`, а не на тексте или
самом факте исключения.

## Штатные 21 инъекция

Точная команда полного прогона:

```bash
/home/dev/brain/host-orch/run-tests.sh 'set -u; faults="privilege two-clinic-blindness staff-insert foreign-org-conflict fio-decision-not-persisted support-always-escalates decision-stays-pending comment-not-saved approval-comment-not-saved refusal-read-any-org refusal-write-any-org refusal-read-any-status refusal-read-any-reason approval-comment-foreign-row approval-comment-optional refusal-comment-optional refusal-write-any-row refusal-write-any-status refusal-write-any-reason approval-any-status approval-any-reason"; total=0; caught=0; missed=0; marker_missing=0; unexpected_rc=0; for fault in $faults; do total=$((total + 1)); set +e; output="$(env RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 DOCTOR_MEDICAL_MERGE_DOOR_ECHO=1 DOCTOR_MEDICAL_MERGE_DOOR_FAULT="$fault" node --test deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs 2>&1)"; rc=$?; set -e; marker_count=$(grep -c "FAULT INJECTED" <<<"$output" || true); not_ok=$(grep -E "^not ok [0-9]+" <<<"$output" | paste -sd, -); rollback_bad=$(grep -c "ROLLBACK_FACTS:.*fixtureRows[^0]" <<<"$output" || true); if [ "$marker_count" -eq 0 ]; then marker_missing=$((marker_missing + 1)); fi; if [ "$rc" -eq 0 ]; then missed=$((missed + 1)); else caught=$((caught + 1)); fi; if [ "$rc" -ne 0 ] && [ "$rc" -ne 1 ]; then unexpected_rc=$((unexpected_rc + 1)); fi; printf "FAULT_RESULT name=%s rc=%s marker=%s rollback_bad=%s failures=%s\n" "$fault" "$rc" "$marker_count" "$rollback_bad" "${not_ok:-none}"; done; printf "SUMMARY faults=%s caught=%s missed=%s marker_missing=%s unexpected_rc=%s\n" "$total" "$caught" "$missed" "$marker_missing" "$unexpected_rc"; test "$missed" -eq 0; test "$unexpected_rc" -eq 0'
```

Результат: `faults=21 caught=21 missed=0 marker_missing=10 unexpected_rc=0`.
Поле `rollback_bad` из этой диагностической команды не использовано: его регулярное выражение захватывает
пунктуацию JSON перед `0` и даёт ложный счёт. Откат подтверждён baseline-фактами и отдельным точным DB-запросом
ниже.

| Fault | Внесено | Поймано | Не поймано | Красный наблюдаемый результат |
|---|---:|---:|---:|---|
| `privilege` | 1 | 1 | 0 | вызов двери не завершает merge из-за реально снятого права |
| `two-clinic-blindness` | 1 | 1 | 0 | `not ok 3`, первая клиника сливает до решения второй |
| `staff-insert` | 1 | 1 | 0 | `not ok 4`, роль врача создаёт основание |
| `foreign-org-conflict` | 2 стены | 1 | 0 | `not ok 5`, чужая клиника меняет строку |
| `fio-decision-not-persisted` | 1 | 1 | 0 | `not ok 7`, выбранное ФИО не переживает defer |
| `support-always-escalates` | 1 | 1 | 0 | `not ok 2`, `support_rows` становится неверным |
| `decision-stays-pending` | 1 | 1 | 0 | `not ok 3`, `pendingAfterFirst` неверен |
| `comment-not-saved` | 1 | 1 | 0 | `not ok 2/6`, сохранённый комментарий отсутствует |
| `approval-comment-not-saved` | 1 | 1 | 0 | `not ok 3`, комментарий одобрения отсутствует |
| `refusal-read-any-org` | 1 | 1 | 0 | `not ok 6`, `foreignTraceRead` не `null` |
| `refusal-write-any-org` | 1 | 1 | 0 | `not ok 6`, чужая строка/обращение меняются |
| `refusal-read-any-status` | 1 | 1 | 0 | `not ok 6`, pending отдаётся как след |
| `refusal-read-any-reason` | 1 | 1 | 0 | `not ok 6`, немедицинская строка отдаётся как след |
| `approval-comment-foreign-row` | 1 | 1 | 0 | `not ok 5`, комментарий ложится в чужую строку |
| `approval-comment-optional` | 1 | 1 | 0 | `not ok 6`, пустой комментарий допускается |
| `refusal-comment-optional` | 1 | 1 | 0 | `not ok 6`, пустой комментарий допускается |
| `refusal-write-any-row` | 1 | 1 | 0 | **не тот факт:** `P0003` до `FACTS`, см. F3 |
| `refusal-write-any-status` | 1 | 1 | 0 | `not ok 6`, разобранная строка меняется повторно |
| `refusal-write-any-reason` | 1 | 1 | 0 | `not ok 6`, pending non-medical строка закрывается |
| `approval-any-status` | 1 | 1 | 0 | `not ok 6`, комментарий разобранной строки меняется |
| `approval-any-reason` | 1 | 1 | 0 | `not ok 6`, комментарий non-medical строки меняется |

Все встроенные якоря просмотрены: новые refusal-якоря ограничены `support_requested` и действительно относятся к
последней редакции двери; read-якоря включают соседние status/reason-строки; accept-якоря включают сигнатурный
фрагмент актуальной 5-аргументной оболочки. Попаданий в вытесненную двухаргументную дверь не обнаружено.

## Baseline, §1 и чистота DEV

Baseline:

```bash
/home/dev/brain/host-orch/run-tests.sh "RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 DOCTOR_MEDICAL_MERGE_DOOR_ECHO=1 node --test deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs"
```

Результат: `tests=7 pass=7 fail=0`; все семь proof-body напечатали `ROLLBACK_FACTS.fixtureRows=0`.

Проверка §1 и отсутствия текстовых assertions:

```bash
/home/dev/brain/host-orch/run-tests.sh 'set -e; migration_hits="$(rg -n "\b(GRANT|REVOKE|CREATE ROLE|ALTER ROLE|ALTER DEFAULT PRIVILEGES|CREATE POLICY)\b" apps/webapp/db/drizzle-migrations/20260914T220000_doctor_resolves_medical_merge_conflict.sql apps/webapp/db/drizzle-migrations/20260915T102455_doctor_merge_decision_has_a_record.sql apps/webapp/db/drizzle-migrations/20260915T150000_the_person_fio_answer_survives_the_doctor_defer.sql || true)"; test -z "$migration_hits"; printf "migration_privilege_operators=0\n"; diagnostic_hits="$(rg -n "assert\.(match|doesNotMatch)" deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs || true)"; test -z "$diagnostic_hits"; printf "diagnostic_text_assertions=0\n"; changed_migrations="$(git diff --name-only f2095e94b^ f2095e94b -- "apps/webapp/db/drizzle-migrations/*.sql")"; test -z "$changed_migrations"; printf "candidate_commit_changed_migrations=0\n"; git diff --check'
```

Результат: `migration_privilege_operators=0`, `diagnostic_text_assertions=0`,
`candidate_commit_changed_migrations=0`, exit `0`. Права кандидата находятся в
`deploy/postgres/privileges/declaration.ts`; миграции прав не содержат.

После всех baseline/fault-прогонов выполнен точный запрос по фиксированным UUID двух использованных наборов:

```bash
/home/dev/brain/host-orch/run-tests.sh "sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -Atqc \"SELECT (SELECT count(*) FROM public.platform_users WHERE id::text LIKE '00000000-0000-4000-8000-00000000fa%' OR id::text LIKE '00000000-0000-4000-8000-00000000d1%') + (SELECT count(*) FROM public.patient_merge_candidates WHERE id::text LIKE '00000000-0000-4000-8000-00000000fa%' OR id::text LIKE '00000000-0000-4000-8000-00000000d1%') + (SELECT count(*) FROM public.be_organizations WHERE id = '00000000-0000-4000-8000-0000000c1001'::uuid);\""
```

Результат: `0`.

## ВОПРОСЫ ВЛАДЕЛЬЦУ

Нет. Все MUST FIX лежат внутри явного критерия proof-set, Э4c/§18б и обязательных §10a/§10b.

## НЕ СДЕЛАНО

- Product-код, миграции, декларацию прав и кандидатные тесты не исправлял.
- Все временные fault-инъекторы, мета-поломка якоря и инструментирование `pg_get_functiondef` удалены.
- Миграции на DEV по-настоящему не применял; использован только транзакционный rollback-only harness.
- Полный CI не запускал.
- UI, браузер и второй Next-сервер не запускал.
- TEST и оба PROD не трогал; TEST-режим не менял.
- Строку вердикта в `feat`, галочку плана, landing и push не выполнял.

## Строка вердикта для ведущего

```text
audit(e4c-proof-round6): FAIL — baseline 7/7; встроенные faults=21 caught=21 missed=0, но marker_missing=10 и мета-инъекция сломанного якоря всё равно считается caught. По активным телам снято ещё 8 предикатов: caught=2, missed=6 — accept.id, accept.pair и organization/status/reason/pair признания соседнего одобрения остаются зелёными; read.id и doctorApproved=true ловятся случайно, но не имеют обещанных поимённых faults. refusal-write-any-row краснеет на P0003 до FACTS, а не на neighbourRows. §1 PASS: privilege-операторов в трёх миграциях 0; rollback residual 0. Полный CI/UI/TEST/PROD не трогались.
```
