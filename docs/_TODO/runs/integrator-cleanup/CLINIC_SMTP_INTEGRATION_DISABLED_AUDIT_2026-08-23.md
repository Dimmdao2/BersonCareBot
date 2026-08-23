# FAIL — дверь объявлена, но не попала в точный каталог способностей: ветку нельзя приземлить как есть

**Аудит коммита** `0e2efbf2b` («fix(webapp): expose clinic integration switch safely»), ветка
`wt/smtp-clinic-20260823`.
**Оракул:** `docs/_TODO/OWNER_WALKTHROUGHS/2026-08-23_TEST_FULL_WALK.md`, шаг «Сохранить SMTP».
**Бриф автора:** `docs/_TODO/runs/briefs/CLINIC_SMTP_INTEGRATION_DISABLED_BRIEF_2026-08-23.md`.

**Вердикт: FAIL.** Причина не в логике правки — она разобрана верно и проверена мной независимо. Причина
в том, что два закоммиченных генерируемых артефакта не перегенерированы, и без них новая дверь физически
недоступна приложению: `app.require_accepted_context` откажет на каждом вызове. Правка при этом делает
ВЕСЬ блок «Каналы доставки клиники» зависимым от этой двери, поэтому отказ выглядит хуже сегодняшнего
симптома: вместо «форма есть, сохранение даёт 403» врач получит красную плашку и НИ ОДНОГО канала.

Границы соблюдены: `--execute`, TEST, PROD, deploy, push не выполнялись; чужой код не правился
(временные мутации для fault injection откачены, дерево чистое). Ничего не чинил.

---

## 🔴 Блокер: `port-context-capabilities.*.sql` не перегенерированы

Декларация (`deploy/postgres/privileges/declaration.ts`) объявляет новую способность
`clinic_platform_integration_availability_read`. Из декларации генерируются ЧЕТЫРЕ артефакта на базу, а
обновлены только два (`privileges.*.sql`). Точный каталог способностей остался старым:

```text
$ node --experimental-strip-types deploy/postgres/privileges/generate-cli.mjs --check
ok bcb_webapp_dev/privileges … совпадает побайтно          ← это и проверил автор
ok bcb_webapp_dev/allowlist  … совпадает побайтно
ok bersoncarebot_test/privileges … совпадает побайтно
ok bersoncarebot_test/allowlist  … совпадает побайтно
--check: артефакты соответствуют декларации побайтно.

$ node --experimental-strip-types deploy/postgres/privileges/generate-cli.mjs --check --all --port-context-only
КРАСНЫЙ bcb_webapp_dev/portContext: … port-context-capabilities.bcb_webapp_dev.sql разошёлся с декларацией
КРАСНЫЙ bersoncarebot_test/portContext: … port-context-capabilities.bersoncarebot_test.sql разошёлся с декларацией
--check: расхождений 2. Перегенерируйте артефакт и закоммитьте.
```

Расхождение — ровно одна недостающая строка в каждом файле, никакого прочего дрейфа:

```text
> ('7fd62406-…'::uuid, 'webapp', 'bcb_dev_webapp_staff',  'app_staff', 'staff',
   'config.clinic-platform-integration-availability.read', 'app.read_clinic_platform_integration_availability()')
> ('3e43edd1-…'::uuid, 'webapp', 'bcb_test_webapp_staff', 'app_staff', 'staff',
   'config.clinic-platform-integration-availability.read', 'app.read_clinic_platform_integration_availability()')
```

**Почему это блокер, а не косметика.**

1. **DEV не примет миграцию.** `deploy/postgres/privileges/reconcile-access.mjs:91` жёстко гейтит
   `generator('--db', dbName, '--check', '--port-context-only')` — ровно ту проверку, что сейчас красная.
   `migrate-dev.sh` зовёт этот реконсайлер (`deploy/host/migrate-dev.sh:272`). То есть живая проверка,
   которую автор оставил ведущему, упадёт на гейте, не дойдя до приложения.
