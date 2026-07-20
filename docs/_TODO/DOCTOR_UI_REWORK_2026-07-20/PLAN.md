# Doctor UI Rework — детальный execution artifact (2026-07-20)

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

- Presentation/layout/text/mechanical: один цельный worker и один независимый audit, без серийных correction-аудитов.
- Identity, tenant isolation, schema/data migration, entitlements и деньги: полный risk-sized цикл roadmap §7.2.
- Не более трёх независимых workers; full CI, lint/build и единственный живой DEV `:5200` сериализуются.
- Любой TEST deploy — отдельное действие только после прямого разрешения владельца. Этот план его не разрешает.
- Finding без строки в owner review/roadmap — вопрос владельцу, не новая задача.

## 1. Решения и открытые развилки

| Gate | Зафиксированное состояние | Safe default / зависимость |
|---|---|---|
| G1 — индивидуальные упражнения | **решено: ДА**, `#564` разблокирована | сначала C4D exact-org library isolation; это hard dependency, не owner gate |
| G2 — voice/STT | **решено: post-production**, taskdb `#922` | сейчас не трогать |
| G3 — тумблеры механик | **решено: только organization/clinic**, не специалист | строить на существующем S4 engine `#888`, не форкать |
| G4 — split коммуникаций | **решено: 45/55** | согласованный fallback: 50/50 |
| G5 — онлайн-приём | **решено:** online уже существует; нужна только встроенная включаемая локация «Онлайн» | её toggle гейтит существующие online-галочки услуг; новой схемы не вводить |
| G6 — общий Doctor UI chrome | **решено:** gap background `#faf9f4`, белая page header, радиусы blocks/KPI/controls `12/8/24px`, padding основных блоков `18px`, белый input, KPI label сверху/value снизу; list rows крупнее/легче, с серым divider `1px` и horizontal padding `24px` | один shared-primitives presentation pass; doctor workspace only, без локального style fork |
| SCH-G5 — fallback слотов | **owner question `#848`** | не менять строгую/резервную семантику без ответа |

Отдельное точное решение по `#191`: разминки по умолчанию в `12:00` и `15:00` в рабочие дни; существующих клиентов
не менять. Это снимает вопрос о времени, но не добавляет UI-8 в текущий launch scope.

## 2. Stage map и границы

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
chat-card navigation нельзя
молча заменить новой: route и доступность должны сохраниться. Shared composer — рекомендация по reuse, а не
разрешение переписать четыре consumers. Voice/STT — deferred UI-7b, не часть общего composer refactor.

### UI-4 — список клиентов

- **UI-4a presentation:** layout, поиск, KPI presentation/tooltips/терминология и порядок информационных иконок;
  launch manifest — §4.
- **UI-4b metrics/backend:** all-time cancellations/reschedules, active-only и expired membership semantics —
  отдельный contract stage с repository/API evidence. Presentation не должна выдумывать недоступные цифры.
- 50/50 и удаление preview нельзя считать разрешением на архитектурную inline-карточку: это UI-5.

**UI-4a exact presentation:** поиск переезжает в page header, а количество и сортировка остаются в шапке списка;
KPI показываются по три в ряд, filtered value — отдельной меньшей цифрой без slash с filter icon; tooltip появляется
с задержкой и укладывается в одну строку; «Все люди» использует настроенный patient plural label; icon slots идут
membership → program-or-supervision → appointment без фоновых коробок. **UI-4b owner intent:** cancellations и
reschedules — all-time, membership KPI — только active, expired memberships — отдельная метрика. Точные repository
fields/API сначала доказываются; pending payment нельзя молча считать active.

### UI-5 — organization patient card

UI-5 является реализацией U5B, а не продолжением косметики списка. Он стартует только после U5A и решения
record-class visibility/export policy. Organization context, foreign-object denial и clinical record ownership
имеют high-risk audit. Пока gate не закрыт, существующая standalone patient card остаётся канонической.

После readiness U5B сохраняет следующий owner outcome, но не начинает его раньше gate:

- карточка открывается в контейнере «Клиенты» без промежуточного preview; поиск активной карточки даёт dropdown;
- compact sticky header: ФИО, полная «Дата рождения», edit affordance и правые deep links chat/phone/email/messenger;
- tabs под header, внутренний 50/50 layout; mobile показывает одну часть за раз;
- Communications и Overview не остаются дублирующими tabs: существующие Notes, Tasks, symptom dynamics, assigned
  program и exercise-completion calendar переносятся, а не переписываются;
- KPI Visits/Future appointments/Memberships открывают соответствующий left content; prepared visit открывает notes;
- membership list/history сохраняет Add, Write off и Recalculate flows; online payment остаётся отдельной `#819`;
- убрать пустые/объяснительные подписи, «Актуальный» и отдельный preliminary diagnosis bucket; переиспользовать
  существующую symptom color logic.

Ни один из этих пунктов не разрешает обход organization context, объединение record classes или потерю standalone
deep-link compatibility до принятого U5B routing contract.

### UI-6 — Сегодня

- **UI-6a presentation:** компактные KPI, перестановка даты/ссылки календаря и удаление дублирующих подписей;
  launch manifest — §4.
- Настраиваемые owner signals, переключатель «на сопровождении»/«недавние с визитами», «самые активные», новые
  counters и скрытие клиентов — рекомендация для отдельной product/behavior работы, не косметика UI-6a.

### UI-P — общий Doctor UI presentation-token pass

- Фон между page-level блоками — `#faf9f4`; sticky page header с названием остаётся белой.
- Радиусы задаются общими doctor primitives: page-level block `12px`, KPI `8px`, doctor button/input/select trigger
  `24px`. Основные блоки используют внутренний отступ `18px`; внутренний `input` имеет белый фон. Локальные копии
  этих классов по страницам не создаются.
- KPI во всех затронутых doctor surfaces используют один порядок: label сверху, value снизу.
- Основной шрифт строк doctor-списков становится крупнее и легче без изменения meta/badge/calendar typography;
  строки разделены серой линией `1px` и имеют горизонтальные внутренние отступы `24px`.
- На странице «Клиенты» поиск переносится из отдельного toolbar под header в правый слот белой page header, на
  одну линию с title. Desktop width совпадает с правой половиной 50/50 split; mobile остаётся доступным и компактным.
- Это presentation-only stage: metric semantics, list sorting/filtering, patient UI, public booking и page data
  contracts не меняются. Перед worker запуском нужен current-use census shared primitives и точный affected-file
  manifest; один worker + один независимый presentation audit, без серийных correction rounds.

### UI-7 — коммуникационные возможности

- **UI-7a scheduled messages:** только после отдельного backend contract для queue, retry, cancellation, org scope
  и delivery; owner outcome — schedule button рядом с Send, date/time picker, «Запланировать» и pending clock state
  у sender; не прячется внутри presentation UI-3 и не копирует broadcast storage без contract review.
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

### Обязательный порядок исполнения

1. **UI-0** — P0 booking funnel целиком.
2. **UI-1 / UI-3 / UI-4 / UI-6 presentation cluster** — непересекающиеся file scopes параллельно, но не более
   трёх workers одновременно. Интегрированные и уже прошедшие принятый slice/audit пункты UI-4a/UI-6a не
   перезапускаются: worker получает только новый owner delta и фактический residual после code/live census.
3. **UI-5** — после U5A и record-class visibility/export readiness.
4. Остальные UI-2/UI-7/UI-8/UI-9 — только по их dependencies; UI-7b `#922` остаётся post-production.

Targeted checks presentation workers могут идти независимо; lint/build/full CI и live DEV на единственном `:5200`
сериализуются. Полный CI запускается на milestone, а не после каждого slice.

## 3. Exact task mapping — без дублей

