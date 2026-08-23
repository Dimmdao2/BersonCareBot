# PASS — каталог собран генератором, дверь под врачом ПРОХОДИТ живьём, блок каналов от неё отвязан

**Повторный аудит коммита** `d18a6970f` («fix(webapp): complete clinic SMTP capability catalog»), ветка
`wt/smtp-clinic-20260823`.
**Оракул:** `docs/_TODO/OWNER_WALKTHROUGHS/2026-08-23_TEST_FULL_WALK.md`, шаг «Сохранить SMTP».
**Круг 1:** `CLINIC_SMTP_INTEGRATION_DISABLED_AUDIT_2026-08-23.md` (мой `FAIL`, блокер — непересобранный
`port-context-capabilities.*.sql`).

**Вердикт: PASS.** Блокер круга 1 закрыт по-настоящему: оба точных каталога совпадают с моей собственной
перегенерацией побайтно, то есть собраны генератором, а не дописаны рукой. Главное, чего не было ни у кого
до сих пор, — **живое доказательство**: на одноразовом клоне DEV новая дверь под принципалом врача
**проходит и возвращает реестр**, а удаление ровно этой строки каталога возвращает отказ. Дополнительно
устранена связность: страница настроек больше не зависит от двери вовсе.

Границы соблюдены: `--execute`, TEST, PROD, deploy, push не выполнялись. Именованная DEV не изменена
(проверено после работы: `door_exists=f`, 272 строки каталога — как до начала). Ничего не чинил;
временная мутация для fault injection откачена, дерево чистое.

---

## Пункты брифа

| # | Пункт | Природа | Вердикт |
|---|---|---|---|
| 1 | оба точных каталога пересобраны и полны | взгляд + свой прогон генератора | **PASS** |
| 2 | дверь под врачом ПРОХОДИТ, а не отказывает | тест живьём (клон DEV) | **PASS** |
| 3 | отказ двери не гасит весь блок каналов | тест | **PASS** |
| 4 | логика круга 1 не поехала | взгляд на diff | **PASS** с одной оговоркой |

---

### 1. Каталоги собраны генератором — PASS

Не поверил `--check` автора: сохранил закоммиченные артефакты в сторону, перегенерировал ВСЕ шесть файлов
сам и сравнил `cmp`.

```text
$ node deploy/postgres/privileges/generate-cli.mjs --all
$ node deploy/postgres/privileges/generate-cli.mjs --all --port-context-only
$ cmp <сохранённая копия> <перегенерированный>
IDENTICAL org-allowlist.bcb_webapp_dev.sql
IDENTICAL org-allowlist.bersoncarebot_test.sql
IDENTICAL port-context-capabilities.bcb_webapp_dev.sql
IDENTICAL port-context-capabilities.bersoncarebot_test.sql
IDENTICAL privileges.bcb_webapp_dev.sql
IDENTICAL privileges.bersoncarebot_test.sql
$ git status --porcelain   # пусто
```

Шесть из шести совпали побайтно с моей перегенерацией — значит файлы вышли из генератора, а не из
редактора. Собственные проверки тоже зелёные:

```text
$ node deploy/postgres/privileges/generate-cli.mjs --all --check                     → 4/4 побайтно, exit 0
$ node deploy/postgres/privileges/generate-cli.mjs --all --check --port-context-only → 2/2 побайтно, exit 0
```

Дельта в каталогах — ровно две строки (по одной на базу), никакого прочего дрейфа:

```text
+ ('7fd62406-2a2f-5080-8c64-f4e0cd0d37dc'::uuid, 'webapp', 'bcb_dev_webapp_staff',  'app_staff', 'staff',
   'config.clinic-platform-integration-availability.read', 'app.read_clinic_platform_integration_availability()')
+ ('3e43edd1-dd9a-503a-834f-daa1afdf35a5'::uuid, 'webapp', 'bcb_test_webapp_staff', 'app_staff', 'staff',
   'config.clinic-platform-integration-availability.read', 'app.read_clinic_platform_integration_availability()')
```

Проверил заодно ВТОРУЮ половину пары — runtime-дескриптор, который приложение ищет по имени функции.
Отрендерил его из декларации сам (без записи в env-файлы) и сверил `capabilityId` со строкой seed:

```text
dev  clinic_platform_integration_availability_read → capabilityId 7fd62406-…  (= строка seed dev)
test clinic_platform_integration_availability_read → capabilityId 3e43edd1-…  (= строка seed test)
```

