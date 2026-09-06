# Независимый аудит: аналитика специалиста, первый этап — VERDICT: **FAIL**

Ветка: `wt/doctor-analytics-first-stage-20260906`
Кандидат: `8bdf79aff` (`feat(doctor-analytics): tenant-scoped rebuild, first stage`)
Аудит проведён на `a440cd1e9` (merge `feat/doctor-ui-rebuild` в ветку кандидата)
План владельца: `docs/_TODO/DOCTOR_ANALYTICS_REBUILD_2026-09-06.md`, разделы `A–D`, `F`, `G`.
Раздел `E` — вне объёма первого этапа; отсутствие его метрик находкой не считалось.

Продуктовый код не менялся. Обе внесённые поломки (fault injection) откачены, дерево чистое.

## Вердикт по разделам

| Раздел | Итог | Комментарий |
|---|---|---|
| A. Границы маршрутов и доступа | **FAIL** | `AN-ROUTE-01`, `AN-SCOPE-01/02/03` закрыты. `AN-ROUTE-02` нарушен — F-2. |
| B. Общий интерфейс | **FAIL** | `AN-UI-01/02`, `AN-PERIOD-01/02` закрыты. `AN-STATE-01` нарушен — F-3. |
| C. Вкладка «Записи» | **FAIL** | `AN-REC-01/02/04` закрыты. `AN-REC-03` нарушен — F-1 (и F-4). |
| D. Вкладка «Активность» | **FAIL** | `AN-ACT-02/03/04/05` закрыты, `AN-ACT-06` честно оставлен открытым. `AN-ACT-01` нарушен — F-5. |
| F. Только global admin | PASS | `AN-ADMIN-01/02` — из doctor route/API платформенных агрегатов и технических ошибок нет. |
| G. Приёмка | частично | `AN-TEST-01` закрыт этим проходом, `AN-TEST-02` — N/A (нового DB read root нет). `AN-AUDIT-01` — этот документ. `AN-INTEGRATION-01` — за оркестратором после PASS. |

Визуальную приёмку выполняет владелец на TEST; она в этот аудит не входила.

## Находки

### F-1 · `AN-REC-03` · Плитка KPI, график и drill-down считают разные множества записей

**Сценарий.** Владелец или админ клиники открывает «Аналитика → Записи». Плитка «Всего записей»
показывает только его собственные приёмы; график под ней и разбивка по филиалам считают записи
ВСЕЙ клиники; клик по плитке открывает список записей всей клиники, который не сходится с цифрой
на самой плитке.

**Почему это не край.** Попасть на экран можно только с capability `clinical.workspace`, а она
выдаётся лишь membership-у с `specialistId !== null` (`modules/organization-membership/service.ts`,
`canAccessClinicalWorkspace`). Для роли `owner`/`admin` `canManageAllSpecialists` всегда `true`.
То есть у КАЖДОГО владельца клиники, который вообще может открыть этот экран, ровно та пара полей,
которая расщепляет scope.

**Механизм.** `src/app/api/doctor/analytics/records/route.ts:36,60,63`:
KPI получает `specialistId: gate.ctx.specialistId` (сужение до своего специалиста), а ряд —
только `visibilityActor: gate.ctx`, и `appointmentVisibilityCond`
(`src/infra/repos/pgDoctorCanonicalAppointments.ts:69`) при `canManageAllSpecialists` не сужает
ничего. Drill-down (`records/drilldown/route.ts:74`) идёт по тому же actor-у — вся клиника.
Комментарий в роуте описывает «clinic admin без личной привязки», но такой админ на экран не
попадает вовсе.

**Доказательство.** `src/app/api/doctor/analytics/analyticsScope.route.test.ts` →
`AN-REC-03 … владелец клиники: KPI не считает своё, пока график и drill-down показывают всю клинику`
— красный на нетронутом кандидате: `expected null to be '1000…0001'`. Обычный специалист
(`canManageAllSpecialists: false`) в том же файле зелёный — расхождения у него нет.

