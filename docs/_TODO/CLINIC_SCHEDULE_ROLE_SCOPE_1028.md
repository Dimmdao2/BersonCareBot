# #1028 — расписание врача и клиники: ролевой scope

**Статус:** S1–S5 реализованы и независимо проверены PASS; DEV-smoke не выполнен.

**Карточка:** `#1028`.

## Решение владельца

Владелец подтвердил модель 30.07.2026:

> «врачу сервер принудительно отдаёт только его записи;
> clinic_admin получает „Моё / Вся клиника“ и выбор специалиста;
> KPI и фильтры получают тот же scope;
> чужие записи нельзя менять через прямой API-ID.
>
> звучит корректно
> clinic_admin может и смотреть чужие записи и создавать, переносить и отменять записи за специалистов»

Под «чужими» ниже понимаются записи другого специалиста. Для обычного врача они недоступны. Для
`clinic_admin` разрешённые операции ограничены специалистами текущей клиники.

## Подтверждённая проблема

Живой экран `/app/doctor/schedule` используется и обычным врачом, и `clinic_admin`, но серверные calendar/KPI
reads и mutation routes сейчас не применяют одну ролевую границу:

- при нескольких специалистах calendar API может оставить `specialistId` пустым и вернуть записи всей организации;
- KPI считаются по организации без того же specialist scope;
- mutation route с прямым appointment ID проверяет организацию, но не всегда принадлежность записи специалисту;
- календарный ответ содержит данные специалиста и пациента, поэтому это не только UX-фильтр, а серверная
  граница доступа.

`BookingEngineSection` к этой задаче не подключается: это отключённая панель каталогов/доступности, а не
календарь записей.

## Ролевая модель

| Роль | Чтение календаря | KPI и фильтры | Создание | Перенос | Отмена |
| --- | --- | --- | --- | --- | --- |
| обычный врач | только собственный `specialistId`, принудительно сервером | только собственный scope | только за себя | только своей записи | только своей записи |
| `clinic_admin` | `Моё`, `Вся клиника` или выбранный специалист текущей клиники | тот же выбранный scope | за любого специалиста текущей клиники | записи любого специалиста текущей клиники | записи любого специалиста текущей клиники |

Глобальная роль не получает из этой задачи новый cross-tenant clinical access. Жёсткое удаление чужой записи
не добавляется: подтверждены создание, перенос и отмена; hard-delete остаётся вне scope.

Обычный «перенос» означает изменение времени/кабинета/услуги при сохранении назначенного специалиста.
`specialistId` в существующем reschedule body не является разрешением переназначить запись другому специалисту:
такое reassignment не подтверждено владельцем и остаётся вне scope.

## Инварианты безопасности

- Organization ID и собственный specialist ID берутся только из server-resolved контекста.
- Для обычного врача клиентский specialist ID не расширяет доступ: сервер всегда заменяет его собственным.
- Для `clinic_admin` выбранный specialist ID сначала проверяется как действующий специалист текущей организации.
- Appointment ID сначала резолвится в appointment, затем проверяются организация и допустимый specialist scope;
  одна проверка organization ID не считается достаточной.
- Один и тот же scope применяется к событиям, metadata/спискам фильтров, KPI и mutation routes.
- UI-скрытие не является защитой; прямой HTTP-вызов обязан получить тот же allow/deny.
- Данные другой клиники недоступны обеим ролям.

## Wire-контракт scope

- UI/deep-link state: `scope=mine|clinic|specialist`; для `scope=specialist` обязателен
  `specialist=<uuid>`, для остальных режимов этот параметр удаляется.
- API query для calendar, KPI и nearest-free-window: тот же `scope`; выбранный ID передаётся как
  `specialistId` только при `scope=specialist`.
