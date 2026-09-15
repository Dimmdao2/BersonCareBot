# Аудит доказательного набора Э4c после коррекции

Вердикт: **FAIL**.

Предмет: коммит `975c5d6cb` (`test(merge): #1113 make E4c proof faults fail closed`) в ветке
`wt/leads-kpi-live`.

Authority: `docs/_TODO/MERGE_MECHANISM_REWRITE_2026-09-14.md`, этап Э4c; оракул Э4c — решение врача оставляет
комментарий врача, явный признак запроса поддержки и видимый след отказа в обеих учётках.

## Классификация

- Повторяемое поведение: baseline, fault-injection, стена арендатора — поведенческие живые проверки через
  `/home/dev/brain/host-orch/run-tests.sh`.
- Качество доказательства: `FACTS`/`ROLLBACK_FACTS` как значения, отсутствие regex/assertion по диагностической
  прозе — чтение теста, `rg`, и одна диагностическая перефразировка.

## Счёт

- Авторский baseline: `7/7`, `ROLLBACK_FACTS.fixtureRows=0`.
- Авторская матрица: `faults=11 missed=0 marker_missing=0 unexpected_rc=0`.
- Мои дополнительные инъекции: `faults=4 caught=1 missed=3 marker_missing=0 unexpected_rc=0`.
- Общий fault-счёт аудита: `15` инъекций, `12` пойманы, `3` не пойманы.
- `definer-tenant-predicate`: `14/14`.

## Команды

Авторский baseline и матрица гонялись одним временным скриптом, чтобы `$fault` раскрывался только внутри файла, а
не внешней оболочкой:

```bash
/home/dev/brain/host-orch/run-tests.sh "bash tmp-e4c-author-faults.sh"
```

Внутренняя форма каждого fault-прогона:

```bash
env RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 DOCTOR_MEDICAL_MERGE_DOOR_ECHO=1 DOCTOR_MEDICAL_MERGE_DOOR_FAULT="$fault" node --test deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs
```

Дополнительные инъекции гонялись отдельным временным скриптом:

```bash
/home/dev/brain/host-orch/run-tests.sh "bash tmp-e4c-extra-faults.sh"
```

Проверка стены арендатора:

```bash
/home/dev/brain/host-orch/run-tests.sh "node --test deploy/postgres/privileges/definer-tenant-predicate.test.mjs"
```

Проверка отсутствия assertion по диагностической прозе:

```bash
rg -n "assert\.(match|doesNotMatch)" deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs deploy/postgres/privileges/doctor-medical-merge-*.proofBody.mjs
```

Результат: пустой вывод, exit `1` от `rg` как “не найдено”.

Диагностическая перефразировка: временно заменил строку журнала
`support refusal:` на `platform review requested:` в `doctor-medical-merge-decision.proofBody.mjs` и прогнал:

```bash
/home/dev/brain/host-orch/run-tests.sh "RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 DOCTOR_MEDICAL_MERGE_DOOR_ECHO=1 node --test deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs"
```

Результат: `tests=7 pass=7 fail=0`.

## MUST FIX

### F1 — снятие `status IN ('dismissed','escalated')` в читающем корне не ловится

Инъекция:

```text
audit-read-refusal-pending-status:
в app.read_staff_patient_medical_merge_refusal(uuid) заменить
AND c.status IN ('dismissed', 'escalated')
на AND TRUE
```

Команда:

```bash
DOCTOR_MEDICAL_MERGE_DOOR_FAULT=audit-read-refusal-pending-status node --test deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs
```

Результат под внешним lock: `FAULT INJECTED` напечатан, `tests=7 pass=7 fail=0`,
`EXTRA_FAULT_RC audit-read-refusal-pending-status 0`.

Impact: proof-set принимает корень, который отдаёт pending-конфликт как след отказа. По Э4c след появляется после
отказа; pending — ещё не решение врача.

Отчёт о непойманной: этот файл, `F1`.

### F2 — снятие `reason LIKE 'medical_history:%'` в читающем корне не ловится

Инъекция:

```text
audit-read-refusal-any-reason:
в app.read_staff_patient_medical_merge_refusal(uuid) заменить
AND c.reason LIKE 'medical_history:%'
на AND TRUE
```

Команда:

```bash
DOCTOR_MEDICAL_MERGE_DOOR_FAULT=audit-read-refusal-any-reason node --test deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs
```

Результат под внешним lock: `FAULT INJECTED` напечатан, `tests=7 pass=7 fail=0`,
`EXTRA_FAULT_RC audit-read-refusal-any-reason 0`.

Impact: proof-set принимает корень, который читает не-медицинский merge-кандидат как медицинский след отказа.
Э4c относится к конфликту медицинских данных внутри организации.

Отчёт о непойманной: этот файл, `F2`.

### F3 — запись approval-комментария в чужую строку до tenant-wall не ловится

Инъекция:

```text
audit-approval-comment-foreign-row:
в пятиаргументной app.transfer_staff_approved_platform_user_merge_data(...)
заменить predicate
AND candidate.organization_id = app.current_org_id()
на AND TRUE
только в UPDATE, который пишет doctor_comment перед вызовом четырёхаргументной двери
```

Команда:

```bash
DOCTOR_MEDICAL_MERGE_DOOR_FAULT=audit-approval-comment-foreign-row node --test deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs
```

Результат под внешним lock: `FAULT INJECTED` напечатан, `tests=7 pass=7 fail=0`,
`EXTRA_FAULT_RC audit-approval-comment-foreign-row 0`.

Impact: врач чужой организации может записать `doctor_comment` в строку чужой клиники, а тест всё равно видит
`mergeOutcome='conflict_not_found'` и считает строку нетронутой, потому что проверяет только `status/payload`.
Э4c требует, чтобы решение врача имело вес только в своей организации.

Отчёт о непойманной: этот файл, `F3`.

## Что прошло

- `audit-read-refusal-any-org` пойман: `not ok 6`, `EXTRA_FAULT_RC audit-read-refusal-any-org 1`.
- Авторские `refusal-read-any-org` и `refusal-write-any-org` пойманы: оба `not ok 6`.
- `foreign-org-conflict` больше не пустой инжектор: напечатал `FAULT INJECTED` и дал `not ok 5`.
- `FACTS` не стали новой прозой: внешний тест читает JSON через `readJsonLine` и сравнивает значения
  `assert.equal` / `assert.deepEqual`; `assert.match` / `assert.doesNotMatch` нет.
- Диагностическая перефразировка не красит baseline: `7/7`.
- `definer-tenant-predicate.test.mjs`: `14/14`.

## ВОПРОСЫ ВЛАДЕЛЬЦУ

Нет. Все три находки лежат внутри proof-set Э4c и опираются на уже записанный оракул Э4c/§18б.

## НЕ СДЕЛАНО

- Не чинил proof-set и продуктовый код.
- Временные fault-инъекторы и временные скрипты удалены; в коммите остаётся только этот отчёт.
- Миграции из клона на DEV по-настоящему не применялись; все DB-прогоны были rollback-only.
- Полный CI (`pnpm run ci`, `scripts/ci-record.mjs`) не запускался.
- UI/браузер/второй Next-сервер не запускались.
- PROD и TEST не трогались.
- Строку вердикта в `feat` не писал.

## Строка вердикта для ведущего

```text
audit(e4c-proof-correction): FAIL — baseline 7/7 и авторская матрица 11/11 поймана (missed=0, marker_missing=0), но независимые дополнительные инъекции нашли 3 ложнозелёных: снятие status IN ('dismissed','escalated') в read_staff_patient_medical_merge_refusal, снятие reason LIKE 'medical_history:%' там же, и запись approval doctor_comment в чужую строку до tenant-wall. Доп. счёт: faults=4 caught=1 missed=3 marker_missing=0 unexpected_rc=0. definer-tenant-predicate 14/14; FACTS сравниваются значениями, diagnostic rephrase оставил baseline 7/7. Не чинил; полный CI/UI/PROD/TEST не трогал; миграции только rollback-only.
```
