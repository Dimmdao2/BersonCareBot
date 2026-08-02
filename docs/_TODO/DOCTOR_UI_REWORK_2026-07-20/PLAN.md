# Doctor UI Rework — детальный execution artifact (2026-07-20)

> RE-VERIFIED 2026-07-23 (all [x] audited vs code; visual-acceptance items -> [~] pending owner): see docs/\_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/PRODUCTION_READINESS_LEDGER_2026-07-23.md

> **Статус:** docs-only детализация существующего
> [`IMPLEMENTATION_ROADMAP.md`](../SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md), не второй roadmap и не
> источник статусов. Продуктовая authority — датированное дополнение в
> [`OWNER_REVIEW_2026-07-18.md`](../SAAS_PRODUCT_UX_INITIATIVE/OWNER_REVIEW_2026-07-18.md). Taskdb хранит только
> состояние и ссылки. До запуска оркестратор повторно сверяет HEAD, taskdb и занятые file scopes.
>
> **Provenance:** исходный owner-dump подготовлен в ветке `plan/doctor-ui-rework-2026-07-20`, итоговый planning
> commit `f48f35a56`. Этот канонический вариант сохранён поверх актуального roadmap/LOG и repo safeguards, а не
> влит wholesale со старой базы ветки.

## 0. Режим исполнения

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- Presentation/layout/text/mechanical: один цельный worker и один независимый audit, без серийных correction-аудитов.
- Identity, tenant isolation, schema/data migration, entitlements и деньги: полный risk-sized цикл roadmap §7.2.
- Не более трёх независимых workers; full CI, lint/build и единственный живой DEV `:5200` сериализуются.
- Любой TEST deploy — отдельное действие только после прямого разрешения владельца. Этот план его не разрешает.
- Finding без строки в owner review/roadmap — вопрос владельцу, не новая задача.

## 1. Решения и открытые развилки

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

| Gate                           | Зафиксированное состояние                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Safe default / зависимость                                                                 |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| G1 — индивидуальные упражнения | **решено: ДА**, `#564` разблокирована                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | сначала C4D exact-org library isolation; это hard dependency, не owner gate                |
| G2 — voice/STT                 | **решено: post-production**, taskdb `#922`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | сейчас не трогать                                                                          |
| G3 — тумблеры механик          | **решено: только organization/clinic**, не специалист                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | строить на существующем S4 engine `#888`, не форкать                                       |
| G4 — split коммуникаций        | **решено: 45/55**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | согласованный fallback: 50/50                                                              |
| G5 — онлайн-приём              | **решено:** online уже существует; нужна только встроенная включаемая локация «Онлайн»                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | её toggle гейтит существующие online-галочки услуг; новой схемы не вводить                 |
| G6 — общий Doctor UI chrome    | **SUPERSEDED частично 2026-07-22:** белый/inherited workspace background из прежней correction. Latest authority `UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` §2 + Design DNA v1.0: doctor canvas = `#F6F4EF`; белая page header, primary `#406ca7`, радиусы blocks/KPI/controls `12/8/24px`, padding `18px`, белый input и KPI label сверху/value снизу сохраняются. 24px не применяется к sidebar/mobile menu rows: меню почти прямоугольное с минимальным radius; section tabs имеют отдельную округлённую форму. Flat lists используют геометрию «На сопровождении», full-row hover и divider `#f0efeb`. | latest shared-primitives residual `#967`; doctor workspace only, без локального style fork |
| SCH-G5 — fallback слотов       | **owner question `#848`**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | не менять строгую/резервную семантику без ответа                                           |

Отдельное точное решение по `#191`: разминки по умолчанию в `12:00` и `15:00` в рабочие дни; существующих клиентов
не менять. Это снимает вопрос о времени, но не добавляет UI-8 в текущий launch scope.

## 2. Stage map и границы

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

### UI-0 — P0: воронка записи клиента

Это первый исполнимый UI-этап. На DEV воспроизвести, трассировать и исправить четыре подтверждённых симптома:

1. SSR/render failure после выбора услуги;
2. неверную видимость услуги относительно выбранной локации;
3. создание записи из календаря без появления клиента в organization-owned client projection;
4. ФИО в существующей детали записи не ведёт в существующую карточку клиента.

Приоритет P0 относится к пользовательской воронке и этим симптомам. **Не доказаны** единая первопричина, дефект
canonical service `OR` или связь всех симптомов с `#801`; worker сначала трассирует текущие write/read paths и
исправляет только доказанную причину каждого симптома.

Проверка ограничена request/state trace, существующими тестами и безопасными DEV fixtures. TEST journal, TEST DB и
любой remote TEST-host доступ не входят в scope без отдельного разрешения. **Owner ruling 2026-07-20 заменяет
временный safe default `location assignment OR specialist assignment`:** если пациент уже выбрал специалиста,
видны только включённые у этого специалиста услуги; при записи в клинику без выбранного специалиста видны только
услуги, назначенные хотя бы одному специалисту этой организации; в solo-режиме видны только включённые услуги
текущего специалиста. Одна привязка услуги к месту приёма не делает её доступной для записи. Ручной пациент,
appointment и walk-in остаются в существующей `#801`/U3B — здесь не создаётся второй механизм. Кликабельное ФИО
использует подтверждённый текущий route contract и остаётся низкорисковым presentation-пунктом внутри цельного
UI-0 acceptance.

До перевода UI-0 в `doing` оркестратор выполняет taskdb dedup и привязывает service-render/service-location часть к
точной существующей карточке либо создаёт одну цельную UI-0 карту через taskdb port. Это короткий launch-preflight,
а не основание откладывать owner-declared P0. `#801` покрывает только manual patient/walk-in.

**Risk:** trace — read-only/targeted; найденный identity/booking fix получает отдельный high-risk scope по доказанной
причине, а не автоматически весь UI-0.

### UI-1 — расписание

- **UI-1a presentation:** все template-days получают цвета существующих location tokens; time + city выводятся
  один раз в weekday header, а не в каждой date-cell; текст «Установить», подключение существующего
  `DoctorDateTimePicker`, более спокойные grid lines. Launch manifest — §4.
- **UI-1b behavior:** independent multi-select location filters: inactive серые, каждый location toggles независимо,
  «Все» включает все; отдельный focused behavior scope после trace текущего state contract.
- **SCH-G5:** не входит ни в UI-1a, ни в UI-1b; остаётся owner-waiting `#848`.
- **UI-2 online appointment:** bounded этап на существующей модели: встроенная включаемая локация «Онлайн» гейтит
  уже существующие online-галочки услуг. Не вводить новую схему, delivery-mode или второй booking engine; сначала
  подтвердить, какие follow-on фильтры/public projections уже работают, и дошить только доказанные gaps.

#### UI-1c — карточка записи в календаре (`#951`)

Новый owner delta 2026-07-21 относится к существующей `DoctorCalendarEventPanel`, открываемой из календаря и
«Сегодня». Это отдельный presentation/interaction substage после текущего C1 baseline `#851`; весь закрытый C1
повторно не запускать. UI-1c может идти параллельно с UI-1a/UI-1b при свободном file scope, но live DEV на `:5200`
и тяжёлые проверки сериализуются.

**Точный outcome:**

1. В каждом host-context остаётся ровно один доступный close-control: в `Dialog` — внешний крупный крестик, в
   embedded schedule panel — её собственное закрытие; два крестика рядом запрещены.
2. ФИО крупнее и остаётся единственной навигацией в карточку пациента. Справа — icon-actions с доступными названиями:
   чат переиспользует `DoctorOpenChatButton`; телефон использует существующую нормализацию `phoneToTelHref`, на
   mobile открывает `tel:`, на desktop показывает номер и копирует его с видимым подтверждением. При отсутствии
   canonical patient/phone соответствующее действие скрыто или disabled, без нового lookup API.
3. Актуальные дата/время показаны отдельной более крупной и жирной строкой с заметным вертикальным отступом; справа
   в той же строке — standard doctor `Badge`, немного выше текущего, с semantic цветом статуса (confirmed — green;
   остальные состояния используют существующую status vocabulary, без случайных hex). Текст «Статус записи: …»
   удалён как дубль.
4. `Rubitime ID`, external Rubitime manage-link и отдельная ссылка «Карточка пациента» не рендерятся. Runtime/data
   Rubitime и lifecycle этим presentation-scope не меняются.
5. Детали идут с явными подписями «Филиал», «Услуга», «Специалист». Строка «Специалист» отсутствует только когда
   server-derived organization/specialist context действительно доказывает solo-mode; clinic mode её сохраняет.
   Не выводить предположение о solo-mode только из пустого поля текущей записи.
6. «Исходное время» находится сразу под актуальными датой/временем в прежней спокойной meta-типографике и появляется
   только если `originalStartAt` реально отличается от `startAt` по календарной минуте.
7. «Создать визит из записи» занимает отдельную центрированную строку, имеет немного более крупный текст/padding,
   но не растягивается на всю ширину. Других ссылок и badges в этой строке нет.