Идентификаторы совпадают, потому что оба выводятся из одной декларации детерминированно
(`deterministicCapabilityId(dbName, loginName, name)`). Рассинхрона «в базе одна способность, в env другая»
конструктивно быть не может.

### 2. Дверь под врачом проходит — PASS, доказано живьём

Круг 1 и круг 2 оба остановились здесь: именованная DEV не содержит миграцию, а применить её нельзя без
`--execute`, который запрещён обоим брифам. Я снял эту неизвестность, не трогая ни DEV, ни TEST: сделал
**одноразовый клон** `CREATE DATABASE bcb_smtp_reaudit TEMPLATE bcb_webapp_dev` (DEV в этот момент имела
0 соединений; клон — 207 МБ, диска 63 ГБ свободно) и работал в нём.

В клоне выполнены ровно три вещи, все DB-локальные (роли кластера НЕ трогались, `GRANT`/`REVOKE` на
роли и членства не выдавались — иначе пострадала бы соседняя DEV):

1. применена миграция двери `20260823T035715_…door.sql` от объявленного владельца
   `app_seam_settings_runtime_owner` (`BCB-MIGRATION-VERIFY` зелёный);
2. установлен ПЕРЕСОБРАННЫЙ seed `port-context-capabilities.bcb_webapp_dev.sql` (272 → 277 строк);
3. выдан `EXECUTE` на дверь роли `app_staff` — ровно тот грант, что и так объявлен в
   `privileges.bcb_webapp_dev.sql:6325` (артефакт целиком не применял намеренно: он реконсайлит кластер).

Дальше воспроизведён путь приложения дословно — `app.begin_port_context` теми же полями заявки, что шлёт
`withPortContextTransaction`, под тем же session-login и с НАСТОЯЩЕЙ парой «непрозрачная ссылка актора +
организация, где у него активное членство» (взята с DEV, read-only).

**Отказ на стухшем каталоге (состояние круга 1, до применения seed):**

```text
$ SET SESSION AUTHORIZATION bcb_dev_webapp_staff; BEGIN;
  SELECT app.begin_port_context('7fd62406-…', ROW(1,'staff','app_staff',
    'config.clinic-platform-integration-availability.read',
    'app.read_clinic_platform_integration_availability()', <hash>, <actor_ref>, NULL, <org>, NULL, NULL));
ERROR:  port context capability mismatch          (SQLSTATE 42501, app.install_port_context)
```

Это и есть блокер круга 1, снятый вживую: без строки каталога дверь недоступна физически.

**Проход на пересобранном каталоге (то, что заявил круг 2):**

```text
 effective_role | door_result
----------------+-------------------------------------------------------------------------------------
 app_staff      | {"value": {"version": 1, "integrations": {"vk": false, "max": true, "smsc": false,
                |  "email": true, "telegram": false, "web_push": true, "google_calendar": true,
                |  "yandex_calendar": false}}}
```

Врач (`app_staff`, реальный актор с активным членством) получает реестр, `email: true`. Форма конверта —
`{"value": {...}}` — ровно та, которую ждёт `parsePlatformIntegrationAvailabilityEnvelope`.

**Инъекция ровно в проверяемую строку** (не «сломать вообще»): удалил из каталога ОДНУ строку
`7fd62406-…`, остальные 276 оставил —

```text
DELETE 1
ERROR:  port context capability mismatch          (SQLSTATE 42501)
```

Отказ вернулся именно на этой строке. Клон после проверок удалён (`DROP DATABASE`), DEV сверена — не изменена.

**Что этим НЕ доказано:** это доказательство SQL-слоя (дверь + гейт каталога + стена FORCE RLS), а не
HTTP-клика. Что `PATCH /api/admin/settings` под сессией врача отдаёт успех, по-прежнему не проверял никто —
для этого нужна применённая миграция на именованной DEV или TEST.

### 3. Отказ двери больше не гасит блок каналов — PASS

Круг 2 убрал дверь со страницы совсем: `page.tsx` снова берёт реестр из уже загруженного снапшота
`listSettingsByScope('admin', { organizationId: null })`, который врачу и так разрешён, а
`getClinicPlatformIntegrationAvailability()` остался ТОЛЬКО в серверном write-gate
(`api/admin/settings/route.ts:299`). Проверил `grep`-ом: других вызовов двери в рендере нет.

Следствие ровно такое, как заявлено: отказ двери теперь не может погасить экран, потому что экран её не
зовёт; падает только конкретная попытка сохранить канал — человеческим `503`. Это снимает мою претензию
круга 1 («вместо формы врач увидит красную плашку и ни одного канала»).

