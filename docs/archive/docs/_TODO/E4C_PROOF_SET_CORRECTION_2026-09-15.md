# Э4c — коррекция набора доказательств после аудита круга 3

Ветка: `wt/leads-kpi-live`.

Authority:

- `docs/_TODO/MERGE_MECHANISM_REWRITE_2026-09-14.md`, этап Э4c;
- `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md`, §18б: отказ оставляет пометку в карточке пациента в обеих учётках;
- `docs/_TODO/AUDIT_E4C_ROUND3_2026-09-15.md` — три MUST FIX доказательной части.

Scope коррекции: только `deploy/postgres/privileges/doctor-medical-merge-*` и этот отчёт. Поведение продукта не менялось.

## Что было ложнозелёным и почему

Команда полного fault-set из аудита круга 3 дала `SUMMARY faults=11 missed=3 marker_missing=0 unexpected_rc=0`:

- `two-clinic-blindness` действительно убирал видимость блокера второй клиники, proof-body печатал `RESULT: FAIL`, но внешний тест специально ожидал этот FAIL и возвращал успех;
- `staff-insert` действительно возвращал `app_staff` колоночный `INSERT`, proof-body видел успешную подделку и печатал `RESULT: FAIL`, но внешний тест снова принимал это как успех;
- `foreign-org-conflict` менял только один предикат двери. Итоговый путь состоит из пятиаргументной оболочки и четырёхаргументной transfer-функции; каждая независимо сверяет организацию. Поэтому вторая стена оставалась и прогон был зелёным при напечатанном `FAULT INJECTED`.

## Что исправлено

### 1. `two-clinic-blindness` и `staff-insert`

Из внешнего теста удалены обе ветки «при заявленной поломке ожидаем `RESULT: FAIL` и возвращаем успех». Теперь каждый сценарий принимает только штатные наблюдённые значения из `FACTS`; отсутствие строки фактов либо отличающееся значение красит тест.

- `two-clinic-blindness` ломает сценарий двух клиник: `not ok 3`;
- `staff-insert` ломает сценарий невозможности самодельной доверенности: `not ok 4`.

### 2. `foreign-org-conflict`

Инъектор теперь снимает tenant-предикат в обоих реально исполняемых слоях одной двери:

- `candidate.organization_id = app.current_org_id()` в пятиаргументной оболочке;
- `candidate.organization_id = v_organization_id` в четырёхаргументной transfer-функции.

Целевой дословный прогон:

```bash
/home/dev/brain/host-orch/run-tests.sh "RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 DOCTOR_MEDICAL_MERGE_DOOR_ECHO=1 DOCTOR_MEDICAL_MERGE_DOOR_FAULT=foreign-org-conflict node --test deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs"
```

Он напечатал:

```text
FAULT INJECTED: the door no longer checks that the conflict belongs to the doctor's organization
not ok 5 - врач чужой организации не проходит дверь конфликта соседней клиники
# tests 7
# pass 6
# fail 1
ROLLBACK_FACTS: {"fixtureRows":0}
```

### 3. Проверки значений вместо диагностической прозы

Все семь proof-body теперь передают наблюдённые значения одной строкой `FACTS: <json>`, а rollback — строкой `ROLLBACK_FACTS: <json>`. Внешний тест разбирает JSON и сравнивает значения: исходы дверей, роли и организации, состояния строк и учёток, комментарии, контакты, обе пометки отказа, число обращений, pending-состояния и выбранное человеком ФИО. Английские строки журнала и `RESULT: PASS/FAIL` больше не являются oracle.

Дословная статическая проверка:

```bash
/home/dev/brain/host-orch/run-tests.sh 'set -e; file="deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs"; hits="$(rg -n "assert\.(match|doesNotMatch)" "$file" || true)"; test -z "$hits"; printf "diagnostic_text_assertions=0\n"; git diff --check'
```

Результат: `diagnostic_text_assertions=0`, exit `0`.

Отдельная проверка признака дефекта: в `doctor-medical-merge-decision.proofBody.mjs` временно заменена только диагностическая строка `support refusal:` на `platform review requested:`. При неизменных `FACTS` дословная baseline-команда ниже осталась зелёной, `7/7`; временная правка после прогона возвращена.

## Baseline

Дословная команда после итоговых правок и форматирования:

```bash
/home/dev/brain/host-orch/run-tests.sh "RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 DOCTOR_MEDICAL_MERGE_DOOR_ECHO=1 node --test deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs"
```

Результат: `tests=7`, `pass=7`, `fail=0`; каждая из семи проб напечатала `ROLLBACK_FACTS: {"fixtureRows":0}`.

