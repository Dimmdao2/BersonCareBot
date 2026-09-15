# Э4c — независимый аудит круга 3: коррекция `FACTS` и полный fault-set

Клон: `/home/dev/dev-projects/bcb-wt-merge-conflict`. Ветка: `wt/leads-kpi-live`.
Проверенный кандидат: `bec23ef4751962b4b563f47d97727def5aefd15d`.

Authority: `docs/_TODO/MERGE_MECHANISM_REWRITE_2026-09-14.md`, Э4c;
`docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md`, §18б: «Отказ не исчезает
бесследно. В карточке пациента — в ОБЕИХ учётках — остаётся пометка».

## Вердикт: FAIL

Коррекция `bec23ef47` в изменённом сценарии правильна: `FACTS` несёт наблюдённые
значения, внешний тест сравнивает их с независимым oracle, обе новые tenant-инъекции
`refusal-read-any-org` и `refusal-write-any-org` дают `not ok 6`, а ранний ложный
`RESULT: PASS` не принимается. Ослабления именно от перехода с английских фраз на
`FACTS` не найдено.

Но весь заявленный `FAULTS`-контракт гейта не выполнен: из 11 непустых fault-режимов
3 оставляют набор зелёным. Два из них реально доводят proof-body до `RESULT: FAIL`,
но тест намеренно превращает этот результат в успех; третий печатает
`FAULT INJECTED`, хотя поздняя миграция тут же перезаписывает мутированную функцию
исправным телом. Кроме того, в том же наборе осталась запрещённая привязка к
английской диагностической прозе: безвредное переименование одной строки даёт 6/7.

## Полная матрица `FAULTS`

Baseline выполнен из cwd `/home/dev/dev-projects/bcb-wt-merge-conflict` дословной
командой:

```bash
/home/dev/brain/host-orch/run-tests.sh "RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 DOCTOR_MEDICAL_MERGE_DOOR_ECHO=1 node --test deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs"
```

Результат: 7/7 PASS; каждая из семи транзакционных проб напечатала
`rolled back; fixture rows left in the database: 0`.

Все непустые элементы `FAULTS` прогнаны одним удержанием общего host-lock. Дословная
команда (cwd тот же):

```bash
/home/dev/brain/host-orch/run-tests.sh 'set -u; faults="privilege two-clinic-blindness staff-insert foreign-org-conflict fio-decision-not-persisted support-always-escalates decision-stays-pending comment-not-saved approval-comment-not-saved refusal-read-any-org refusal-write-any-org"; total=0; missed=0; marker_missing=0; unexpected_rc=0; for fault in $faults; do total=$((total + 1)); printf "=== FAULT %s ===\n" "$fault"; set +e; output="$(env RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 DOCTOR_MEDICAL_MERGE_DOOR_ECHO=1 DOCTOR_MEDICAL_MERGE_DOOR_FAULT="$fault" node --test deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs 2>&1)"; rc=$?; set -e; printf "%s\n" "$output" | grep -E "FAULT INJECTED|^not ok [0-9]+|^# tests |^# pass |^# fail |fixture rows left in the database: [^0]" || true; if ! grep -q "FAULT INJECTED" <<<"$output"; then marker_missing=$((marker_missing + 1)); fi; if [ "$rc" -eq 0 ]; then missed=$((missed + 1)); fi; if [ "$rc" -ne 0 ] && [ "$rc" -ne 1 ]; then unexpected_rc=$((unexpected_rc + 1)); fi; printf "FAULT_RC %s %s\n" "$fault" "$rc"; done; printf "SUMMARY faults=%s missed=%s marker_missing=%s unexpected_rc=%s\n" "$total" "$missed" "$marker_missing" "$unexpected_rc"; test "$marker_missing" -eq 0; test "$unexpected_rc" -eq 0'
```

Итог самой команды: `SUMMARY faults=11 missed=3 marker_missing=0 unexpected_rc=0`.
Фильтр отдельно печатал бы любой ненулевой остаток fixture rows; таких строк не было.

