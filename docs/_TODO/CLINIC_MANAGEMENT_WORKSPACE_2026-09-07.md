# Рабочее место специалиста и управление клиникой

**Статус:** M1–M4 и M6 реализованы, независимо проверены и по команде владельца 07.09.2026 приземлены в
`feat/doctor-ui-rebuild`; M5 отложен владельцем до появления подтверждённого спроса на работу нескольких
специалистов и не блокирует стартовый solo-запуск.

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

> «Глобально это сейчас не надо реализовывать — давай оставим заглушку, поскольку я не буду на старте запускать
> работу нескольких специалистов; это надо доработать, только если будут запросы».

До возврата реального спроса допустимый временный сценарий clinic calendar — только явное переключение одного
филиала и одного специалиста. Он не реализуется заранее и не выдаётся за одновременную работу команды.

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

Owner/admin с привязанным specialist получает контекстный переход между двумя режимами в основном меню рядом с
пунктом настроек; в шапке отдельного переключателя нет:

- `Работа специалиста` → `/app/doctor/**`;
- `Управление клиникой` → `/app/manage/**`.

Owner/admin без specialist binding сразу открывает разрешённую management-поверхность; клинический режим и
фиктивный переключатель не показываются. Последний разрешённый режим можно помнить как UI preference, но он не
является authority и не расширяет права.

Management mode появляется при доступности clinic-team composition/entitlement и `organization.management`, а
не после появления второй фактической записи специалиста: панель нужна уже для добавления команды.

### 3.3. Навигация management mode

- `Обзор` — имеющиеся организационные показатели и операционные проблемы, без нового слоя аналитики;
- `Записи` — резервная заглушка отложенной многоспециалистной инициативы; на старте не обещает и не имитирует
  общий календарь клиники;
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

### 6.2. Clinic appointments — отложенная инициатива

**Owner defer 07.09.2026:** многоспециалистный календарь не входит в стартовый запуск и не является текущим
blocker. Возврат к инициативе происходит только после фактических запросов клиник на одновременную диспетчерскую
работу нескольких специалистов. До этого management navigation сохраняет только честную заглушку без второго
calendar engine, новых зависимостей и скрытого расширения doctor scope.

Если до полноценного resource-view понадобится промежуточный clinic pilot, допустима только поверхность с
обязательным выбором одного филиала и одного специалиста. Она переиспользует готовые booking domain operations,
appointment modal и server-resolved scope из `#1028`; doctor route не ослабляется, booking engine не копируется.

Исследованная целевая UX-композиция для будущего этапа:

- `День клиники` — время по вертикали, специалисты выбранного филиала отдельными колонками; неработающие в этот
  день специалисты скрываются по умолчанию;
- `Неделя` — один выбранный специалист либо небольшой явно выбранный набор, а не нечитаемое произведение всех
  специалистов на все дни;
- `Лента` — все записи филиала за период с существующими фильтрами и карточкой записи;
- постоянный график редактируется существующим specialist editor; массовое применение шаблона не требует второй
  календарной сетки;
- при появлении полноценного management calendar создание, перенос, отмена и смена специалиста проходят только
  через существующую clinic-admin mutation matrix и повторную server-side проверку tenant/specialist/branch.

Исследованные варианты движка (состояние на 07.09.2026):

1. **FullCalendar Premium Resource/Scheduler** — предпочтительный по объёму переиспользования: текущий проект уже
   использует FullCalendar, а события содержат `specialistId`; resource-timegrid даёт специалистов колонками,
   resource-timeline — строками. Для закрытого коммерческого продукта требуется коммерческая лицензия, возможность
   покупки и сопровождения из РФ проверяется только при появлении спроса.
   Источники: <https://fullcalendar.io/docs/vertical-resource-view>,
   <https://fullcalendar.io/docs/timeline-view>, <https://fullcalendar.io/license>.
2. **DayPilot Lite for React** — основной бесплатный кандидат для будущего spike: Apache 2.0, разрешено
   коммерческое использование, заявлены React/Next.js, resource columns, drag-and-drop и TypeScript. Цена варианта
   — замена слоя отрисовки FullCalendar; до выбора обязательно проверить touch/mobile fallback, DST/timezone,
   пересечения, background availability и перенос между специалистами на нашем event contract.
   Источники: <https://www.daypilot.org/react/>, <https://javascript.daypilot.org/calendar/>.