### F-2 · `AN-ROUTE-02` · Legacy-входы платформенной аналитики упираются в «доступ запрещён»

**Сценарий.** Глобальный админ открывает старую ссылку/закладку на платформенную аналитику
(`/app/doctor/analytics/clients`, `/app/doctor/analytics/notifications`, `/app/doctor/usage`).
Proxy отдаёт 308 на `/app/doctor/analytics?tab=…`, а этот путь после кандидата убран из
`DOCTOR_PORTAL_PLATFORM_OPERATIONS_PATHS` — портальный гейт отбивает админа на
`/app/admin/system-health?app_access_denied=1`. Платформенная аналитика по этим входам
недостижима. То же у двух legacy-редиректов настроек
(`src/app/app/settings/adminSettingsData.ts:27,28` — `product-analytics`, `reminder-stats`) и у
`src/app/app/doctor/stats/page.tsx:4`.

**Механизм.** `src/middleware/doctorRouteRedirects.ts:85-87` по-прежнему ведут на клинический
`/app/doctor/analytics`, хотя платформенная страница переехала на `/app/admin/analytics`.
`doctorRouteRedirectResponse` в `proxy.ts:107` срабатывает раньше портального гейта, поэтому
редирект отрабатывает и уже вторым хопом упирается в отказ. `platformNavLinks.ts` обновлён верно —
сломаны именно legacy-входы, которые план требует перевести вместе с навигацией.

**Доказательство.** `src/proxy.route.test.ts` →
`does not dead-end a platform-operations admin following legacy entry …` — красный по всем трём
путям на нетронутом кандидате (`'/app/admin/system-health?app_access_denied=1'` вместо `null`).
Что это именно регрессия кандидата: при временно возвращённом `/app/doctor/analytics` в
`DOCTOR_PORTAL_PLATFORM_OPERATIONS_PATHS` утверждение про тупик становится зелёным (краснеет
только требование «вести на `/app/admin/analytics`»), а собственное утверждение кандидата про
запрет админа на `/app/doctor/analytics` — красным. Правка откачена.

### F-3 · `AN-STATE-01` · Сырой код ошибки показывается пользователю

**Сценарий.** Специалист выбирает произвольный период длиннее 400 дней (пикер периода не
ограничен сверху — `AnalyticsPeriodToolbar` не передаёт `max` в `DoctorDatePicker`, а клиентская
`validateCustomAnalyticsPeriod` проверяет только минимум в 7 дней). Сервер отвечает
`400 {error:'range_too_long'}`, и вкладка печатает в красной строке буквально `range_too_long`.
Тот же путь у `entitlement_required` (403) и у `HTTP 500`.

**Механизм.** `records/RecordsAnalyticsTab.tsx:127,174` и `activity/ActivityAnalyticsTab.tsx:131,177`
кладут `json.error` прямо в текст сообщения.

**Классификация.** Взгляд, не тест: это разовое качество текста отказа, а не повторяемое поведение
данных. Наименее тяжёлая из находок, но пункт `AN-STATE-01` назван в плане дословно.

### F-4 · `AN-REC-03`/`AN-REC-04` · «Отмены» на плитке и «Отмены» на графике — разные метрики

**Сценарий.** Период «7 дней». Пациент сегодня отменяет визит, назначенный на следующий месяц:
линия графика «Отмены» вырастет на 1, плитка «Отмены» — нет. Визит внутри периода, отменённый
месяц назад: наоборот. Две цифры под одним словом на одном экране, и drill-down по плитке не
сходится с графиком.

**Механизм.** Плитка — `ScheduleKpis.cancellationsInPeriod`: строки со статусом отмены по дате
визита (`start_at`). Линия графика — `AppointmentDayPoint.cancellationActions`: строки
`be_appointment_cancellations` по дате самого действия (`created_at`)
(`pgDoctorCanonicalAppointments.ts`, ветка `getAppointmentDailySeries`). Drill-down
`onlyCancelled=1` идёт по дате визита, то есть согласован с плиткой и рассогласован с графиком.

