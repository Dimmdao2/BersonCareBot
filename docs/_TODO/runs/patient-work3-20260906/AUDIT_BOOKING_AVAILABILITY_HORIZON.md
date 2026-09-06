# Независимый аудит: горизонт доступной онлайн-записи (BAH-01..04)

- Дерево: `/home/dev/dev-projects/bcb-wt-patient-work3-horizon-20260906`, ветка `wt/patient-work3-horizon-20260906`
- Аудируемый SHA: `2301031d6` «feat(booking): add clinic availability horizon»
- Authority: `docs/_TODO/BOOKING_AVAILABILITY_HORIZON_2026-09-04.md` (BAH-01..04 + «Граница»). Ничего сверх неё.
- Роль: `auditor-live`. Слепой kill-set — [`BLIND_KILL_SET.md`](BLIND_KILL_SET.md), составлен ДО чтения тестов и реализации.
- Продуктовый код аудитор не правил; все временные поломки откачены (`git checkout --`).

## Вердикт по каждому ID

| ID | Вердикт | Доказательство |
| --- | --- | --- |
| BAH-01 | **PASS** (код) | 14-дневный hardcode убран: `service.ts:115-133` считает окно от настройки клиники; `MAX_RANGE_DAYS = 92` совпадает с `maxValue` реестра. Оба входа выдачи (`getInPersonSlots`, `getOnlineSlots`) идут через один `defaultDateRange`, других вызовов `port.getSlots` в сервисе нет. Прямой запрос по дате за окном возвращает `[]` и до порта не доходит. Тест `availabilityHorizon.unit.test.ts`, 5 проверок, зелёные; убиты инъекциями 1-3. |
| BAH-02 | **PASS** | Ключ `booking_availability_horizon_days` объявлен `per_org` (`registry.ts:392`); запись — канонический `deps.systemSettings.updateSetting` с `organizationId` из клинического гейта (`route.ts:930-939`), клинике не-per_org ключ закрыт (`route.ts:515`); границы 1..92 берутся из единственного `SERVER_RUNTIME_INTEGER_DEFINITIONS`, batch-путь физически ограничен `z.enum(MODES_FORM_KEYS)` и этот ключ туда не входит. UI — секция «Календарь записи» с человеческой подписью «На сколько дней вперёд показывать календарь записи» в разделе `schedule?tab=setup&section=rules`. Не свойство пациента и не глобальная константа. |
| BAH-03 | **FAIL** | `app.provision_specialist_owner()` пишет строку клиники со значением 30 (миграция, строки 249-264) — но под живыми стенами эта запись невозможна: роль-владелец шва `app_seam_specialist_provision_owner` не имеет INSERT на `public.system_settings` и не входит ни в одну из двух её политик. См. finding **F1**. |
| BAH-04 | **FAIL → закрыт этим аудитом частично** | На SHA `2301031d6` целевых проверок горизонта в репозитории не было ни одной (`grep -rl "availabilityHorizon\|booking_availability_horizon"` по всем `*.test.*` — пусто), чекбокс в плане не отмечен. Аудитор добавил поведенческие тесты выдачи (см. ниже). Половина «дефолт для новой клиники» остаётся недоказуемой, пока не закрыт **F1**. |

## Findings

### F1 — MUST FIX: права новой записи объявлены только в сгенерированном артефакте, не в декларации

**Что.** Коммит добавил в `deploy/postgres/generated/privileges.{bcb_webapp_dev,bersoncarebot_test}.sql`
руками: строку census `provision_specialist_owner → public.system_settings [INSERT]`, `GRANT INSERT (...)
ON public.system_settings TO app_seam_specialist_provision_owner`, грант на последовательности и членство этой
роли в политиках `rev10_named_root_owner_gate_192` / `rev10_seam_business_192`. При этом
`deploy/postgres/privileges/declaration.ts` — единственный файл, который правит человек и из которого генератор
строит артефакт и reconcile — **не изменён** (`git show --stat 2301031d6` его не содержит).

**Достижимый сценарий и impact — два независимых.**

1. *Выкатка не проходит вовсе.* `reconcile-access.mjs:93` первым делом вызывает `generate-cli.mjs --check`,
   а `command()` бросает на ненулевом коде. Гейт сейчас красный, значит `bash deploy/host/migrate-dev.sh
   --execute` и `deploy/host/deploy-test.sh` падают на reconcile. Тот же шаг есть в CI
   (`.github/workflows/ci.yml:103`, `pnpm check:db-privileges-generated`).