8. «Добавить комментарий» disabled при пустом или whitespace-only draft; существующий comments API не меняется.
9. Текущий `BookingStaffPaymentPanel` является диагностическим read-on-demand UI и не соответствует целевому
   payment UX. До доказанной полной organization provider-readiness и существующих server-authorized contracts
   cash mark + invoice/pay-link + QR панель скрывается, но сам компонент/домен не удаляется. UI-1c не строит эти
   денежные механизмы. Будущий payment substage показывает только три owner-состояния: частичная предоплата с
   суммой, полностью оплачено с суммой либо «Не оплачено» с действиями «Оплачено наличными»/«Выставить счёт».

**Risk:** UI-1c сейчас presentation/interaction — один worker + один независимый audit. Любая реализация cash mark,
invoice/pay-link/QR или новый provider-readiness contract выносится в отдельный money/high-risk stage; finding не
превращает её автоматически в scope UI-1c.

### UI-3 — коммуникации

Разделить три непересекающихся по риску этапа:

1. **UI-3a cosmetics:** подтверждённые тексты, фон/градиент, мелкая presentation-плотность и split 45/55 с
   fallback 50/50 через существующий layout primitive;
2. **UI-3b broadcast IA:** журнал, выбор/раскрытие и error-details с отдельным interaction acceptance;
3. **UI-3c composer/backend:** shared composer, scheduled messages и delivery state; high-risk там, где появляется
   durable queue/dispatcher.

**Owner-ruling content to preserve in the bounded subscopes:** одинаковый chat background в doctor/patient chat,
modal и comments; имя в шапке как единственная card navigation; убрать лишнюю верхнюю фразу broadcasts; выбранная
рассылка раскрывается без перекрытий с summary/delivery/error data; в левом списке заявок не дублировать ссылку на
имя, если она есть в detail. 45/55 явно заменяет прежние 40/60; fallback — 50/50. Существующую принятую
chat-card navigation нельзя молча заменить новой: route и доступность должны сохраниться.

**UI-3b exact broadcast IA из owner dump `f48f35a56`:** клик по строке рассылки открывает её просмотр в левой
части split: заголовок, текст и метрики «кому / куда / ошибки / недоставка». Действие «Лог ошибок» открывает детали
в правой части. Просмотр использует стандартную верхнюю панель с одним закрытием и не перекрывает summary,
delivery/error data или соседние строки.

**UI-3c exact foundation:** один shared composer должен покрыть четыре доказанных consumers — doctor chat/modal,
patient chat, doctor comments и patient comments — до scheduled-message расширения. Это owner requirement исходного
плана, а не необязательная рекомендация. Extraction выполняется отдельным bounded scope с parity-тестами и не
разрешает переписать consumers или включить deferred Voice/STT.

### UI-4 — список клиентов

- **UI-4a presentation:** layout, поиск, KPI presentation/tooltips/терминология и порядок информационных иконок;
  launch manifest — §4.
- **UI-4b metrics/backend:** all-time cancellations/reschedules, active-only и expired membership semantics —
  отдельный contract stage с repository/API evidence. Presentation не должна выдумывать недоступные цифры.
- ~~В обычном режиме страница сохраняет `list + filters + functional preview` в split 50/50. Выбор полной карточки
  переключает весь рабочий контейнер в UI-5a card mode; это не удаление preview и не попытка втиснуть карточку в
  правую половину.~~ **SUPERSEDED 2026-07-23 (owner ruling: remove the right-pane preview entirely; a client-row
  click opens the FULL patient card. The right pane holds filters only.)**

**UI-4a exact presentation:** поиск переезжает в page header, а количество и сортировка остаются в шапке списка;
KPI показываются по три в ряд, filtered value — отдельной меньшей цифрой без slash с filter icon; tooltip появляется
с задержкой и укладывается в одну строку; «Все люди» использует настроенный patient plural label; icon slots идут
membership → program-or-supervision → appointment без фоновых коробок. **UI-4b owner intent:** cancellations и
reschedules — all-time, membership KPI — только active, expired memberships — отдельная метрика. Точные repository
fields/API сначала доказываются; pending payment нельзя молча считать active.

### UI-5 — страница клиента

**Последнее решение владельца 2026-07-22 заменяет layout из planning commit `1c77c207d`.** В обычном режиме
«Клиенты» остаются страницей `list + filters + functional preview`. По команде открыть полную карточку она заменяет
**весь рабочий content container раздела**, а не содержимое правой колонки: список и фильтры временно не видны,
боковая навигация кабинета остаётся. Возврат «К клиентам» восстанавливает поиск, сортировку, фильтры, выбранный preview
и позицию прокрутки. Прямой URL, reload и browser back/forward открывают тот же card/list mode.

#### UI-5a / `#958` — routing/layout reuse

Первый bounded этап переиспользует существующий защищённый standalone patient-card view на всю ширину content
container. Он сохраняет тот же server loader, guards, data/API paths и deep URL; не создаёт второй card tree, iframe
или client-side обход авторизации. UI-5a не меняет состав вкладок, клиническую видимость, ownership, authorship,
counts/search/export, schema или record classes и может идти до полного U5A/U5B только после доказательства
guard-equivalence. Это полноценное открытие уже существующей карточки, но не реализация нового состава ниже.

#### UI-5b / U5B — полный owner composition после U5A

Полный этап сохраняет исходный подробный checklist `f48f35a56`, а не его прежнюю сокращённую выжимку:

- при активной карточке поиск остаётся доступным; совпадения показываются dropdown под полем;
- compact sticky header содержит только ФИО, полную подпись «Дата рождения», edit affordance с достаточным отступом
  и правые deep links chat/phone/email/messenger; пол, рост, вес, chips и mini-stats из header убираются;
- tabs находятся под header; header и tabs sticky. Внутри рабочих tabs используется 50/50 master/detail, на mobile
  видна одна часть за раз;
- отдельные `Overview`, `Communications` и `Visits` не дублируют данные: их существующие блоки переносятся, а не
  переписываются. Чат использует тот же существующий messaging path;
- в правой части `Карточки` выбранная запись о визите по умолчанию скрыта. Сверху идёт KPI-строка `Визиты /
Будущие записи / Абонементы`; клик открывает соответствующие данные в левой части над диагнозом;
- ниже справа идут `Заметки`, `Задачи`, `Динамика симптомов`, `Назначенная программа` и календарь `Выполнение
упражнений`. Пустые Notes/Tasks показывают только действие добавления, без текста «нет ...»;
- summary назначенной программы содержит только название, дату контроля и этапы с подсветкой активного, без состава
  упражнений; клик по названию открывает саму программу;
- в левом списке визитов оформленная запись предлагает `Открыть заметки`, а не создать визит повторно;
- абонементы в левой части сохраняют список и историю, `Списать`, `Пересчитать` и верхнее `Добавить абонемент`.
  Добавление открывает справа конфигурацию, выбор и оплату; реальная online payment остаётся отдельной `#819`;
- убрать поясняющие пустые подписи про приоритет/выраженность, отсутствие диагнозов, сопутствующих состояний и травм,
  а также тексты «по клику ...»;
- диагноз не называется `Актуальный`; preliminary diagnoses не выделяются отдельным bucket, а входят в единый
  список. Цвета симптомов переиспользуют существующую Overview color logic.

Только UI-5b может менять section composition, history, visibility parity, authorship/ownership и доступ
owner/admin/другого специалиста. Ни один layout-пункт не разрешает cross-organization доступ, раскрытие private
counts/metadata или потерю standalone deep-link compatibility.

### UI-6 — Сегодня

- **UI-6a presentation:** компактные KPI, перестановка даты/ссылки календаря и удаление дублирующих подписей;
  launch manifest — §4.
- **UI-6c owner correction 2026-07-22 (`#966`):** desktop-полотна возвращаются к точному `50/50`; ссылка
  календаря становится стандартной doctor-кнопкой «Открыть расписание»; начало видимой сетки проверяется против
  первого приёма и должно давать ровно один час до него, без локального форка общего calendar-window contract.
- Настраиваемые owner signals, переключатель «на сопровождении»/«недавние с визитами», «самые активные», новые
  counters и скрытие клиентов не входят в косметику UI-6a, но остаются отдельным owner-requested product/behavior
  этапом. Их нельзя понижать до рекомендации или считать закрытыми вместе с compact presentation.

### UI-P — общий Doctor UI presentation-token pass

- **SUPERSEDED — 2026-07-22:** прежний G6 white/inherited background outcome. Latest owner authority
  `UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` §2 + Design DNA v1.0 sets exact doctor canvas `#F6F4EF`;
  sticky page header with title remains white.
- Радиусы задаются общими doctor primitives: page-level block `12px`, KPI `8px`, doctor button/input/select trigger
  `24px`. Основные блоки используют внутренний отступ `18px`; внутренний `input` имеет белый фон. Локальные копии
  этих классов по страницам не создаются.
- KPI во всех затронутых doctor surfaces используют один порядок: label сверху, value снизу.
- Основной шрифт строк doctor-списков становится крупнее и легче без изменения meta/badge/calendar typography.
  Live-эталон владельца — блок «На сопровождении» на «Сегодня»: divider `1px` не доходит до краёв page-level блока,
  а текст/иконки имеют тот же спокойный внутренний ритм. Этот behavioral reference применяется к «Клиентам» и
  спискам сообщений/диалогов и заменяет прежнее буквальное требование размножить `18px` на каждом экране.
  Выбранный диалог сохраняет понятное состояние, но не превращается в отдельную карточку и не ломает divider rhythm.
