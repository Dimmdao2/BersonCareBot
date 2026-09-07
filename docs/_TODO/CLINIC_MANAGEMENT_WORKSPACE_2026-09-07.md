# Рабочее место специалиста и управление клиникой

**Статус:** независимый архитектурный аудит выполнен; обязательные корректировки внесены. К реализации допущены
M1–M4 и M6. M5 выделен в отдельный owner-blocked этап из-за отсутствия лицензированного resource-view.

**Карточка:** `#1099`.

**Дата решения владельца:** 07.09.2026.

## 1. Текущее решение владельца

Новые решения ниже заменяют несовместимые прежние продуктовые решения о размещении настроек. Технические
ограничения репозитория, безопасность, tenant scope и правила архитектуры остаются обязательными.

> «В расписании оставить три вкладки: записи, график работы и абонементы».

> «Если есть несколько специалистов, то появляется панель администратора и настройки филиалов и услуг
> переезжают только к администратору».

> «Панель администратора должна появляться только у владельца клиники дополнительно».

> «Не так, что она усложняет интерфейс текущий доктор, а именно переключение между панелью администратора и
> панелью специалиста».

> «До приёмки пока не приземляй. Когда сделаешь работу, визуальный проход по интерфейсу самостоятельно не
> делай».

Дополнение владельца о процессе:

- план пишется в `feat/doctor-ui-rebuild`, проходит отдельный аудит и только после этого запускается реализация;
- реализация выполняется Codex-воркером в одном отдельном clone/worktree и ветке `wt/*`;
- воркер не пишет тесты;
- аудитор формирует blind kill-set и пишет только необходимые поведенческие acceptance-тесты;
- запрещены тесты текста/формы исходника, числа кнопок, вкладок, таблиц, UI-текстов, расположения и DOM;
- UI до owner-приёмки не проверяется живым визуальным проходом и candidate не приземляется в `feat`.

## 2. Проверенная основа, которую не строим заново

- `organization.management` и `clinical.workspace` уже независимы и могут принадлежать одному membership.
- `/app/manage` уже существует, защищён management-контекстом и сейчас только перенаправляет в Settings.
- План `docs/_TODO/CLINIC_SCHEDULE_ROLE_SCOPE_1028.md` уже реализовал единый server-resolved scope
  `mine|clinic|specialist`, ограничение врача своим специалистом и разрешённые clinic-admin операции.
- `be_specialists.description` и административный editor профиля специалиста уже существуют.
- Компоненты филиалов, услуг, специалистов, публичной формы, правил, уведомлений, оплат и абонементов уже
  существуют; задача меняет композицию и authority, а не создаёт второй booking/settings engine.
- Doctor UI строится только из существующих `DoctorWorkspaceShell`/viewport, `DoctorAppShell`,
  `DoctorPageHeader`, `DoctorMobileSectionTabs`, `DoctorSection`, doctor primitives и канонических layout-
  констант. Новый визуальный контейнер допустим только при доказанном отсутствии подходящего существующего.

## 3. Целевая продуктовая модель

### 3.1. Solo

`solo|clinic` вычисляется одним typed composition resolver поверх существующих clinic-team entitlement и seat
status, а не подсчётом строк специалистов:

- `clinic`, если team-механика доступна, effective seat limit больше одного либо сохранены активные/ожидающие
  team memberships/invites после downgrade;
- `solo`, только если team-механика недоступна, configured effective limit не больше одного и сохранённой команды
  нет;
- для legacy/unconfigured seat limit действует консервативная совместимость: существующая команда сохраняет
  management mode, организация без команды остаётся solo;
- downgrade не удаляет memberships и не прячет управление сохранённой командой: добавление новых мест блокирует
  entitlement, а управление/вывод участников остаются доступны.

У solo нет отдельного режима администратора и нет раздела «Команда».

Рабочее место специалиста сохраняет текущую клиническую навигацию. В «Расписании» доступны:

- `Записи`;
- `График работы`;
- `Абонементы`.

Основные настройки solo группируются как:

- `Клиника` — организация, бренд, публичная карточка, домен;
- `Профиль специалиста` — имя, фото при наличии поддержанного media path, профессиональное описание;
- `Услуги и место приёма` — услуги, филиалы/места, назначения;
- `Онлайн-запись` — публикация, форма, правила, горизонт, отмена/перенос, предоплата, уведомления;
- `Рабочее пространство` — состав кабинета и личные рабочие предпочтения;
- `Каналы и интеграции`;
- `Тариф и оплата`.