2. *Если артефакт перегенерировать (ровно то, что советует сообщение гейта) — ломается регистрация клиники.*
   Reconcile применяет то, что генератор строит из декларации, а не закоммиченный `.sql`. Без строки в
   декларации грант и обе политики не приезжают, и первый же `INSERT INTO public.system_settings` внутри
   `app.provision_specialist_owner()` отказывает. Отказ доедет до человека, подтвердившего почту, а не до CI.

**Evidence (живой DEV, `bcb_webapp_dev`):**

```
$ node deploy/postgres/privileges/generate-cli.mjs --check     → exit 1, расхождений 2
  строка 3443: закоммичено provision_specialist_owner→public.system_settings, сгенерировано →user_contacts

$ psql: SELECT has_table_privilege('app_seam_specialist_provision_owner','public.system_settings','INSERT'),
               has_column_privilege(...,'key','INSERT');
  → f | f
$ psql: BEGIN; SET LOCAL ROLE app_seam_specialist_provision_owner;
        INSERT INTO public.system_settings (...) VALUES ('booking_availability_horizon_days',...); ROLLBACK;
  → ERROR: permission denied for table system_settings
$ psql: SELECT polname, polroles::regrole[] FROM pg_policy WHERE polrelid='public.system_settings'::regclass;
  → app_seam_specialist_provision_owner ОТСУТСТВУЕТ в rev10_named_root_owner_gate_192 и rev10_seam_business_192
```

**Где чинить:** `deploy/postgres/privileges/declaration.ts` — relation surface, колоночный `INSERT` и членство
роли в обеих политиках `system_settings`; затем перегенерировать артефакты. Миграция прав не выдаёт и в этой
части менять её нельзя (AGENTS.md §1 «⛔ Миграция не выдаёт и не отзывает права»). Это ровно тот класс, ради
которого §1 требует письменный разбор прав миграции до landing: тело функции получило новую таблицу для записи,
а декларация об этом не узнала.

### F2 — MUST FIX: отсутствие строки горизонта гасит весь раздел «Правила», а не одно поле

**Что.** `BookingRulesLoader` (`ScheduleSetupTab.tsx:127-143`) при отсутствующем или выходящем за 1..92
значении `booking_availability_horizon_days` переводит ВЕСЬ раздел в `phase: 'error'` и рисует
«Не удалось загрузить настройки» вместо `BookingRulesPageClient`.

**Достижимый сценарий.** Вместе с горизонтом исчезают четыре независимые группы настроек: политика отмены,
политика переноса, «открепление прошлых сессий абонемента» и уведомления о событиях записи. Воспроизводится
сегодня: на `bcb_webapp_dev` строки нет (`SELECT count(*) … WHERE key='booking_availability_horizon_days'` → `0`,
миграция в ledger отсутствует), то есть на любом окружении, куда код приедет раньше миграции — а приехать она
сейчас не может из-за **F1**, — врач теряет доступ к настройкам отмены и переноса. До этого коммита раздел от
этого ключа не зависел, поэтому это регрессия, а не новое поведение.

**Замечание к разбору:** значение горизонта нужно только своей секции; остальные три группы не обязаны падать
вместе с ним.

### F3 — OWNER QUESTION (вне текста BAH, граница): новый ключ не попал в тарифную дверь записи

Три соседних ключа записи закрыты механикой `booking` в
`app-layer/entitlements/mechanicSettingsWriteClearance.ts:34-36` (`booking_min_notice_hours`,
`booking_max_consecutive_slot_hours`, `booking_prepayment_wait_minutes`). `booking_availability_horizon_days`
в карте отсутствует, поэтому клиника без механики `booking` может его записать, а его соседей — нет.
Impact ограничен: без механики `booking` значение ни на что не влияет. В BAH-01..04 требования об
энтайтлменте нет, поэтому это **вопрос владельцу**, а не работа (AGENTS.md §24.6).

## Миграция `20260906T030953_add_booking_availability_horizon.sql` — вердикт

**Формальный контракт — PASS.**

- Имя `YYYYMMDDTHHMMSS_slug.sql` соблюдено; файл ещё не в ledger (`__drizzle_migrations` → 0), переименований нет.
- `-- BCB-MIGRATION-VERIFY:` присутствует в ведущем блоке и проверяет все четыре следа (глобальная строка = 30
  и три тела функций).
- Маркеры statement-owner расставлены на каждом блоке: `app_object_owner` (+ `BCB-MIGRATION-BACKFILL` для
  data-only сида), `app_seam_patient_booking_owner`, `app_seam_specialist_provision_owner`,
  `app_seam_public_booking_owner`; каждый с `SCHEMA-CREATE: app`, `LANGUAGE-USAGE: plpgsql` и
  `REHOME-FUNCTION` под точную существующую сигнатуру.
