# Э4c — независимый аудит круга 2: коррекция гейта и прогон стены отказа

Клон: `/home/dev/dev-projects/bcb-wt-merge-conflict`, ветка `wt/leads-kpi-live`, проверенный
HEAD `d03328a32`. Основание: `MERGE_MECHANISM_REWRITE_2026-09-14.md`, Э4c, и
`AUTH_AND_IDENTITY_CANON.md` §18б («Отказ не исчезает бесследно… в ОБЕИХ учётках»).

Проверены ровно два предмета брифа: удаление блока `TENANT_WALL_CROSSINGS` в `d03328a32` и
добавленный предыдущим аудитором прогон стены записи отказа из `ed3f6f7ff`.

## Вердикт: FAIL

Коррекция `d03328a32` правильна и все её применимые гейты зелёные. Но в добавленном `ed3f6f7ff`
прогоне есть запрещённая проверка собственного текста журнала: поведение не меняется, а прогон
краснеет. Это реальная ложная защита по AGENTS.md §10a, поэтому кандидат нельзя принять до её
исправления независимым исполнителем.

## 1. Коррекция `d03328a32`: PASS

`d03328a32` удаляет ровно 23 строки: одну запись четырёхаргументного
`app.transfer_staff_approved_platform_user_merge_data(uuid,uuid,uuid,uuid)` из
`TENANT_WALL_CROSSINGS`. Иного кода, прав или generated-артефактов коммит не меняет.

Удалённая пометка не была объяснением, нужным человеку или другому гейту. Это вход только для
`definer-tenant-predicate.test.mjs`: сам комментарий объявления говорит, что пометки допустимы
лишь для чтений стенованной таблицы из доступного арендатору DEFINER-корня. Четырёхаргументная
функция в `declaration.ts` имеет `execute: []`, `invocation: 'internal'`; generated DEV SQL делает
`REVOKE ALL` для неё от PUBLIC и всех ролей, включая `app_staff`, и не содержит `GRANT EXECUTE`.
Публичная пятиаргументная обёртка, напротив, получает EXECUTE только для `app_staff` и вызывает
четырёхаргументную под тем же владельцем SECURITY DEFINER. Поиск вызовов показал единственный
runtime-вызов TypeScript — `packages/platform-merge/src/pgPlatformUserMerge.ts`, пятиаргументный;
вызов четырёхаргументной формы есть только внутри этой DB-обёртки (и в proof-body фикстуре).

Следовательно, снятие пометки не делает стенованные чтения молчаливыми: внутренние relation
surfaces остаются в declaration и в generated census, но не должны входить в tenant-root gate.

Проверки выполнены через общий замок хоста:

```bash
/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-merge-conflict && \
  node deploy/postgres/privileges/generate-cli.mjs --check"
# → все privileges/allowlist для bcb_webapp_dev, bersoncarebot_test и therapysto_prod совпали побайтно

/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-merge-conflict && \
  node deploy/postgres/privileges/generate-cli.mjs --all --check --port-context-only"
# → все port-context artifacts совпали побайтно

/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-merge-conflict && \
  node deploy/postgres/privileges/generate-cli.mjs --census"
# → для каждой из трёх деклараций: 221 ACTIVE relation / 3623 source files; census PASS

/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-merge-conflict && \
  node --test deploy/postgres/privileges/definer-tenant-predicate.test.mjs"
# → 14/14 PASS, включая «пометка на функции, которую арендатор позвать не может, не заводится»
```

`generate-cli` — локальная генерация/сверка committed files, к PROD не подключается.

## 2. Добавленный прогон стены записи отказа: FAIL

### Что в нём действительно годно

Это повторяемое и дорогое молчаливое DB/RLS-поведение, поэтому живой rollback-only proof —
правильный слой. Независимый oracle — §18б: конфликт разбирает врач **своей** организации и
пометка отказа остаётся в обеих учётках. Обычный DEV-прогон создаёт вторую клинику только внутри
транзакции, устанавливает candidate migration/privileges внутри неё и заканчивается
`ROLLBACK`; остаток fixture rows равен 0.

Нормальный прогон:

```bash
/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-merge-conflict && \
  RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 node --test \
  deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs"
# → 7/7 PASS; test 6 — «врач чужой организации не читает и не переписывает отказ соседней клиники»
```

### Семантическая инъекция: PASS

Снята именно стена записи в кандидате: `refusal-write-any-org` заменяет
`AND organization_id = app.current_org_id()` на `AND TRUE` в корне
`app.refuse_staff_patient_medical_merge_conflict`.

