# Независимый адверсарный аудит Л3 — публичный приём, круг 3

Вердикт: **PASS**.

Кандидат: `3d68801e99bc3ab79d25886e3e76540a9549829d` (`wt/leads-public-intake`).
Аудиторские acceptance-проверки: `03870ab9a`.

Оракул: `LEADS_AND_COMMUNICATION_VISIBILITY_2026-09-14.md:350-351` — форма заявки на
визитке клиники и режим заявок в `/book/embed.js`, с капчей, отдельным лимитом частоты и согласием
на обработку ПДн. Состав полей задаёт клиника (`:37-42`, `:235-241`, `:256-262`), а подтверждённая
заявка принадлежит правильной платформенной учётке (`:405-417`). Права живут только в декларации
и должны исполняться под runtime-ролью (`AGENTS.md` §1, §5).

## Ответ на стартовый вопрос

**ПОВЕДЕНИЕ.** Нет: телефон, выключенный клиникой, сейчас не может повлиять на выбор учётной записи.
Один результат tenant-конфигурации `accepted` питает обе критические ветки:
`submittedPhone: accepted.get('phone')` и `phone: accepted.get('phone')`
(`apps/webapp/src/app/api/leads/public/submit/route.ts:96-115`).

Прежняя проверка доказывала только сохранённое поле заявки. Дыра в доказательстве закрыта наблюдением
финального `platformUserId`: fake resolver выбирает другого владельца при любом `submittedPhone`, а запрос
с выключенным полем обязан создать заявку за владельцем подтверждённой почты
(`route.route.test.ts:315-319`). При слепой подмене `submittedPhone` на телефон из тела этот сценарий упал:
команда route-теста ниже получила **1 failed, 11 passed**, `expected …c1`, `received …c2`.

## Проверенные закрытия

| Пункт | Класс | Результат и оракул |
|---|---|---|
| Д1: SQL-типы `typedArgs` | **ВЗГЛЯД** | PASS. В декларации стоят SQL-типы `text`, `uuid`, `timestamp with time zone` (`declaration.ts:27948-27980`); generator check сходится. Подмена типа на runtime-тег отвергнута генератором. Требование: `AGENTS.md` §1. |
| Д2: поля задаёт клиника | **ПОВЕДЕНИЕ** | PASS. Выключенный телефон не попадает ни в заявку, ни в решение о слиянии; обязательное включённое поле контролирует приём (`route.route.test.ts:305-319`). Требование плана: `:37-42`, `:235-241`, `:256-262`. |
| Д3: права `INSERT … RETURNING *` | **ПОВЕДЕНИЕ** | PASS. Живой вызов под `app_tenant_service` создал одну строку при `INSERT+SELECT` и отказал без `SELECT`: `permission denied for table leads`; оба прогона откатились. Декларация содержит обе операции (`declaration.ts:27977-27994`), артефакт — `SELECT` 19 колонок и `INSERT` 12 (`privileges.bcb_webapp_dev.sql:16994-16995`). Требование: `AGENTS.md` §1, §5. |
| Д4: одноразовая капча | **ПОВЕДЕНИЕ** | PASS. Живая PostgreSQL-дверь дала `t, t, f`: выдача, первое consume, повторное consume. HTTP-сценарий даёт `[201, 403]` и одну заявку (`route.route.test.ts:272-280`). Требование плана: `:350-351`. |
| Д5: ФИО задаёт клиника | **ПОВЕДЕНИЕ** | PASS. Email-only lead OTP проходит; обычная регистрация без ФИО по-прежнему отказывает (`emailOtpPublic.unit.test.ts:124-169`). Требование плана: `:37-42`. |
| Д6: своё ведро частоты | **ПОВЕДЕНИЕ** | PASS. После 20 разрешённых booking-вызовов 21-й ограничен, а первый lead-вызов разрешён (`authRateLimits.unit.test.ts:19-45`). Требование плана: `:350-351`. |
| Tenant wall: slug и механика | **ПОВЕДЕНИЕ** | PASS. Организация берётся из slug, неизвестная клиника и выключенная механика отвечают 404 без заявки (`route.route.test.ts:284-303`). Создание в PostgreSQL вернуло тот же `organization_id`, что tenant-контекст. Требование этапа: публичная дверь клиники, `:350-351`. |

## Инъекции

Все инъекции сделаны поверх зафиксированного кандидата и после прогона возвращены побайтно.