- `GRANT`/`REVOKE`/`CREATE POLICY`/`CREATE ROLE`/`ALTER ROLE`/`ALTER DEFAULT PRIVILEGES` — **ноль вхождений**
  (`grep -icE`), правило §1 соблюдено.
- Новых таблиц и колонок нет → индекс на горячую колонку не требуется.

**Разбор прав (§1 «Перед приземлением миграции»).**

| Функция | Владелец тела | Что тело делает нового | Право есть в декларации? |
| --- | --- | --- | --- |
| `app.read_current_patient_booking_runtime_integer(text)` | `app_seam_patient_booking_owner` | новый допустимый ключ; та же `public.system_settings`, только SELECT | да, поверхность не изменилась |
| `app.read_public_booking_slot_snapshot(uuid,uuid,text,text)` | `app_seam_public_booking_owner` | новый SELECT той же `public.system_settings` | да, поверхность не изменилась |
| `app.provision_specialist_owner(uuid)` | `app_seam_specialist_provision_owner` | **новый INSERT в `public.system_settings`** | **НЕТ → F1** |

**Preflight — BLOCKED (не по вине этой ветки).** Санкционированный кандидатный путь запущен:

```
$ bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot
… ERROR: new row violates row-level security policy for table "system_settings"   → EXIT=3
```

Падение происходит на более ранней pending-миграции
`20260905T233000_an_appointment_owns_its_price_and_prepayment.sql` (коммит `2b865795d`, workstream
appointment-prepayment): её `-- BCB-MIGRATION-BACKFILL`-блок и NOTICE про
`be_appointments_prepayment_mode_check` стоят в логе непосредственно перед ошибкой. Сортировка по имени
ставит её раньше `20260906T030953`, поэтому аудируемая миграция в прогоне **не достигается**. Обходить это
переупорядочиванием, одноразовой базой или голым `psql` от `postgres` запрещено (AGENTS.md «Маршрут», §1),
поэтому preflight именно этой миграции остаётся не пройденным.

**DEV не изменён:** после прогонов `__drizzle_migrations` не содержит ни один из двух тегов,
`system_settings` не содержит строк `booking_availability_horizon_days` (обе проверки — `count = 0`).

## Тесты, добавленные аудитором (BAH-04)

| Файл | Что защищает | Почему этот слой |
| --- | --- | --- |
| `apps/webapp/src/modules/booking-scheduling/availabilityHorizon.unit.test.ts` (новый) | окно = горизонт клиники; свой горизонт у каждой клиники; прямой запрос даты вне окна не отдаёт слоты; последний день внутри окна доступен; онлайн-выдача ведёт себя так же | границы диапазона целиком видны на сервисе; БД, HTTP и UI ради них поднимать незачем (§10b «самый дешёвый публичный слой») |
| `apps/webapp/src/infra/repos/pgBookingScheduling.settings.unit.test.ts` (расширен, +1 сценарий в существующем `it`) | серверный путь читает СВОЙ ключ и для ЗАПРОШЕННОЙ клиники | метод склонирован с двух соседних; правдоподобная поломка — оставленный ключ соседа. Расширение существующего файла вместо нового (§11) |

Время зафиксировано `vi.setSystemTime` — тест не зависит от даты и зоны прогона (§10a, п. 6).
Тестов на текст исходника, SQL, число импортов, DOM-геометрию и классы не добавлено.

### Fault injection — по одному разу на независимый класс

| # | Что сломано в продуктовом коде | Какое утверждение покраснело |
| --- | --- | --- |
| 1 | `service.ts`: `addDays(today, horizonDays - 1)` → `addDays(today, 13)` (возврат 14-дневного hardcode) | 4 из 5: `expected { from, to } to deeply equal` на всех трёх диапазонных проверках + `getSlots` вызван 1 раз там, где не должен |
| 2 | `service.ts`: удалена строка `if (date < today || date > horizonEnd) return null;` (обход по дате открыт) | 2 из 5: `expected "vi.fn()" to not be called at all, but actually been called 3 times` (in-person) и `1 times` (online) |
| 3 | `service.ts`: `getAvailabilityHorizonDays(ctx.organizationId)` → фиксированный uuid организации A | 1 из 5: «каждая клиника получает свой горизонт, а не горизонт соседней» |
| 4 | `pgBookingScheduling.ts`: серверная ветка читает `booking_min_notice_hours` вместо `booking_availability_horizon_days` | `expected 3rd call to have been called with "booking_availability_horizon_days", got "booking_min_notice_hours"` |

Все четыре правки откачены `git checkout --`; `git status` чист, кроме намеренных тестов и этих артефактов.

### Покрытие слепого kill-set: поймано 6 из 11, по каждому непойманному — причина