2. **TEST установит каталог БЕЗ этой способности.** `deploy-test-saas.sh:107` берёт
   `port-context-capabilities.bersoncarebot_test.sql`, а сам seed — это ТОЧНАЯ ЗАМЕНА всего DB-каталога
   (`DELETE FROM app_ext.port_context_capabilities; INSERT …`, `generate.mjs:283-291`). Гейт числа строк
   в `install_port_context_capability_catalog` считает ожидание ИЗ САМОГО seed-файла, поэтому стухший
   seed проходит его зелёным и молча выкатывает каталог без новой строки.
3. **Последствие для человека.** Без строки в каталоге `app.require_accepted_context` в теле двери
   отказывает → `getClinicPlatformIntegrationAvailability` бросает → `PATCH` отдаёт 503, а страница
   `/app/settings` ловит ошибку и рендерит `platformAvailability = null`. По коду секции
   (`ClinicDeliveryChannelsSection.tsx`) это значит: красная плашка «Сервер не смог загрузить доступные
   каналы» и НИ ОДНОГО канала — ни SMTP, ни SMS, ни Telegram, ни MAX, ни VK. Сегодня врач хотя бы видит
   форму. Регресс по шагу оракула, а не исправление.

**Что сделать (одна команда, я её не выполнял — не чиню):**

```text
node --experimental-strip-types deploy/postgres/privileges/generate-cli.mjs --all --port-context-only
```
и закоммитить оба файла.

## 🟡 Второе, связанное: `WEBAPP_PORT_CONTEXT_CAPABILITIES_JSON` на TEST никто не перерисовывает

Приложение выбирает дескриптор способности ПО ИМЕНИ ФУНКЦИИ из env-переменной
(`portContextRuntime.ts:274-300`, `capabilityFor`): нет ровно одного совпадения — `throw Missing unique
declared webapp port capability for app.read_clinic_platform_integration_availability()`. То есть отказ
случится ещё до базы.

Кто эту переменную рисует:

- `deploy/host/update-dev-port-context-env.mjs` — DEV, вшит в `migrate-dev.sh` (`:26`, `:164`). DEV закрыт;
- `deploy/host/bootstrap-c4-test-env.mjs` — bootstrap-скрипт;
- `deploy-test-saas.sh` — **ни одного упоминания** (`grep -n "CAPABILITIES_JSON\|port-context-env"` пуст).

Я не могу читать `/opt/env/bersoncarebot/webapp.test` с этого бокса, поэтому утверждаю ровно факт по
репозиторию: **штатная выкатка TEST эту переменную не обновляет.** Ведущему — подтвердить, каким шагом
она попадёт на TEST, иначе дверь останется недоступной даже после перегенерации seed.

## ⚪ Живой проверки нет ни у автора, ни у меня

Бриф автора и мой запрещают `--execute` и TEST. Миграция не применена ни к одной базе, поэтому
утверждение «врач сохраняет SMTP и получает успех» **не доказано никем**. Оставленный автором opt-in
`clinicPlatformIntegrationAvailability.devDbProof.test.ts` — правильный инструмент, но он запускается
только ПОСЛЕ применения; сегодня он доказывает лишь причину, а не починку.

Часть неизвестности я снял без применения миграции — см. пункт 3 ниже: тело двери под FORCE RLS читает
строку, это проверено живьём.

---

## Пункты брифа

| # | Пункт | Природа | Вердикт |
|---|---|---|---|
| 1 | причина названа настоящая | взгляд | **PASS** |
| 2 | отказ доступа не притворяется «выключено» | тест + injection | **PASS** |
| 3 | врач не получил лишних прав | взгляд | **PASS** |
| 4 | три состояния различимы человеку | тест | **PASS с дырой в покрытии** |
| 5 | при выключенной интеграции формы нет | тест | **PASS** |
| — | приземляемость ветки | взгляд | **FAIL** (блокер выше) |

### 1. Причина названа настоящая — PASS

Разобрал цепочку сам, не по отчёту. Она такая, как заявлено, и «пустой catch» — только последнее звено:

- `getSettingWithRuntimeFirst` (`service.ts:368`) для `organizationId=null, audience=server` уходит в
  именованный root `app.read_webapp_server_runtime_setting(text,text)`. Снял его тело с живой DEV: внутри
  фиксированный allowlist из 11 ключей, `platform_integration_availability` в нём **нет** — root честно
  отдаёт ноль строк;