- Серверная страница расписания передаёт в calendar tab минимальный bootstrap:
  `canManageAllSpecialists`, собственный active `specialistId` и список `{id, displayLabel}` действующих
  специалистов текущей организации. Raw workspace ID, которого нет в active directory, передаётся как `null`.
  Источник — существующий server-resolved doctor context/doctor-workspace service, не доверенный клиентский
  список и не мёртвый HTTP directory endpoint.
- Обычному врачу bootstrap не выдаёт управляющий control: сервер резолвит любой запрос в `mine` и собственный
  specialist ID.
- `clinic_admin` получает `mine|clinic|specialist`; server response возвращает resolved scope, чтобы UI,
  календарь и KPI не могли показывать разные режимы.
- Create body может содержать `specialistId` только для `clinic_admin`; сервер всё равно валидирует его в
  текущей организации. Для врача body ID игнорируется/отклоняется и заменяется собственным.
- Reschedule body не меняет назначенного специалиста. Переданный отличный `specialistId` получает neutral
  validation error; текущий ID сохраняется.

## Разрешённый file scope

- `apps/webapp/src/app/app/doctor/schedule/**`;
- `apps/webapp/src/app/app/doctor/layout.tsx` и
  `apps/webapp/src/shared/ui/doctor/doctorNavLinks.ts`, только чтобы management-capable `clinic_admin`
  мог открыть существующий schedule route без расширения остальных clinical routes;
- `apps/webapp/src/app/app/doctor/calendar/DoctorCalendarEventPanel.tsx`;
- `apps/webapp/src/app/app/doctor/TodayAppointmentFullModal.tsx` и
  `apps/webapp/src/app/app/doctor/TodayMiniCalendarWithModal.tsx`, только чтобы тот же own-specialist
  hard-delete contract действовал во всех существующих hosts календарной панели;
- `apps/webapp/src/app/api/doctor/schedule*/**`;
- `apps/webapp/src/app/api/doctor/booking-engine/_requireDoctorBookingEngine.ts` и новый/существующий соседний
  typed scope resolver;
- `apps/webapp/src/app/api/doctor/booking-engine/calendar/**`;
- `apps/webapp/src/app/api/doctor/booking-engine/appointments/**`;
- `apps/webapp/src/modules/booking-calendar/**`, `apps/webapp/src/modules/booking-appointment-lifecycle/**` и
  их существующие repo/port callsites, только насколько нужно провести один scope;
- `apps/webapp/src/modules/doctor-schedule/**` для общего typed wire-контракта server/client без дублирования;
- `apps/webapp/src/modules/doctor-appointments/ports.ts` и
  `apps/webapp/src/infra/repos/pgDoctorCanonicalAppointments.ts`, только для применения того же scope к KPI;
- `docs/ARCHITECTURE/DOCTOR_CABINET_NAVIGATION.md`,
  `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/ROLE_CAPABILITY_MATRIX.md` и этот план.

Любой дополнительный production-path сначала добавляется сюда с доказанной необходимостью. Colocated unit/route
tests в перечисленных областях разрешены по текущему owner ruling и test-authoring canon; Stryker, миграции,
env/deploy/server scripts и другие UI-разделы запрещены.

## Чек-лист исполнения

### S1. Единый серверный scope

- [x] Ввести или переиспользовать один typed resolver ролевого schedule scope: doctor-self и
  clinic-admin `mine|clinic|specialist`. Evidence:
  `apps/webapp/src/app/api/doctor/booking-engine/_resolveDoctorScheduleScope.ts`.
- [x] Валидировать выбранного специалиста по текущей организации и fail closed для отсутствующего,
  деактивированного или чужого ID. Evidence: `_resolveDoctorScheduleScope.unit.test.ts`, 5/5 PASS.
- [x] Не создавать параллельную модель ролей: использовать существующие `specialistId`,
  `canManageOrganization`/`canManageAllSpecialists` и organization context. Evidence:
  `_resolveDoctorScheduleScope.ts`.
- [x] Зафиксировать typed wire schema `scope + specialistId` и resolved-scope response; calendar/KPI/
  nearest-window используют один контракт. Evidence: `_resolveDoctorScheduleScope.ts` и три route callsite.
