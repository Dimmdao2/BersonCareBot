# Э4b: модалка конфликта открывалась пустой — дверь подробностей отвечала `500`

План: `docs/_TODO/MERGE_MECHANISM_REWRITE_2026-09-14.md`, этап Э4b. Канон — `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md` §18б.
Клон: `/home/dev/dev-projects/bcb-wt-fio-dialog`, ветка `wt/merge-conflict-detail` (HEAD ветки = `72115ed5e`, то же дерево, что и `feat`).

## Итог

Дверь отвечает `200` с подробностями. **Правки кода и объявления прав не потребовалось: дефекта в репозитории нет.**
Отказ был состоянием СТЕНДА — база DEV отставала от `feat` на три приземлённые миграции, и объявленная
способность двери не существовала ни в каталоге базы, ни в рантайм-env, из которого поднят `:5200`.

Полная сверка прав на DEV **по-прежнему не проходит** — её валит чужая приземлённая дверь Л4
(`app.public_lead_consume_altcha_challenge`). Механика названа ниже, в работу не превращена.

## Причина — механикой, а не догадкой

Сообщение бросает `capabilityFor` (`apps/webapp/src/infra/db/portContextRuntime.ts:302`) при
`matches.length !== 1`. Совпадений было **ноль**, а не два.

1. **Объявление было ВЕРНЫМ.** Рендер дескрипторов из самой декларации даёт ровно один дескриптор на эту
   функцию:

   ```bash
   node --experimental-strip-types -e "
     const { declaration } = await import('./deploy/postgres/privileges/declaration.ts');
     const { renderPortContextRuntimeEnv } = await import('./deploy/postgres/privileges/generate.mjs');
     const d = JSON.parse(renderPortContextRuntimeEnv(declaration,'dev','bcb_webapp_dev','webapp').value);
     console.log(Object.entries(d).filter(([,v])=>String(v.functionIdentity||'').includes('medical_merge_conflict')));"
   # staff_patient_medical_merge_conflict_read → app_staff / staff / identity.medical-merge-conflict.read
   ```

2. **Рантайм-env отставал на 8 дескрипторов из 279.** Сравнение рендера декларации с живым
   `WEBAPP_PORT_CONTEXT_CAPABILITIES_JSON` из `/home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev`
   (дерево, из которого поднят общий `:5200`):

   ```text
   declaration(dev, webapp) descriptors: 279
   live .env.dev descriptors            : 271
   MISSING live: create_public_lead, public_lead_consume_altcha_challenge,
                 public_lead_issue_altcha_challenge, patient_medical_merge_conflict_record,
                 platform_patient_medical_merge_conflicts_resolve,
                 pre_session_patient_medical_merge_conflict_record,
                 staff_patient_medical_merge_conflict_read,
                 staff_patient_medical_merge_conflict_refuse
   расхождение в теле дескриптора: list_public_booking_form_fields  () → (text)
   ```

3. **Каталог базы отставал ровно так же, и функций двери на DEV не было вовсе.**

   ```text
   SELECT ... FROM pg_proc WHERE proname LIKE '%medical_merge_conflict%';        -> (0 rows)
   SELECT count(*) FROM app_ext.port_context_capabilities
     WHERE port='webapp' AND active_until IS NULL;                               -> 271
   SELECT ... FROM app_ext.port_context_capabilities
     WHERE function_identity::text LIKE '%medical_merge_conflict%';              -> (0 rows)
   ```

   Причина отставания — три НЕ ПРИМЕНЁННЫЕ приземлённые миграции (`pending=3` из `total=223`):
   `20260914T220000_doctor_resolves_medical_merge_conflict.sql`, `20260915T120000_public_lead_intake.sql`,
   `20260915T130000_the_public_lead_captcha_burns_once.sql`. Ровно эти три дают те самые 8 дескрипторов.

**Итог механики:** env не нёс строки способности → фильтр `capabilityFor` не нашёл ни одного совпадения →
`matches.length !== 1` → `Missing unique declared webapp port capability`. Двери в базе тоже не существовало,
так что даже с исправленным env запрос упал бы дальше. «Строку забыли объявить» — действительно не объяснение.