**Оговорка.** Компонент графика и обе SQL-семантики существовали раньше; кандидат впервые сделал
ряд непустым, и расхождение стало видимым. Уровень уверенности ниже, чем у F-1/F-2, но пункт
`AN-REC-03` требует согласованности графика, KPI и drill-down явно.

### F-5 · `AN-ACT-01` · Активность считает пациентов без активной назначенной программы

**Сценарий.** У специалиста трое видимых пациентов, у двоих сейчас активная программа. Третий
отмечал упражнения в выбранном периоде, и его программу в этом же периоде закрыли (кнопка
«завершить», `TreatmentProgramInstanceDetailClient.tsx:2138`; статусы таблицы — только `active` и
`completed`, check-constraint `treatment_program_instances_status_check`). Экран покажет
«с программой: 2», «с активностью за период: 3» и «Доля активных: **150 %**». Вырожденный случай:
единственный пациент, закрывший программу, даёт «с активностью: 1» и «Доля активных: 0 %» —
выдуманный ноль вместо недоступной величины (`AN-STATE-01`).

**Механизм.** `src/infra/repos/pgDoctorProgramActivity.ts:26-40` — `doneInPeriodCond` фильтрует
`program_action_log` по организации, видимости, `action_type='done'` и периоду, но НЕ соединяется
с `treatment_program_instances` и не требует активной программы. Знаменатель
(`activeProgramCond`, строки 49-58) требует `status='active'`, числитель — нет. Расходятся все
три поверхности: KPI, дневной ряд и drill-down пациентов.

**Классификация.** Взгляд, не тест: дефект структурный (отсутствующее соединение), а полная
DB/RLS-матрица по AGENTS.md §10a пишется отдельно и здесь не подменяется.

## Слепой список поломок и результат

Список составлен до чтения существующих тестов (11 классов из брифа).

| # | Класс | Итог |
|---|---|---|
| 1 | `/app/doctor/analytics` отбивает обычного специалиста / берёт global-admin или дефолтную организацию | закрыт |
| 2 | Чужая организация меняет KPI/ряд/drill-down | закрыт, поломка ловится |
| 3 | Невидимый пациент остаётся виден | закрыт, поломка ловится |
| 4 | `/app/admin/analytics` или платформенная навигация сломана/дублирована | **ПРОБИТ → F-2** |
| 5 | Границы периода в серверной/браузерной зоне или inclusive end | закрыт |
| 6 | KPI, ряд и drill-down с разной семантикой scope/статуса/даты | **ПРОБИТ → F-1, F-4** |
| 7 | Активность выдаёт adherence / минуты просмотра / деньги | закрыт (дисклеймер на вкладке, метрик нет) |
| 8 | Активность включает пациентов без активной программы / показывает невидимого | **ПРОБИТ → F-5** (невидимый — нет) |
| 9 | Tenant-scoped оценки материалов пропали или заменены глобальными | закрыт |
| 10 | Технические player/proxy/transcode/storage ошибки утекли в doctor UI | закрыт |
| 11 | Новый DB read root без централизованного разбора прав | закрыт (нового read root нет) |

### Fault injection (по одной на независимый защищаемый класс)

1. Убран `visibilityActor: gate.ctx` из `activity/drilldown/route.ts` → красный
   `AN-SCOPE-01/02 … activity drill-down: список пациентов ограничен организацией и actor-ом запроса`.
2. `organizationId` в `records/route.ts` подменён на чужой uuid → красный
   `AN-SCOPE-01/02 … records: KPI и ряд читаются в организации запроса`.
3. `/app/doctor/analytics` временно возвращён в `DOCTOR_PORTAL_PLATFORM_OPERATIONS_PATHS` →
   утверждение про тупик в `proxy.route.test.ts` зеленеет, что и доказывает регрессию F-2.