| Fault | `FAULT INJECTED` | TAP |
|---|---|---|
| `privilege` | есть | 6/7, `not ok 7` |
| `two-clinic-blindness` | есть | **7/7, непоймана** |
| `staff-insert` | есть | **7/7, непоймана** |
| `foreign-org-conflict` | есть | **7/7, инъекция не дошла до итогового тела** |
| `fio-decision-not-persisted` | есть | 6/7, `not ok 7` |
| `support-always-escalates` | есть | 6/7, `not ok 2` |
| `decision-stays-pending` | есть | 6/7, `not ok 3` |
| `comment-not-saved` | есть | 5/7, `not ok 2`, `not ok 6` |
| `approval-comment-not-saved` | есть | 6/7, `not ok 3` |
| `refusal-read-any-org` | есть | 6/7, `not ok 6` |
| `refusal-write-any-org` | есть | 6/7, `not ok 6` |

Счёт: 11 заявленных непустых инъекций; 8 красных; 3 ложнозелёных. Внутри трёх
ложнозелёных — 2 эффективные поломки, принятые тестом, и 1 неэффективный injector.

## MUST FIX 1 — две реальные поломки тест считает успехом

Инъекции: `two-clinic-blindness` заменяет поиск блокера другой клиники на
`WHERE false`; `staff-insert` возвращает `app_staff` колоночный `INSERT` в
`patient_merge_candidates`.

Команда и результаты — полная матрица выше. В обоих случаях в выводе есть точный
`FAULT INJECTED`, proof-body доходит до `RESULT: FAIL`, но
`doctor-medical-merge-door.devDbProof.test.mjs` содержит специальные ветки:

- для `two-clinic-blindness` ожидает `/RESULT: FAIL/` и делает `return`;
- для `staff-insert` ожидает `/INSERT SUCCEEDED/`, `/RESULT: FAIL/` и делает `return`.

Тем самым набор зелёный именно при достижимом нарушении: первая клиника больше не
ждёт решения второй, а runtime-роль врача снова может выписать себе доверенную строку
конфликта. Это нарушает §18б и AGENTS.md §10a/§10b: fault injection должна красить
гейт, а не иметь отдельное зелёное ожидание поломки.

## MUST FIX 2 — `foreign-org-conflict` объявлен применённым, но не меняет итоговую дверь

Инъекция: harness заменяет
`AND candidate.organization_id = v_organization_id` в миграции
`20260914T220000_doctor_resolves_medical_merge_conflict.sql` на `AND TRUE` и печатает
`FAULT INJECTED`.

Целевой повтор выполнен дословно:

```bash
/home/dev/brain/host-orch/run-tests.sh "RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 DOCTOR_MEDICAL_MERGE_DOOR_ECHO=1 DOCTOR_MEDICAL_MERGE_DOOR_FAULT=foreign-org-conflict node --test deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs"
```

Результат: 7/7 PASS; врач B по-прежнему получил `mergeOutcome=conflict_not_found`,
строка клиники A осталась `pending/null`. Причина подтверждена чтением порядка
кандидатных миграций: следующая
`20260915T102455_doctor_merge_decision_has_a_record.sql` снова выполняет
`CREATE OR REPLACE FUNCTION app.transfer_staff_approved_platform_user_merge_data`
и ставит действующий predicate
`candidate.organization_id = app.current_org_id()`. То есть строка
`FAULT INJECTED` здесь ложна, а заявленная tenant-регрессия фактически не проверяется.

## MUST FIX 3 — в наборе остались сопоставления с диагностической прозой

Инъекция формы: только строка журнала в
`doctor-medical-merge-decision.proofBody.mjs` была временно переформулирована
`support refusal:` → `support escalation outcome:`. DB-запросы, проверки значений,
`RESULT: PASS` и rollback не менялись.

Дословная команда (после временной переформулировки):

```bash
/home/dev/brain/host-orch/run-tests.sh "RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 DOCTOR_MEDICAL_MERGE_DOOR_ECHO=1 node --test deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs"
```

Proof-body напечатал правильные значения
`{"status":"escalated",...,"support_rows":1}`, затем `RESULT: PASS`, rollback
оставил 0 строк, но набор дал 6/7 с `not ok 2` на
`assert.match(output, /support refusal: .../)`. Временная правка возвращена.

Другие привязки того же класса найдены разовым взглядом командой:

```bash
rg -n "assert\.(match|doesNotMatch)|includes\(|RESULT: PASS|RESULT: FAIL|FACTS:" deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs deploy/postgres/privileges/doctor-medical-merge-*.proofBody.mjs
```

В частности, test продолжает требовать префиксы `doctor A merge returned:`,
`doctor A pending conflicts after decision:`, `forgery refused:`,
`doctor B pressed merge on clinic A's conflict`, а сценарий ФИО — несколько
английских диагностических предложений. Это тот же запрещённый §10a класс: честная
переформулировка proof-log красит тест при целом поведении.