## Полная матрица поломок

Все строки таблицы получены одним удержанием общего host-lock. Дословная внешняя команда:

```bash
/home/dev/brain/host-orch/run-tests.sh 'set -u; faults="privilege two-clinic-blindness staff-insert foreign-org-conflict fio-decision-not-persisted support-always-escalates decision-stays-pending comment-not-saved approval-comment-not-saved refusal-read-any-org refusal-write-any-org"; total=0; missed=0; marker_missing=0; unexpected_rc=0; for fault in $faults; do total=$((total + 1)); printf "=== FAULT %s ===\n" "$fault"; set +e; output="$(env RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 DOCTOR_MEDICAL_MERGE_DOOR_ECHO=1 DOCTOR_MEDICAL_MERGE_DOOR_FAULT="$fault" node --test deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs 2>&1)"; rc=$?; set -e; printf "%s\n" "$output" | grep -E "FAULT INJECTED|^not ok [0-9]+|^# tests |^# pass |^# fail |ROLLBACK_FACTS:.*fixtureRows[^0]" || true; if ! grep -q "FAULT INJECTED" <<<"$output"; then marker_missing=$((marker_missing + 1)); fi; if [ "$rc" -eq 0 ]; then missed=$((missed + 1)); fi; if [ "$rc" -ne 0 ] && [ "$rc" -ne 1 ]; then unexpected_rc=$((unexpected_rc + 1)); fi; printf "FAULT_RC %s %s\n" "$fault" "$rc"; done; printf "SUMMARY faults=%s missed=%s marker_missing=%s unexpected_rc=%s\n" "$total" "$missed" "$marker_missing" "$unexpected_rc"; test "$missed" -eq 0; test "$marker_missing" -eq 0; test "$unexpected_rc" -eq 0'
```

Каждый внутренний вызов имел дословную форму:

```bash
env RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 DOCTOR_MEDICAL_MERGE_DOOR_ECHO=1 DOCTOR_MEDICAL_MERGE_DOOR_FAULT="$fault" node --test deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs
```

После подстановки `$fault` были исполнены именно эти одиннадцать команд внутри уже удерживаемого внешнего lock:

```bash
env RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 DOCTOR_MEDICAL_MERGE_DOOR_ECHO=1 DOCTOR_MEDICAL_MERGE_DOOR_FAULT=privilege node --test deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs
env RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 DOCTOR_MEDICAL_MERGE_DOOR_ECHO=1 DOCTOR_MEDICAL_MERGE_DOOR_FAULT=two-clinic-blindness node --test deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs
env RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 DOCTOR_MEDICAL_MERGE_DOOR_ECHO=1 DOCTOR_MEDICAL_MERGE_DOOR_FAULT=staff-insert node --test deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs
env RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 DOCTOR_MEDICAL_MERGE_DOOR_ECHO=1 DOCTOR_MEDICAL_MERGE_DOOR_FAULT=foreign-org-conflict node --test deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs
env RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 DOCTOR_MEDICAL_MERGE_DOOR_ECHO=1 DOCTOR_MEDICAL_MERGE_DOOR_FAULT=fio-decision-not-persisted node --test deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs
env RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 DOCTOR_MEDICAL_MERGE_DOOR_ECHO=1 DOCTOR_MEDICAL_MERGE_DOOR_FAULT=support-always-escalates node --test deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs
env RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 DOCTOR_MEDICAL_MERGE_DOOR_ECHO=1 DOCTOR_MEDICAL_MERGE_DOOR_FAULT=decision-stays-pending node --test deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs
env RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 DOCTOR_MEDICAL_MERGE_DOOR_ECHO=1 DOCTOR_MEDICAL_MERGE_DOOR_FAULT=comment-not-saved node --test deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs
env RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 DOCTOR_MEDICAL_MERGE_DOOR_ECHO=1 DOCTOR_MEDICAL_MERGE_DOOR_FAULT=approval-comment-not-saved node --test deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs
env RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 DOCTOR_MEDICAL_MERGE_DOOR_ECHO=1 DOCTOR_MEDICAL_MERGE_DOOR_FAULT=refusal-read-any-org node --test deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs
env RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 DOCTOR_MEDICAL_MERGE_DOOR_ECHO=1 DOCTOR_MEDICAL_MERGE_DOOR_FAULT=refusal-write-any-org node --test deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs
```