## Что сделано на стенде

| Шаг | Команда | Результат |
|---|---|---|
| Откатываемый preflight из клона | `bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot` | `pending=3 total=223`, `migrate-dev preflight: PASS` |
| Применение приземлённых миграций из ГЛАВНОГО дерева | `cd /home/dev/dev-projects/BersonCareBot && bash deploy/host/migrate-dev.sh --execute` | миграции применены (4 функции двери появились); **сверка прав упала** — см. блокер ниже; `EXIT=1` |
| Объявленный срез двери (дословно из сгенерированных артефактов) | `psql -f /tmp/e4b-door-slice.sql` | `EXIT=0`, `INSERT 0 5`, `COMMIT` |
| Починка повисшей строки способности | `UPDATE app_ext.port_context_capabilities SET function_identity='app.list_public_booking_form_fields(text)'::regprocedure WHERE capability_id='c59dc36e-…'` | `dangling` 1 → 0 |
| Синхронизация рантайм-env штатным портом | `node --experimental-strip-types deploy/host/update-dev-port-context-env.mjs` (в главном дереве) | `DEV port-context runtime env synchronized with declaration` |
| Перезапуск общего `:5200` | `bash scripts/run-webapp-dev.sh turbo` | `✓ Ready`, порт слушает |

Все прогоны против базы шли через общий замок хоста `/home/dev/brain/host-orch/run-tests.sh`.
Второй Next-сервер не поднимался, полный CI не запускался.

Срез `/tmp/e4b-door-slice.sql` — не ручная выдумка: это дословно взятые из
`deploy/postgres/generated/privileges.bcb_webapp_dev.sql` блоки семи таблиц двери
(`patient_merge_candidates`, `platform_users`, `user_identity`, `user_login_events`,
`treatment_program_instances`, `patient_lfk_assignments`, `lfk_complex_templates`), 36 строк ACL четырёх
функций двери и 5 строк способностей из `port-context-capabilities.bcb_webapp_dev.sql`. Первая успешная
полная сверка прав перезапишет это целиком (она делает `DELETE`+`INSERT` всего каталога), поэтому срез
самозатирающийся и от объявления не расходится.

## Дверь: до и после — дословно

До (живая приёмка 15.09, `docs/_TODO/LIVE_ACCEPTANCE_E4B_2026-09-15/REPORT.md` в клоне
`bcb-wt-merge-conflict`, и журнал рантайма):

```text
GET /api/doctor/account-merge-conflicts                     -> 200, конфликт найден
GET /api/doctor/account-merge-conflicts/<id>                -> 500
Missing unique declared webapp port capability for app.read_staff_patient_medical_merge_conflict(uuid)
```

После (мой прогон, вход владельца `dimmdao@yandex.ru` на `127.0.0.1:5200`, кука
`bersoncare_webapp_session`):

```text
POST /api/auth/email-password/login  -> 200 {"ok":true,"redirectTo":"/app/doctor","role":"doctor"}
GET  /api/doctor/account-merge-conflicts -> 200
{"ok":true,"hasConflicts":true,"conflictIds":["00000000-0000-4000-8000-0000000e4b10"], …}

GET /api/doctor/account-merge-conflicts/00000000-0000-4000-8000-0000000e4b10 -> 200
{"ok":true,"conflict":{"id":"00000000-0000-4000-8000-0000000e4b10",
 "organizationId":"a0000000-0000-4000-8000-000000000001",
 "createdAt":"2026-09-15 07:23:37.266699+03","source":"projection","doctorApproved":false,
 "parties":[
  {"userId":"…e4b01","displayName":"Иванова Мария Петровна","firstName":"Мария","lastName":"Иванова",
   "patronymic":"Петровна","lastActivityAt":"2026-09-13 07:23:37.266699+03",
   "assignments":[{"id":"…e4b21","kind":"treatment_program",
                   "title":"Программа восстановления спины",
                   "assignedAt":"2026-08-26 07:23:37.266699+03","status":"active"}]},
  {"userId":"…e4b02","displayName":"Иванова М. П.","firstName":"Мария","lastName":"Иванова",
   "patronymic":null,"lastActivityAt":"2026-09-06 07:23:37.266699+03",
   "assignments":[{"id":"…e4b22","kind":"treatment_program",
                   "title":"Программа после травмы колена",
                   "assignedAt":"2026-09-10 07:23:37.266699+03","status":"active"}]}]}}
```

