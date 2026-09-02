# PASS — одно ограничение названия клиники, 100 знаков (`a7af0c99a`)

Независимый аудит 23.08.2026. Оракул — `IMPLEMENTATION_PLAN.md` §1.2i (владелец: «конечно же, сто знаков,
конечно. Зачем больше?»). Клон `/home/dev/dev-projects/bcb-wt-night-b4a-20260823`, ветка
`wt/night-b4a-20260823`, проверяемый коммит `a7af0c99a`. Блокирующих находок нет; ниже — доказательства,
один вопрос владельцу и три пометки без работы.

## Инъекции: посажено 4 / убито 4 / не поймано 0

Классы независимые, каждый сажался и откатывался по одному; после отката дерево совпадает с `a7af0c99a`
(`git status --porcelain` — пусто).

| # | Что сломано | Кто поймал | Как упало |
| --- | --- | --- | --- |
| K1 | В маршруте регистрации возвращён старый `max(200)` и голый `trim()` вместо `validateOrganizationName` | `src/app/api/auth/specialist-signup/start/route.route.test.ts` | «returns a typed, human-readable error for 101 characters»: `expected 200 to be 400` |
| K2 | Off-by-one в общей проверке: `>` → `>=` | тот же файл | «accepts exactly 100 characters without changing the title»: `expected 400 to be 200` |
| K3 | Проекция бренда снова молча режет (`slice(0, 100)`), отказ подменён на `return` | `src/modules/org-branding/service.unit.test.ts` | «refuses a 101-character paid clinic-name override…»: `promise resolved "{ ok: true, draft: … }" instead of rejecting` |
| K4 | Санитайзер поверхности снова отбивает имя длиннее 100 | `src/proxy.route.test.ts` (B4a) | 4 теста: `expected 404 to be 200` — ровно исходный блокер B4a |

K4 — главное: он воспроизводит мёртвый адрес. Пока проверка длины стоит в санитайзере поверхности,
клиника со старым длинным названием получает `404`; после снятия — `200` и имя целиком.

## Ограничение одно и стоит на вводе

Все места, где название организации попадает в базу, найдены проходом по write-путям
(`grep organizationTitle|organization_title`, `beOrganizations` + `insert|update`, `display_name`
в `clinic_public_directory_entries` и `org_brand_revisions`, SQL-функции провижининга), а не по списку автора.

| Куда пишется | Через что | Ограничение |
| --- | --- | --- |
| `specialist_signup_intents.organization_title` → далее `be_organizations.title` и `clinic_public_directory_entries.display_name` (функция `app.provision_specialist_owner`, миграция `20260821T040000`) | `POST /api/auth/specialist-signup/start` | 100 на сервере (`validateOrganizationName`) + `maxLength` и проверка в `AuthFlowV2` |
| `org_brand_revisions.display_name` (платный override) | server action `saveOrgBranding` → `orgBranding.saveDraft` | 100 в сервисе (`assertValidOrganizationNameInput`) + `maxLength` в `OrgBrandingSection` |
| `org_brand_revisions.patient_app_name` | только `saveDraft`, UI-писателя нет | 100 тем же ассертом |
| `clinic_public_directory_entries.display_name` | `pgClinicDirectory.ts:276` — копия `organization.title` при публикации | своего ввода нет |
| `be_organizations` (админка платформы) | `PATCH /api/admin/organizations/[organizationId]` | пишет только `is_active` + `reason`; названия не трогает |
| `be_organizations.tariff_id` | `pgSaasBilling.updateOrganizationTariffAssignment` | названия не трогает |
| приглашения, биллинг, расписание, карточка пациента | проекции чтения (`organizationTitle` только на выход) | ввода нет |
| сиды, скрипты, `apps/integrator` | `grep` по `scripts/`, `tools/`, `apps/integrator/src` — совпадений нет | ввода нет |

Один шов без ограничения: `bookingEngine.organization.upsertOrganization({ title })`
(`pgBookingEngine.ts:735`) пишет `be_organizations.title` без проверки длины. Достижимого сценария нет —
в продовом коде у него нет ни одного вызывающего (`grep` даёт только сам порт, сервис и тест
`service.mechanicWriteClearance.test.ts`). По §24.6 это не finding, а пометка на будущее: если у метода
появится маршрут, ограничение придётся ставить и там.

## Чисел 200 и 120 не осталось

Разовая перепись констант, проверена взглядом, а не тестом (§24.4).

- единственный источник числа — `apps/webapp/src/shared/lib/organizationName.ts:1`
  (`ORGANIZATION_NAME_MAX_LENGTH = 100`); все четыре потребителя импортируют его, своих чисел не держат;
- в схемах длины нет вообще: `be_organizations.title`, `clinic_public_directory_entries.display_name`,
  `specialist_signup_intents.organization_title`, `org_brand_revisions.display_name` — `text` без
  `varchar(n)`; `grep 'varchar('` по `db/schema/*.ts` рядом с `title|name` — пусто;
- в миграциях длина названия не ограничивается и не режется: `grep organization_title` по
  `db/drizzle-migrations/*.sql` даёт только объявления типов и перенос значения;