- дальше `service.ts:376-378` идёт в legacy `port.getByKey`, а это ДРУГАЯ таблица — `public.system_settings`
  (`pgSystemSettings.ts:478-494`). Её SELECT-политика для `app_staff`:
  `organization_id = current_org_id() OR (organization_id IS NULL AND scope = 'doctor')`. Нужная строка —
  `scope='admin'`, `organization_id IS NULL`, то есть **вне стены врача**. Ноль строк;
- `parsePlatformIntegrationAvailabilityEnvelope(undefined)` бросает `RuntimeSettingUnavailableError`
  (`platformIntegrationAvailability.ts:145-151`);
- пустой `catch` в маршруте превращал это в продуктовый `403 integration_disabled`.

Живое подтверждение стены (read-only, DEV):

```text
$ psql -d bcb_webapp_dev -c "BEGIN; SET LOCAL ROLE app_staff;
    SELECT count(*) FROM public.system_settings WHERE key='platform_integration_availability'; ROLLBACK;"
ERROR:  accepted port context required
```

Побочно объяснилось и то, почему владелец ВИДЕЛ форму, а падало только сохранение: страница читала
доступность не через `getSetting`, а через `listSettingsByScope('admin', …)` → `getSnapshotRows` по
`public.app_runtime_settings`, чья SELECT-политика для `app_staff` глобальные строки как раз ПОКАЗЫВАЕТ
(`organization_id IS NULL → true`). Два пути к одному факту расходились — это и есть корень.
Формулировка отчёта «RLS не показывал ему глобальную admin-строку» верна, но не называет таблицу;
таблица — `system_settings`, а не `app_runtime_settings`.

### 2. Отказ доступа больше не притворяется «выключено» — PASS

Маршрут различает три исхода (`route.ts:293-307`, `:589-613`): `unavailable` → лог `console.error` с
организацией и интеграцией + `503 integration_availability_unavailable`; `disabled` → `403` с человеческим
текстом; иначе — сохранение. Молчаливых `catch` на этом пути не осталось: второй, на странице
(`page.tsx:245-252`), тоже логирует.

Прогнал тесты сам (не по отчёту) и внёс СВОИ мутации:

| Мутация | Ожидание | Факт |
|---|---|---|
| вернуть пустой `catch { return 'disabled' }` | красный | 1 failed / 43 passed (403 вместо 503) |
| оставить 503, но убрать строку журнала | красный | 1 failed / 43 passed |
| убрать проверку рубильника в UI (`{true ? …}`) | красный | 1 failed / 3 passed |

Все мутации откачены, дерево чистое (`git status --porcelain` пуст).

Зелёные прогоны у меня: route 44/44, ui 4/4, unit 10/10, `pnpm --dir apps/webapp typecheck` — PASS.

### 3. Права врача не расширены — PASS

- Миграция `20260823T035715_…door.sql` не содержит ни одного `GRANT`/`REVOKE`/роли/политики/таблицы —
  только `CREATE FUNCTION`. Проверено чтением файла целиком.
- Дверь — no-arg: ключ, scope, audience и `organization_id IS NULL` зашиты в тело, вызывающий не управляет
  ничем. Отдаётся один `jsonb` реестра интеграций, ничего сверх.
- `EXECUTE` — только `app_staff` (в generated-артефакте перед этим `REVOKE ALL … FROM PUBLIC` и поимённо
  от 60+ ролей).
- Relation surface (5 колонок `public.app_runtime_settings`) — не новое право: `app_seam_settings_runtime_owner`
  уже имеет ровно `SELECT (audience, key, organization_id, scope, value_json)` (сверено по
  `information_schema.column_privileges` на DEV).
- Главное: `app_staff` и БЕЗ этой двери видит ту же самую строку прямым SELECT по `app_runtime_settings`
  (политика `rev10_app_runtime_settings_select_20`, ветка `organization_id IS NULL → true`) — именно так
  её читает страница сегодня. Дверь читает СТРОГО МЕНЬШЕ, чем уже разрешено. Расширения нет.