- Единый flat-list vocabulary для «Клиентов» и списков сообщений берёт расположение и границы строк с блока
  «На сопровождении» страницы «Сегодня», но hover подсвечивает всю ширину строки как в текущих интерактивных
  списках. Цвет divider — точно `#f0efeb` через общий doctor token/class, без локальных копий.
- Табы разделов используют более скруглённую doctor-control форму и более тёмный нейтральный hover; правка делается
  через общий tab vocabulary, а не независимые классы «Расписания»/«Коммуникаций»/настроек записи.
- **Latest correction того же дня:** пункты основного doctor-меню не являются button/control pills. Для sidebar и
  mobile menu возвращается прежняя почти прямоугольная форма с минимальным скруглением; правило 24px на menu items
  не распространяется. Это не отменяет отдельно более округлённые section tabs.
- На странице «Клиенты» поиск переносится из отдельного toolbar под header в правый слот белой page header, на
  одну линию с title. Desktop width совпадает с правой половиной 50/50 split; mobile остаётся доступным и компактным.
- Это presentation-only stage: metric semantics, list sorting/filtering, patient UI, public booking и page data
  contracts не меняются. Перед worker запуском нужен current-use census shared primitives и точный affected-file
  manifest; один worker + один независимый presentation audit, без серийных correction rounds.

### UI-7 — коммуникационные возможности

- **UI-7a scheduled messages:** exact scope — doctor/patient chat и doctor/patient comments. Schedule button рядом
  с Send открывает date/time picker; основное действие становится «Запланировать»; до отправки сообщение видно у
  отправителя с clock-state вместо delivery checks. Нужны per-message `scheduled_at` + durable status и worker
  dispatch поверх отдельно проверенных queue/retry/cancel/org-scope contracts. Этап не прячется внутри presentation
  UI-3 и не копирует broadcast storage без contract review.
- **Reconciliation 2026-08-02:** владелец подтвердил, что ручная отложенная отправка нужна продукту и не является
  администраторской рассылкой по триггерам. Старый прототип `origin/agent/ui964-20260722` не переносится: его
  отдельные migration/cron/principal и access boundary устарели. Требования ниже сохраняются как authority, а новая
  реализация строится от текущего `feat`, использует действующий operational runner/principal и новый заранее
  забронированный номер миграции.
- **UI-7b voice/STT:** решением G2 отложено до post-production, taskdb `#922`; в текущий заход не входит.

### UI-8 — capability/commercial projection

UI-8 вложен в C4D/C5. Он использует уже интегрированный и принятый S4 engine `#888`: единый entitlement registry,
точную organization ownership и commercial defaults; не создаёт параллельную polarity system, seed или второй
набор feature keys. Решение G3 закрепляет только organization/clinic axis; per-specialist axis отсутствует. Owner
outcome — администратор может собирать тариф/включать
доступные организации механики через единый commercial contour; точные registry keys/default polarity и migration
определяет C4D/C5, а не этот UI plan. Значения `#191` не являются разрешением запускать UI-8 раньше C4D/C5.

### UI-9 — индивидуальные упражнения

UI-9 одобрена владельцем и зависит от C4D exact-org library isolation. `#565` — design evidence для разблокированной
`#564`, а не отдельный owner gate. Personal-scoped exercise создаётся из program editor, doctor media
upload использует organization/patient-owned folder contract, а назначенное видео immutable; точные field names и
draft semantics не являются owner rulings. Media access/presign и tenant ownership проверяются high-risk циклом.

### Client UI residual

Пустой mood chart на patient «Сегодня» скрывается до первой emoji/check-in отметки. Это точечная presentation-задача,
не расширяет Doctor UI stage и получает отдельный exact file manifest перед запуском.

### Current implementation truth — reconciliation 2026-07-22

Статус ниже проверен против полного `f48f35a56`, integrated code through `eb64a4956`, code/tests/LOG и exact TEST
SHA `eb64a495644` (code-only deploy 2026-07-22, без dump/restore/full reset).
`DONE` здесь означает repository implementation evidence; owner acceptance остаётся отдельным taskdb-layer.

| Scope                | Статус                                                 | Точный остаток                                                                                                                                                                                                                                                            |
| -------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI-0                 | `DONE`                                                 | Четыре symptoms закрыты; отдельная owner live recheck не подменяется smoke.                                                                                                                                                                                               |
| UI-1                 | `DONE code / TEST deployed / owner pending`            | Canonical picker reuse и UI-1c находятся на TEST; обязательный smoke и первичная read-only visual проверка прошли. Money/provider и SCH-G5 остаются отдельными gates, не UI-1 debt.                                                                                       |
| UI-2                 | `DONE repository / public live gated`                  | Built-in Online, schedule filters, client booking and separate public online-block доказаны `#972`; published-slug live proof остаётся U6B `#926`. Expanded online chain не входит.                                                                                       |
| UI-3                 | `DONE code / TEST deployed / owner pending`            | 45/55, owner gradient, broadcast detail/error IA и shared composer находятся на TEST; smoke и desktop/mobile read-only visual проверка прошли.                                                                                                                            |
| UI-4                 | `DONE code / TEST deployed / owner pending`            | Presentation, metric semantics и normal-mode functional `PatientPreviewPane` находятся на TEST; smoke и desktop/mobile list check прошли.                                                                                                                                 |
| UI-5                 | `UI-5a TEST deployed / UI-5b BLOCKED #971→#796`        | Existing full card replaces the doctor workspace with list-state restoration; mandatory live route smoke прошёл. U5B record-class contract `#928` закрыт, но полный atomic composition/data-policy ждёт два U5A live-seal из `#796`; presentation-only подмена запрещена. |
| UI-6                 | `DONE current contract / TEST deployed / future gated` | 50/50, calendar button/window and existing-signal preferences/list switch находятся на TEST; «Самые активные»/new counters/hiding stay contract-gated.                                                                                                                    |
| UI-7                 | `OPEN #964 / rebuild from current feat`                | Ручная отложенная отправка подтверждена владельцем. Старый isolated-прототип признан несовместимым с текущими migration/runner/access boundaries и удаляется; реализация выполняется по exact checklist ниже. Voice/STT корректно post-production.                         |
| UI-8                 | `DONE current contract`                                | S4/C5 organization-only commercial contour готов; `#191` задаёт только новым правилам разминок `12:00`/`15:00` в рабочие дни и не изменяет существующие правила.                                                                                                          |
| UI-9                 | `DONE`                                                 | Personal exercises/media exact-org implementation и high-risk audit закрыты; live owner acceptance отдельно.                                                                                                                                                              |
| Client mood residual | `DONE`                                                 | Empty chart скрывается, mood controls остаются.                                                                                                                                                                                                                           |
| UI-P                 | `prior pass TEST deployed / #977 OPEN`                 | Shared pass is on TEST; the latest background/tabs/list/menu reconciliation has proven rows plus open `P2B-01/02/09/10/14` below and is not complete.                                                                                                                     |

Эта таблица отменяет прежние blanket-формулировки «baseline проверен» для полного UI-1/UI-3/UI-4/UI-6 scope:
повторять закрытую часть нельзя, но перечисленный residual обязан получить собственный exact task/acceptance.

### UI-P2b / `#977` — latest owner visual contract lock (2026-07-22)

Этот bounded presentation-pass повторно сверяет только перечисленный ниже визуальный контракт на базе точного
`feat/doctor-ui-rebuild` commit `49a0d0501`. Исторические `[x]` UI-6/UI-P ниже являются evidence прошлых slices,
но не закрывают `#977` без новой построчной матрицы `checkbox → current code/live evidence`. Data contracts,
metric semantics, patient/public UI, DB/env/deploy и полный CI вне scope.

#### Supersession map

- **SUPERSEDED — 2026-07-22, replaced by `P2B-05`:** прежнее UI-6a действие/текст «Открыть календарь» и
  presentation-ссылка календаря. Текущий канон — standard doctor button **«Открыть расписание»**.
- **SUPERSEDED — 2026-07-22, replaced by `P2B-01`:** любое распространение communications split `45/55`
  (G4/UI-3) на desktop-полотна «Сегодня». `45/55` остаётся только communications contract; «Сегодня» — точно
  `50/50`.
- **SUPERSEDED — 2026-07-22:** the previous `P2B-02` white/inherited workspace outcome. Replaced by
  `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` §2 + Design DNA v1.0: doctor canvas is exactly
  `#F6F4EF`; page header and primary surfaces remain white.
- **SUPERSEDED — 2026-07-22, replaced by `P2B-09`:** применение doctor control radius `24px` к sidebar/mobile
  menu rows, включая промежуточный `rounded-md`. Основное меню остаётся почти прямоугольным с минимальным radius;
  более округлённые section tabs — отдельный contract.
- **SUPERSEDED — 2026-07-22, replaced by `P2B-06`/`P2B-10`:** буквальное размножение числового `18px` padding
  внутри каждой list row. `18px` остаётся padding основных page-blocks; Clients/Messages rows переиспользуют
  геометрию списка «На сопровождении» без page-local числовых fork.

#### Owner ruling — P2B-09/P2B-10/P2B-14 list ambiguity (2026-07-22, Track A round 4)

- **Visual canon:** doctor lists follow the Today page. The list itself receives no added side border or enclosing
  side frame; the Doctor DNA canvas remains `#F6F4EF`, while page headers and primary surfaces remain white.
