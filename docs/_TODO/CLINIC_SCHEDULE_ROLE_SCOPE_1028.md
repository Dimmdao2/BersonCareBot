# #1028 — расписание врача и клиники: ролевой scope

**Статус:** согласовано владельцем 30.07.2026; реализация не начата.

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
  `canManageAllSpecialists`, собственный `specialistId` и список `{id, displayLabel}` действующих специалистов
  текущей организации. Источник — существующий server-resolved doctor context/doctor-workspace service, не
  доверенный клиентский список и не мёртвый HTTP directory endpoint.
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
- `apps/webapp/src/app/app/doctor/calendar/DoctorCalendarEventPanel.tsx`;
- `apps/webapp/src/app/api/doctor/schedule*/**`;
- `apps/webapp/src/app/api/doctor/booking-engine/_requireDoctorBookingEngine.ts` и новый/существующий соседний
  typed scope resolver;
- `apps/webapp/src/app/api/doctor/booking-engine/calendar/**`;
- `apps/webapp/src/app/api/doctor/booking-engine/appointments/**`;
- `apps/webapp/src/modules/booking-calendar/**`, `apps/webapp/src/modules/booking-appointment-lifecycle/**` и
  их существующие repo/port callsites, только насколько нужно провести один scope;
- `apps/webapp/src/modules/doctor-appointments/ports.ts` и
  `apps/webapp/src/infra/repos/pgDoctorCanonicalAppointments.ts`, только для применения того же scope к KPI;
- `docs/ARCHITECTURE/DOCTOR_CABINET_NAVIGATION.md`,
  `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/ROLE_CAPABILITY_MATRIX.md` и этот план.

Любой дополнительный production-path сначала добавляется сюда с доказанной необходимостью. Tests, Stryker,
миграции, env/deploy/server scripts и другие UI-разделы запрещены.

## Чек-лист исполнения

### S1. Единый серверный scope

- [ ] Ввести или переиспользовать один typed resolver ролевого schedule scope: doctor-self и
  clinic-admin `mine|clinic|specialist`.
- [ ] Валидировать выбранного специалиста по текущей организации и fail closed для отсутствующего,
  деактивированного или чужого ID.
- [ ] Не создавать параллельную модель ролей: использовать существующие `specialistId`,
  `canManageOrganization`/`canManageAllSpecialists` и organization context.
- [ ] Зафиксировать typed wire schema `scope + specialistId`, SSR capability bootstrap и resolved-scope response;
  calendar/KPI/nearest-window/create используют один контракт.

### S2. Calendar, filters и KPI

- [ ] Calendar API принудительно ограничивает обычного врача его собственным `specialistId`.
- [ ] Calendar API поддерживает для `clinic_admin` `Моё`, `Вся клиника` и выбранного специалиста.
- [ ] Доступные значения specialist-filter формируются только из специалистов текущей клиники.
- [ ] KPI принимает и применяет тот же resolved scope, что календарь.
- [ ] Остальные calendar filter metadata/counts не показывают данные вне resolved scope.
- [ ] `GET /api/doctor/schedule/nearest-free-window` использует тот же resolver: doctor-self,
  clinic-admin mine/clinic/specialist; клиентский `specialistId` сам по себе доступ не расширяет.

### S3. UI существующего расписания

- [ ] На `/app/doctor/schedule` для `clinic_admin` добавить понятный переключатель `Моё / Вся клиника`.
- [ ] В режиме клиники дать выбор конкретного специалиста; обычному врачу эти controls не показывать.
- [ ] Смена scope синхронно обновляет календарь, KPI и фильтры без второго экрана и без подключения
  `BookingEngineSection`.
- [ ] В форме создания `clinic_admin` может выбрать специалиста только из текущей клиники; у врача специалист
  фиксирован сервером и UI.
- [ ] Deep-link registry и fetch query передают `scope/specialist` одинаково в calendar, KPI,
  nearest-free-window и create UI; недействительный deep link нормализуется server-side.

### S4. Direct-ID read matrix

- [ ] `GET appointments/[id]/lifecycle`: doctor-own; `clinic_admin` — appointment текущей клиники; чужая
  организация получает neutral denial.