## Что доказано по коррекции `FACTS`

### Новая форма не ослабила изменённый сценарий

`git show bec23ef47 --` показывает, что коммит меняет только assertions test 6 и
добавляет его строку `FACTS`; остальные тесты и fault-инъекторы не менялись.
Матрица выше даёт:

- `refusal-read-any-org` → 6/7, `not ok 6`;
- `refusal-write-any-org` → 6/7, `not ok 6`;
- `comment-not-saved` → test 6 тоже красный.

Следовательно, поломки, относящиеся к заменённым assertions, новая форма ловит.
Три ложнозелёных режима существовали вне изменённого test 6; это дефекты полного
набора, а не регрессия от `FACTS`.

### `FACTS` не является самоподтверждающейся тавтологией

Инъекция транспорта: после всех внутренних DB-проверок только передаваемое поле
временно изменено с `marks` на
`marks: { ...marks, clinicA_duplicate: 0 }`. Сам proof-body по-прежнему прошёл свои
проверки и напечатал `RESULT: PASS`.

Дословная команда — та же baseline-команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 DOCTOR_MEDICAL_MERGE_DOOR_ECHO=1 node --test deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs"
```

Результат: 6/7, `not ok 6`, `deepStrictEqual` показал expected
`clinicA_duplicate: 1` против actual `0`, хотя рядом был `RESULT: PASS`. Значит
внешний expected не выводится из внутренней проверки proof-body и не доверяет его
PASS-фразе. Временная правка возвращена.

### Ранний `RESULT: PASS` не скрывает пропущенную проверку

Инъекция управления: перед чтением следа врачом чужой организации временно вставлены
`say('RESULT: PASS — injected early success before the foreign-trace check'); return;`.

Дословная команда — та же baseline-команда выше. Результат: 6/7, `not ok 6` с
`в выводе пробы нет строки FACTS`, хотя ранний `RESULT: PASS` и полный rollback были
напечатаны. В текущем proof-body `FACTS` и штатный `RESULT: PASS` расположены после
всех проверок; top-level `catch` ставит `process.exitCode = 1`, `finally` всегда
выполняет `ROLLBACK`. Временная правка возвращена.

Итого для исправленного test 6 сигнал честный: одной PASS-фразы недостаточно,
пропуск ветки и подмена значения краснят внешний тест. Ложнозелёные `return` из
MUST FIX 1 находятся в других test callbacks и потому остаются отдельным дефектом.

## ВОПРОСЫ ВЛАДЕЛЬЦУ

Нет. Все три MUST FIX прямо следуют из Э4c/§18б и обязательного канона тестов
AGENTS.md §10a/§10b; расширения продуктового scope не требуется.

## НЕ СДЕЛАНО

- Продуктовый код, тесты и harness не исправлялись: аудит — gate, не fixer.
- Строка вердикта в `feat` не записывалась; её должен внести ведущий.
- Полный CI (`pnpm run ci`, `scripts/ci-record.mjs`) не запускался.
- UI/браузер не запускались; второй Next-сервер не поднимался.
- Миграции на DEV по-настоящему не применялись: candidate ставился только внутри
  транзакций, завершённых `ROLLBACK`.
- PROD не затрагивался.

## Строка вердикта для ведущего

```text
audit(e4c): FAIL — круг 3, независимый, кандидат bec23ef47. Сама коррекция test 6 через FACTS годна: baseline 7/7; refusal-read-any-org и refusal-write-any-org дают 6/7 not ok 6; подмена поля FACTS и ранний RESULT PASS тоже дают not ok 6, поэтому самоподтверждения и ослабления изменённого сценария нет. Полный FAULTS-прогон: 11 заявленных инъекций, 8 красных, 3 ложнозелёных: two-clinic-blindness и staff-insert тест явно принимает через ветку RESULT FAIL + return; foreign-org-conflict мутирует старое тело, которое следующая миграция перезаписывает, хотя harness печатает FAULT INJECTED. Отдельный MUST FIX §10a: в наборе остались сопоставления с английской диагностической прозой; support refusal → support escalation outcome оставило proof RESULT PASS и rollback=0, но дало 6/7 not ok 2. Вопросов владельцу: 0. Полный CI/UI/PROD не трогались, миграции только rollback-only.
```
