Прод работает на выложенном образе `therapysto-app:bb91018ec`; из 277 подтверждаемых обещаний миграций и трёх свежих поверхностей в базе не отсутствует ничего, а штатный вызов гейта отказал до сравнения из-за отсутствующей команды `therapysto-journal-truth` и недоступного non-interactive `sudo` для `deploy`.

# Замер гейта журнала миграций на новом проде — 15.09.2026

Scope: только read-only замер нового прода `135.106.187.95`. Старый прод не открывался. Исправления,
деплой, миграции, rollback, restart и смена `TEST=true` не выполнялись.

## 1. Обязательный вызов гейта — дословно

Запущено из `/home/dev/dev-projects/BersonCareBot`:

```bash
BCB_JOURNAL_TRUTH_SSH_OPTS="-i $HOME/.ssh/therapysto_prod_build_20260817 -o IdentitiesOnly=yes -o BatchMode=yes" \
bash deploy/host/check-migration-journal-truth.sh therapysto_prod deploy@135.106.187.95
```

Полный вывод:

```text
  конвейерный путь: sudo: a password is required
sudo: a password is required
ОТКАЗ: цель therapysto_prod не ответила ни одной строкой
```

Код возврата: `2`.

Это не список ложных миграций: цель не вернула гейту ни одной строки, поэтому сравнение предикатов не
началось.

## 2. Содержательная сверка той же базы через документированный root-доступ

Чтобы отделить состояние БД от поломанного пути `deploy@ → sudo`, тот же локальный гейт запущен с тем же
ключом и той же целью, но через документированный root-доступ:

```bash
BCB_JOURNAL_TRUTH_SSH_OPTS="-i $HOME/.ssh/therapysto_prod_build_20260817 -o IdentitiesOnly=yes -o BatchMode=yes" \
bash deploy/host/check-migration-journal-truth.sh therapysto_prod root@135.106.187.95
```

Полный вывод:

```text
  конвейерный путь: sudo: /opt/therapysto/pipeline/therapysto-journal-truth: command not found
эталон: bcb_webapp_dev (277 обещаний) · цель: therapysto_prod (277)
журнал цели не врёт: всё, что сбылось на эталоне, сбылось и здесь
```

Код возврата: `0`.

Проверка наличия обеих возможных команд:

```bash
ssh -i "$HOME/.ssh/therapysto_prod_build_20260817" -o IdentitiesOnly=yes -o BatchMode=yes \
  root@135.106.187.95 \
  'ls -l /usr/local/sbin/therapysto-journal-truth /opt/therapysto/pipeline/therapysto-journal-truth'
```

Полный вывод:

```text
ls: cannot access '/usr/local/sbin/therapysto-journal-truth': No such file or directory
ls: cannot access '/opt/therapysto/pipeline/therapysto-journal-truth': No such file or directory
```

Код возврата: `2`.

### Классификация списка отказа

Миграций в списке отказа нет: обязательный вызов не дошёл до сравнения, а содержательная сверка всех
`277` обещаний не нашла ни отсутствующего объекта, ни отличающегося применимого предиката
`BCB-MIGRATION-VERIFY`. Поэтому классифицировать отдельные миграции как «объекта нет» либо «предикат честно
неприменим» не к чему.

## 3. Активный цвет, образ и контейнеры

Команда:

```bash
ssh -i "$HOME/.ssh/therapysto_prod_build_20260817" -o IdentitiesOnly=yes -o BatchMode=yes \
  root@135.106.187.95 '
printf "active-colour: "
cat /opt/therapysto/state/active-colour
active_colour=$(cat /opt/therapysto/state/active-colour)
printf "active-image: "
docker inspect --format "{{.Config.Image}}" "therapysto-${active_colour}-webapp-1"
docker inspect --format "{{.Name}} image={{.Config.Image}} status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} restarts={{.RestartCount}}" $(docker ps -aq --filter "name=therapysto-blue-" --filter "name=therapysto-green-")
'
```

Полный вывод:

```text
active-colour: blue
active-image: therapysto-app:bb91018ec
/therapysto-blue-scheduler-1 image=therapysto-app:bb91018ec status=running health=none restarts=0
/therapysto-blue-media-worker-1 image=therapysto-app:bb91018ec status=running health=none restarts=0
/therapysto-blue-webapp-1 image=therapysto-app:bb91018ec status=running health=healthy restarts=0
/therapysto-blue-api-1 image=therapysto-app:bb91018ec status=running health=healthy restarts=0
```

Код возврата: `0`.

