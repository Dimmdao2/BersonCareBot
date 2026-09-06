# Второй независимый аудит: горизонт записи (BAH-01..04)

- Дерево: `/home/dev/dev-projects/bcb-wt-patient-work3-horizon-20260906`, ветка `wt/patient-work3-horizon-20260906`
- Аудируемый SHA: `2301031d6` «feat(booking): add clinic availability horizon»
- Authority: `docs/_TODO/BOOKING_AVAILABILITY_HORIZON_2026-09-04.md` (BAH-01..04 + «Граница»). Ничего сверх неё.
- Слепой kill-set: [`BLIND_KILL_SET.md`](BLIND_KILL_SET.md) — составлен ЭТИМ аудитором до чтения тестов
  (файл попал в чужой коммит `b56a2b426`, см. «Замечание по процессу»).
- Продуктовый код не правился; все временные поломки откачены, дерево чистое.

**Отношение к `AUDIT_BOOKING_AVAILABILITY_HORIZON.md`:** на этой же ветке параллельно работал второй
auditor-live с тем же run-id; его отчёт уже лежит рядом. Дублировать его findings здесь незачем — ниже
только то, чего в нём нет: **новый блокирующий finding A1**, **исправление его F2** и независимая
перепроверка его F1 живой пробой.

---

## Вердикт по каждому ID

| ID | Вердикт | Доказательство |
| --- | --- | --- |
| `BAH-01` | **FAIL** | Код диапазона верен (14-дневный hardcode убран, оба входа идут через один `defaultDateRange`, `service.ts:121-136`), но значение горизонта **невозможно завести в базе**: первый statement миграции отказан RLS — finding **A1**. Пока миграции нет, код ветки ломает запись целиком: старая `app.read_public_booking_slot_snapshot` не отдаёт `availabilityHorizonDays`, а `publicBookingSlotSnapshotSchema` (`pgBookingScheduling.ts:130`) её требует → публичная запись падает; пациентская дверь на новый ключ отвечает `unsupported patient booking runtime integer`. То есть выкатка кода без миграции — не «горизонт 14 дней», а неработающая запись. |
| `BAH-02` | **FAIL для существующих клиник**, PASS для вновь созданной | Конструкция верна: ключ `per_org` (`registry.ts:392`), запись через канонический `deps.systemSettings.updateSetting` с `organizationId` клинического гейта (`route.ts:930-939`), границы 1..92 из единственного `SERVER_RUNTIME_INTEGER_DEFINITIONS`, человеческая подпись, место — «Расписание → Настройка → Правила». Но у клиники, существовавшей до миграции, своей строки нет, а глобальную она **не видит по RLS** — finding **A2**. Настройка «доступна в настройках записи специалиста» только для клиник, созданных после миграции. |
| `BAH-03` | **FAIL** | Подтверждено дважды и независимо: (1) декларация не знает о новой поверхности — `check:db-privileges-generated` красный (finding F1 соседнего отчёта); (2) живая проба: роль-владелец шва получает `permission denied for table system_settings` и на глобальной, и на клинической строке. `app.provision_specialist_owner()` физически не может записать умолчание 30. |
| `BAH-04` | **FAIL → закрыт частично** | На `2301031d6` целевых проверок не было. Тесты, добавленные первым аудитором в `b56a2b426`, **перепроверены мной независимо**: все 4 независимых класса поломок покраснели (таблица ниже). Половина «дефолт новой клиники» остаётся недоказанной, пока живы A1 и F1. |

---

## Findings

### A1 — MUST FIX, НОВЫЙ: первый statement миграции отказан RLS, миграция не применяется вообще

**Что.** Statement 1 миграции `20260906T030953_add_booking_availability_horizon.sql` — вставка глобальной
строки `booking_availability_horizon_days = 30` в `public.system_settings` — отказывается политикой RLS.

**Почему.** Разбор канонического парсера (`deploy/postgres/privileges/migrate-local-parse.mjs:4`) анкорит
маркер `BCB-MIGRATION-BACKFILL` **на начало statement**. В файле строка 1 — `BCB-MIGRATION-OWNER:
app_object_owner`, строка 2 — probe `BCB-MIGRATION-VERIFY`, и только строка 8 — `BCB-MIGRATION-BACKFILL`.
Поэтому маркер backfill **инертен**, а statement исполняется под `SET LOCAL ROLE app_object_owner`:

```
$ node -e "parseOwnerStatements(<миграция>)"
stmt 1 | owner = app_object_owner | backfill = false | INSERT INTO public.system_settings (
stmt 2 | owner = app_seam_patient_booking_owner       | CREATE OR REPLACE FUNCTION app.read_current_patient_booking_…
stmt 3 | owner = app_seam_specialist_provision_owner  | CREATE OR REPLACE FUNCTION app.provision_specialist_owner(…
stmt 4 | owner = app_seam_public_booking_owner        | CREATE OR REPLACE FUNCTION app.read_public_booking_slot_snap…
```

Политика `rev10_system_settings_insert_192` на живой `bcb_webapp_dev` разрешает INSERT только
`app_staff` (своя организация) и `app_platform_settings` (`organization_id IS NULL`), для всех прочих —
ветка `ELSE false`. У таблицы `relforcerowsecurity = t`, у `app_object_owner` `rolbypassrls = f`, то есть
владелец объекта политикам подчиняется.

**Живая проба точным statement миграции (в транзакции, ROLLBACK, ничего не сохранено):**

```
BEGIN; SET LOCAL ROLE app_object_owner;
INSERT INTO public.system_settings (key, scope, organization_id, value_json, updated_at, updated_by)
VALUES ('booking_availability_horizon_days','admin',NULL, jsonb_build_object('value',30), now(), NULL)
ON CONFLICT (key, scope) WHERE organization_id IS NULL DO NOTHING;
ERROR:  new row violates row-level security policy for table "system_settings"
```

**Перенос маркера на строку 1 проблему НЕ решает.** В том же прогоне preflight соседняя миграция
`20260905T233000_an_appointment_owns_its_price_and_prepayment.sql` со **штатно** разобранным backfill
(`stmt 9 | owner = null | backfill = true | INSERT INTO public.system_settings (`) на структурно
идентичной вставке глобальной строки упала тем же
`ERROR: new row violates row-level security policy for table "system_settings"`. То есть путь «записать
глобальную строку настройки из миграции» на этой базе не работает ни под owner-, ни под backfill-ролью.
Единственная роль, чья ветка политики допускает `organization_id IS NULL`, — `app_platform_settings`.

**Impact.** Миграция не приземляется; вместе с ней не приезжают три переписанные definer-функции. А код
ветки уже требует новое поле снимка, поэтому выкатка кода без миграции ломает и публичную, и пациентскую
запись (см. строку `BAH-01`). Ветка не landable в текущем виде.

**Выбор решения — не за аудитором:** развилка «писать глобальную строку под `app_platform_settings` /
не писать её вовсе и опереться только на строку клиники / расширить политику через декларацию» меняет
модель прав и требует решения владельца или ведущего.

### A2 — ИСПРАВЛЕНИЕ F2 соседнего отчёта: это не проблема порядка выкатки, а постоянная для существующих клиник

Соседний отчёт объясняет F2 тем, что «строки нет на `bcb_webapp_dev`, миграция в ledger отсутствует», и
относит остальное к окружениям, «куда код приедет раньше миграции». Из этого читается, что после
приземления миграции F2 закроется. **Это не так.**

Миграция бэкфиллит **только глобальную строку** (`organization_id NULL`, `scope 'admin'`); построчного
бэкфилла по существующим организациям в файле нет. Клинический кабинет читает `system_settings` под ролью
`app_staff` (`packages/db-principal/src/index.ts:1112-1114`: `case 'organization'`/`case 'staff'` →
`app_staff`), а живая политика чтения — из `pg_policy` на `bcb_webapp_dev`:

```
rev10_system_settings_select_192 (permissive, SELECT):
  WHEN current_user = 'app_staff' THEN
    organization_id = app.current_org_id() OR (organization_id IS NULL AND scope = 'doctor')
  WHEN current_user = 'app_platform_settings' THEN organization_id IS NULL
  ELSE false
```

Ключ имеет `scope = 'admin'`, поэтому **глобальная строка для `app_staff` невидима навсегда**, а не до
миграции. Других permissive-политик SELECT для `app_staff` на этой таблице нет (проверено перечислением
`pg_policy`: единственная — эта). Следствия:

1. У любой клиники, созданной **до** миграции, `GET /api/admin/settings` не вернёт ключ никогда;
   `BookingRulesLoader` (`ScheduleSetupTab.tsx:136-147`) уходит в `phase: 'error'` и гасит весь раздел —
   отмену, перенос, открепление прошлых сессий абонемента и уведомления. Замкнутый круг: единственный
   экран, способный создать строку клиники, сам и отказывается рисоваться.
2. Починка «раздел не должен падать целиком» (рекомендация соседнего отчёта) убирает сопутствующий ущерб,
   но не закрывает BAH-02: поле всё равно нечего показать, и показанное значение будет расходиться с тем,
   по которому реально считается выдача (глобальные 30, видимые definer-функциям, но не кабинету).