- [x] Передать SSR capability bootstrap тем же typed контрактом. Evidence:
  `schedule/page.tsx` → `DoctorScheduleShell` → `ScheduleCalendarTab`; общий тип
  `modules/doctor-schedule/scope.ts`.
- [x] Применить тот же server-resolved контракт к create. Evidence: `resolveDoctorCreateSpecialist` в обоих
  manual-create routes; hostile-ID unit/route tests PASS.

### S2. Calendar, filters и KPI

- [x] Calendar API принудительно ограничивает обычного врача его собственным `specialistId`. Evidence:
  `calendar/route.ts`; hostile-query route test PASS.
- [x] Calendar API поддерживает для `clinic_admin` `Моё`, `Вся клиника` и выбранного специалиста. Evidence:
  shared resolver unit test и selected-specialist route test PASS.
- [x] Доступные значения specialist-filter формируются только из специалистов текущей клиники. Evidence:
  resolver catalog validation + scoped calendar metadata.
- [x] KPI принимает и применяет тот же resolved scope, что календарь. Evidence:
  `schedule-kpis/route.ts`, `pgDoctorCanonicalAppointments.ts`; route test PASS.
- [x] Остальные calendar filter metadata/counts не показывают данные вне resolved scope. Evidence:
  `scopeCalendarFilterMeta` ограничивает specialists/service availability, а calendar query ограничивает events.
- [x] `GET /api/doctor/schedule/nearest-free-window` использует тот же resolver: doctor-self,
  clinic-admin mine/clinic/specialist; клиентский `specialistId` сам по себе доступ не расширяет. Evidence:
  `_doctorScheduleScope.route.test.ts` PASS.

### S3. UI существующего расписания

- [x] На `/app/doctor/schedule` для `clinic_admin` добавить понятный переключатель `Моё / Вся клиника`.
  Evidence: `ScheduleCalendarTab.tsx`.
- [x] В режиме клиники дать выбор конкретного специалиста; обычному врачу эти controls не показывать.
  Evidence: server bootstrap + `schedule-scope-*` controls.
- [x] Смена scope синхронно обновляет календарь, KPI и фильтры без второго экрана и без подключения
  `BookingEngineSection`. Evidence: один `scheduleScope` во всех трёх fetch; UI test PASS.
- [x] В форме создания `clinic_admin` может выбрать специалиста только из текущей клиники; у врача специалист
  фиксирован сервером и UI. Evidence: trusted bootstrap → scoped filter metadata →
  `DoctorCalendarEventPanel.activeFilters`; server-side create enforcement остаётся отдельным S5.
- [x] Deep-link registry и fetch query передают `scope/specialist` одинаково в calendar, KPI и
  nearest-free-window; недействительный deep link нормализуется по server-resolved bootstrap. Evidence:
  `scheduleTabRegistry.ts`, `resolveDoctorScheduleScopeState`, UI test PASS.
- [x] Create submit применяет тот же server-resolved scope. Evidence:
  `resolveDoctorCreateSpecialist` используется обоими manual-create routes; hostile-ID route test PASS.

### S4. Direct-ID read matrix

- [x] `GET appointments/[id]/lifecycle`: doctor-own; `clinic_admin` — appointment текущей клиники; чужая
  организация получает neutral denial. Evidence: shared `_resolveDoctorAppointmentAccess`, route test PASS.
- [x] `GET appointments/[id]/comments`: doctor-own; `clinic_admin` — appointment текущей клиники; чужая
  организация получает neutral denial. Evidence: shared resolver before history read, route test PASS.
- [x] `GET appointments/[id]/payment`: doctor-own; `clinic_admin` — appointment текущей клиники; чужая
  организация получает neutral denial. Evidence: shared resolver before payment summary, route test PASS.