- `MAX_DISPLAY_NAME_LENGTH` удалён, `slice(0, 120)` и `slice(0, 200)` для названия не осталось
  (совпадения `slice(0, 200)` в репозитории — комментарий к LFK-дневнику, имя файла загрузки, ключ
  дедупликации алерта: другие сущности);
- в тестах 120 как ожидание не осталось. `proxy.route.test.ts:888` держит `'Ю'.repeat(200)` — это
  фикстура *старого длинного* названия, которое обязано пройти целиком, а не ожидание лимита 200;
- `max(200)` в `api/admin/booking-engine/{branches,services,specialists}` — названия филиалов, услуг и ФИО
  специалиста, другие сущности; §1.2i их не касается.

## Обрезания больше нет, длинное старое название адрес не роняет

- `normalizeDisplayName` больше не режет, `sanitizeEffectivePatientBrand` больше не отбивает по длине;
- живые тесты B4a: названия в 100, 101 и 200 знаков дают `200` и `effectiveDisplayName === title`
  без среза; отдельный случай — ветка «тариф есть, опубликована только палитра» (имя ядра берётся другой
  строкой) и случай с эмодзи (`'🌿'.repeat(100)` = 200 кодовых единиц UTF-16, срез рвал суррогатную пару);
- инъекция K4 доказывает, что эти тесты действительно держат блокер, а не проходят мимо него.

## Отказ типизирован и доходит до клиента кодом

- регистрация: `jsonError('organization_name_too_long', { message }, { status: 400 })`; тест сверяет
  тело целиком — `{ ok: false, error: 'organization_name_too_long', message: 'Название клиники не должно
  быть длиннее 100 знаков.' }`. `AuthFlowV2` ловит код в обеих ветках отправки (основная — по коду,
  ветка «отправить код повторно» — по `data.message`), пользователь видит причину, а не «Ошибка»;
- настройки бренда: сервис бросает `Error('organization_name_too_long')`, `saveOrgBranding` ловит и
  возвращает `{ ok: false, error: 'organization_name_too_long' }`, `OrgBrandingSection` печатает тот же
  текст из `SAVE_ERROR_MESSAGES`. Код до клиента доходит.

## Проверки

| Что | Команда | Итог |
| --- | --- | --- |
| Все тесты webapp на `a7af0c99a` | `pnpm --dir apps/webapp test` | 441 файл прошёл, 6 пропущено; 2124 теста прошло, 15 пропущено, 0 упало (136 с) |
| Типы webapp | `pnpm --dir apps/webapp typecheck` | зелено |
| Целевые прогоны под инъекциями | `npx vitest run --project {route,unit} <файл>` | см. таблицу инъекций |

## Данные DEV (числа с командами)

`sudo -n -u postgres psql -X -q -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -At` (read-only, суперюзер —
значит RLS не занижает счёт):

| Таблица | Строк | Длиннее 100 | Максимум |
| --- | ---: | ---: | ---: |
| `be_organizations.title` | 5 | **0** | 19 |
| `clinic_public_directory_entries.display_name` | 4 | **0** | 24 |
| `org_brand_revisions.display_name` | 12 | **0** | 38 |
| `specialist_signup_intents.organization_title` | 16 | **0** | 27 |

## OWNER QUESTION — что делать с названиями длиннее 100, если они есть на проде

На DEV их 0 (таблица выше), поэтому политика не выдумывалась (граница брифа). Механика, о которой стоит
знать при ответе: пока имя не трогают, ничего не ломается — если в поле настроек осталось каноническое
имя организации, `OrgBrandingSection` отправляет `displayName: null`, и проверка не срабатывает вовсе.
Но если у клиники уже сохранён **платный override** длиннее 100, поле подставит его целиком (`maxLength`
не режет предзаполненное значение), и любое сохранение — даже если клиника меняла только логотип —
получит отказ, пока имя не укоротят вручную. Варианты: (а) оставить как есть — таких клиник может не быть
вовсе; (б) разово укоротить их при переезде; (в) пропускать неизменённое длинное имя и требовать 100
только при правке. Проверить, есть ли такие строки на проде, можно тем же запросом по
`org_brand_revisions.display_name`.

## Пометки без работы (не findings)

1. **`assertValidOrganizationNameInput` бросает `Error`, а сервис в остальном возвращает типизированный
   `OrgBrandMutationFailure`.** Сегодня это работает: единственный вызывающий (`saveOrgBranding`) обёрнут
   в `try/catch` и превращает `error.message` в код. Достижимого сбоя нет, поэтому не finding; но второй
   вызывающий без `try/catch` получит 500 вместо типизированного отказа.
2. **`.length` считает кодовые единицы UTF-16.** Кириллица и латиница — один к одному, а имя из эмодзи
   упрётся в 50 видимых знаков. Реального сценария нет.
3. **DEV отстаёт от ветки:** в `org_brand_revisions` на DEV нет колонки `patient_app_name` — миграция
   `20260823T064034_patient_brand_has_one_name_and_one_accent.sql` там не применена. К `a7af0c99a`
   отношения не имеет, на аудит не влияет; отмечено, чтобы следующий замер по DEV не принял это за поломку.
