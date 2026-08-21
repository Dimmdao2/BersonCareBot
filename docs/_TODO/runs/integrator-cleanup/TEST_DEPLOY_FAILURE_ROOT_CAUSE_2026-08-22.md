# TEST deploy failure 21.08 09:04–18:17 — root cause, current-branch verdict, alert gap

**Роль:** worker. **Authority:** распоряжение владельца 22.08 «разберись, почему не работает тест» +
`docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` D15b/6.
**Запрещённые действия НЕ выполнялись:** `deploy-test.sh` не запускался, миграции не применялись,
юниты `bersoncarebot-*-test.service` не трогались, PROD не трогался.

## 1. Точная причина падения 09:13

**Одна причина, не две.** `ERROR: column "email" of relation "platform_users" does not exist` —
это САМА ошибка; `FATAL: сверка прав reconcile-access: отказал (код 1)` (deploy-test.sh, шаг
«сверка прав reconcile-access», `deploy/host/deploy-test.sh:320`) — её прямое следствие: psql внутри
`reconcile-access.mjs` вышел с кодом 3 (`Error: psql failed (3)`, `reconcile-access.mjs:65`), это
пробросило ненулевой статус наружу, и `db_run` в `deploy-test.sh` превратил его в FATAL.

**Откуда взялась ссылка на `platform_users.email`.** Она пришла из декларации прав
(`deploy/postgres/privileges/declaration.ts` + `deploy/postgres/privileges/function-census.ts`),
не из миграции и не из генератора-как-такового. Хронология по git log (все коммиты — уже в текущей
ветке, см. §2):

- `38b917aba` (21.08 06:22) — `feat(identity): cut over canonical contacts (#987)`: миграция
  `20260821T040000_cut_over_canonical_contacts.sql` дропнула пять контактных колонок из
  `public.platform_users` (`phone_normalized`, `email`, `email_normalized`, `email_verified_at`,
  `patient_phone_trust_at`) и переписала тела всех задетых функций на чтение/запись через
  `public.user_contacts`.
- Три ручных источника метаданных прав это не отследили: `function-census.ts`
  (`BUSINESS_SEAM_FUNCTIONS`, 27 relationSurfaces), `declaration.ts` (11 самостоятельных блоков
  relationSurfaces + прямой грант таблицы для `app_patient`/`app_platform_settings`) и
  `relation-access.ts` (грант для `app_staff`/`app_tenant_service`) — все продолжали объявлять
  дропнутые колонки как колонки `platform_users`.
- `generate-cli.mjs` честно превратил устаревшую декларацию в
  `GRANT SELECT (..., "email", ...) ON TABLE platform_users` — именно этот `GRANT` и исполнял
  `reconcile-access.mjs` через `generator('--db', dbName, '--target-access-only')`
  (`reconcile-access.mjs:97`), когда Postgres ответил ошибкой: колонки `email` у `platform_users`
  уже физически нет.
- `995144016` (21.08 13:16, **уже на этой ветке**) — `fix(track-d/d15b6): repair reconcile-access
  privilege metadata after canonical contacts cutover` — сузил все 27+11+2 списков колонок под
  реальную схему, перегенерировал канонические артефакты через `generate-cli.mjs --all`, обновил
  два теста `relation-access.test.mjs`, которые раньше хардкодили дореформенный список колонок.
  Автор сам зафиксировал ровно эту же ошибку в описании коммита.
- Следующий прогон, `deploy-test.20260821T192843Z.CZkYt7.log` (19:28) — уже с этим фиксом в
  дереве — прошёл: `deploy-test: PASS branch=feat/doctor-ui-rebuild head=92cf34ffa4bf`.

Доказательство командой (текущее состояние живой TEST-базы совпадает с текущей декларацией, а НЕ
с тем, что декларация требовала в 09:13):