Личный `/app/account` не становится владельцем публичного профессионального описания: он остаётся областью
идентичности, безопасности, личных уведомлений и PWA.

### 3.2. Клиника

Обычный специалист работает только в клиническом режиме. Его расписание содержит `Записи` и `График работы`;
каталог абонементов, услуг и филиалов отсутствует.

В clinic composition весь `/app/doctor/**`, включая owner/admin со specialist binding, всегда разрешает только
scope `mine`. Параметры `clinic` и `specialist` существующего resolver из `#1028` доступны только management-
маршрутам. Не создавать второй resolver: один и тот же существующий scope engine параметризуется режимом, чтобы
прямой doctor URL не превращался в обход management boundary.

Owner/admin с привязанным specialist получает переключатель двух режимов рядом с account/organization chrome:

- `Работа специалиста` → `/app/doctor/**`;
- `Управление клиникой` → `/app/manage/**`.

Owner/admin без specialist binding сразу открывает разрешённую management-поверхность; клинический режим и
фиктивный переключатель не показываются. Последний разрешённый режим можно помнить как UI preference, но он не
является authority и не расширяет права.

Management mode появляется при доступности clinic-team composition/entitlement и `organization.management`, а
не после появления второй фактической записи специалиста: панель нужна уже для добавления команды.

### 3.3. Навигация management mode

- `Обзор` — имеющиеся организационные показатели и операционные проблемы, без нового слоя аналитики;
- `Записи` — общий многоспециалистный календарь клиники;
- `Команда` — memberships, приглашения, роли, разрешения и specialist profiles;
- `Каталог` — услуги, филиалы/места, кабинеты и шаблоны абонементов;
- `Онлайн-запись` — публичная форма, общие правила, доступные специалисты/услуги/места, уведомления и платежная
  политика;
- `Аналитика` — только уже существующие применимые clinic-wide данные;
- `Настройки клиники` — бренд, публичная карточка, домен, каналы, интеграции и composition;
- `Тариф` — subscription/billing; необратимые owner-действия остаются owner-only.

Не создавать пустые placeholder-разделы. Если для пункта нет работающей текущей поверхности, он не появляется
до своего реализованного этапа.

## 4. Authority профиля специалиста

Единственный источник публичного профиля — существующая specialist entity текущей организации.

- Solo редактирует его в `Настройки → Профиль специалиста`.
- В клинике owner/admin редактирует его в `Управление клиникой → Команда → специалист → Публичный профиль`.
- В первой версии обычный специалист клиники не редактирует публичное описание сам.
- Не создавать второй профиль, копию description или синхронизацию между account и specialist.

Карточка специалиста объединяет публичные свойства и назначения, но не смешивает их с правами пользователя:

- профиль: имя, описание, фото/специализация при наличии существующего поддержанного хранения;
- назначения: услуги и филиалы;
- публикация: доступен ли специалист для онлайн-записи;
- доступ: отдельные membership permissions ниже.

## 5. Минимальная модель разрешений

Для клинического membership вводятся два независимых устойчивых разрешения:

- `appointments.manage_own` — управлять scheduling/lifecycle собственных записей;
- `availability.manage_own` — создавать и изменять собственный график/отсутствия.

`clinical.workspace` с active specialist binding продолжает давать чтение собственного расписания. Отсутствие
mutation-permission переводит соответствующую поверхность в read-only: UI скрывает/отключает действия, а прямой
HTTP-вызов получает серверный отказ до side effect.

Матрица `appointments.manage_own` обязательна и одинакова для UI и route/service guards:

| Действие в specialist mode | Требуемое право | Поведение без права |
| --- | --- | --- |
| Создать собственную запись | `appointments.manage_own` | серверный отказ, действие отсутствует в UI |
| Перенести или отменить собственную запись | `appointments.manage_own` | серверный отказ, действие отсутствует в UI |
| Удалить или отметить неявку, если действие уже разрешено текущей lifecycle-policy | `appointments.manage_own` плюс существующая lifecycle-policy | серверный отказ, действие отсутствует в UI |
| Читать собственную запись | `clinical.workspace` и own scope | остаётся доступно |
| Клинический комментарий | существующая clinical/appointment authority, не scheduling permission | не блокируется этим флагом |
| Платёж, refund или отвязка/списание абонемента | существующая financial/package authority и mechanics, не scheduling permission | не блокируется этим флагом |

В management mode создание, перенос и отмена записей специалистов используют существующую clinic-admin mutation
matrix из `#1028`; прочие lifecycle, clinical и financial действия не расширяются этой работой. Новые финансовые
или клинические permission-флаги не вводятся.