Оракул Э4b закрыт по содержимому: какие назначения и от какого числа, последняя активность в каждой
учётке, как человек записан с обеих сторон (ФИО и там, и там).

## Фикстура и уборка

Временная фикстура в организации владельца (`Точка Здоровья`, `a0000000-…-000000000001`): 2 `platform_users`,
2 `user_identity`, 2 `org_enrollments`, 2 `user_login_events`, 2 `treatment_program_instances`,
1 `patient_merge_candidates` — 11 строк, детерминированные UUID с хвостом `e4b…`. Удалена целиком,
контрольный счёт:

```text
fixture_rows_left|all_pending_medical_conflicts_left
0|0
```

## 🔴 Блокер, который НЕ мой и в работу не превращён: полная сверка прав на DEV не проходит

`migrate-dev.sh --execute` доходит до `reconcile-access.mjs` и падает:

```text
ERROR:  pre-session exact gate missing or mismatched: app.public_lead_consume_altcha_challenge(text,uuid,text)
```

Механика (`deploy/postgres/privileges/generate.mjs:632-646`): гейт запрещает ЛЮБОЕ вычисление до вызова
`app.require_accepted_context`. Тело двери Л4 объявляет переменную с инициализацией
(`v_now timestamptz := statement_timestamp();`) в `DECLARE`, то есть до гейта. Проверено живым
предикатом самого гейта:

```text
assignment_before_gate | has_hash | prosecdef
t                      | t        | t
```

Это дверь Л4 (её независимый аудит уже помечен FAIL в `72115ed5e`), а не Э4b. Сверка прав — одна
транзакция, поэтому падение на ней оставляет DEV без НОВЫХ строк каталога способностей и без новых
грантов по всей базе. Последствия, которые видны прямо сейчас:

- три способности Л4 (`create_public_lead`, `public_lead_issue_altcha_challenge`,
  `public_lead_consume_altcha_challenge`) есть в env и в декларации, но их нет в
  `app_ext.port_context_capabilities` (276 строк webapp против 279 объявленных) — двери публичных заявок
  на DEV не откроются;
- до моего прогона они не открывались тоже (их функций на DEV просто не было), но отказ выглядел иначе:
  раньше приложение падало своим сообщением о способности, теперь отказ придёт от `install_port_context`.

Развязка — одна строка в НОВОЙ миграции Л4: перенести инициализацию `v_now` за вызов гейта. **Это решение
ведущего/владельца по Л4; я его не трогал**, чтобы не переписать чужую дверь поверх идущей у них коррекции.

## НЕ СДЕЛАНО

- Не чинил дверь Л4 и не разблокировал полную сверку прав на DEV — назван блокер, работа не начата.
- Не выполнял `POST` действий двери (`merge`/`refuse`) живьём: оракул этого этапа — подробности в модалке,
  а обе кнопки уничтожили бы фикстуру до снятия доказательства.
- Не смотрел саму модалку в браузере: §10a запрещает автоматические UI-тесты, а живой клик — приёмка владельца.
- Не запускал полный CI (`pnpm run ci`), не запускал `vitest`/`node --test`: правок кода в этой работе нет.
- Не менял репозиторий, кроме этого отчёта: дефекта в коде и в объявлении прав не найдено.
- Не писал строку вердикта в очередь — отдаю ведущему текстом в отчёте.
- Прод не затрагивался; пароль `dimmdao@gmail.com` не подбирался.