- **Interaction canon:** the full visible row is the hit target. Today uses one native row `Link` with its metadata
  inside it; Clients and Messages keep their existing native full-row button behavior for master/detail selection.
  No nested interactive element is permitted inside the Today link; any future independent row action must be a
  correctly separated sibling control.
- **Reuse boundary:** retain the shared `DoctorDnaFlatListRow` divider/hover/typography contract and doctor-zone
  primitives. This ruling does not authorize changes to fonts, spacing, other panels, navigation, #848, #963,
  #964, UI-5b, or U5A.

#### Atomic acceptance — worker/auditor authority

- [ ] **P2B-01** Desktop «Сегодня» использует точное разделение `50/50`; mobile composition не регрессирует.
- [ ] **P2B-02** **SUPERSEDED — 2026-07-22 by `UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` §2:** Doctor
      workspace canvas uses exact Design DNA `#F6F4EF`; page headers and primary surfaces remain white.
- [~] **P2B-03** Shared section tabs имеют более тёмный neutral hover и свой округлённый tab contract без
  page-local divergence; это не меняет геометрию sidebar/mobile menu. (code may be in place; awaiting owner live visual acceptance)
- [x] **P2B-04** Видимая сетка Today calendar начинается ровно за один час до первого приёма, когда именно приём
      расширяет нижнюю границу; общий calendar-window contract не получает локальный fork или двойной lead padding.
      (✓ apps/webapp/src/modules/booking-calendar/visibleTimeWindow.ts:28-69; DoctorTodayMiniCalendar.test.tsx:383-410)
- [x] **P2B-05** В Today calendar header используется standard doctor button **«Открыть расписание»**, а не
      текстовая/ghost-ссылка «Открыть календарь». (✓ apps/webapp/src/app/app/doctor/DoctorTodayMiniCalendar.tsx:227-236)
- [~] **P2B-06** Clients и Messages используют общий flat-list row contract с геометрией списка «На
  сопровождении», full-row hover для интерактивных строк и divider ровно `1px #f0efeb`; selected dialog не
  превращается в отдельную карточку. (code may be in place; awaiting owner live visual acceptance)
- [x] **P2B-07** Semantic doctor primary остаётся ровно `#406ca7` через doctor-zone token; local primary hex и
      перекраска patient/public tokens отсутствуют. (✓ apps/webapp/src/app/styles/bersoncare-tweakcn-theme.css:101; scoped census finds no local hex fork)
- [~] **P2B-08** Page headers и фактические input surfaces белые. (code may be in place; awaiting owner live visual acceptance)
- [ ] **P2B-09** Shared radius scale соблюдена: page-level blocks `12px`, KPI `8px`, doctor buttons/inputs/select
      triggers `24px`; sidebar/mobile menu rows сохраняют прежний почти прямоугольный минимальный radius, tabs живут
      по отдельному rounded contract. **Owner ruling 2026-07-22:** visual canon for Clients/Messages list surfaces is
      Today; those lists receive no added side border or enclosing side frame.
- [ ] **P2B-10** Основные page-blocks используют внутренний padding `18px` через shared doctor primitives, без
      локальных копий в затронутых страницах. **Owner ruling 2026-07-22:** Today is one full-row native link; Clients
      and Messages retain their full-row native button behavior, including keyboard activation.
- [x] **P2B-11** KPI используют единый порядок label сверху → value снизу и `doctorMetricValueClass` для значения.
      (✓ apps/webapp/src/app/app/doctor/analytics/clients/DoctorStatCard.tsx:54-58; shared/ui/doctor/doctorVisual.ts:63)
- [x] **P2B-12** Поиск «Клиентов» находится в правом слоте белой page header на уровне title; desktop width
      совпадает с правой половиной `50/50`, mobile вариант остаётся доступным и компактным.
      (✓ apps/webapp/src/app/app/doctor/patients/PatientsPageClient.tsx:657-688)
- [x] **P2B-13** Primary text строк Clients/Messages/Today support крупнее и легче (`text-base font-normal`), а
      meta/badge/calendar typography не повышена вместе с ним. (✓ apps/webapp/src/shared/ui/doctor/DoctorDnaFlatListRow.tsx:17-27, reused by Today/Clients/Messages)
- [ ] **P2B-14** Изменения переиспользуют shared doctor primitives/list-row/tab/calendar contracts и сохраняют
      физическую patient/doctor UI isolation; локальные style forks и imports из patient/components UI не добавлены.
      **Owner ruling 2026-07-22:** this list correction is limited to the shared flat-list contract and its three
      consumers; no unrelated UI scope is opened.

#### P2b evidence matrix

- `P2B-01` — code/test prove `DoctorTodayDashboard.tsx` uses `md:grid-cols-2`; mobile runtime evidence remains open
  until the integrated commit is checked live.
- `P2B-02` — **SUPERSEDED then reopened by latest owner authority:** old white/inherited value and `#faf9f4`
  fallback do not apply. `doctor.css` and `bersoncare-tweakcn-theme.css` must use DNA canvas `#F6F4EF`;
  `P2B-07`/`P2B-08` remain proven by the doctor-only `#406ca7` semantic primary and white header/input surfaces.
- `P2B-03` — `DoctorSectionTabs.ts` uses `--doctor-section-tab-hover`; `DoctorPresentationChrome.test.tsx`
  proves that section tabs keep their own pill contract independently of menu rows.
- `P2B-04`/`P2B-05` — `DoctorTodayMiniCalendar.tsx` delegates the single lead buffer to
  `deriveCalendarVisibleTimeWindow` and renders `buttonVariants({ size: "sm" })` with «Открыть расписание»;
  focused tests prove the exact one-hour boundary and button contract.
- `P2B-06`/`P2B-13` — `DoctorDnaFlatListRow.tsx` is reused by Today support, `PatientsPageClient.tsx` and
  `DoctorSupportInbox.tsx`; it owns the full-row hover, one-pixel `#f0efeb` divider and `text-base font-normal`
  primary role. Focused Clients/Messages/presentation tests cover those consumers.
- `P2B-09`/`P2B-10`/`P2B-14` — **Owner decision recorded 2026-07-22:** Today is the visual reference and receives no
  added side borders or enclosing side frame; Clients and Messages retain whole-row behavior. The ambiguity is
  resolved. Live PNG evidence and owner acceptance remain open.
- `P2B-11` — `DoctorStatCard.tsx` renders label before value and consumes the shared
  `doctorMetricValueClass`; this pass reconciled that class with the canonical Metric role `text-2xl` and added
  an exact regression assertion.
- `P2B-12` — `PatientsPageClient.tsx` places the full-width search input in the `DoctorPageHeader` right slot;
  `DoctorPageHeader.tsx` gives title/right slots equal desktop flex while preserving full-width mobile wrapping.
- `P2B-14` — patient/doctor isolation remains proven; the ambiguity is resolved by the 2026-07-22 owner decision.
  Live PNG evidence and owner acceptance remain open.

Validation from the isolated `#977` worktree: focused Vitest **6 files PASS** (worker reported 97 cases; static audit
counted 96 generated cases, so the exact count is not used as closure evidence), scoped ESLint **PASS**,
webapp typecheck **PASS**, `git diff --check` **PASS**. Live DEV screenshots were not repeated in this worker slice:
the sole existing `:5200` process belongs to the integration checkout, not this isolated worktree; starting a
second Next server is prohibited. The integrated commit therefore still requires the single planned independent
desktop/mobile audit pass.

### Atomic owner checklist — единственный completion tracker

`[x]` ниже означает только доказанную repository-реализацию на текущей feature-ветке. Это не означает owner
acceptance и не заменяет отдельный TEST/live checkpoint. `[ ]` означает фактический остаток либо ещё не пройденный
gate. Этап нельзя называть выполненным по общему audit PASS, пока все его in-scope owner checkboxes не закрыты
точными code/test/live evidence. Описательная часть выше задаёт смысл; этот список не разрешается сокращать в worker
brief или заменять одним общим пунктом.

#### UI-0 — booking funnel (`#923`)

- [x] Устранён SSR/render failure после выбора услуги.
      (✓ apps/webapp/src/app/app/patient/booking/bookingCatalogRsc.ts:94-154; slot/page.tsx:28-79 fail-closed validate+redirect)
- [x] Видимость услуг соблюдает выбранного специалиста, clinic-wide и solo правила владельца; одной location
      assignment недостаточно. (✓ apps/webapp/src/modules/patient-booking/inPersonServicesCatalog.ts:101-159; DoctorCalendarEventPanel.tsx:166-177)
- [x] Запись из календаря создаёт видимого organization-owned клиента по действующему contract.
      (✓ DoctorCalendarEventPanel.tsx:418-471; api/doctor/booking-engine/appointments/manual-patient-visit/route.ts:50-120; infra/repos/pgBookingEngine.ts:1301-1428; infra/repos/pgDoctorClients.ts:270-295)
- [x] ФИО в детали записи ведёт в существующую карточку пациента.
      (✓ apps/webapp/src/app/app/doctor/calendar/DoctorCalendarEventPanel.tsx:518-540; patients/patientCardHref.ts:1-18)
- [ ] Owner live recheck остаётся отдельным acceptance-layer и не выводится из smoke.

#### UI-1 — Schedule (`#851`, residual `#960`) и appointment detail (`#951`)