`availability.manage_own` разрешает специалисту менять собственные часы, исключения и применять к себе
организационный шаблон. Создание, изменение и удаление общих шаблонов графика — только management authority.

Для обратной совместимости обе колонки имеют default/backfill `true`: это сохраняет поведение существующих active
memberships с specialist binding, solo-владельцев и новых owner/admin/doctor memberships со specialist binding.
У непривязанного membership флаги не дают clinical capability. Отключение администратором записывает `false`;
downgrade, смена роли и временное выключение doctor screens значения не стирают.

Не вводить per-specialist разрешения на изменение услуг, филиалов, шаблонов абонементов, clinic-wide онлайн-
записи, эквайринга или тарифа. Это management authority.

Отдельно не путать права и конфигурацию:

- `onlineBookingEnabled` специалиста — свойство его публичного предложения;
- service/location assignments — связи каталога;
- предоплата — правило клиники с допустимым переопределением на уровне услуги, но не специалиста в этой работе;
- возможность продать/применить уже созданный абонемент — операционное действие, а не право менять его шаблон.

Новая capability projection расширяет существующий server-resolved membership context. Ролевые проверки не
размазываются по компонентам и маршрутам. До добавления новой функции/guard обязательно проверить, можно ли
параметризовать существующие `resolveLaunchCapabilities`, schedule scope и appointment access resolver —
`AGENTS.md` §5 «Один общий проход».

Хранение разрешений выполняется минимальной typed Drizzle-моделью в `be_organization_members` с organization
ownership через membership и timestamp forward migration. В одном изменении провести новые поля через:

- оба SECURITY DEFINER read seam: `app.resolve_staff_workspace_memberships(uuid)` и
  `app.list_platform_organization_members(uuid)`;
- typed rows/maps/ports в `pgOrganizationMembership.ts`;
- обе `relationSurfaces` соответствующих функций в privilege declaration;
- column-level `UPDATE` declaration `public.be_organization_members` для существующего staff write path;
- declaration/reconcile фактической DB-функции и её return shape.

Миграция не содержит GRANT/REVOKE/POLICY. До landing требуется owner-aware rollback-only candidate preflight;
apply на DEV до отдельной команды владельца запрещён.

## 6. Расписание и абонементы

### 6.1. Specialist schedule

- Solo: `Записи / График работы / Абонементы`.
- Specialist клиники: `Записи / График работы`.
- `Настройки` удаляются из Schedule после появления всех новых владельцев этих секций.
- Существующие deep links получают явные redirects только там, где сохранение старой ссылки полезно; второй
  активный Settings UI не остаётся.

### 6.2. Clinic appointments

Management appointments используют готовые booking domain operations, appointment modal и server-resolved
scope из `#1028`, но получают отдельное представление для одновременной работы с несколькими специалистами и
филиалами. Не ослаблять doctor route до общего календаря и не копировать booking engine.

Минимально работающая management-поверхность:

- обязательный фильтр/контекст филиала;
- одновременная видимость специалистов выбранного филиала;
- день/неделя с различимыми specialist resources;
- создание записи за выбранного специалиста;
- перенос и отмена в пределах уже разрешённой clinic-admin mutation matrix;
- отсутствие cross-organization IDs в metadata и mutation payload authority.

Текущий dependency set не содержит FullCalendar Premium resource-timegrid, необходимый для честных колонок
специалистов. Стандартные plugins не дают эквивалентной многоресурсной сетки, а package dependency additions и
самописная псевдосетка этой работой запрещены. Поэтому M5 не входит в текущий candidate: он остаётся отдельным
owner-blocked этапом до выбора лицензии/зависимости либо явного изменения требования. Воркер M1–M4/M6 не создаёт
компромиссный clinic calendar и не ослабляет doctor route как временный обход.

### 6.3. Packages

- Solo сохраняет настройку шаблонов абонементов третьей вкладкой Schedule.
- В клинике шаблоны живут в `Управление клиникой → Каталог → Абонементы`.
- Проданный пациенту экземпляр, остаток и списание показываются в существующих appointment/patient flows; эта
  работа не создаёт параллельную продажу.

## 7. Часовой пояс филиала

Текущий `DoctorTimezoneSelect.tsx` уже происходит от согласованной реализации `23e4ed4e7`: использует
`react-timezone-select`, поддерживает поиск, UTC display и общие русские labels; create/edit филиала уже вызывает
этот компонент. Поэтому воркер не «восстанавливает picker» целиком и не создаёт новые данные. Его задача — найти и
исправить конкретную visual/integration regression существующего общего компонента и его размещения.