| Поломка                      | Дословное значение `$fault`  | Строка `FAULT INJECTED`                                                                            | Результат прогона                                                           |
| ---------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `privilege`                  | `privilege`                  | `FAULT INJECTED: user_password_credentials revoked from the door owner`                            | `not ok 1`, `not ok 3`, `not ok 7`; `pass=4 fail=3`; `FAULT_RC privilege 1` |
| `two-clinic-blindness`       | `two-clinic-blindness`       | `FAULT INJECTED: the door no longer sees another clinic's blocker`                                 | `not ok 3`; `pass=6 fail=1`; `FAULT_RC two-clinic-blindness 1`              |
| `staff-insert`               | `staff-insert`               | `FAULT INJECTED: app_staff column INSERT on patient_merge_candidates granted back`                 | `not ok 4`; `pass=6 fail=1`; `FAULT_RC staff-insert 1`                      |
| `foreign-org-conflict`       | `foreign-org-conflict`       | `FAULT INJECTED: the door no longer checks that the conflict belongs to the doctor's organization` | `not ok 5`; `pass=6 fail=1`; `FAULT_RC foreign-org-conflict 1`              |
| `fio-decision-not-persisted` | `fio-decision-not-persisted` | `FAULT INJECTED: the conflict row no longer keeps the person's FIO answer`                         | `not ok 7`; `pass=6 fail=1`; `FAULT_RC fio-decision-not-persisted 1`        |
| `support-always-escalates`   | `support-always-escalates`   | `FAULT INJECTED: support is always escalated`                                                      | `not ok 2`; `pass=6 fail=1`; `FAULT_RC support-always-escalates 1`          |
| `decision-stays-pending`     | `decision-stays-pending`     | `FAULT INJECTED: accepted decision stays pending`                                                  | `not ok 3`; `pass=6 fail=1`; `FAULT_RC decision-stays-pending 1`            |
| `comment-not-saved`          | `comment-not-saved`          | `FAULT INJECTED: refusal drops the doctor comment`                                                 | `not ok 2`, `not ok 6`; `pass=5 fail=2`; `FAULT_RC comment-not-saved 1`     |
| `approval-comment-not-saved` | `approval-comment-not-saved` | `FAULT INJECTED: approval drops the doctor comment`                                                | `not ok 3`; `pass=6 fail=1`; `FAULT_RC approval-comment-not-saved 1`        |
| `refusal-read-any-org`       | `refusal-read-any-org`       | `FAULT INJECTED: the refusal-trace read door no longer checks the organization`                    | `not ok 6`; `pass=6 fail=1`; `FAULT_RC refusal-read-any-org 1`              |
| `refusal-write-any-org`      | `refusal-write-any-org`      | `FAULT INJECTED: the refusal write door no longer checks the organization`                         | `not ok 6`; `pass=6 fail=1`; `FAULT_RC refusal-write-any-org 1`             |

Итог дословно:

```text
SUMMARY faults=11 missed=0 marker_missing=0 unexpected_rc=0
```

Сводка: в наборе 11 непустых поломок; краснеют 11; зелёных осталось 0. Законных зелёных fault-режимов нет. В журнале каждого транзакционного proof-body напечатано `ROLLBACK_FACTS: {"fixtureRows":0}`; ненулевого значения не наблюдалось.

## НЕ СДЕЛАНО

- Поведение продукта, product-код, миграции и декларация привилегий не менялись.
- Миграции из клона на DEV не применялись; кандидатные тела и права ставились только внутри транзакций с обязательным `ROLLBACK`.
- Полный CI (`pnpm run ci`, `scripts/ci-record.mjs`) не запускался.
- UI и браузер не запускались; второй Next-сервер не поднимался.
- PROD и TEST не затрагивались.
- Строка вердикта в `feat` и галочка Э4c не записывались: автор коррекции свою работу не принимает.
- Push и landing не выполнялись.

## Строка вердикта для ведущего

```text
audit(e4c-proof-correction): READY FOR INDEPENDENT AUDIT — коррекция круга 3. Baseline 7/7, все семь proof-body завершились ROLLBACK_FACTS.fixtureRows=0. Полный FAULTS-прогон: 11 заявленных инъекций, 11 красных, missed=0, marker_missing=0, unexpected_rc=0. two-clinic-blindness → not ok 3; staff-insert → not ok 4; foreign-org-conflict теперь снимает оба исполняемых tenant-предиката, печатает FAULT INJECTED и даёт not ok 5. Внешний тест сверяет JSON FACTS/ROLLBACK_FACTS по значениям; assert.match/doesNotMatch по диагностической прозе — 0. Временная переформулировка support refusal → platform review requested оставила baseline 7/7. Product-код/миграции/права не менялись; полный CI/UI/PROD/TEST не трогались; миграции только rollback-only.
```