- [x] Template-days используют существующие цвета локаций. (✓ ScheduleWorkTab.tsx:322-347,398-424)
- [x] Время и город выводятся один раз в weekday header, а не в каждой date-cell. (✓ ScheduleWorkTab.tsx:354-367,440-489)
- [x] Действие настройки времени называется «Установить». (✓ ScheduleWorkTab.tsx:1378-1387)
- [x] Недельный график переиспользует canonical `DoctorDateTimePicker`, без локального picker fork (`#960`).
      (✓ ScheduleWorkTab.tsx:25,515-533,1310-1330,1506-1526; shared/ui/doctor/DoctorDateTimePicker.tsx)
- [~] Grid lines имеют согласованную спокойную presentation-плотность. (code may be in place; awaiting owner live visual acceptance)
- [x] Location filters независимы; «Все» включает все локации. (✓ ScheduleWorkTab.tsx:565-566,609-635,1138-1179 — `selectedBranchIds`/`toggleGridBranch`/`selectAllGridBranches`)
- [x] В appointment detail остаётся ровно один доступный close-control в каждом host-context.
      (✓ ScheduleCalendarTab.tsx:2052-2076; TodayAppointmentFullModal.tsx:89-104 `showCloseControl={false}`; TodayMiniCalendarWithModal.tsx:127-140)
- [x] ФИО крупнее, остаётся единственной card navigation и имеет existing chat/phone actions с mobile/desktop
      поведением и отсутствующими-data states. (✓ DoctorCalendarEventPanel.tsx:527-584)
- [x] Актуальные дата/время выделены; semantic status badge находится в той же строке; дублирующая подпись статуса
      отсутствует. (✓ DoctorCalendarEventPanel.tsx:601-614; no `Статус записи:` string in file)
- [x] `Rubitime ID`, Rubitime manage-link и отдельная ссылка «Карточка пациента» не рендерятся.
      (✓ DoctorCalendarEventPanel.tsx:505-704 has no rubitimeId/rubitimeManageUrl render use)
- [x] «Филиал / Услуга / Специалист» подписаны; specialist row скрывается только при server-proven solo-mode.
      (✓ DoctorCalendarEventPanel.tsx:507,621-636 — `isSoloMode` from server filter metadata)
- [x] Исходное время показывается только после фактического переноса. (✓ DoctorCalendarEventPanel.tsx:508-515,615-619 `hasRealOriginalStart`)
- [x] «Создать визит из записи» оформлено отдельным центрированным действием. (✓ DoctorCalendarEventPanel.tsx:645-661)
- [x] Пустой/whitespace комментарий нельзя отправить. (✓ AppointmentStaffCommentsSection.tsx:51,97-104 `disabled={saving || !draft.trim()}`)
- [x] Диагностическая payment panel скрыта до доказанных provider/cash/invoice/pay-link/QR contracts; домен не удалён.
      (✓ DoctorCalendarEventPanel.tsx has no `BookingStaffPaymentPanel` import; component still exists at app/app/settings/BookingStaffPaymentPanel.tsx)
- [ ] После отдельного money/provider gate карточка различает частичную предоплату с суммой.
- [ ] После отдельного money/provider gate карточка различает полную оплату с суммой.
- [ ] После отдельного money/provider gate состояние «Не оплачено» даёт server-authorized действия «Оплачено
      наличными» и «Выставить счёт»; UI-1c не изобретает эти contracts.
- [ ] UI-1c присутствует на exact TEST SHA `eb64a495644`; mandatory patient-card/schedule smoke и первичная
      read-only visual проверка прошли. Owner interaction acceptance остаётся отдельным gate.
      (REOPENED 2026-07-23: literal SHA `eb64a495644` is stale — current TEST checkout resolved to successor SHA
      `2c3b40e7738a1fe45a713f7f9f6d0a39db707f7e` / `45ffed731` lineage per docs/\_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/TEST_DEPLOY_EVIDENCE_2026-07-22.md;
      underlying UI-1c code is an ancestor and still present, so this is evidence drift, not a regression, but the
      literal checkpoint claim needs updating before it can be re-ticked.)
- [ ] SCH-G5 остаётся отдельным owner gate `#848`, не скрывается внутри UI-1 completion.

#### UI-2 — built-in Online location

- [x] «Онлайн» является встроенной включаемой локацией в существующей модели, а не вручную создаваемым workaround.
      (✓ apps/webapp/src/modules/booking-engine/onlineLocation.ts:4-35,45-117)
- [x] Состояние Online location гейтит существующие online-галочки услуг.
      (✓ apps/webapp/src/modules/patient-booking/inPersonServicesCatalog.ts:69-84; BookingSoloAvailabilitySection.tsx)
- [x] Не создана новая schema/delivery-mode/booking engine. (✓ onlineLocation.ts reuses existing `be_branches`/catalog port; no new migration/table)
- [x] Отдельно доказано, что Online присутствует в существующих schedule location list/filters без второго
      projection. (✓ ScheduleWorkTab.tsx:564-566,700-710,1138-1179 maps the same active-branches list)
- [x] Отдельно доказано, что online services видны в существующем client booking wizard при включённой Online
      location. (✓ inPersonServicesCatalog.ts:69-84,101-159; bookingCatalogRsc.ts:157-214)
- [x] Online-only services на публичной странице попадают в online-block, а не в physical location (`#972`).
      (✓ inPersonServicesCatalog.ts:40-67 excludes built-in Online from physical cities; shared/publicBook/onlineBookingCategories.ts)
- [ ] Live proof этого публичного разделения ждёт sanctioned published slug/U6B `#926`; repository-evidence его
      не подменяет.

#### UI-3 — Communications (`#852`, residual `#961/#962`)

- [x] Desktop split во всех применимых вкладках — 45/55 с fallback 50/50; mobile master/detail сохранён.
      (✓ `lg:grid-cols-[minmax(0,9fr)_minmax(0,11fr)]` in BroadcastsTab.tsx:165, DoctorSupportInbox.tsx:510, DoctorCommentsTab.tsx:1125)
- [x] Exact owner gradient применён одинаково к doctor/patient chat, modal и comments (`#961`).
      (✓ single asset shared/ui/chat/chatThreadSurface.ts:1-3, reused by ChatView.tsx:108-112, DoctorCommentsTab.tsx:1055-1086, ProgramItemDiscussionDialog.tsx:203-250)
- [x] Имя в шапке является единственной card navigation с сохранённым route contract.
      (✓ DoctorSupportInbox.tsx:365-418,447-455; DoctorCommentsTab.tsx header link via patientCardHref)
- [x] Убрана лишняя верхняя broadcast-фраза с отдельным current-code evidence (`#961`).
      (✓ BroadcastsTab.tsx:111-151 starts directly with the standard heading; no removed phrase found in current tree)
- [x] Выбор рассылки показывает слева title/text/audience/channel/error/non-delivery metrics (`#961`).
      (✓ BroadcastsTab.tsx:74-109; BroadcastAuditLog.tsx:107-162)
- [x] «Лог ошибок» открывает detail справа; стандартная верхняя панель имеет одно закрытие; overlap отсутствует во
      всех summary/delivery/error states (`#961`). (✓ BroadcastAuditLog.tsx:115-193; BroadcastsTab.tsx:99-109,111-153)
- [x] Intake left list не дублирует ссылку по имени из detail. (✓ DoctorOnlineIntakeClient.tsx:565-616,653-665)
- [x] Один shared composer покрывает doctor chat/modal, patient chat, doctor comments и patient comments с parity
      текущего поведения (`#962`). (✓ shared/ui/chat/MessageComposer.tsx reused by DoctorChatPanel.tsx, PatientMessagesClient.tsx, DoctorCommentsTab.tsx, ProgramItemDiscussionDialog.tsx)

#### UI-4 — Clients list (`#850`, preview входит в `#958`)

- [x] Обычный desktop mode использует split 50/50. (✓ PatientsPageClient.tsx:689-700 `lg:grid-cols-2`)
- [x] Поиск находится в правом слоте page header; count/sort остаются над списком.
      (✓ PatientsPageClient.tsx:657-688 (DoctorPageHeader tabs slot), 701-756 (count/sort))
- [x] KPI расположены по три в ряд, label сверху и value снизу. (✓ PatientsPageClient.tsx:815 `grid-cols-3`; DoctorStatCard.tsx:54-58)
- [x] Filtered KPI value показан отдельной меньшей цифрой без slash и с filter icon. (✓ PatientsPageClient.tsx:312-323)
- [x] KPI имеют короткие delayed hover/focus tooltips и единый active state. (✓ PatientsPageClient.tsx:814 `TooltipProvider delay={450}`)
- [x] «Все люди» использует настроенный patient plural label. (✓ PatientsPageClient.tsx:653,830-832 `patientPluralLabel`)
- [x] Cancellations/reschedules имеют all-time semantics; membership KPI — active-only; expired membership отделён.
      (✓ PatientsPageClient.tsx:143-158 tooltip keys "за всё время"/active/expired; infra/repos/pgDoctorClients.ts:120-228)
- [x] Информационные иконки имеют стабильные слоты membership → program-or-supervision → appointment без boxes.
      (✓ PatientsPageClient.tsx:790-798 IconSlot order; no bg/border classes on the slot)