Тесты, покрывающие сам гейт видимости и три состояния, зелёные и мои мутации круга 1 по-прежнему ловят:
5 файлов, 61/61.

### 4. Логика круга 1 не поехала — PASS, с одной оговоркой

Круг 2 тронул шесть файлов; `api/admin/settings/route.ts` — тот самый, где живут различение
`403 integration_disabled` / `503 integration_availability_unavailable`, журнал отказа и серверное
дублирование тарифного гейта, — **не тронут вовсе**. Всё, что я принял в круге 1 по пунктам 1-3 и 5,
на месте. Гейт Google Calendar переписан один-в-один по смыслу.

**Оговорка (не блокер).** Круг 1 добавлял на страницу третье состояние ЗАГРУЗКИ — плашку «Сервер не смог
загрузить доступные каналы»; круг 2 её удалил вместе с `platformAvailability: … | null`. Теперь, если
строки `platform_integration_availability` в снапшоте не окажется или конверт окажется битым,
`parsePlatformIntegrationAvailabilityEnvelope` бросит и упадёт ВСЯ страница `/app/settings`, а не одна
секция. Это НЕ регресс относительно того, что крутится сегодня: до круга 1 код был ровно таким же
(сверил `git show 0e2efbf2b^:…/page.tsx` — строки идентичны). Но улучшение круга 1 при этом потеряно.
Отмечаю как факт для владельца/ведущего, работой не считаю: требования «страница переживает битый
снапшот» в плане нет, а сам круг 1 эту ветку тестом так и не покрыл.

---

## Поправка к моему же отчёту круга 1

🟡-пункт круга 1 («`deploy-test-saas.sh` не перерисовывает `WEBAPP_PORT_CONTEXT_CAPABILITIES_JSON` —
ни одного упоминания») **неверен по выводу**. Я грепал `CAPABILITIES_JSON|port-context-env` и пропустил
вызов через скрипт-обёртку:

```text
deploy/host/deploy-test-saas.sh:423   bootstrap-c4-test-env.mjs --port-context-check   (preflight)
deploy/host/bootstrap-c4-test-env.mjs:54  renderPortContextRuntimeEnv(declaration, 'test', …, 'webapp')
```

То есть выкатка TEST рендерит ожидаемое значение из декларации и СВЕРЯЕТ его с env-файлом на префлайте,
падая при расхождении (`fail()`). Значит тихой выкатки TEST без новой способности не будет — она
остановится. Значение при этом preflight-ом не пишется: записать его должен человек командой
`--port-context-execute`. Это порядок выкатки, а не дефект ветки.

## Проверки, которые прогнал сам (не по отчёту автора)

```text
$ pnpm --dir apps/webapp exec vitest run <5 затронутых файлов>   → 5 files, 61/61 passed
$ pnpm --dir apps/webapp typecheck                               → exit 0
$ pnpm --dir apps/webapp lint                                    → exit 0
```

## Дыра в покрытии (нашёл мутацией, чинить не стал)

Связка «страница → снапшот» не покрыта ничем. Заменил в `page.tsx` чтение снапшота на литерал
(`{ value: { version: 1, integrations: { email: true, google_calendar: true } } }`) — то есть выкинул
источник данных целиком — и прогнал те же пять файлов: **61/61 зелёные**. Мутация откачена, дерево чистое.

Причина структурная: круг 1 подавал доступность через мок порта `getClinicPlatformIntegrationAvailability`
в `page.unit.test.ts`, и этот мок круг 2 удалил вместе с вызовом. Шва, за который мог бы взяться тест,
на странице больше нет. До круга 1 было так же, так что это не регресс — но и не закрыто.

## НЕ СДЕЛАНО

- **Живой HTTP-клик врача не проверен.** Доказан SQL-слой на клоне; что `PATCH /api/admin/settings` под
  сессией врача отдаёт успех и что шаг оракула «Сохранить SMTP» проходит — нужна применённая миграция на
  именованной DEV (`bash deploy/host/migrate-dev.sh --execute`) или выкатка TEST. Оба запрещены брифом.
- **Порядок «миграция → seed каталога → env-дескриптор» на реальной выкатке не прослежен end-to-end** —
  проверены только звенья по отдельности (seed ссылается на `::regprocedure`, т.е. требует уже созданной
  функции; TEST-префлайт fails-closed на env). Живого прогона выкатки не было.
- **Full CI не гонялся** — только `typecheck`, `lint` и пять затронутых тестовых файлов.
- **Второй базы (`bersoncarebot_test`) живьём не касался** — её каталог проверен только побайтовой
  перегенерацией; клон делался с DEV.