Команда подтверждения checkout и image id:

```bash
ssh -i "$HOME/.ssh/therapysto_prod_build_20260817" -o IdentitiesOnly=yes -o BatchMode=yes \
  root@135.106.187.95 \
  'git -C /opt/therapysto/src rev-parse HEAD; docker image inspect therapysto-app:bb91018ec --format "image-id: {{.Id}}"'
```

Полный вывод:

```text
bb91018eccefce272dd7159eed60586f6d69dc92
image-id: sha256:2d934473ad935b315beff13e347b6c093026c0995632595ca5e77d64cb30692c
```

Код возврата: `0`.

Итог состояния: активен `blue`; webapp и api — `running/healthy`; scheduler и media-worker —
`running` на том же `blue`; у каждого из четырёх контейнеров `restarts=0`.

## 4. `/api/health`

Команда:

```bash
for url in https://therapysto.ru/api/health https://admin.therapysto.ru/api/health https://therapygo.ru/api/health; do
  printf '%s\n' "$url"
  curl --silent --show-error --write-out '\nHTTP %{http_code}\n' "$url"
done
```

Полный вывод:

```text
https://therapysto.ru/api/health
{"ok":true,"db":"up"}
HTTP 200
https://admin.therapysto.ru/api/health
{"ok":true,"db":"up"}
HTTP 200
https://therapygo.ru/api/health
{"ok":true,"db":"up"}
HTTP 200
```

Код возврата: `0`.

## 5. Расписание фоновых заданий против manifest

Команда выполнена в выложенном дереве на новом проде:

```bash
ssh -i "$HOME/.ssh/therapysto_prod_build_20260817" -o IdentitiesOnly=yes -o BatchMode=yes \
  root@135.106.187.95 \
  'cd /opt/therapysto/src && node deploy/host/background-jobs-cli.mjs --verify-installed --env prod'
```

Полный вывод:

```text
background-jobs-cli --verify-installed (prod): OK
```

Код возврата: `0`.

## 6. Три свежие миграции

### Записи журнала

Read-only запрос:

```sql
WITH expected(tag) AS (
  VALUES
    ('20260915T140000_lead_notification_profiles_root'),
    ('20260915T141000_pre_session_lead_doors_gate_before_compute'),
    ('20260915T150000_the_person_fio_answer_survives_the_doctor_defer')
)
SELECT expected.tag, migrations.tag IS NOT NULL AS journal_applied
FROM expected
LEFT JOIN drizzle.__drizzle_migrations AS migrations USING (tag)
ORDER BY expected.tag;
```

Он выполнен командой:

```bash
ssh -i "$HOME/.ssh/therapysto_prod_build_20260817" -o IdentitiesOnly=yes -o BatchMode=yes \
  root@135.106.187.95 \
  'runuser -u postgres -- psql -d therapysto_prod -X -v ON_ERROR_STOP=1 -P pager=off'
```

Полный вывод:

```text
                               tag                               | journal_applied
-----------------------------------------------------------------+-----------------
 20260915T140000_lead_notification_profiles_root                 | t
 20260915T141000_pre_session_lead_doors_gate_before_compute      | t
 20260915T150000_the_person_fio_answer_survives_the_doctor_defer | t
(3 rows)
```

Код возврата: `0`.

### `20260915T140000_lead_notification_profiles_root`

Read-only запрос:

```sql
SELECT
  to_regprocedure('app.read_clinic_lead_notification_profiles(uuid,text)')::text AS signature,
  to_regprocedure('app.read_clinic_lead_notification_profiles(uuid,text)') IS NOT NULL AS exists;
```

Полный вывод:

```text
                       signature                       | exists
-------------------------------------------------------+--------
 app.read_clinic_lead_notification_profiles(uuid,text) | t
(1 row)
```

Итог: `app.read_clinic_lead_notification_profiles(uuid,text)` на проде есть.

### `20260915T150000_the_person_fio_answer_survives_the_doctor_defer`

Read-only запрос:

```sql
SELECT
  to_regprocedure('app.record_patient_medical_merge_conflict(uuid,uuid,uuid,text,text)')::text AS signature,
  to_regprocedure('app.record_patient_medical_merge_conflict(uuid,uuid,uuid,text,text)') IS NOT NULL AS exists,
  to_regprocedure('app.record_patient_medical_merge_conflict(uuid,uuid,uuid,text)') IS NULL AS old_four_arg_absent;
```

Полный вывод:

```text
                              signature                              | exists | old_four_arg_absent
---------------------------------------------------------------------+--------+---------------------
 app.record_patient_medical_merge_conflict(uuid,uuid,uuid,text,text) | t      | t
(1 row)
```

Итог: пятиаргументная `app.record_patient_medical_merge_conflict(uuid,uuid,uuid,text,text)` на проде есть;
старая четырёхаргументная сигнатура отсутствует.

### `20260915T141000_pre_session_lead_doors_gate_before_compute`

Read-only интроспекция `pg_proc.prosrc`: для каждой ожидаемой сигнатуры взята первая непустая строка после
`BEGIN`, затем проверено, начинается ли она с `PERFORM app.require_accepted_context(`.

Запрос:

```sql
WITH expected(signature) AS (
  VALUES
    ('app.list_public_booking_form_fields(text)'),
    ('app.create_public_lead(uuid,text,text,text,text,text,text,text,text,timestamp with time zone)'),
    ('app.public_lead_issue_altcha_challenge(text,uuid,text,timestamp with time zone)'),
    ('app.public_lead_consume_altcha_challenge(text,uuid,text)')
),
definitions AS (
  SELECT expected.signature, pg_catalog.to_regprocedure(expected.signature) AS oid, proc.prosrc
  FROM expected
  LEFT JOIN pg_catalog.pg_proc AS proc
    ON proc.oid = pg_catalog.to_regprocedure(expected.signature)
),
first_lines AS (
  SELECT definitions.signature, definitions.oid, first_line.first_executable
  FROM definitions
  LEFT JOIN LATERAL (
    SELECT pg_catalog.btrim(source.line) AS first_executable
    FROM pg_catalog.unnest(pg_catalog.string_to_array(definitions.prosrc, E'\n'))
      WITH ORDINALITY AS source(line, line_number)
    WHERE source.line_number > (
      SELECT min(begin_source.line_number)
      FROM pg_catalog.unnest(pg_catalog.string_to_array(definitions.prosrc, E'\n'))
        WITH ORDINALITY AS begin_source(line, line_number)
      WHERE pg_catalog.btrim(begin_source.line) = 'BEGIN'
    )
      AND pg_catalog.btrim(source.line) <> ''
    ORDER BY source.line_number
    LIMIT 1
  ) AS first_line ON true
)
SELECT
  signature,
  oid IS NOT NULL AS exists,
  pg_catalog.left(first_executable, pg_catalog.strpos(first_executable, '(')) AS first_executable,
  pg_catalog.starts_with(first_executable, 'PERFORM app.require_accepted_context(') AS gate_is_first
FROM first_lines
ORDER BY signature;
```

Полный вывод:

```text
                                           signature                                           | exists |           first_executable            | gate_is_first
-----------------------------------------------------------------------------------------------+--------+---------------------------------------+---------------
 app.create_public_lead(uuid,text,text,text,text,text,text,text,text,timestamp with time zone) | t      | PERFORM app.require_accepted_context( | t
 app.list_public_booking_form_fields(text)                                                     | t      | PERFORM app.require_accepted_context( | t
 app.public_lead_consume_altcha_challenge(text,uuid,text)                                      | t      | PERFORM app.require_accepted_context( | t
 app.public_lead_issue_altcha_challenge(text,uuid,text,timestamp with time zone)               | t      | PERFORM app.require_accepted_context( | t
(4 rows)
```

Код возврата: `0`.

Итог: все четыре публичные двери заявки на проде есть, и в каждой гейт — первая исполняемая операция.

## Строка вердикта для ведущего

`PROD JOURNAL TRUTH: runtime PASS на образе bb91018ec; DB truth PASS 277/277 через root fallback; обязательный deploy@-гейт FAIL exit 2 до сравнения — therapysto-journal-truth отсутствует, fallback sudo недоступен; три свежие миграции записаны в журнал, обе именованные функции существуют, четыре публичные двери существуют и начинают исполнение с require_accepted_context; исправления не выполнялись.`

## НЕ СДЕЛАНО

- Не исправлены отсутствие `therapysto-journal-truth` и права `deploy` на штатный путь гейта: решение по
  находке принимает ведущий.
- Не выполнялись deploy, миграция, rollback, restart, изменение контейнеров, cron или базы.
- Не снимался `TEST=true`.
- Не открывался и не проверялся старый прод `135.106.162.170`.
- Не запускались тесты, сборки и полный CI: код не менялся, а brief полный CI прямо запрещает.
- Строка вердикта не внесена в `feat`; выше дан только текст для ведущего.