- [x] ~~Правая половина содержит functional patient preview, а не только фильтры или пустое место (`#958`).
      (✓ PatientsPageClient.tsx:810 `<PatientPreviewPane>`)~~ **SUPERSEDED 2026-07-23 (owner ruling: remove the
      right-pane preview entirely; a client-row click opens the FULL patient card. The right pane holds filters only.)**

#### UI-5a — full-workspace existing card reuse (`#958`)

- [x] Открытие полной карточки заменяет весь doctor content workspace; sidebar остаётся.
      (✓ patients/[userId]/page.tsx renders inside DoctorAppShell; DoctorWorkspaceShell.tsx:92-103 keeps sidebar as sibling)
- [x] Карточка не втискивается в right pane и не создаёт второй component tree/iframe.
      (✓ PatientsPageClient.tsx:621-626,808-810 only render `PatientPreviewPane`, not `PatientCardClient`, in the list right pane)
- [x] «К клиентам» восстанавливает search/sort/filters/selected preview/scroll.
      (✓ patients/patientListWorkspaceState.ts:66-101; PatientsPageClient.tsx:628-632,937-954)
- [x] Direct URL, reload и browser back/forward сохраняют card/list mode.
      (✓ separate Next.js routes `patients/page.tsx` and `patients/[userId]/page.tsx`; patientListWorkspaceState.ts deep-link/returnTo)
- [x] Переиспользованы exact standalone loader/guards/data/API; доказана guard-equivalence без visibility/schema
      изменений. (✓ both routes use `requireDoctorWorkspaceContext` — patients/page.tsx:24-50; patients/[userId]/page.tsx:28-46)

#### UI-5b — полный patient-card composition после U5A/U5B (`#928`)

- [ ] При активной карточке поиск доступен, результаты показаны dropdown под полем.
- [x] Sticky header содержит только ФИО и полную подпись «Дата рождения»; пол/рост/вес/chips/mini-stats убраны.
      (✓ header now ФИО PatientCardClient.tsx:266 + «Дата рождения» :387; удалены Пол-блок, Рост/Вес display+inline
      форма+state/handlers+physical-data plumbing, chips Архив/Заблокирован, правая mini-stats сводка, приписка возраста.
      Звезда «★ На сопровождении» :284 и portal-invite :476 ОСТАВЛЕНЫ намеренно по owner 2026-07-23 — это НЕ chips из
      UI-5b, не спец-нарушение.)
- [x] Edit affordance ФИО имеет увеличенный отступ и не слипается с именем.
      (✓ FIO row gap-1.5→gap-2.5 + pencil ml-0.5 PatientCardClient.tsx:273)
- [ ] Справа находятся phone/email/messenger deep links; chat открывает существующую modal/messaging path.
- [ ] Tabs находятся под header и sticky; рабочие tabs используют внутренний 50/50, mobile показывает одну часть.
- [ ] `Overview`, `Communications` и `Visits` не дублируют данные; существующие блоки и messaging path
      переиспользованы.
- [ ] Выбранная запись о визите справа скрыта по умолчанию.
- [ ] KPI `Визиты / Будущие записи / Абонементы` открывают соответствующий left content над диагнозом.
- [ ] Справа находятся Notes/Tasks/Dynamics/Program/Completion; пустые Notes/Tasks показывают только add action.
- [ ] Program summary содержит только название, дату контроля и этапы; состав упражнений скрыт.
- [ ] Активный этап программы визуально выделен.
- [ ] Клик по названию открывает существующую программу.
- [ ] Оформленный визит предлагает «Открыть заметки», а не повторное создание визита.
- [ ] Membership list и history перенесены из «Финансы» в левую часть card flow.
- [ ] `Списать` доступно только активному абонементу; `Пересчитать` сохранено.
- [ ] Верхнее `Добавить абонемент` открывает справа configuration/selection/payment; реальная online payment
      остаётся `#819`.
- [ ] Убрана пустая/объяснительная подпись про приоритет и выраженность.
- [ ] Убран пустой текст «диагнозов нет».
- [ ] Убраны тексты-инструкции «по клику ...».
- [ ] Убран пустой текст об отсутствии сопутствующих состояний.
- [ ] Убран пустой текст «травм не внесено».
- [ ] Диагноз не называется «Актуальный»; preliminary diagnoses входят в единый список.
- [ ] Symptom colors переиспользуют существующую Overview color logic.
- [ ] Visibility, authorship, ownership, counts/search/export и access matrix закрыты после U5A без
      cross-organization раскрытия.

#### UI-6 — Today (`#850`, residual `#963`)

- [~] KPI на «Сегодня» имеют compact presentation без искусственной пустой высоты. (code may be in place; awaiting owner live visual acceptance)
- [x] Дата и «Открыть календарь» находятся в compact calendar header, ссылка расположена справа.
      (✓ DoctorTodayMiniCalendar.tsx:226-236 single `justify-between` row)
- [x] Дублирующая фраза/строка с количеством записей удалена. (✓ no duplicate appointment-count line in DoctorTodayDashboard.tsx)
- [x] Desktop-разделение страницы «Сегодня» возвращено к точному 50/50 (`#966`). (✓ DoctorTodayDashboard.tsx:118-122 `md:grid-cols-2`)
- [x] «Открыть расписание» оформлено стандартной doctor-кнопкой (`#966`). (✓ DoctorTodayMiniCalendar.tsx:231-236 `buttonVariants({ size: "sm" })`)
- [x] Календарная сетка начинается ровно за один час до первого приёма, если именно приём расширяет нижнюю границу;
      default window и рабочие границы не получают второй запас (`#966`).
      (✓ modules/booking-calendar/visibleTimeWindow.ts:28-69; DoctorTodayMiniCalendar.tsx:151-172)
- [x] Состав видимых сигналов настраивается через существующий settings path после exact data contract (`#963`).
      (✓ modules/reminders или doctorTodayPreferences.ts; DoctorTodayDashboard.tsx:70-71 `data.peopleListMode`)
- [x] Переключатель «на сопровождении» / «недавние с визитами» имеет доказанную семантику (`#963`).
      (✓ DoctorTodayDashboard.tsx:70-71,161-238 `peopleListIsOnSupport`)
- [ ] «Самые активные», новые counters и hiding semantics реализуются только после exact contract (`#963`).

#### UI-P — shared doctor presentation (`#925`)

- [ ] **SUPERSEDED — 2026-07-22 by `UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` §2:** Doctor canvas uses
      exact Design DNA `#F6F4EF`; page header remains white, and primary `#406ca7` does not change.
- [ ] Радиусы block/KPI/control `12/8/24px`, основной padding `18px` и белый input не размножены локально.
- [x] KPI используют порядок label → value. (✓ DoctorStatCard.tsx:54-58)
- [x] Основной текст doctor-списков крупнее и легче без изменения meta/badge/calendar typography.
      (✓ DoctorDnaFlatListRow.tsx:17-27 `text-base font-normal` primary vs `text-xs` meta)
- [~] Clients/messages используют один shared list-row contract: геометрия как «На сопровождении», full-row hover и
  divider `#f0efeb` (`#967`). (code may be in place; awaiting owner live visual acceptance)
- [~] Общие tabs имеют более округлые края и более тёмный нейтральный hover без page-local divergence (`#967`). (code may be in place; awaiting owner live visual acceptance)
- [~] Пункты основного sidebar/mobile menu возвращены к прежней почти прямоугольной форме с действительно
  минимальным скруглением и не наследуют 24px doctor button radius (`#967`). Owner live recheck 2026-07-22
  отклонил промежуточный `rounded-md` как всё ещё слишком округлый; rounded section tabs этим пунктом не меняются.
  (code may be in place; awaiting owner live visual acceptance)
- [x] Clients search находится в page-header slot. (✓ PatientsPageClient.tsx:657-688 via `DoctorPageHeader` tabs slot)

#### UI-7 — scheduled communications (`#964`)

- [ ] Scheduling покрывает doctor/patient chat и doctor/patient comments.
- [ ] Schedule action рядом с Send открывает date/time picker и меняет основное действие на «Запланировать».
- [ ] Pending message виден отправителю с clock-state вместо delivery checks.
- [ ] Per-message `scheduled_at` и durable status хранятся с exact organization ownership.
- [ ] Worker dispatch закрывает retry/cancel/idempotency без копирования broadcast storage вслепую.

Exact execution checklist (authority для worker/auditor; каждый пункт требует evidence):

**UI and four-surface parity**

- [ ] Один shared composer contract поддерживает immediate send и schedule mode без локальных fork на шести
      существующих adapters: doctor chat/modal, patient chat, три doctor-comment adapters и patient comments.
- [ ] Schedule action расположен рядом с Send; picker использует doctor/patient shared primitives своей UI-zone,
      не создаёт cross-zone import и после выбора показывает основное действие «Запланировать».
- [ ] `datetime-local` интерпретируется в timezone браузера отправителя, в API уходит UTC ISO; допустимо только
      будущее время с minimum lead `60` секунд и maximum horizon `1` год.
- [ ] Scheduling text-only: существующий media/upload path остаётся immediate и не меняется.
- [ ] Pending item виден только точному creator, включая существующий скрытый program-detail modal после
      close/reload; recipient и другой clinic staff не видят будущий текст.