Дополнительно снял живьём главную неизвестность тела двери — читается ли строка владельцем-дефайнером под
FORCE RLS (таблица `relforcerowsecurity=t`):

```text
$ psql -d bcb_webapp_dev -c "BEGIN; SET LOCAL ROLE app_seam_settings_runtime_owner;
    SELECT 'seam-owner-sees-row=' || (value_json IS NOT NULL)::text FROM public.app_runtime_settings
    WHERE key='platform_integration_availability' AND scope='admin'
      AND organization_id IS NULL AND audience='server'; ROLLBACK;"
seam-owner-sees-row=true
```

Ограничительные политики `rev10_named_root_owner_gate_20` и разрешающая `rev10_seam_business_20` этого
владельца пропускают. Тело двери сработает; отказать может только каталог способностей — см. блокер.

### 4. Три состояния различимы — PASS с дырой в покрытии

Покрыто тестами: «выключено платформой» (403 + «SMTP отключён платформой.»), «не тот тариф»
(«Собственный SMTP недоступен на вашем тарифе.», кнопки нет), «сервер отказал» при сохранении
(503 + человеческий текст, машинный токен в DOM отсутствует). Машинный токен до человека не доходит:
`apiJson` (`shared/lib/apiJson.ts:18`) предпочитает `message` полю `error`. Тарифный отказ дублируется на
сервере (`route.ts:574-585`), так что скрытие формы — не единственная защита.

Дыра: третье состояние на ЗАГРУЗКЕ страницы (`platformAvailability === null` → «Сервер не смог загрузить
доступные каналы») не покрыто ничем. Проверил мутацией — удалил плашку целиком, все 4 UI-теста остались
зелёными. Именно эта ветка сейчас и сработает при стухшем каталоге, то есть незакрытым тестом оказался
ровно тот экран, который увидит владелец при блокере выше.

### 5. При выключенной интеграции форма не предлагается — PASS

`ClinicDeliveryChannelsSection.tsx`: каждый из пяти каналов рендерится только при
`isPlatformIntegrationAvailable(platformAvailability, <id>)`. Тест «does not offer the SMTP form when the
platform disabled email» проверяет и отсутствие заголовка, и отсутствие кнопки; моя мутация делает его
красным. На DEV в реестре сейчас `telegram:false, vk:false, smsc:false` — после приземления эти три блока
у врача пропадут, что и есть заявленное правило.

---

## НЕ СДЕЛАНО

- **Живая проверка на DEV не выполнена** — требует применения миграции (`--execute`), это вне моих границ.
  Не доказано: что врач сохраняет SMTP успешно и что при выключенном платформой рубильнике форма исчезает,
  а не падает. После перегенерации seed это доказывается прогоном
  `USE_REAL_DATABASE=1 RUN_CLINIC_INTEGRATION_AVAILABILITY_DB=1 pnpm --dir apps/webapp exec vitest run
  src/infra/repos/clinicPlatformIntegrationAvailability.devDbProof.test.ts` плюс кликом в кабинете врача.
- **Состояние `WEBAPP_PORT_CONTEXT_CAPABILITIES_JSON` на TEST не проверено** — файл живёт на другом боксе.
  Установлен только факт по репозиторию: штатная выкатка TEST его не перерисовывает.
- **Порядок «миграция → privileges» на выкатке не прослежен end-to-end.** Seed ссылается на
  `'app.read_clinic_platform_integration_availability()'::regprocedure`, то есть требует, чтобы функция уже
  существовала. Это та же механика, что у всех прежних именованных дверей, поэтому я счёл риск
  унаследованным и не разбирал; отдельного доказательства не привожу.
- **Full CI не гонялся** — прогнаны только затронутые тесты (route/ui/unit) и `typecheck`. `lint` не гонял.

---

## Круг 2 — каталоги исправлены, связность сужена; живая DEV-проверка заблокирована границей брифа

### Сгенерированные артефакты — PASS

Выполнены команды из брифа:

```text
$ node deploy/postgres/privileges/generate-cli.mjs --all
записаны privileges + org-allowlist для bcb_webapp_dev и bersoncarebot_test

$ node deploy/postgres/privileges/generate-cli.mjs --all --port-context-only
записаны port-context-capabilities.bcb_webapp_dev.sql (78153 байт)
и port-context-capabilities.bersoncarebot_test.sql (78430 байт)

$ node deploy/postgres/privileges/generate-cli.mjs --all --check
4/4 privileges/allowlist совпадают побайтно

$ node deploy/postgres/privileges/generate-cli.mjs --all --check --port-context-only
2/2 portContext совпадают побайтно
```

В обоих точных каталогах появилась единственная требуемая строка
`config.clinic-platform-integration-availability.read` →
`app.read_clinic_platform_integration_availability()`.

### Fault injection старого каталога — PASS

Из обоих `port-context-capabilities.*.sql` временно удалена только новая строка, после чего выполнено:

```text
$ node deploy/postgres/privileges/generate-cli.mjs --all --check --port-context-only
КРАСНЫЙ bcb_webapp_dev/portContext: строка 17 — отсутствует новая способность
КРАСНЫЙ bersoncarebot_test/portContext: строка 17 — отсутствует новая способность
--check: расхождений 2
exit 1
```

То есть инъекция покраснела именно на старом точном каталоге, а не «упала вообще». Затем оба файла повторно
перегенерированы; та же побайтовая проверка снова зелёная.

### Связность — исправлена

Отказ новой двери не обязан гасить весь блок каналов. Экран уже получает платформенный реестр через разрешённый
ему snapshot `listSettingsByScope('admin', { organizationId: null })`; новая дверь нужна только серверной
мутации, где старый `system_settings`-fallback не видел глобальную admin-строку.

Поэтому `page.tsx` снова строит видимость SMTP/SMS/Telegram/MAX/VK из уже загруженного snapshot, а
`getClinicPlatformIntegrationAvailability()` остаётся только в серверном write-gate. При отказе двери врач
видит каналы и их сохранённое состояние; падает конкретная попытка сохранить канал с человеческим `503`.
Платформенно выключенный канал по-прежнему не предлагается, а маршрут независимо от UI повторяет этот гейт.

### Проверки кода — PASS

```text
$ pnpm --dir apps/webapp exec vitest run \
    src/app/app/settings/ClinicDeliveryChannelsSection.ui.test.tsx \
    src/app/app/settings/page.unit.test.ts \
    src/app/api/tariffMechanics.route.test.ts \
    src/modules/system-settings/clinicDeliverySettings.unit.test.ts \
    src/modules/system-settings/configAdapter.unit.test.ts
Test Files 5 passed (5); Tests 61 passed (61)

$ pnpm --dir apps/webapp typecheck
PASS

$ pnpm --dir apps/webapp lint
exit 0; 2 прежних warning в doctor/calendar/AppointmentPaymentSection.tsx, ошибок 0
```

### Именованный blocker живого DEV-доказательства

Текущая именованная DEV ещё не содержит ни миграцию двери, ни строку точного каталога, ни runtime-дескриптор:

```text
$ sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev \
    -v ON_ERROR_STOP=1 -c "BEGIN READ ONLY; SELECT
      to_regprocedure('app.read_clinic_platform_integration_availability()') IS NOT NULL AS door_exists,
      (SELECT count(*) FROM app_ext.port_context_capabilities
       WHERE function_identity::text = 'app.read_clinic_platform_integration_availability()') AS catalog_rows;
      ROLLBACK;"
door_exists=f, catalog_rows=0

$ set -a && source /home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev && set +a && \
  node -e '<проверка наличия ключа без печати значения env>'
runtime_descriptor_present=false
```

Канонический путь, который атомарно применяет pending migration, reconcile каталога и runtime env, —
`bash deploy/host/migrate-dev.sh --execute`; флаг `--execute` этим брифом прямо запрещён. Обходить запрет
ручным `psql -f`, голым migrator или прямой правкой каталога нельзя. Поэтому живой вызов двери под врачом,
живое сохранение SMTP и DB-инъекция удаления строки каталога не запускались: до разрешённого применения baseline
они покраснеют раньше на `door_exists=false`, а не на проверяемом `accepted port context required`.

TEST, PROD, deploy, push и `--execute` не выполнялись.