```
$ sudo -u postgres psql -X -1 -d bersoncarebot_test -c \
  "select column_name from information_schema.columns where table_schema='public' and table_name='platform_users' order by 1;"
 birth_date | blocked_at | blocked_by | blocked_reason | calendar_timezone | created_at |
 display_name | first_name | gender | height_cm | id | integrator_user_id | is_archived |
 is_blocked | last_name | merged_at | merged_into_id | patronymic | reminder_muted_until |
 role | session_epoch | updated_at | weight_kg
(23 rows)
```

Ни `email`, ни `phone_normalized`, ни `email_normalized`, ни `email_verified_at`, ни
`patient_phone_trust_at` в таблице нет — ровно то, что фиксирует текущий `declaration.ts`.

## 2. Пройдёт ли деплой текущей `feat` на TEST сейчас — **ДА**, конкретно эта причина падения устранена

⛔ Живой деплой НЕ запускался (запрещено брифом). Ответ получен ТОЛЬКО безопасными
read-only/dry-режимами того же генератора, который использует `reconcile-access.mjs`:

1. **`995144016` уже в истории текущей ветки:**
   ```
   $ git merge-base --is-ancestor 995144016 HEAD && echo YES
   YES
   ```
2. **Текущая ветка (`wt/test-deploy-recovery-20260822`) и `feat/doctor-ui-rebuild` расходятся ровно
   на один doc-only коммит** (проверено `git diff --stat` в обе стороны) — ни declaration.ts, ни
   generated/*, ни миграции не задеты этим расхождением, так что вывод ниже верен и для
   `feat/doctor-ui-rebuild`.
3. **Байт-в-байт гейт `generate-cli.mjs --check`** (первые два шага, которые `reconcile-access.mjs`
   выполняет ДО живого SQL — `reconcile-access.mjs:83,88`) — чистый, файлов не читает из БД:
   ```
   $ node --experimental-strip-types deploy/postgres/privileges/generate-cli.mjs --db bersoncarebot_test --check
   ok bersoncarebot_test/privileges: ...совпадает побайтно
   ok bersoncarebot_test/allowlist: ...совпадает побайтно
   --check: артефакты соответствуют декларации побайтно.

   $ node --experimental-strip-types deploy/postgres/privileges/generate-cli.mjs --db bersoncarebot_test --check --port-context-only
   ok bersoncarebot_test/portContext: ...совпадает побайтно
   --check: артефакты соответствуют декларации побайтно.
   ```
4. **Свежая генерация того самого SQL-блока, что уронил прогон** (`--target-access-only`, чистая
   функция без подключения к БД — вход только файлы репозитория):
   ```
   $ node --experimental-strip-types deploy/postgres/privileges/generate-cli.mjs --db bersoncarebot_test --target-access-only \
     | grep -i 'platform_users' | grep -i '"email"'
   (пусто, 0 совпадений)
   ```
   Полный ручной обход декларации на все пять дропнутых имён колонок рядом с `platform_users`
   (см. §1) — тоже чисто; единственные оставшиеся буквальные `'email'` в файле принадлежат
   `email_challenges` (у неё своя колонка `email`, это не баг), а `phone_normalized` рядом со
   словом platform_users встречается только как текст в поле `source:` историчексого решения
   (`declaration.ts:843`), не в списке колонок функции.
5. **Единственная новая drizzle-миграция** после последнего успешного прогона (`92cf34ffa4bf` →
   HEAD): `20260821T100000_platform_integration_availability_gains_vk.sql` (коммит `5d5fef1ca`) —
   backfill-UPDATE по `system_settings`, timestamp-forward, `BCB-MIGRATION-BACKFILL` +
   `BCB-MIGRATION-VERIFY` на месте, платформенных колонок не трогает, к `platform_users` отношения
   не имеет.

**Вывод п.2:** причина падения 09:13 в текущей ветке отсутствует — фикс `995144016` уже внесён (не
мной, до начала этого хода) и подтверждён свежей регенерацией. Это НЕ гарантия, что деплой пройдёт
целиком (живых миграций/systemd/сети я не проверял — запрещено), но конкретно эта причина закрыта.

## 3. Правка в репозитории — НЕ ТРЕБУЕТСЯ

Причина уже устранена коммитом `995144016` (см. §1–2), который является предком текущего HEAD.
Дополнительных изменений в код/декларацию/миграции в этом ходе не вносилось — вносить нечего.

## 4. Алертинг оператору при падении деплоя — механизм найден, точка встраивания названа, НЕ встроено

**Механизм в репозитории уже есть**, как и было сказано в брифе:
- `apps/webapp/src/modules/operator-alerts/dispatchOperatorAlert.ts` — сборка алерта (аудитория,
  дедуп, каналы).
- `apps/integrator/src/infra/operatorIncident/reportOperatorFailure.ts` /
  `recordOperatorFailureIncident` — открытие/копилка инцидента на стороне integrator.
- `apps/webapp/src/modules/operator-alerts/relayOperatorAlert.ts` — фактическая отправка: HTTP POST
  webapp → integrator `/api/bersoncare/operator-alert-relay` (HMAC-подписанный), дальше рассылка по
  telegram/max/sms/email/web_push.

**Готовая точка обнаружения именно этого отказа уже существует и ничего не делает:**
`deploy/host/deploy-test.sh:135-144`, функция `cleanup()`, поставлена как `trap cleanup EXIT`
(строка 145). Она уже вычисляет ровно нужное условие — `status -ne 0 && WRITERS_STOPPED==1 &&
SERVICES_RELEASED!=1` (сервисы остановлены, деплой упал, восстановление не запускалось) — и сейчас
только печатает строку в тот же транскрипт-лог, который никто не читает до вопроса владельца:
```
141:    printf 'TEST writers remain stopped after failed migration/deploy; inspect the transcript before recovery.\n' >&2
```
Это и есть минимальная точка: один вызов алерта внутри этой ветки `if`, рядом со строкой 141.

**Обязательный нюанс, который нужно решить владельцу до встраивания (не решаю сам, это
развилка):** `dispatchOperatorAlert`/`relayOperatorAlert` физически требуют ЖИВЫХ webapp И
integrator процессов — оба входят в `UNITS=(api scheduler webapp media-worker)`
(`deploy-test.sh:19`), которые `cleanup()` находит уже остановленными (`WRITERS_STOPPED=1` ставится
после `systemctl stop` на строке 259-260, ДО миграций/reconcile, и снимается в `SERVICES_RELEASED`
только после успешного `systemctl restart` на строке 348). Т.е. ровно в момент, когда нужно послать
алерт «TEST лежит», штатный HTTP-путь alert'а (webapp → integrator) сам недоступен — это тот же
класс отказа, который алерт должен сообщить. Варианты на выбор владельца:
- (a) звать существующий host-канал `notify-owner.sh` (глобальный CLAUDE.md) из `cleanup()` — не
  зависит от состояния приложения, но это другой канал/аудитория (лично владелец, не операторская
  рассылка);
- (b) научить `cleanup()` слать тот же Telegram/etc через прямое обращение к конфигу
  (`system_settings`/`operator_health_alert_config`) в обход HTTP-эстафеты webapp→integrator, раз
  Postgres на этот момент ещё жив — то есть частично продублировать `relayOperatorAlert`, а не
  вызвать его;
- (c) оставить операторский `operator_alert` для отказов ВО ВРЕМЯ штатной работы (когда сервисы
  живы), а для «деплой уронил и не поднял» держать отдельно host-канал (a) — раз аудитория и
  доступность механизма принципиально разные.
Встраивание НЕ делалось — по брифу решение о месте утверждает ведущий/владелец.

## НЕ СДЕЛАНО

- Живой деплой (`deploy-test.sh`) не запускался — п.2 отвечен только read-only/dry-путями, как
  требовал бриф; полной гарантии прохождения деплоя целиком (systemd/сеть/таймауты) это не даёт.
- Встраивание вызова operator_alert в `cleanup()` НЕ сделано — только найдена точка и назван
  нерешённый архитектурный нюанс (§4); ждёт решения владельца по одному из вариантов (a)/(b)/(c).
- Правка кода/декларации НЕ делалась — причина уже устранена коммитом `995144016` до начала этого
  хода, вносить было нечего.