- [ ] Pending item показывает clock-state и локальное время вместо delivery checks; creator может отменить его.
      Edit/reschedule не вводятся: изменение времени — cancel + create new.

**Domain/storage contract**

- [ ] Новый scheduling aggregate принадлежит webapp domain и имеет direct `organization_id`, creator,
      typed target, immutable text payload, UTC `scheduled_at`, attempts/next-attempt/safe-error timestamps,
      unique idempotency key и resulting canonical message identifiers.
- [ ] Durable states ограничены `scheduled | processing | sent | failed_retryable | dead | cancelled`; `sent`
      означает exactly-once materialization canonical BersonCare message/comment. Внешняя доставка остаётся отдельной
      существующей notification pipeline и не переопределяет этот status.
- [ ] Pending storage не создаёт live message/discussion row заранее и не влияет на unread/read cursor,
      conversation ordering/`last_message_at`, patient action log или notification до due dispatch.
- [ ] Drizzle schema/repository/ports/DI и migration используют existing getDrizzle path; application raw SQL и
      второй broadcast/outgoing queue запрещены. Due, creator-list, target и idempotency hot indexes создаются в той же
      migration.

**Dispatch/access/cancel contract**

- [ ] Due worker использует transactional claim/CAS, bounded retry/backoff и stable schedule-derived IDs;
      concurrent workers и crash after materialization не создают дубль.
- [ ] Dispatch переиспользует canonical immediate service каждого surface. Doctor comment сохраняет ровно один
      support message + один linked discussion row; patient comment создаёт action log только в due moment.
- [ ] Перед dispatch повторно проверяются organization, target ownership и current access. Deleted/archived target,
      revoked access или mismatch завершаются fail-closed `dead` с PII-free reason.
- [ ] Cancel разрешён только exact creator для `scheduled`/`failed_retryable`; race с `processing`/`sent` даёт
      deterministic conflict и cancelled item никогда не dispatch-ится.
- [ ] Internal tick использует существующий authenticated operational-principal/telemetry pattern и не допускает
      реальных внешних отправок из DEV.

**Mandatory verification**

- [ ] Focused tests закрывают четыре same-org allow и cross-org/mismatched deny paths, creator-only pending
      visibility, pre-due invisibility to unread/order/action-log/recipient и invalid/past/horizon boundaries.
- [ ] Concurrency/crash/retry/idempotency, doctor dual-write, patient due-time action-log, cancel race,
      access-revoked/dead и external-notification-failure-no-duplicate покрыты deterministic tests.
- [ ] Locked/RLS matrix, migration/index contract, typecheck, scoped lint and production build relevant package
      проходят; live DEV doctor+patient checks не отправляют сообщения во внешние каналы.
- [ ] Один независимый high-risk audit проходит весь этот checklist; находка вне него становится owner question,
      а не новым scope.

Scope decision, не implementation checkbox: Voice/STT исключён из текущего scope и сохранён post-production в
`#922`.

#### UI-8 / UI-9 / Client residual

- [x] UI-8 использует единый S4/C5 organization-only entitlement/commercial contour без второго registry.
      (✓ modules/org-entitlements/types.ts:7-32 single `MECHANIC_REGISTRY`; service.ts:100-115,145-188)
- [x] Для новых назначений разминок default = `12:00` и `15:00` в рабочие дни; существующие назначения не
      изменяются (`#191`). (✓ modules/reminders/scheduleSlots.ts:22-25; ensureWarmupsReminderOnFirstPwaPush.ts only fills default when no existing rule)
- [x] UI-9 создаёт personal-scoped exercise из program editor; org-catalog save только явный.
      (✓ modules/lfk-exercises/types.ts:11 `ExerciseCatalogScope = "catalog" | "personal"`; InstanceAddLibraryItemDialog.tsx defaults `saveToCatalog=false`)
- [x] UI-9 media использует exact-org ownership/presign path, назначенное видео immutable.
      (✓ media-presign/route.ts authorized-folder guard; pgTreatmentProgramInstance.ts freezes media in snapshot)
- [x] Пустой patient mood chart скрыт до первой отметки, controls не удалены.
      (✓ PatientHomeMoodCheckin.tsx:178 renders week chart only when `hasWellbeingWeekMarks`; controls stay outside the condition)

#### Milestone completion gates

- [ ] Все открытые in-scope owner checkboxes текущего пакета закрыты отдельным evidence, без parent-stage shortcut.
- [ ] Targeted tests/typecheck/lint закрыты для каждого изменённого scope; presentation audits выполнены ровно один
      раз, high-risk stages — по их risk tier.
- [ ] Один accumulated full CI начат на `2a2cbda61`, продолжен canonical resume после единственного stale-test
      failure и дополнен точечными delta-gates до deployed `eb64a495644`; полный прогон не повторялся после малых
      correction slices.
      (REOPENED 2026-07-23: literal SHA chain is stale current-state wording — current accumulated full CI runs on the
      successor product tree through `2c3b40e77` per docs/\_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/TEST_DEPLOY_EVIDENCE_2026-07-22.md;
      the underlying achievement (lint/typecheck/full test suites/builds green, no repeat after small correction slices)
      is still true on that successor tree, but the literal SHA pointer needs updating before re-ticking.)
- [ ] Разрешённый code-only TEST deploy указывает на exact SHA `eb64a495644`; dump/restore/full reset не запускались,
      locked product smoke `22/22` и отдельный deny-smoke прошли.
      (REOPENED 2026-07-23: literal SHA `eb64a495644` is stale — current canonical TEST checkout resolves to successor
      SHA `2c3b40e7738a1fe45a713f7f9f6d0a39db707f7e` per the same TEST_DEPLOY_EVIDENCE_2026-07-22.md; smoke `22/22` and
      deny-smoke are confirmed green on that successor checkout, but the literal SHA claim in this checkbox is outdated.)
- [ ] Owner прошёл live click-through по точным URL/ролям/viewports; `accepted` остаётся только owner action.

### Обязательный порядок исполнения — current selector 2026-07-22

1. Закрытые UI-0, UI-2, UI-9 и Patient mood residual повторно не запускаются. UI-P baseline не повторяется, но
   latest owner correction `#967` исполняется как отдельный exact residual. Закрытый S4/C5 контур UI-8
   также не повторяется, но его отдельный reminder-default residual `#191` остаётся открытым. UI-1/UI-3/UI-4/UI-6
   не переоткрываются целиком: workers получают только exact residual из current-truth table.
2. Текущий independent presentation cluster: Today correction `#966` параллельно shared tabs/lists/background
   correction `#967`; затем UI-1 picker `#960`, UI-3a/b gradient+broadcast IA `#961` и UI-4 preview + UI-5a
   full-workspace reuse `#958`, не более трёх workers одновременно.
3. UI-3c shared composer `#962` идёт после UI-3a/b из-за пересечения communications consumers. UI-6b `#963`
   стартует только после отдельного data/settings contract manifest и не смешивается с уже закрытой косметикой;
   reminder-default `#191` исполняется отдельным bounded behavior slice без изменения существующих назначений.
4. Полный UI-5b остаётся после U5A и record-class visibility/export readiness. UI-7a `#964` — отдельный high-risk
   backend/worker stage; UI-7b Voice/STT `#922` остаётся post-production.

Targeted checks presentation workers могут идти независимо; lint/build/full CI и live DEV на единственном `:5200`
сериализуются. Полный CI запускается на milestone, а не после каждого slice.

## 3. Exact task mapping — без дублей

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

| Scope                                    | Existing authority/task                                            | Действие                                                                                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI-0 booking funnel                      | `#923`; manual patient/walk-in — `#801`                            | `#923` — единый UI-0 stage; `#801` остаётся отдельным authority для полного manual patient/walk-in scope и не форкается                             |
| Manual patient/walk-in                   | U3B / `#801`                                                       | переиспользовать; не считать authority для UI-0 trace                                                                                               |
| UI-1 presentation/behavior               | historical C1 / `#851`; exact picker residual `#960`               | не переоткрывать весь C1; `#960` заменяет локальный picker canonical reuse                                                                          |
| UI-1c appointment detail card            | `#951`, sibling закрытого C1 `#851`                                | новый owner delta; запускать отдельно, не переоткрывать и не повторять весь C1                                                                      |
| SCH-G5                                   | `#848`                                                             | owner-waiting, без реализации                                                                                                                       |
| UI-2 built-in Online location            | базовый online-location scope отделить от расширенного `#215`      | G5 закрыт; переиспользовать существующую модель и не объявлять закрытым расширенный flow `#215`                                                     |
| UI-3 communications                      | historical C1 / `#852`; residual `#961` + `#962`                   | `#961` gradient+broadcast IA; `#962` shared composer; закрытую 45/55 часть не повторять                                                             |
| UI-4/UI-6 presentation                   | historical C1 / `#850`; UI-4 preview входит в `#958`; UI-6b `#963` | закрытые presentation/metrics не повторять; preview и configurable Today не считать закрытыми baseline                                              |
| UI-5a existing-card full-workspace reuse | `#958`; layout-only predecessor U5B                                | selected card заменяет весь content container; возврат восстанавливает list state; после route/guard census, без data/API/visibility/schema changes |
| UI-5b organization card/history policy   | U5B roadmap stage / `#928` contract                                | U5A + record-class runtime readiness; не смешивать с `#958`                                                                                         |
| UI-8 mechanics/reminders                 | C4D/C5 + `#191`, foundation `#888` accepted                        | только organization/clinic axis; не форкать entitlement/commercial систему                                                                          |
| UI-9 individual exercises                | `#564`, design `#565`                                              | owner-approved; запуск после C4D exact-org isolation                                                                                                |
| Patient Today mood residual              | `#924`                                                             | repository stage завершён; live owner acceptance не подменять audit seal                                                                            |
| UI-7a scheduled messages                 | `#964`                                                             | high-risk backend/worker stage после exact contract; Voice/STT `#922` исключён                                                                      |
| UI-P doctor chrome/tokens                | taskdb `#925`                                                      | shared doctor primitives + Clients header search; presentation-only, без patient/public UI                                                          |
| Full Doctor DNA migration                | `#885`                                                             | owner-cancelled/superseded; сохранить blocked historical record без stale question                                                                  |