```bash
/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-merge-conflict && \
  if RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 \
    DOCTOR_MEDICAL_MERGE_DOOR_FAULT=refusal-write-any-org \
    node --test deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs; then \
      echo 'ERROR: expected injected wall removal to fail' >&2; exit 1; \
  else echo 'EXPECTED_FAILURE: refusal-write-any-org'; fi"
```

Результат: 6/7, `not ok 6`. У инъецированного врача клиники B дверь вернула `true`; строка
клиники A стала `escalated`, получила чужой комментарий, `resolved_by` врача B и
`platform_requests: 1`. Затем proof сделал `ROLLBACK`, остаток fixture rows — 0. Повторный
обычный прогон после инъекции снова дал 7/7 PASS.

Непойманной поломки **того же семантического класса** не найдено: один доступный арендатору
write-root имеет единственный организационный predicate в UPDATE; единственный runtime route
доходит до этого корня, а клиника B с известным `conflictId` уже проверена. Поиск

```bash
rg -l "transfer_staff_approved_platform_user_merge_data\\(" \
  --glob '!deploy/postgres/generated/**' --glob '!docs/**' | sort
```

дал только две миграции, declaration, proof-body и `pgPlatformUserMerge.ts`; tenant-runtime
вызов четырёхаргументного внутреннего корня не обнаружен.

### MUST FIX N1 — добавленный тест фиксирует текст собственного журнала

`doctor-medical-merge-door.devDbProof.test.mjs:214-221` проверяет точные строки и JSON-порядок,
которые печатает добавленный же `doctor-medical-merge-refusal-foreign-org.proofBody.mjs`: например
`clinic A sees its own trace:` и сериализацию `clinicA_target/clinicA_duplicate/clinicB_target`.
Это не независимый oracle §18б и не конечный результат для человека — это внутренний текст
оснастки, который меняется вместе с ней.

Инъекция формы без изменения DB-поведения это доказала. Временно заменена только фраза журнала
`clinic A sees its own trace` → `clinic A has its own refusal trace`; proof напечатал
`RESULT: PASS`, все DB-проверки прошли и rollback оставил 0 строк, но внешний набор стал 6/7 с
`not ok 6` на `assert.match(... /clinic A sees its own trace/)`.

Команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-merge-conflict && \
  if RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 node --test \
    deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs; then \
      echo 'ERROR: expected log-only change to fail' >&2; exit 1; \
  else echo 'EXPECTED_FAILURE: log-only wording change'; fi"
# → 6/7: только test 6 красный; после прогона временная правка откатена
```

Impact: любая безвредная правка диагностики создаст красный gate и вынудит менять тест вместе с
кодом. Это прямо запрещено AGENTS.md §10a («тест не дублирует ... текст» и линейка владельца
15.09). Исправление не делалось: нужно убрать проверки внутреннего текста/сериализации и оставить
наблюдаемое DB-поведение через независимый oracle, не сохраняя текстовый протокол как контракт.

## Счёт инъекций

| Вид | Инъекция | Результат |
|---|---|---|
| Семантика стены записи | `refusal-write-any-org` | Поймана: 7/7 → 6/7 (`not ok 6`) → 7/7 после rollback |
| Семантика того же класса, не пойманная прогоном | поиск root/callers + границы write-door | 0 найдено |
| Форма теста | смена одной диагностической фразы proof-body | Ложно поймана: 7/7 → 6/7 при `RESULT: PASS`; временная правка откатена |

## ВОПРОСЫ ВЛАДЕЛЬЦУ

Нет.

## НЕ СДЕЛАНО

- Продуктовый код и тест не исправлялись: аудит — gate, не fixer.
- Полный CI не запускался по прямому запрету brief.
- UI/live-browser приёмка не входит в эти два предмета.
- Миграции на DEV не применялись: все живые прогоны ставили candidate только внутри транзакции с ROLLBACK.

## Строка вердикта для ведущего (в `feat` пишет ведущий)

```text
audit(e4c): FAIL — круг 2, независимый. Коррекция d03328a32 верна: внутренний transfer(uuid,uuid,uuid,uuid) недоступен арендатору, declaration/generator/census сходятся, definer-tenant-predicate 14/14. Новый живой proof стены ЗАПИСИ отказа семантически держит: снятие org predicate даёт 6/7 (чужой врач меняет строку A и заводит заявку), rollback → 7/7; непойманной semantic-поломки того же класса нет. MUST FIX: добавленный внешний test фиксирует текст/JSON собственного proof-log — одна безвредная смена фразы дала 6/7 при RESULT PASS, нарушая §10a. Вопросов владельцу: 0.
```