3. На DEV/TEST это **не заметно владельцу**: его учётка имеет `platform.operations`, поэтому
   `requireSettingsApiContext` уводит её в ветку `platform` (`organizationId: null`, роль
   `app_platform_settings`, которая глобальные строки видит). Живой клик владельца покажет работающее
   поле там, где у настоящего клинического администратора экран сломан.

Нужен либо построчный бэкфилл по существующим организациям, либо чтение с деградацией к умолчанию.

### A3 — независимое подтверждение F1 живой пробой (не новый finding)

Вывод соседнего отчёта про декларацию подтверждён прямой пробой, а не чтением артефакта:

```
SET LOCAL ROLE app_seam_specialist_provision_owner;
INSERT INTO public.system_settings (... organization_id NULL ...)      → ERROR: permission denied for table system_settings
INSERT INTO public.system_settings (... organization_id '<клиника>' ...) → ERROR: permission denied for table system_settings
```

Роль шва не имеет INSERT на таблицу вовсе, поэтому `app.provision_specialist_owner()` не запишет умолчание
30 ни глобально, ни для своей клиники. Права на это есть только в **сгенерированном** артефакте
(`privileges.bcb_webapp_dev.sql`, `privileges.bersoncarebot_test.sql`), а `declaration.ts` о поверхности
`app.provision_specialist_owner(uuid) → public.system_settings` не знает: перечень `relationSurfaces` этой
функции содержит `be_organization_members`, `be_organizations`, `be_specialists`,
`clinic_public_directory_entries`, `organization_slug_claims`, `platform_users`,
`specialist_signup_intents`, `user_contacts` — и не содержит `system_settings`.

---

## Вердикт по миграции и правам

| Пункт §1 | Итог |
| --- | --- |
| Имя `YYYYMMDDTHHMMSS_slug.sql`, не переименована, не в ledger | PASS |
| `BCB-MIGRATION-VERIFY` в ведущем блоке комментариев | PASS (проверяет 4 следа) |
| Маркеры statement-owner на каждом блоке, `postgres` не используется | PASS формально, **но см. A1**: маркер backfill в statement 1 инертен, и фактический исполнитель — `app_object_owner`, а не локальный администратор |
| `GRANT`/`REVOKE`/`CREATE ROLE`/`ALTER ROLE`/`ALTER DEFAULT PRIVILEGES`/`CREATE POLICY` | PASS — ноль вхождений |
| Разбор прав тел (§1 «Перед приземлением миграции») | **FAIL** — новая поверхность `provision_specialist_owner → system_settings` не объявлена в `declaration.ts` (F1/A3); вставка глобальной строки не имеет исполнимой роли (A1) |
| Когерентность декларации | **FAIL** — `check:db-privileges-generated` exit 1, расхождений 2 |
| Индекс на горячую колонку | N/A — новых таблиц и колонок нет |
| Owner-aware rollback-only preflight на именованной DEV | **BLOCKED** — прогон останавливается на чужой миграции соседнего workstream, аудируемая не достигнута (ниже) |

**Preflight (санкционированный путь, из кандидатного чекаута, без apply и без одноразовой базы):**

```
$ bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot
…
NOTICE:  constraint "be_appointments_prepayment_mode_check" of relation "be_appointments" does not exist, skipping
ERROR:  new row violates row-level security policy for table "system_settings"
EXIT=3
```

Падает `20260905T233000_an_appointment_owns_its_price_and_prepayment.sql` — миграция **соседнего**
workstream, сортируемая раньше аудируемой. Это BLOCKED, а не провал этой ветки; обходить переупорядочиванием,
одноразовой базой или голым `psql` от `postgres` запрещено. Аудируемая миграция прогоном не достигнута —
поэтому A1 доказан отдельной точечной пробой её же statement (см. выше), а не выводом из чужого падения.

---

## Тесты и fault injection

Новых тестов **не добавлял**: тесты по BAH-03/04 уже добавлены первым аудитором в `b56a2b426`, а классы,
которые они не покрывают (A1, A2), ловятся механическим гейтом `check:db-privileges-generated` и живой
пробой прав — дублировать их тестом запрещено (§10b, п. 4-5). Вместо этого — независимая перепроверка
чужих тестов приёмом «сломай специально».

Базовая линия: `6 passed (6)`.