## 4. Parallel presentation manifests

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

File scopes ниже не пересекаются. **Этот docs-only pass workers не запускает.** UI-4a и UI-6a уже были
интегрированы и прошли собственный независимый presentation audit; они являются baseline, а не заданием на повтор.
Перед новым worker оркестратор сверяет фактический diff/live acceptance и выдаёт только остаток последнего owner
delta. UI-1 и UI-3 могут выполняться параллельно с этим residual при лимите ≤3.

### UI-6a — Сегодня

**Current fact:** базовый compact-presentation slice уже интегрирован и проверен; не перезапускать без нового
непокрытого owner delta.

**Writable manifest:**

- `apps/webapp/src/app/app/doctor/DoctorTodayMiniCalendar.tsx`
- `apps/webapp/src/app/app/doctor/DoctorTodayMiniCalendar.test.tsx`
- `apps/webapp/src/app/app/doctor/DoctorTodayDashboard.tsx`
- `apps/webapp/src/app/app/doctor/DoctorTodayDashboard.test.tsx`
- `apps/webapp/src/app/app/doctor/DoctorTodayLeftKpiRow.tsx`
- `apps/webapp/src/app/app/doctor/DoctorTodayLeftKpiRow.test.tsx`

**Acceptance:** DEV `http://127.0.0.1:5200/app/doctor`, `dev:doctor`; `1440×900` и `390×844`. KPI не имеют
искусственной пустой высоты; дата и «Открыть календарь» находятся в компактной календарной шапке; день/дата и
количество записей не дублируются. Никаких новых KPI/сигналов или query changes.

### UI-1a — Расписание presentation

**Writable manifest:**

- `apps/webapp/src/app/app/doctor/schedule/tabs/ScheduleWorkTab.tsx`
- `apps/webapp/src/app/app/doctor/schedule/tabs/ScheduleWorkTab.test.tsx`
- `apps/webapp/src/app/app/doctor/schedule/tabs/ScheduleCalendarTab.tsx`
- `apps/webapp/src/app/app/doctor/schedule/tabs/ScheduleCalendarTab.test.tsx`

**Acceptance:** DEV `http://127.0.0.1:5200/app/doctor/schedule?tab=work` и `?tab=calendar`, `dev:admin`;
`1440×900` и `390×844`. Все template-days залиты existing location color; time + city показаны один раз в weekday
header, а не повторены в каждой date-cell; действие называется «Установить», используется существующий shared time
picker, grid lines спокойнее. Фильтр state и SCH-G5 не менять в presentation slice.

### UI-1c — Карточка записи presentation/interaction

**Current fact:** `DoctorCalendarEventPanel` переиспользуется в schedule и двух modal wrappers «Сегодня»; именно
сочетание встроенного close и стандартного `DialogContent` даёт два крестика. Карточка уже получает canonical
patient id/phone, имеет `DoctorOpenChatButton` и `phoneToTelHref` reuse-кандидаты, но текущий payment panel только
загружает диагностический summary и не имеет полного readiness/cash/invoice/QR contract.

**Writable manifest (уточнить current callsites перед launch):**

- `apps/webapp/src/app/app/doctor/calendar/DoctorCalendarEventPanel.tsx`
- `apps/webapp/src/app/app/doctor/calendar/DoctorCalendarEventPanel.test.tsx`
- `apps/webapp/src/app/app/doctor/TodayAppointmentFullModal.tsx`
- `apps/webapp/src/app/app/doctor/TodayMiniCalendarWithModal.tsx`
- `apps/webapp/src/app/app/doctor/clients/AppointmentStaffCommentsSection.tsx`
- существующий или новый focused test рядом с `AppointmentStaffCommentsSection`, только если blank-draft contract
  нельзя доказать через panel test без тяжёлого mock graph.

**Acceptance:** DEV `/app/doctor/schedule?tab=calendar` и `/app/doctor`, `dev:doctor`; `1440×900` и `390×844`.
Проверить modal и embedded context, confirmed + cancelled/rescheduled statuses, solo и clinic context, patient с/без
phone/canonical id, whitespace comment, unchanged appointment и реально перенесённую запись. Payment panel отсутствует
до отдельной readiness proof. Focused tests + scoped typecheck/lint; один live pass и один independent presentation
audit. TEST/deploy/full CI не входят — stage присоединяется к следующему milestone CI.

### UI-4a — Клиенты presentation

**Current fact:** базовый 50/50/presentation slice уже интегрирован и прошёл независимый audit; не запускать его
заново. Остаточный новый owner delta определяется по current code/live evidence и taskdb `#850`.

**Writable manifest:**

- `apps/webapp/src/app/app/doctor/patients/PatientsPageClient.tsx`
- `apps/webapp/src/app/app/doctor/patients/PatientsPageClient.test.tsx`

**Acceptance:** DEV `http://127.0.0.1:5200/app/doctor/patients`, `dev:doctor`; `1440×900` и `390×844`. Обычный режим
сохраняет 50/50 `list + filters/preview`; поиск находится в page header; KPI по три в ряд, имеют единый active state
и короткие delayed tooltips; терминология берётся из patient label; информационные иконки имеют стабильные слоты.
Не менять metric queries/semantics. Полная карточка относится к отдельному UI-5 card mode и не рендерится внутри
правой половины.

Для каждого scope: focused tests + scoped typecheck/lint по политике, один живой DEV evidence pass (сериализован на
`:5200`), затем один независимый audit по точным acceptance. TEST deploy и full CI не входят; full CI идёт только на
следующей milestone-вехе.

### UI-3 presentation/interaction delta — Коммуникации

**Current fact:** исторический taskdb `#852` стартовал с 40/60, но поздний owner delta и текущий live baseline уже
45/55 с fallback 50/50. Acceptance карточки и этого плана используют только позднюю пропорцию; старый stage целиком
не повторяется, проверяется только полный непокрытый residual ниже.

**Initial file census (уточнить code-search перед launch):**

- `apps/webapp/src/app/app/doctor/communications/tabs/*`
- `apps/webapp/src/modules/messaging/components/ChatView.tsx`
- doctor/patient comment renderers, найденные через current callsites `ChatView`/discussion panels
- `apps/webapp/src/app/app/doctor/communications/broadcasts/*`
- `apps/webapp/src/app/app/doctor/communications/DoctorOnlineIntakeClient.tsx`

**Acceptance:** split 45/55 на desktop во всех применимых вкладках через существующий split primitive, fallback
50/50; mobile master/detail не регрессирует. Одинаковый фон применён к doctor/patient chat, modal и comments. Имя в
шапке — единственная доступная навигация в карточку с сохранённым route contract. Broadcast selection раскрывается
без overlap с summary/delivery/error details; лишняя верхняя фраза отсутствует; intake left list не дублирует name
link detail. Shared composer/backend/scheduled-message работу не смешивать с этим presentation/interaction scope.

## 5. Реестр переиспользования — не строить второй механизм

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- `DoctorDateTimePicker` и существующие time-picker contracts → UI-1.
- Existing location-color resolver/tokens → все template days и weekday header UI-1.
- Existing independent multi-select pattern → UI-1b, после trace текущего state contract.
- Standard doctor `Badge`, `DoctorOpenChatButton`, `phoneToTelHref` и canonical `patientCardHref` → UI-1c; новый
  chat/phone/payment механизм не создавать.
- `CatalogSplitLayout`/действующий doctor split primitive → обычный UI-3/UI-4 split. UI-5 full-workspace card mode
  не втискивается в этот primitive и переиспользует существующий patient-card route/view.
- `ChatView` и текущие discussion renderers → UI-3 background и поздний UI-7 message status.
- Existing Overview/Visits blocks и `MembershipPanel` → перенос в UI-5, не переписывание.
- Accepted S4 `MECHANIC_REGISTRY`/resolver/chokepoint `#888` → UI-8.
- Design `#565`, current program editor/media abstractions и approved ownership path → UI-9.

## 6. Handoff и completion

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- Этот документ детализирует исполнение; status, completion и DAG остаются только в roadmap/taskdb/LOG.
- Worker handoff: commit, exact files, acceptance lines, commands/results, DEV URLs/viewports, residual risks.
- Presentation PASS не закрывает backend sibling; backend PASS не разрешает owner-waiting gates.
- После интеграции accepted slice в `feat/doctor-ui-rebuild` временная branch/worktree удаляется.
- Owner-visible TEST checkpoint проводится только по отдельному явному разрешению и только code-only deploy.