- [x] Event/detail fetch UI не обходит эту матрицу другим прямым ID endpoint. Evidence:
  `DoctorCalendarEventPanel` reads lifecycle/comments/payment; all three use the shared direct-ID resolver.

### S5. Direct-ID mutation matrix

- [x] `POST appointments/manual` и `POST appointments/manual-patient-visit`: врач создаёт только за себя;
  `clinic_admin` — за валидированного специалиста текущей клиники. Evidence: shared create resolver +
  hostile-ID route/unit tests PASS.
- [x] `POST appointments/[id]/manual-reschedule`: врач — только своей записи; `clinic_admin` — записи
  специалиста текущей клиники; назначенный specialist сохраняется, reassignment запрещён. Evidence:
  clinic-mode resolver; allowed-manager and rejected-reassignment route tests PASS.
- [x] `POST appointments/[id]/manual-cancel`: врач — только своей записи; `clinic_admin` — записи специалиста
  текущей клиники. Evidence: clinic-mode resolver + allowed-manager route test PASS.
- [x] `POST appointments/[id]/delete`: hard-delete чужой записи запрещён и обычному врачу, и `clinic_admin`;
  UI не предлагает его для чужой записи. Evidence: own-mode resolver; schedule/today calendar panels compare
  the row specialist with authenticated non-null `ownSpecialistId`.
- [x] `POST appointments/[id]/manual-no-show`: чужая запись запрещена обеим ролям до отдельного owner ruling.
  Evidence: own-mode resolver before lifecycle side effects; route test PASS.
- [x] `POST appointments/[id]/comments`: изменение чужой записи запрещено обеим ролям до отдельного owner ruling.
  Evidence: own-mode resolver before comment creation; route test PASS.
- [x] `POST appointments/[id]/package/detach`, `refund`, `unlink`: изменение чужой записи запрещено обеим ролям
  до отдельного owner ruling. Evidence: own-mode resolver before `runPackageDetach`; route test PASS.
- [x] Отказы не раскрывают существование appointment/специалиста другой клиники сверх действующего safe-error
  контракта. Evidence: shared resolver returns `null`; all denied mutation routes return the same
  `{ ok:false, error:'not_found' }` / 404 contract before side effects.

### S6. Документация и доказательство

- [x] Безусловно обновить `ROLE_CAPABILITY_MATRIX.md`: owner ruling 30.07.2026 заменяет future/deferred
  another-specialist appointment row для `clinic_admin`; обычному врачу расширение не даётся. Evidence:
  строка `Clinic admin / another-specialist appointment` и §4 в текущем документе.
- [x] Обновить `DOCTOR_CABINET_NAVIGATION.md` новым контрактом одного schedule screen и role scope.
- [x] Выполнить typecheck и targeted lint по изменённым production-файлам. Evidence:
  `pnpm --filter webapp typecheck` и scoped `eslint` PASS.
- [ ] Выполнить DEV-smoke существующими `dev:doctor` и `dev:clinic-admin`: self/all/specialist, KPI parity,
  nearest-free-window, create/reschedule/cancel и каждый direct-ID allow/deny из S4/S5.
- [-] ~~Тестовые и Stryker-файлы не менять и тестовые suites не запускать: тестовый контур переделывается
  соседней работой по прямому указанию владельца.~~ — ОТМЕНЕНО ВЛАДЕЛЬЦЕМ 30.07.2026:
  «уже начинай добавлять тесты»; «с тестами — читай инструкцию и разбирайся впредь сам».
- [x] Добавить минимальные unit/route проверки named schedule-scope failure с независимым oracle и fault
  injection. Evidence: 8 files / 26 tests PASS; specialist scope, UI request parity, navigation and direct-ID
  mutations produced their expected failures before restoration.
- [x] Независимый аудит сверяет каждый пункт этого плана и server-side IDOR. Evidence: initial audit
  `ac7db7975..505a883d0` нашёл 2 behavior MUST FIX + 1 file-scope violation; corrective re-audit exact
  `8a7adff4e70c56e7a0df48c8561615581b2807a8` PASS, новых authorization/IDOR ошибок нет.