3. **React Big Calendar** — MIT-кандидат с React 19, resource accessors и drag-and-drop addon. Он также требует
   замены текущего FullCalendar host и повторной сборки presentation/interaction adapter; полноценный resource
   timeline официально не подтверждён, поэтому это запасной, а не основной вариант.
   Источник: <https://github.com/bigcalendar/react-big-calendar>.
4. **TOAST UI Calendar** — MIT и React wrapper, но в проверенной официальной документации не подтверждена нужная
   многоресурсная сетка; не включать в shortlist без нового spike.
   Источник: <https://github.com/nhn/tui.calendar>.
5. **DHTMLX Scheduler** — resource timeline существует, но относится к PRO; GPL/коммерческая модель не даёт
   очевидного преимущества закрытому продукту перед FullCalendar Premium.
   Источник: <https://docs.dhtmlx.com/scheduler/views/timeline/>.

Подтверждённый российский drop-in компонент с React resource-view, подходящей лицензией и доказанной поддержкой
на момент исследования не найден. Это не утверждение об отсутствии такого продукта: при появлении спроса сначала
повторить поиск российских поставщиков и доступных способов оплаты, затем сравнить time-boxed prototypes
FullCalendar Premium и DayPilot Lite на одном и том же существующем event payload.

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

- [x] Зафиксировать единый typed `solo|clinic` resolver по §3.1, включая unconfigured и downgrade state. Evidence: `resolveDoctorWorkspaceComposition`; targeted composition/scope oracle 9/9 PASS.
- [x] Добавить server-resolved `appointments.manage_own` и `availability.manage_own` с `true` default/backfill и
  единым membership write/read path. Evidence: migration `20260907T141500_clinic_membership_clinical_permissions`,
  organization-membership ports/service/repos and workspace mapping in candidate `48a1a13c1`.
- [x] Провести поля через обе SECURITY DEFINER functions, typed mapping, обе function `relationSurfaces` и
  column-level UPDATE declaration по §5. Evidence: migration/declaration audit in
  `CLINIC_MANAGEMENT_WORKSPACE_AUDIT_2026-09-07.md` and generated privilege parity.
- [x] Провести permissions через существующие schedule/appointment guards; UI не является enforcement. Evidence:
  retained composition/scope oracle `3` files / `9` tests PASS on candidate and integrated tree.
- [x] Добавить admin editor этих двух разрешений в карточку участника команды, без custom-role builder. Evidence:
  existing `TeamSection` member editor consumes the two typed membership fields.

### M2. Разделение shell и навигации

- [x] Превратить `/app/manage` из redirect в отдельный management mode с собственным nav registry. Evidence: `managementNavLinks` is rendered by the reused workspace shell; root opens the catalog writer and online booking has its own route.
- [x] Переиспользовать существующий doctor viewport/sidebar/mobile shell chrome и визуальные primitives;
  не создавать визуально эквивалентный shell с нуля.
- [x] Добавить capability-gated mode switch для owner/admin со specialist binding и корректные landing rules для
  management-only пользователя.
- [x] Management mode не докует специалистскую нижнюю панель: `DoctorBottomNav` принадлежит только клиническому
  меню (owner correction 10.09.2026 — «в настройках клиники панель нижнего меню специалиста, такого тут быть не
  должно»). Evidence: `DoctorWorkspaceShell` bottomNav снова `menuKind === 'doctor'`, отменён `bf8fcee15`.
- [x] Ограничить `/app/doctor/**` scope `mine` для всех clinic memberships; clinic/specialist scope разрешать
  только management routes через параметризованный resolver `#1028`.
- [x] Убрать clinic-management links из specialist menu в clinic composition; solo сохраняет единый Settings.

### M3. Перекомпоновка Settings и существующих booking sections

- [x] Собрать solo Settings в целевую структуру §3.1 и скрыть Team. Evidence: solo exposes `Профиль специалиста` beside existing clinic and billing sections; Team stays capability/composition-gated.
  ⚠️ Галочка была преждевременной: после M2/M4 (mode switch только у clinic + Schedule Setup, свёрнутый до
  `Абонементы`) у solo не осталось ни пункта меню «Настройки», ни доступа к booking-секциям §3.1 — `/app/manage`
  редиректит solo обратно в Settings. Закрыто пунктом ниже.