Требуемое поведение:

- один общий staff-компонент выбора timezone для всех подходящих staff-поверхностей;
- поиск по числовому UTC-смещению;
- понятная подсказка/подпись UTC offset;
- русские подписи российских городов, включая ранее согласованный набор;
- сохранение валидного IANA ID, а не числового offset;
- использование в create/edit филиала без локального дублирования стилей и данных;
- геометрия doctor controls и mobile modal соответствует действующим doctor primitives.

Точки истории, которые обязательно сравнить: `f1b10a00e`, `530774f9c`, `23e4ed4e7`, текущие
`patientTimezoneSelectLabels.ts`, `DoctorTimezoneSelect.tsx` и
`BookingSoloLocationsSection.tsx`. UI-тест существующей формы не является authority; oracle — это owner-
описание выше и фактическое прежнее поведение компонента.

## 8. Этапы реализации

### M1. Composition и capability projection

- [ ] Зафиксировать единый typed `solo|clinic` resolver по §3.1, включая unconfigured и downgrade state.
- [ ] Добавить server-resolved `appointments.manage_own` и `availability.manage_own` с `true` default/backfill и
  единым membership write/read path.
- [ ] Провести поля через обе SECURITY DEFINER functions, typed mapping, обе function `relationSurfaces` и
  column-level UPDATE declaration по §5.
- [ ] Провести permissions через существующие schedule/appointment guards; UI не является enforcement.
- [ ] Добавить admin editor этих двух разрешений в карточку участника команды, без custom-role builder.

### M2. Разделение shell и навигации

- [ ] Превратить `/app/manage` из redirect в отдельный management mode с собственным nav registry.
- [ ] Переиспользовать существующий doctor viewport/sidebar/mobile shell chrome и визуальные primitives;
  не создавать визуально эквивалентный shell с нуля.
- [ ] Добавить capability-gated mode switch для owner/admin со specialist binding и корректные landing rules для
  management-only пользователя.
- [ ] Ограничить `/app/doctor/**` scope `mine` для всех clinic memberships; clinic/specialist scope разрешать
  только management routes через параметризованный resolver `#1028`.
- [ ] Убрать clinic-management links из specialist menu в clinic composition; solo сохраняет единый Settings.

### M3. Перекомпоновка Settings и существующих booking sections

- [ ] Собрать solo Settings в целевую структуру §3.1 и скрыть Team.
- [ ] В management mode подключить существующие Team, branches, services, specialists, public form, rules,
  notifications, payments, integrations, branding и billing components к их новым разделам.
- [ ] Один компонент/один API path обслуживает одинаковую настройку в solo и clinic composition; не оставлять
  второй writer в Schedule Setup.
- [ ] Разместить существующее specialist description по правилам §4.

### M4. Schedule и packages

- [ ] Заменить Schedule Setup на `Абонементы` для solo.
- [ ] Для clinic specialist оставить `Записи / График работы`; mutation actions зависят от M1 capabilities.
- [ ] Ограничить `availability.manage_own` собственным графиком/исключениями и применением готового шаблона;
  общий template CRUD оставить management authority.
- [ ] Перенести clinic package-template management в management Catalog без копии package business logic.
- [ ] Сохранить полезные старые deep links через redirect/normalization и удалить только мёртвую композицию.

### M5. Management appointments — отдельный owner-blocked этап

- [ ] Получить решение владельца: лицензировать FullCalendar Premium resource-timegrid либо изменить требование к
  представлению. До решения этап не запускать.
- [ ] После решения реализовать общую clinic appointment surface по §6.2 поверх существующего `#1028` scope.
- [ ] Переиспользовать appointment editor/modal и lifecycle operations; не создавать второй mutation flow.
- [ ] Подтвердить server-side own/clinic/cross-org границы для read и mutation.

### M6. Timezone и архитектурная чистота

- [ ] Диагностировать и исправить regression существующего `DoctorTimezoneSelect`/его placement по §7, не
  заменяя компонент и timezone dataset.
- [ ] Удалить/не допустить дубли timezone options, labels, formatting и styles.
- [ ] Проверить doctor/patient UI isolation, Select display labels, shared primitives и отсутствие новых локальных
  page-level containers.
- [ ] Обновить только действующую документацию затронутых route/module boundaries.

### M7. Проверки и независимый аудит

- [ ] Воркер не создаёт и не изменяет тесты. Он выполняет formatter для своих файлов, webapp typecheck и scoped
  ESLint; существующие targeted tests запускает только если они остаются релевантными и не требуют переписывания.