| № | Инъекция | Исполнимый детектор | Результат |
|---:|---|---|---|
| 1 | `typedArgs[0]: 'uuid' → 'uuid@1'` | generator check | УБИТА: exit 2, декларация неполна в 1 месте |
| 2 | убрать `SELECT` у `public.leads`, оставить `RETURNING *` | живой PostgreSQL runtime-вызов | УБИТА: `permission denied for table leads` |
| 3 | `submittedPhone` взять напрямую из body | route test, итоговый `platformUserId` | УБИТА: 1 failed / 11 passed |
| 4 | обойти DB-consume решённой captcha | route test, повтор payload | УБИТА: 1 failed / 11 passed; вместо `[201,403]` получено `[201,201]` |
| 5 | снова потребовать ФИО в lead OTP | email OTP unit test | УБИТА: 1 failed / 5 passed |
| 6 | вернуть lead scope `booking.public_create` | rate-limit unit test | УБИТА: 1 failed / 0 passed |
| 7 | неизвестному slug подставить другую организацию | route test | УБИТА: 1 failed / 11 passed; вместо 404 получено 201 |
| 8 | обойти mechanic gate | route test | УБИТА: 1 failed / 11 passed; вместо 404 получено 201 |

Итого по командам ниже: **8 инъекций, 8 убито, 0 непойманных**. Отдельно принято измерение ведущего:
подмена сохранённого `phone` на body красит сценарий выключенного поля; это не включено повторно в мои 8.

## Команды и измерения

Доверенные измерения ведущего, не повторялись:

- `node deploy/postgres/privileges/generate-cli.mjs --check` — exit 0, generated-артефакты сходятся
  побайтно;
- `tsc -p apps/webapp/tsconfig.json --noEmit` — exit 0;
- `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run --project route src/app/api/leads/public/submit/route.route.test.ts"`
  — **12/12 passed** на кандидате.

Мои проверки:

- `node deploy/postgres/privileges/generate-cli.mjs --check` после инъекции `uuid@1` — exit 2,
  `декларация неполна — генерация отказана (1 мест)`; исходный файл восстановлен;
- `/home/dev/brain/host-orch/run-tests.sh "bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot"`
  — PASS, `pending=2`, `total=219`, обязательный `ROLLBACK`;
- `/home/dev/brain/host-orch/run-tests.sh "RUN_L3_PUBLIC_LEAD_DB=1 node --test deploy/postgres/privileges/public-lead-round3-audit.devDbProof.test.mjs"`
  — **3/3 passed**: runtime create, отказ без SELECT, captcha `t,t,f`; одноразовый audit harness
  после проверки удалён;
- `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run --project route src/app/api/leads/public/submit/route.route.test.ts && pnpm --dir apps/webapp exec vitest run --project unit src/modules/auth/authRateLimits.unit.test.ts"`
  — финальный baseline: route **12/12 passed**, unit **1/1 passed**;
- `pnpm --dir apps/webapp exec eslint src/app/api/leads/public/submit/route.route.test.ts src/modules/auth/authRateLimits.unit.test.ts`
  — exit 0.

Полный CI и автоматические UI-тесты не запускались.

## Чистота DEV после rollback-проб

Первый черновой probe ошибочно полагался на `psql -1` без явного `ROLLBACK` и зафиксировал свои fixture-строки;
они были немедленно удалены по точным audit-id командой
`/home/dev/brain/host-orch/run-tests.sh "node deploy/postgres/privileges/public-lead-round3-audit-cleanup.mjs"`:
`DELETE 1` lead, `DELETE 2` captcha challenge, `DELETE 7` capability и `DROP POLICY` для 2 probe-policy.
После очистки и повторной проверки с явным `ROLLBACK` выполнена read-only команда:

`/home/dev/brain/host-orch/run-tests.sh "node deploy/postgres/privileges/public-lead-round3-audit-verify.mjs"`

Она вернула:

```text
function|app.list_public_booking_form_fields()|app_seam_public_booking_owner|true
trace|0|0|0|0
rights|false|true|false|false
constraint|password_altcha_challenge_identifier_key_check|CHECK ((identifier_key ~ '^password-email:v1:[0-9a-f]{64}$'::text))
constraint|password_altcha_challenge_purpose_check|CHECK ((purpose = 'password_login'::text))
old-capability|1
```

То есть после аудита осталось **0** lead fixture, **0** captcha fixture, **0** capability fixture и
**0** probe-policy; исходные DEV-сигнатура, ограничения и права восстановлены. Одноразовые probe/cleanup/verify
файлы удалены и в дерево не входят.

## Findings и вопросы владельцу

MUST FIX: **нет**. OWNER QUESTION: **нет**.