- [x] Вернуть solo единственный вход в настройки без смены режима кабинета (owner correction 10.09.2026:
  «для соло все настройки должны быть в одном месте и без смены режима кабинета… и настройки записи, и клиники
  и приложения»). Evidence: `doctorNavLinks` пункт `settings` под composition-gate `soloSettingsHub`; вкладка
  `?tab=booking` в `/app/settings` монтирует те же booking writers через параметризованный
  `ManagementBookingSections` (basePath = settings), без второго writer; live DEV solo: sidebar «Настройки»,
  вкладки `Кабинет / Онлайн-запись / Профиль специалиста / Тариф и биллинг`, секции
  `Филиалы / Услуги / Специалисты / Публичная форма / Правила записи / Тексты уведомлений` отдают 200.
  Отступление от §3.1: отдельная группа «Услуги и место приёма» не заводится — эти writers живут секциями внутри
  `Онлайн-запись`, как в management mode; `Абонементы` остаются единственным местом в «Расписании».
- [x] Довести solo-настройки до рабочего состояния по живому проходу (owner 10.09.2026 — «для тарифа с одним
  специалистом и режимом соло всё настроить и проверить»). Сделано:
  «Профиль специалиста» у solo открывает сам профиль (ФИО + описание, вариант `solo-profile` того же writer),
  а не каталог со «Добавить специалиста», которого тариф не даёт; секция «Специалисты» убрана из solo
  «Онлайн-запись» как дубль соседней вкладки (`specialistsVisible`); подсказка платежей вела в исчезнувший
  «Расписание → Настройки записи» — теперь в «Онлайн-запись»; «Безопасность команды» → «Безопасность входа»
  (у solo команды нет); «Список клиенты» → «Список клиентов» (родительный падеж из `patientGenPlural`).
  Evidence: живой DEV solo — PATCH профиля 200 и значение читается после перезагрузки, все вкладки и секции
  без console-ошибок и 4xx на desktop и mobile.
- [x] Настройки говорят «организация», а не «клиника» (owner 10.09.2026: «вместо клиники писать организация в
  настройках», для всех composition). Evidence: вкладка «Организация», «Бренд/Название/Страница организации»,
  «Каналы доставки организации», тексты домена, slug, биллинга и предоплаты; пункт management-меню —
  «Настройки организации».
- [x] В management mode подключить существующие Team, branches, services, specialists, public form, rules,
  notifications, payments, integrations, branding и billing components к их новым разделам. Evidence:
  `MANAGEMENT_NAV` + `ManagementBookingSections` reuse existing writers.
- [x] Один компонент/один API path обслуживает одинаковую настройку в solo и clinic composition; не оставлять
  второй writer в Schedule Setup. Evidence: management renders the existing `ScheduleSetupTab`, no copied writer.
- [x] Разместить существующее specialist description по правилам §4. Evidence: solo uses `BookingSoloSpecialistsSection`; clinic management reaches the same entity writer through Team.

### M4. Schedule и packages

- [x] Заменить Schedule Setup на `Абонементы` для owner/admin в solo и clinic composition (owner correction
  09.09.2026); обычный specialist без organization-management authority не получает каталожный writer.
- [x] Для owner/admin календарь содержит `Записи / График работы / Абонементы`; mutation actions зависят от
  organization-management authority и tariff capability.
- [x] Ограничить `availability.manage_own` собственным графиком/исключениями и применением готового шаблона;
  общий template CRUD оставить management authority.
- [x] Переиспользовать один package writer и в management Catalog, и во вкладке календаря «Абонементы», без
  копии package business logic.
- [x] Сохранить полезные старые deep links через redirect/normalization и удалить только мёртвую композицию.

### M5. Management appointments — отложено владельцем 07.09.2026

Отложенность относится ко всему M5: этап не запускать до подтверждённых запросов клиник на работу нескольких
специалистов. Стартовый solo-релиз и candidate M1–M4/M6 от него не зависят.

- [ ] После появления спроса провести ограниченный prototype-spike FullCalendar Premium и DayPilot Lite на
  существующем event contract; отдельно подтвердить покупку/лицензию из РФ.
- [ ] По результату решения владельца реализовать либо полноценную clinic appointment surface по §6.2, либо
  честный временный режим одного филиала и одного специалиста поверх существующего `#1028` scope.
- [ ] Переиспользовать appointment editor/modal и lifecycle operations; не создавать второй mutation flow.
- [ ] Подтвердить server-side own/clinic/cross-org границы для read и mutation.

### M6. Timezone и архитектурная чистота

- [x] Диагностировать и исправить regression существующего `DoctorTimezoneSelect`/его placement по §7, не
  заменяя компонент и timezone dataset.
