# Независимый аудит доказательного набора Э4c — круг 5

Вердикт: **FAIL**.

Предмет: коммит `007ceb35a840e0f9f043b88e13d6596799d0ac79` в ветке
`wt/leads-kpi-live`.

Authority: `docs/_TODO/MERGE_MECHANISM_REWRITE_2026-09-14.md`, этап **Э4c**:
решение врача оставляет комментарий врача, явную отметку о запросе поддержки и видимый след отказа
в обеих учётках. Критерий шапки proof-set дополнительно требует красного результата при снятии
**каждого** предиката дверей Э4c.

## Классификация

- Повторяемое поведение: baseline, заявленные fault injection, независимая инъекция обязательности
  комментария, диагностическая перефразировка и tenant-wall — живые прогоны через общий host-lock.
- Качество разового действия: полнота перечня предикатов, состав фикстуры, значения счётчиков,
  отсутствие прав в миграциях и восстановление дерева — чтение, `rg` и итоговый `git diff`.

## Разбор предикатов

Три миграции применяются по имени. Поэтому в таблице ниже учтены активные после их последовательного
применения определения: четырёхаргументная transfer-дверь из `20260914T220000`, три двери Э4c из
`20260915T102455` и запись ответа человека из `20260915T150000`. Переписанные более поздней миграцией
старые определения повторно действующими не считаются.

Команда, которой получен перечень строк для самостоятельного разбора:

```bash
rg -n '^CREATE OR REPLACE FUNCTION|^  IF |^   WHERE |^     AND |^          WHERE |^            AND |^       AND ' apps/webapp/db/drizzle-migrations/20260914T220000_doctor_resolves_medical_merge_conflict.sql apps/webapp/db/drizzle-migrations/20260915T102455_doctor_merge_decision_has_a_record.sql apps/webapp/db/drizzle-migrations/20260915T150000_the_person_fio_answer_survives_the_doctor_defer.sql
```

### Публичные двери Э4c, которые шапка называет своим конечным scope

| Дверь | Предикат / условие в активной миграции | Поломка в шапке | Результат сверки |
|---|---|---|---|
| accept, 5 арг. | комментарий не пуст и не длиннее 2000 (`IF btrim(...) = '' OR length(...) > 2000`) | нет | **пропущен**; независимая инъекция сняла весь `IF`, набор остался 7/7 |
| accept, 5 арг. | `candidate.id = p_conflict_id` | нет | отсутствует в конечном перечне |
| accept, 5 арг. | `candidate.organization_id = app.current_org_id()` | `approval-comment-foreign-row`; вместе с нижней дверью — `foreign-org-conflict` | заявленная инъекция красная |
| accept, 5 арг. | `candidate.status = 'pending'` | нет | отсутствует в конечном перечне |
| accept, 5 арг. | `candidate.reason LIKE 'medical_history:%'` | нет | отсутствует в конечном перечне |
| accept, 5 арг. | неупорядоченная пара: равны и `LEAST(...)`, и `GREATEST(...)` | нет | отсутствует в конечном перечне |
| accept, 5 арг. | `IF NOT FOUND` возвращает `conflict_not_found` | нет | отсутствует в конечном перечне |
| accept, 5 арг. | `IF v_outcome = 'awaiting_other_organization'` гасит pending своей клиники | `decision-stays-pending` | заявленная инъекция красная |
| accept, 5 арг. | финальный `WHERE id = p_conflict_id` гасит ровно одну строку | нет | отсутствует в конечном перечне |
| refuse | комментарий не пуст и не длиннее 2000 (`IF btrim(...) = '' OR length(...) > 2000`) | нет | отсутствует в конечном перечне |
| refuse | `CASE WHEN p_support_requested` выбирает `escalated`/`dismissed` | нет отдельной поломки | `support-always-escalates` меняет другой `IF`, не этот предикат |
| refuse | `id = p_conflict_id` | нет | отсутствует в конечном перечне |
| refuse | `organization_id = app.current_org_id()` | `refusal-write-any-org` | заявленная инъекция красная |
| refuse | `status = 'pending'` | нет | отсутствует в конечном перечне |
| refuse | `reason LIKE 'medical_history:%'` | нет | отсутствует в конечном перечне |
| refuse | `IF v_conflict_id IS NULL` возвращает отказ | нет | отсутствует в конечном перечне |
| refuse | `IF p_support_requested` создаёт обращение платформе | `support-always-escalates` | заявленная инъекция красная |
| read refusal | `c.id = p_conflict_id` | нет | отсутствует в конечном перечне |
| read refusal | `c.organization_id = app.current_org_id()` | `refusal-read-any-org` | заявленная инъекция красная |
| read refusal | `c.status IN ('dismissed', 'escalated')` | `refusal-read-any-status` | заявленная инъекция красная |
| read refusal | `c.reason LIKE 'medical_history:%'` | `refusal-read-any-reason` | заявленная инъекция красная |
| read refusal | инициатор: `foundAccountId = anchor` / `foundAccountId = candidate` | нет | результат baseline проверяет инициатора, но поимённой поломки в критерии нет |
| read refusal | контакты принадлежат текущей стороне: `contact.platform_user_id = party.user_id` | нет | результат baseline проверяет точный список контактов, но поимённой поломки в критерии нет |