| ID | Итог |
| --- | --- |
| K1, K3, K10 | поймано инъекцией 1 (горизонт в тесте = 7, поэтому и «14», и «30» как hardcode красят тест) |
| K2 | поймано инъекцией 2 |
| K4 | поймано инъекцией 3 |
| K8 (провижининг пишет один ключ, рантайм читает другой) | поймано инъекцией 4 на стороне чтения; со стороны записи ключ совпадает буквально и дополнительно проверяется probe `BCB-MIGRATION-VERIFY` |
| K5 (UI сохранил, планирование читает старое) | тестом не покрыт: закрыт конструкцией — один ключ реестра, одна точка записи `updateSetting`, чтение того же литерала (инъекция 4). Отдельный сквозной тест был бы дублем классов |
| K6 (за границы 1..92) | тестом не покрыт: закрыт конструкцией на четырёх уровнях — границы маршрута берутся из того же `SERVER_RUNTIME_INTEGER_DEFINITIONS`, batch-путь ограничен `z.enum(MODES_FORM_KEYS)` (ключа там нет), definer-функции проверяют 1..92, сервис проверяет 1..`MAX_RANGE_DAYS` |
| K7 (новая клиника молча получает не 30) | **не поймано и не может быть поймано сейчас — это и есть F1.** Класс расхождения декларации уже держит механический CI-гейт `pnpm check:db-privileges-generated` (`.github/workflows/ci.yml:103`), он КРАСНЫЙ; дублировать его тестом не нужно (§10b, п. 4) |
| K9 (кэш через организации/горизонты) | не нарушено. Ключ `in_person` содержит `branchId`+`serviceId` — uuid, уникальные внутри организации; путь `online` оба маршрута отклоняют 400 `ambiguous_booking_tenant`, то есть недостижим. Горизонта в ключе нет → после смены настройки возможна устаревшая выдача не дольше `slotsTtlMs` = 60 c, отказ самоизлечивается — не finding |
| K11 (глобальная строка / свойство пациента) | не нарушено, проверено взглядом: запись идёт с `organizationId` клинического гейта, ключ `per_org`, не-per_org ключи клинике закрыты 403 |

### Почему не расширен `specialist-owner-provisioning.devDbProof.test.mjs`

Это правильное место для доказательства «новая клиника получает 30», но на этой ветке файл **уже красный
до всякой правки**:

```
$ RUN_SPECIALIST_OWNER_PROVISIONING_DB=1 node --test deploy/postgres/privileges/specialist-owner-provisioning.devDbProof.test.mjs
  actual: '42501 accepted opaque identity context required'   (1 pass, 1 fail)
```

Причина не в аудируемом коммите: миграция на DEV не применена (ledger пуст), значит проба звала тело функции
ДО правки. Добавлять утверждение внутрь пробы, которая падает раньше по чужой причине, — завести тест,
красноту которого нельзя приписать нужному дефекту. Доказательство BAH-03 остаётся за F1 и живой пробой прав.

## Выполненные команды и результаты

| Команда | Результат |
| --- | --- |
| `node deploy/postgres/privileges/generate-cli.mjs --check` | **exit 1**, расхождений 2 (F1) |
| `bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot` | **exit 3**, падение на чужой более ранней pending-миграции; аудируемая не достигнута |
| `psql` пробы прав/политик на `bcb_webapp_dev` (в транзакции с ROLLBACK) | INSERT роли шва отказан, роль вне обеих политик |
| `pnpm --dir apps/webapp typecheck` | exit 0 |
| `pnpm exec eslint` по затронутым путям webapp | exit 0 |
| `pnpm exec vitest run --project unit --project route src/modules/booking-scheduling src/infra/repos/pgBookingScheduling.settings.unit.test.ts src/app/api/admin/settings src/modules/system-settings` | 13 файлов, **110 тестов зелёные** |
| `RUN_SPECIALIST_OWNER_PROVISIONING_DB=1 node --test …specialist-owner-provisioning.devDbProof.test.mjs` | 1 pass / 1 fail, падение предшествует коммиту |

Полный CI не запускался: изменения ограничены одним приложением и декларацией прав, а §9 прямо говорит, что
изменение DB-прав и forward-миграции основанием для full CI не являются.

## Что осталось владельцу

1. **F1** — правка `declaration.ts` + перегенерация артефактов. Без неё ветка не приземляется: reconcile падает,
   а при «починке» перегенерацией ломается регистрация клиники.
2. **F2** — раздел «Правила» не должен падать целиком из-за одной настройки.
3. **F3** — решение владельца: закрывать ли горизонт механикой `booking`, как трёх его соседей.
4. Preflight аудируемой миграции остаётся не пройденным, пока в ветке лежит падающая
   `20260905T233000_an_appointment_owns_its_price_and_prepayment.sql` соседнего workstream.