| Scope | Existing authority/task | Действие |
|---|---|---|
| UI-0 booking funnel | `#923`; manual patient/walk-in — `#801` | `#923` — единый UI-0 stage; `#801` остаётся отдельным authority для полного manual patient/walk-in scope и не форкается |
| Manual patient/walk-in | U3B / `#801` | переиспользовать; не считать authority для UI-0 trace |
| UI-1 presentation/behavior | C1 / `#851` | обновить scope существующей задачи при запуске |
| SCH-G5 | `#848` | owner-waiting, без реализации |
| UI-2 built-in Online location | базовый online-location scope отделить от расширенного `#215` | G5 закрыт; переиспользовать существующую модель и не объявлять закрытым расширенный flow `#215` |
| UI-3 communications | C1 / `#852` | split на subscopes в meta/note, не новые дубли |
| UI-4/UI-6 presentation | C1 / `#850` | принятые/integrated slices не повторять; новый owner delta и backend residual фиксировать отдельно в note/meta той же карты после census |
| UI-5 organization patient card | U5B roadmap stage | task создаётся/расширяется только при readiness, не заранее |
| UI-8 mechanics/reminders | C4D/C5 + `#191`, foundation `#888` accepted | только organization/clinic axis; не форкать entitlement/commercial систему |
| UI-9 individual exercises | `#564`, design `#565` | owner-approved; запуск после C4D exact-org isolation |
| UI-P doctor chrome/tokens | taskdb `#925` | shared doctor primitives + Clients header search; presentation-only, без patient/public UI |
| Full Doctor DNA migration | `#885` | owner-cancelled/superseded; сохранить blocked historical record без stale question |

## 4. Parallel presentation manifests

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

### UI-4a — Клиенты presentation

**Current fact:** базовый 50/50/presentation slice уже интегрирован и прошёл независимый audit; не запускать его
заново. Остаточный новый owner delta определяется по current code/live evidence и taskdb `#850`.

**Writable manifest:**

- `apps/webapp/src/app/app/doctor/patients/PatientsPageClient.tsx`
- `apps/webapp/src/app/app/doctor/patients/PatientsPageClient.test.tsx`

**Acceptance:** DEV `http://127.0.0.1:5200/app/doctor/patients`, `dev:doctor`; `1440×900` и `390×844`. Layout 50/50
на desktop и упражнения-подобный master/detail на mobile; поиск в page header; KPI по три в ряд, имеют единый active
state и короткие delayed tooltips; терминология берётся из patient label; информационные иконки имеют стабильные
слоты. Не менять metric queries/semantics и не строить inline patient card.

Для каждого scope: focused tests + scoped typecheck/lint по политике, один живой DEV evidence pass (сериализован на
`:5200`), затем один независимый audit по точным acceptance. TEST deploy и full CI не входят; full CI идёт только на
следующей milestone-вехе.

### UI-3 presentation/interaction delta — Коммуникации

**Current fact:** baseline taskdb `#852` завершён для прежнего 40/60 acceptance. Новый owner delta явно заменяет
только соответствующие presentation/interaction пункты; старый stage целиком не повторять.

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

- `DoctorDateTimePicker` и существующие time-picker contracts → UI-1.
- Existing location-color resolver/tokens → все template days и weekday header UI-1.
- Existing independent multi-select pattern → UI-1b, после trace текущего state contract.
- `CatalogSplitLayout`/действующий doctor split primitive → UI-3/UI-4/UI-5; новый layout primitive не создавать.
- `ChatView` и текущие discussion renderers → UI-3 background и поздний UI-7 message status.
- Existing Overview/Visits blocks и `MembershipPanel` → перенос в UI-5, не переписывание.
- Accepted S4 `MECHANIC_REGISTRY`/resolver/chokepoint `#888` → UI-8.
- Design `#565`, current program editor/media abstractions и approved ownership path → UI-9.

## 6. Handoff и completion

- Этот документ детализирует исполнение; status, completion и DAG остаются только в roadmap/taskdb/LOG.
- Worker handoff: commit, exact files, acceptance lines, commands/results, DEV URLs/viewports, residual risks.
- Presentation PASS не закрывает backend sibling; backend PASS не разрешает owner-waiting gates.
- После интеграции accepted slice в `feat/doctor-ui-rebuild` временная branch/worktree удаляется.
- Owner-visible TEST checkpoint проводится только по отдельному явному разрешению и только code-only deploy.