Уже этой таблицы достаточно для FAIL: шапка называет перечень полным, но не называет даже обязательный
`IF` комментария, фильтры статуса/причины/пары в accept/refuse и выбор строки по `conflictId`.

### Делегированная четырёхаргументная transfer-дверь и запись defer

| Дверь | Предикат / условие | Поломка в шапке | Результат сверки |
|---|---|---|---|
| transfer, 4 арг. | `v_organization_id IS NULL` → отказ | нет | отсутствует в конечном перечне |
| transfer, 4 арг. | exact row: id + organization + pending + medical reason + обе половины неупорядоченной пары | только organization входит в `foreign-org-conflict` | id/status/reason/pair поимённо отсутствуют |
| transfer, 4 арг. | существует медицинская история обеих учёток в другой организации | `two-clinic-blindness` снимает `target_history.organization_id IS DISTINCT FROM v_organization_id` | заявленная инъекция красная |
| transfer, 4 арг. | другая организация ещё не одобрила: organization + status pending/resolved + medical reason + `doctorApproved` + обе половины пары | нет отдельных поломок | отсутствуют в конечном перечне |
| record defer, 5 арг. | `p_human_fio_decision IS NOT NULL` и добавление ответа в payload | `fio-decision-not-persisted` | заявленная инъекция сохранения ответа красная |

Остальные фильтры четырёхаргументного тела переносят строки доменов после уже принятого решения; они не
являются предикатами допуска к решению Э4c и в заявленный критерий дверей не включены.

## MUST FIX

### F1 — критерий полноты неполон, а снятие обязательности комментария остаётся зелёным

В `app.transfer_staff_approved_platform_user_merge_data(uuid,uuid,uuid,uuid,text)` снят весь блок:

```sql
IF btrim(COALESCE(p_doctor_comment, '')) = '' OR
   length(btrim(p_doctor_comment)) > 2000 THEN
  RAISE EXCEPTION 'doctor_medical_merge_comment_invalid';
END IF;
```

Инъектор был добавлен временно отдельным именем `approval-comment-validation-removed`; `replaceOnce`
подтвердил ровно один якорь, а proof-тела напечатали `FAULT INJECTED: approval accepts an empty or
oversized doctor comment`.