- [ ] Первый `auditor-live` до чтения тестов составляет blind kill-set по §§3–7 и классифицирует каждый пункт как
  `тест или взгляд` по `AGENTS.md` §10a/§10b/§24.4.
- [ ] Аудитор не пишет UI/markup/count/text/source-shape tests. Допустимы только необходимые unit/route tests для
  дорогих молчаливых permission/tenant/mutation failures, если их не защищает существующий набор.
- [ ] Для каждого нового acceptance-test аудитор выполняет один fault injection и записывает
  `поломка → покрасневшее утверждение`; временный product diff откатывает.
- [ ] Нетестовые layout/reuse/migration findings проверяются чтением diff, AST/rg и candidate preflight, не
  постоянными тестами.
- [ ] Оркестратор принимает diff, SHA и evidence, но не выполняет live visual UI проход.
- [ ] Candidate остаётся в `wt/*` до отчёта оркестратора. В `feat/doctor-ui-rebuild` не land, dev-server не
  переключать и DEV migration не применять до отдельной команды владельца.

## 9. File scope реализации

Разрешены только необходимые изменения в:

- `apps/webapp/src/app/app/manage/**`;
- `apps/webapp/src/app/app/settings/**`;
- `apps/webapp/src/app/app/doctor/schedule/**`;
- `apps/webapp/src/shared/ui/doctor/**` и doctor shell/nav registries;
- `apps/webapp/src/app-layer/guards/**`, только существующий membership/capability/schedule access path;
- `apps/webapp/src/modules/organization-membership/**`, `doctor-workspace/**`, `doctor-schedule/**`,
  `booking-engine/**` только для подтверждённых contracts;
- соответствующие thin API routes, ports, Drizzle repos/DI;
- `apps/webapp/src/infra/repos/pgOrganizationMembership.ts`, обе связанные SECURITY DEFINER functions и их
  declaration/reconcile surfaces;
- `apps/webapp/db/schema/bookingEngine.ts`, одна timestamp forward migration и
  `deploy/postgres/privileges/declaration.ts` для persistent membership columns M1;
- точечная действующая документация затронутых модулей и этот план;
- acceptance-тесты только аудитору и только по M7.

Запрещены patient UI, глобальный platform-admin, integrator, PROD/TEST/deploy, package dependency additions, M5
до owner-решения, параллельная role model, новая booking entity и любые unrelated fixes. Реальная найденная
проблема вне scope выносится владельцу и не чинится.

## 10. Definition of Done текущего candidate до landing

- [ ] Solo не видит Team/admin mode и получает целевые Settings и три Schedule tabs.
- [ ] Clinic specialist не видит clinic catalog/settings/package templates и работает только со своим
  расписанием; два mutation-permissions enforce read-only сервером и UI.
- [ ] Owner/admin получает отдельный management mode; management-only участник не попадает в doctor UI.
- [ ] Clinic services, branches, specialist profiles, packages, online booking, payments and organization settings
  имеют по одному writer path в management mode.
- [ ] Specialist description редактируется из одного specialist source в правильном solo/clinic context.
- [ ] Doctor routes в clinic composition всегда ограничены own scope; management authority не достижима через
  прямой doctor URL.
- [ ] Branch timezone picker восстанавливает поиск по offset, UTC hint и русские города без второй реализации.
- [ ] Worker checks и независимый audit завершены; audit findings исправлены тем же candidate workstream.
- [ ] Candidate закоммичен в `wt/*`, не приземлён и не подвергался живой визуальной приёмке агентом.
- [ ] M5 явно остаётся незавершённым owner-blocked этапом и не подменён другим календарём.

## 11. Landing и owner walkthrough

После завершения code/audit candidate оркестратор передаёт SHA, evidence, известный blocker M5 и маршрут
проверки. Только по отдельной команде владельца candidate приземляется через `tools/orch-launch.sh land` в
`feat/doctor-ui-rebuild`; применяются разрешённые интеграционные шаги и DEV migration, после чего владелец сам
проходит UI на DEV.

Маршрут owner-проверки:

- solo Settings и три вкладки Schedule;
- clinic specialist с разрешёнными и запрещёнными appointment/availability actions;
- mode switch owner-specialist и прямой management landing администратора без specialist binding;
- Team → specialist profile/description/assignments;
- Catalog → branches/services/packages;
- Online booking/payment sections;
- create/edit branch timezone: поиск по `+3`, `+5`, русскому городу и сохранение IANA.

Общий clinic appointments calendar добавляется в маршрут только после отдельного выполнения M5. Push
`feat/doctor-ui-rebuild` также выполняется только по явной команде владельца.