| # | Класс | Поломка, внесённая в продуктовый код | Какое утверждение покраснело |
| --- | --- | --- | --- |
| 1 | возврат 14-дневного hardcode | `service.ts`: `addDays(today, horizonDays - 1)` → `addDays(today, 13)` | `4 failed`: `AssertionError: expected { Object (from, to) } to deeply equal { Object (from, to) }` ×3 + `expected "vi.fn()" to not be called at all, but actually been called 1 times` |
| 2 | обход списка дней прямой датой | `service.ts`: удалён `if (date < today \|\| date > horizonEnd) return null;` | `2 failed`: `expected "vi.fn()" to not be called at all, but actually been called 3 times` (in-person) и `1 times` (online) |
| 3 | горизонт чужой организации | `service.ts`: `getAvailabilityHorizonDays(ctx.organizationId)` → фиксированный uuid org A | `1 failed`: «каждая клиника получает свой горизонт, а не горизонт соседней» |
| 4 | серверная ветка читает ключ соседа | `pgBookingScheduling.ts`: `booking_availability_horizon_days` → `booking_min_notice_hours` | `1 failed`: `expected 3rd "vi.fn()" call to have been called with … - "booking_availability_horizon_days" + "booking_min_notice_hours"` |

**Поймано 4 из 4 внесённых классов, непойманных нет.** Все четыре правки откачены `git checkout --`,
`git status` чист, базовая линия снова `6 passed (6)`.

Классы слепого kill-set, которые тестами не покрыты и покрыты быть не должны: `K8`/`K9` (дефолт новой
клиники) — держит гейт `check:db-privileges-generated`, он красный; `K6` (границы 1..92) — закрыто
конструкцией на четырёх уровнях; `K5`/`K11` — закрыто единственной точкой записи `updateSetting`.
`K14` (TZ) не проверялся отдельно: `defaultDateRange` берёт `today` через `localDateKey(..., timeZone)`
филиала, тест фиксирует время `vi.setSystemTime`.

Кэш слотов (`patient-booking/service.ts:103-119`) через организации **не течёт**: ключ `in_person` несёт
`branchId`+`serviceId` (uuid, уникальные внутри организации), а ветка `online` недостижима — оба маршрута
отвечают на неё `400 ambiguous_booking_tenant`. Горизонта в ключе нет, поэтому после смены настройки
возможна устаревшая выдача не дольше `slotsTtlMs = 60 c`; отказ самоизлечивается — не finding.

---

## Выполненные команды и результаты

| Команда | Результат |
| --- | --- |
| `pnpm check:db-privileges-generated` | **exit 1**, расхождений 2 (F1/A3) |
| `pnpm check:db-privileges-census` | exit 0 |
| `pnpm --dir apps/webapp typecheck` | exit 0 |
| `npx eslint` по 10 затронутым путям webapp | exit 0 |
| `node scripts/check-migration-privileges.mjs` | OK (124 файла) |
| `bash apps/webapp/scripts/check-drizzle-migration-order.sh` | OK |
| `node scripts/check-c4-migration-owned-function-bodies.mjs` | OK |
| `npx vitest --run availabilityHorizon.unit.test.ts pgBookingScheduling.settings.unit.test.ts` | `6 passed (6)`; под 4 инъекциями — 4/4 красные |
| `bash deploy/host/migrate-dev.sh --preflight --runtime-env-root …` | **exit 3**, BLOCKED на чужой `20260905T233000_…` |
| `psql` пробы INSERT в транзакции с ROLLBACK (4 роли) | `app_object_owner` → RLS-отказ; `app_seam_specialist_provision_owner` → `permission denied`; сохранено 0 строк |

Полный CI не гонялся (брифом запрещён).

---

## Что осталось владельцу

1. **A1 (новое, блокирует всё)** — глобальную строку настройки некому записать из миграции. Развилка по
   модели прав, решение не аудиторское.
2. **F1** (соседний отчёт) + **A3** — `declaration.ts` не знает о поверхности
   `provision_specialist_owner → system_settings`; правка артефакта руками не считается.
3. **A2** — существующие клиники не увидят настройку никогда, а раздел «Правила» у них гаснет целиком.
   Нужен построчный бэкфилл или чтение с деградацией к умолчанию.
4. **F3** (соседний отчёт) — закрывать ли горизонт механикой `booking`, как трёх его соседей.

### Замечание по процессу

На этой ветке одновременно работали **два** auditor-live с одним run-id `patient-work3-horizon-20260906` в
одном worktree (pid 2418275 и 2433850). Второй увидел чистое дерево, первый через две минуты закоммитил в
`b56a2b426` свои тесты **вместе с чужим** `BLIND_KILL_SET.md` и приписал его себе в теле коммита. Работа не
потеряна только случайно: пересекись правки продуктового кода при fault injection — оба прогона получили бы
мусор. Стоит закрыть запуск второго агента на занятый run-id.