Точная команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "bash ./audit-e4c-round5-extra.sh"
```

Результат: `EXTRA_FAULT_RC approval-comment-validation-removed 0`, `tests=7 pass=7 fail=0`.

Impact: accept-дверь может перестать требовать комментарий врача, а доказательный набор примет это как
готовую Э4c. Это прямо нарушает строку owner-плана «Принять открывает дополнительное подтверждение с
комментарием врача». Поломка дорогая и молчаливая: решение и слияние сохранятся без обязательного
объяснения, а зелёный набор не остановит выкатку.

Исправление должно дополнить конечный перечень всеми отсутствующими предикатами из таблицы и дать каждому
поимённую, реально доезжающую поломку. Минимум для самой найденной поломки — отдельные сценарии пустого
комментария у accept и refuse; `comment-not-saved` проверяет сохранение валидного текста и не заменяет
проверку его обязательности.

## Счёт и остальные проверки

Основной прогон выполнялся отдельным временным script-файлом, поэтому shell не мог раскрыть имя fault во
внешней оболочке:

```bash
/home/dev/brain/host-orch/run-tests.sh "bash ./audit-e4c-round5-run.sh"
```

Результат этой команды:

- baseline: `tests=7 pass=7 fail=0`;
- заявленная матрица: `faults=14 caught=14 missed=0 marker_missing=0 unexpected_rc=0`;
- `definer-tenant-predicate.test.mjs`: `tests=14 pass=14 fail=0`.

С независимой инъекцией из F1 общий счёт круга: **15 инъекций; 14 пойманы; 1 не поймана;
ошибок якоря 0; неожиданных кодов возврата 0**. Отчёт о единственной непойманной — этот файл, F1.

Две новые строки фикстуры не изменили прежние счётчики. Точная команда baseline с печатью фактов:

```bash
/home/dev/brain/host-orch/run-tests.sh "RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 DOCTOR_MEDICAL_MERGE_DOOR_ECHO=1 node --test deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs"
```

Результат: `marks={clinicA_target:1, clinicA_duplicate:1, clinicB_target:0}` и `tests=7 pass=7 fail=0`.
`pendingTraceRead=null`, `nonMedicalTraceRead=null`; каждый proof завершил `ROLLBACK_FACTS={fixtureRows:0}`.

Той же командой после временной замены только диагностической строки
`RESULT: PASS — both accounts keep ...` на другую английскую формулировку получено
`tests=7 pass=7 fail=0`. Значит assertions читают значения `FACTS`, а не фиксируют диагностический текст.
Перефразировка после прогона удалена.

Проверка отсутствия privilege-операторов в трёх миграциях:

```bash
rg -n '\b(GRANT|REVOKE|CREATE ROLE|ALTER ROLE|ALTER DEFAULT PRIVILEGES|CREATE POLICY)\b' apps/webapp/db/drizzle-migrations/20260914T220000_doctor_resolves_medical_merge_conflict.sql apps/webapp/db/drizzle-migrations/20260915T102455_doctor_merge_decision_has_a_record.sql apps/webapp/db/drizzle-migrations/20260915T150000_the_person_fio_answer_survives_the_doctor_defer.sql
```

Результат: пустой вывод, exit `1` (`rg` ничего не нашёл).

## ВОПРОСЫ ВЛАДЕЛЬЦУ

Нет. F1 лежит внутри явного owner-требования Э4c об обязательном комментарии и внутри заявленного самим
proof-set критерия «каждый предикат».

## НЕ СДЕЛАНО

- Proof-set и продуктовый код не исправлял.
- Все временные инъекторы, script-файлы и диагностическая перефразировка удалены до коммита.
- Миграции из клона на DEV по-настоящему не применялись; каждый живой прогон был транзакционным с
  `ROLLBACK`.
- Полный CI (`pnpm run ci`, `scripts/ci-record.mjs`) не запускался.
- UI, браузер и второй Next-сервер не запускались.
- PROD и TEST не трогались.
- Строку вердикта в `feat` не писал.

## Строка вердикта для ведущего

```text
audit(e4c-proof-round5): FAIL — baseline 7/7; заявленные faults=14 caught=14 missed=0 marker_missing=0, tenant-wall 14/14, но критерий «каждый предикат» неполон: в нём нет обязательного IF непустого комментария accept/refuse и ряда row/status/reason/pair-предикатов. Независимая approval-comment-validation-removed точно доехала и осталась зелёной: 7/7, rc=0. Общий счёт: faults=15 caught=14 missed=1 marker_missing=0 unexpected_rc=0; непойманная — AUDIT_E4C_ROUND5_2026-09-15.md F1. Новые fixture rows не изменили marks: clinicA_target=1, clinicA_duplicate=1, clinicB_target=0; diagnostic rephrase 7/7; rollback facts 0; полный CI/UI/PROD/TEST не трогал, миграции только rollback-only.
```