- [ ] `GET appointments/[id]/comments`: doctor-own; `clinic_admin` — appointment текущей клиники; чужая
  организация получает neutral denial.
- [ ] `GET appointments/[id]/payment`: doctor-own; `clinic_admin` — appointment текущей клиники; чужая
  организация получает neutral denial.
- [ ] Event/detail fetch UI не обходит эту матрицу другим прямым ID endpoint.

### S5. Direct-ID mutation matrix

- [ ] `POST appointments/manual` и `POST appointments/manual-patient-visit`: врач создаёт только за себя;
  `clinic_admin` — за валидированного специалиста текущей клиники.
- [ ] `POST appointments/[id]/manual-reschedule`: врач — только своей записи; `clinic_admin` — записи
  специалиста текущей клиники; назначенный specialist сохраняется, reassignment запрещён.
- [ ] `POST appointments/[id]/manual-cancel`: врач — только своей записи; `clinic_admin` — записи специалиста
  текущей клиники.
- [ ] `POST appointments/[id]/delete`: hard-delete чужой записи запрещён и обычному врачу, и `clinic_admin`;
  UI не предлагает его для чужой записи.
- [ ] `POST appointments/[id]/manual-no-show`: чужая запись запрещена обеим ролям до отдельного owner ruling.
- [ ] `POST appointments/[id]/comments`: изменение чужой записи запрещено обеим ролям до отдельного owner ruling.
- [ ] `POST appointments/[id]/package/detach`, `refund`, `unlink`: изменение чужой записи запрещено обеим ролям
  до отдельного owner ruling.
- [ ] Отказы не раскрывают существование appointment/специалиста другой клиники сверх действующего safe-error
  контракта.

### S6. Документация и доказательство

- [ ] Безусловно обновить `ROLE_CAPABILITY_MATRIX.md`: owner ruling 30.07.2026 заменяет future/deferred
  another-specialist appointment row для `clinic_admin`; обычному врачу расширение не даётся.
- [ ] Обновить `DOCTOR_CABINET_NAVIGATION.md` новым контрактом одного schedule screen и role scope.
- [ ] Выполнить typecheck и targeted lint по изменённым production-файлам.
- [ ] Выполнить DEV-smoke существующими `dev:doctor` и `dev:clinic-admin`: self/all/specialist, KPI parity,
  nearest-free-window, create/reschedule/cancel и каждый direct-ID allow/deny из S4/S5.
- [ ] Тестовые и Stryker-файлы не менять и тестовые suites не запускать: тестовый контур переделывается
  соседней работой по прямому указанию владельца.
- [ ] Независимый аудит сверяет каждый пункт этого плана и server-side IDOR, после чего фиксируются commit SHA
  и фактически выполненные команды.

## Definition of Done

- [ ] Обычный врач не может прочитать или изменить appointment другого специалиста ни списком, ни прямым ID.
- [ ] `clinic_admin` на одном экране использует `Моё / Вся клиника / специалист`, а calendar, KPI, filters и
  nearest-free-window показывают один resolved scope.
- [ ] `clinic_admin` создаёт, переносит и отменяет запись за специалиста своей клиники; cross-org,
  reassignment и hard-delete чужой записи нейтрально запрещены.
- [ ] Все строки direct-ID read/mutation matrix S4/S5 имеют code evidence и DEV-smoke evidence либо
  трассируемую N/A-причину.
- [ ] Production files проходят typecheck/targeted lint; protected test/Stryker paths остаются нетронутыми;
  независимый security audit даёт PASS.

## Execution log

Пока пусто: реализация не начата. В процессе сюда добавляются только короткие строки
`дата → пункт → code/runtime evidence → SHA`, без дублирования taskdb-карточки.

## Не входит

- отдельный экран расписания;
- подключение `BookingEngineSection`;
- cross-tenant доступ глобального администратора;
- hard-delete чужих записей;
- reassignment записи другому специалисту во время переноса;
- no-show, comments и package/payment mutations чужой записи без отдельного решения владельца;
- изменение тестов, Stryker-артефактов или test-suite документации;
- TEST/PROD deploy и любые PROD-службы.