## Definition of Done

- [x] Обычный врач не может прочитать или изменить appointment другого специалиста ни списком, ни прямым ID.
  Evidence: server-resolved list/direct-ID scope + unit/route fault-injection evidence.
- [x] `clinic_admin` на одном экране использует `Моё / Вся клиника / специалист`, а calendar, KPI, filters и
  nearest-free-window показывают один resolved scope. Evidence: shared client scope + UI request test;
  inactive own specialist normalizes to clinic scope.
- [x] `clinic_admin` создаёт, переносит и отменяет запись за специалиста своей клиники; cross-org,
  reassignment и hard-delete чужой записи нейтрально запрещены. Evidence: shared create/direct-ID resolvers
  + mutation route tests.
- [ ] Все строки direct-ID read/mutation matrix S4/S5 имеют code evidence и DEV-smoke evidence либо
  трассируемую N/A-причину.
- [x] Production files проходят typecheck/targeted lint; protected test/Stryker paths остаются нетронутыми;
  независимый security audit даёт PASS. Evidence: webapp typecheck + scoped ESLint PASS; audit exact
  `8a7adff4e70c56e7a0df48c8561615581b2807a8` PASS; protected path delta = 0.

## Execution log

- 30.07.2026 → S1/S2 read scope → shared resolver, calendar/KPI/nearest integration, scoped KPI repository
  condition; `pnpm --filter webapp typecheck` PASS; scoped ESLint PASS; unit+route 7/7 PASS; hostile
  specialist-ID fault injection correctly failed unit+route and was restored → SHA фиксируется тем же коммитом.
- 30.07.2026 → S3 scope UI → server bootstrap, staff-only schedule navigation, mine/clinic/specialist controls,
  common calendar/KPI/nearest query and documentation; combined unit/route/UI 12/12 PASS; missing-KPI-scope
  fault injection correctly failed and was restored → SHA фиксируется тем же коммитом.
- 30.07.2026 → S4 direct reads → one organization/specialist resolver before lifecycle/comments/payment;
  combined resolver+route 5/5 PASS; broadened-doctor fault injection failed unit+route and was restored →
  SHA фиксируется тем же коммитом.
- 30.07.2026 → S5 mutations → create target resolved from authenticated role/current-clinic catalog;
  reschedule/cancel use clinic-mode access while delete/no-show/comment/package operations use own-mode
  access; reassignment rejected; foreign hard-delete hidden in schedule/today calendar panels. Combined
  8 files / 24 tests, webapp typecheck and scoped ESLint PASS. Broadening own-mode access produced the
  expected red test before restoration.
- 30.07.2026 → independent audit of `ac7db7975..505a883d0` found two behavior MUST FIX and one exact-scope
  omission: inactive own specialist selected broken `mine`; `null === null` exposed a nonworking hard-delete;
  Today panel hosts were necessary but missing from allowed paths. Corrective branch derives own ID from the
  active directory, requires a non-null own ID for own-only UI actions, adds both hosts to scope and adds two
  named unit oracles. Initial audit remains FAIL until independent re-audit of the correction.
- 30.07.2026 → corrective re-audit exact `8a7adff4e70c56e7a0df48c8561615581b2807a8` PASS: all three MUST FIX
  closed; S1–S5 remain PASS; new authorization/IDOR findings = 0; protected DB/RLS/testcut/Stryker paths = 0.

## Не входит

- отдельный экран расписания;
- подключение `BookingEngineSection`;
- cross-tenant доступ глобального администратора;
- hard-delete чужих записей;
- reassignment записи другому специалисту во время переноса;
- no-show, comments и package/payment mutations чужой записи без отдельного решения владельца;
- изменение тестов, Stryker-артефактов или test-suite документации;
- TEST/PROD deploy и любые PROD-службы.