Все три правки откачены; `git status` чист по продуктовому коду.

## AN-TEST-02 — права

Нового DB read root нет: `pgDoctorProgramActivity` читает `program_action_log` и
`treatment_program_instances` тем же `getDrizzle()`-портом под ролью `app_staff`, что и уже
работающие `pgProgramActionLog` / `pgProgramItemDiscussion`, и оборачивает чтение в
`withDoctorWorkspacePrincipal`. Проверка на именованном DEV (`bcb_webapp_dev`, роль
`bcb_dev_webapp_staff` по mTLS): обе таблицы несут `relrowsecurity`+`relforcerowsecurity`, как и
`be_appointments`; чтение без принципала отбивается громко —
`ERROR: accepted port context required (app.require_accepted_context)`, то есть отсутствие
принципала даст 500, а не молчаливые нули. Права миграциями не выдаются:
`check-migration-privileges` OK, `deploy/postgres/privileges/declaration.ts` кандидатом не
затронут.

## Выполненные проверки

| Проверка | Команда | Результат |
|---|---|---|
| Типы webapp | `pnpm typecheck` (`apps/webapp`) | exit 0 |
| ESLint (изменённое + новые тесты) | `npx eslint src/app/api/doctor/analytics src/app/app/doctor/analytics src/infra/repos/pgDoctorProgramActivity.ts src/infra/repos/localCalendarDateSql.ts src/infra/repos/inMemoryDoctorProgramActivity.ts src/modules/doctor-program-activity src/proxy.route.test.ts` | exit 0 |
| Сырой SQL | `node scripts/check-no-new-raw-sql.mjs` | OK, production debt 0 |
| Границы импорта infra | `node scripts/check-webapp-infra-import-boundary.mjs` | OK |
| Права в миграциях | `node scripts/check-migration-privileges.mjs` | OK, 127 файлов |
| Пробелы/конфликты в диффе | `git diff --check` | exit 0 |
| Новый scope-тест | `npx vitest run src/app/api/doctor/analytics/analyticsScope.route.test.ts` | **1 red / 5 green** (red = F-1) |
| Proxy | `npx vitest run src/proxy.route.test.ts` | **3 red / 92 green** (red = F-2) |
| Навигация и реестр действий | `npx vitest run src/shared/ui/doctor/doctorNavLinks.unit.test.ts src/app-layer/entitlements` | 33/33 |
| Соседний scope записей и оценки | `npx vitest run src/app/api/doctor/schedule-kpis src/app/api/doctor/booking-engine/_doctorScheduleScope.route.test.ts src/app/api/doctor/booking-engine/_resolveDoctorScheduleScope.unit.test.ts src/app/app/doctor/material-ratings` | 10/10 |

Full CI, push, land и deploy не выполнялись — по брифу это работа оркестратора после PASS
(`AN-INTEGRATION-01`).

## Что НЕ сделано

- Живой прогон приложения из worktree не выполнялся: все находки доказаны публичными
  поведенческими тестами и чтением, визуальная приёмка — за владельцем на TEST.
- Полная DB/RLS-матрица по новым запросам активности не писалась (AGENTS.md §10a: до отдельного
  аудита ролей/стен новый DB-тест не заводим). F-5 доказан разбором SQL, не прогоном по данным.
- Раздел `E` не проверялся: он явно вне первого этапа.

## Замечание без статуса находки

`MetricAccountsDialog` печатает время строки drill-down через
`toLocaleString('ru-RU')`, то есть в зоне браузера, а не в бизнес-зоне организации. Фильтрация
периода при этом честно идёт в бизнес-зоне (`resolveAppointmentStatsBounds`), так что данные верны
— расходится только подпись. Поведение досталось от существующего примитива и кандидатом не
вносилось; переиспользование примитива требует канон §16.