- [x] Удалить/не допустить дубли timezone options, labels, formatting и styles.
- [x] Проверить doctor/patient UI isolation, Select display labels, shared primitives и отсутствие новых локальных
  page-level containers.
- [x] Обновить только действующую документацию затронутых route/module boundaries. Evidence:
  `apps/webapp/src/app/app/settings/settings.md` and this active plan; no parallel implementation document added.

### M7. Проверки и независимый аудит

- [x] Воркер не создаёт и не изменяет тесты. Он выполняет formatter для своих файлов, webapp typecheck и scoped
  ESLint; существующие targeted tests запускает только если они остаются релевантными и не требуют переписывания.
  Evidence: worker/correction commits and both audit artifacts; UI correction `48a1a13c1` changed no tests.
- [x] Первый `auditor-live` до чтения тестов составляет blind kill-set по §§3–7 и классифицирует каждый пункт как
  `тест или взгляд` по `AGENTS.md` §10a/§10b/§24.4. Evidence:
  `CLINIC_MANAGEMENT_WORKSPACE_AUDIT_2026-09-07.md`.
- [x] Аудитор не пишет UI/markup/count/text/source-shape tests. Допустимы только необходимые unit/route tests для
  дорогих молчаливых permission/tenant/mutation failures, если их не защищает существующий набор. Evidence: UI
  audit explicitly retained no UI/DOM/text assertion.
- [x] Для каждого нового acceptance-test аудитор выполняет один fault injection и записывает
  `поломка → покрасневшее утверждение`; временный product diff откатывает. Evidence: backend audit records three
  red scope assertions and restoration; UI findings were correctly classified as view-only.
- [x] Нетестовые layout/reuse/migration findings проверяются чтением diff, AST/rg и candidate preflight, не
  постоянными тестами. Evidence: both audit artifacts and queue verdicts for `39271e811` / `8fee45039`.
- [x] Оркестратор принимает diff, SHA и evidence, но не выполняет live visual UI проход. Evidence: lead acceptance
  queue verdict for `48a1a13c1`; no live UI run.
- [x] Candidate остаётся в `wt/*` до отчёта оркестратора. В `feat/doctor-ui-rebuild` не land, dev-server не
  переключать и DEV migration не применять до отдельной команды владельца. Evidence: candidate stayed isolated
  through audit/correction and landing began only after the owner's «вливай» command on 07.09.2026.

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

- [x] Solo не видит Team/admin mode и получает целевые Settings и три Schedule tabs. Evidence: UI audit findings
  closed by `48a1a13c1`, lead verdict «убито 2 / непойманных 0».
- [x] Clinic specialist не видит clinic catalog/settings/package templates и работает только со своим
  расписанием; два mutation-permissions enforce read-only сервером и UI. Evidence: retained scope oracle `9/9`
  PASS and accepted UI correction across global/Today/patient-card/encounter creation entries.
- [x] Owner/admin получает отдельный management mode; management-only участник не попадает в doctor UI. Evidence:
  composition-gated management loader/mode switch and accepted route scope oracle.
- [x] Clinic services, branches, specialist profiles, packages, online booking, payments and organization settings
  имеют по одному writer path в management mode. Evidence: accepted `ManagementBookingSections` reuse of existing
  writers; no copied booking/settings engine.
- [x] Specialist description редактируется из одного specialist source в правильном solo/clinic context. Evidence:
  accepted reuse of `BookingSoloSpecialistsSection` in solo and management contexts.
- [x] Doctor routes в clinic composition всегда ограничены own scope; management authority не достижима через
  прямой doctor URL. Evidence: independently fault-injected route/scope oracle, `9/9` PASS after correction and on
  the integrated tree.
- [x] Branch timezone picker восстанавливает поиск по offset, UTC hint и русские города без второй реализации.
  Evidence: audit confirmed the shared picker/data path; candidate changes only doctor-control geometry.
- [x] Worker checks и независимый audit завершены; audit findings исправлены тем же candidate workstream. Evidence:
  audit commits `39271e811` / `8fee45039`, accepted correction `48a1a13c1`, integrated typecheck and `9/9` oracle.
- [x] Candidate закоммичен в `wt/*`, не приземлён и не подвергался живой визуальной приёмке агентом. Evidence:
  candidate `48a1a13c1` remained isolated until the owner's 07.09.2026 landing command; no agent live walkthrough.
- [x] M5 явно остаётся незавершённым owner-deferred этапом и не подменён другим календарём. Evidence: §6.2 and
  M5 remain open; no package dependency or management appointment implementation was added.

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
