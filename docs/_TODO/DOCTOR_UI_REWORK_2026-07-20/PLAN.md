# Doctor UI Rework — детальный execution artifact (2026-07-20)

> **Статус:** docs-only детализация существующего
> [`IMPLEMENTATION_ROADMAP.md`](../SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md), не второй roadmap и не
> источник статусов. Продуктовая authority — датированное дополнение в
> [`OWNER_REVIEW_2026-07-18.md`](../SAAS_PRODUCT_UX_INITIATIVE/OWNER_REVIEW_2026-07-18.md). Taskdb хранит только
> состояние и ссылки. До интеграции оркестратор повторно сверяет HEAD, taskdb и занятые file scopes.

## 0. Режим исполнения

- Presentation/layout/text/mechanical: один цельный worker и один независимый audit, без серийных correction-аудитов.
- Identity, tenant isolation, schema/data migration, entitlements и деньги: полный risk-sized цикл roadmap §7.2.
- Не более трёх независимых workers; full CI, lint/build и единственный живой DEV `:5200` сериализуются.
- Любой TEST deploy — отдельное действие только после прямого разрешения владельца. Этот план его не разрешает.
- Finding без строки в owner review/roadmap — вопрос владельцу, не новая задача.

## 1. Решения и открытые развилки

| Gate | Зафиксированное состояние | Safe default / зависимость |
|---|---|---|
| G1 — индивидуальные упражнения | **owner question:** начинать ли `#564`; `#565` — дизайн, а не разрешение реализации | не начинать; сначала C4D exact-org library isolation |
| G2 — voice/STT | **deferred** | не строить сейчас; UI-7b остаётся отдельным поздним этапом |
| G3 — тумблеры механик | **owner ruling:** текущий default только на организацию | не добавлять per-specialist axis |
| G4 — split коммуникаций | **owner question:** менять ли принятое 40/60 на 45/55 | сохранять 40/60 |
| G5 — онлайн-приём | **owner question:** точный MVP и граница относительно полной `#215` | не начинать schema/backend; рекомендация MVP не является решением |
| SCH-G5 — fallback слотов | **owner question `#848`** | не менять строгую/резервную семантику без ответа |

Отдельное точное решение по `#191`: разминки по умолчанию в `12:00` и `15:00` в рабочие дни; существующих клиентов
не менять. Это снимает вопрос о времени, но не добавляет UI-8 в текущий launch scope.

## 2. Stage map и границы

### UI-0 — ограниченная DEV-репродукция записи

**Не доказано:** P0, единая первопричина, ошибка canonical service OR или связь всех симптомов с `#801`.

Сначала на DEV воспроизвести и трассировать три независимых состояния:

1. выбор услуги и последующий render/SSR;
2. видимость услуги при комбинации location-service и specialist-service assignment;
3. создание записи из календаря и появление пациента в organization-owned client projection.

Проверка ограничена request/state trace, существующими тестами и безопасными DEV fixtures. TEST journal, TEST DB и
любой remote TEST-host доступ не входят в scope без отдельного разрешения. Текущая логика canonical service
relevance `location assignment OR specialist assignment` сохраняется, пока trace не докажет конкретный write/read
дефект; нельзя заменять её более узким AND по предположению. Ручной пациент, appointment и walk-in остаются в
существующей `#801`/U3B — здесь не создаётся второй механизм. Кликабельное ФИО в существующей детали записи —
отдельный низкорисковый presentation slice после подтверждения текущего route contract.

**Risk:** trace — read-only/targeted; найденный identity/booking fix получает отдельный high-risk scope по доказанной
причине, а не автоматически весь UI-0.

### UI-1 — расписание

- **UI-1a presentation:** цвета существующих location tokens в недельном шаблоне, текст «Установить», подключение
  существующего `DoctorDateTimePicker`, более спокойные grid lines. Launch manifest — §4.
- **UI-1b behavior:** independent multi-select location filters: inactive серые, каждый location toggles независимо,
  «Все» включает все; отдельный focused behavior scope после trace текущего state contract.
- **SCH-G5:** не входит ни в UI-1a, ни в UI-1b; остаётся owner-waiting `#848`.
- **UI-2 online appointment:** отдельный backend/schema этап после ответа G5; системная online-location,
  delivery-mode услуги и public booking не строятся как косметика.

### UI-3 — коммуникации

Разделить три непересекающихся по риску этапа:

1. **UI-3a cosmetics:** подтверждённые тексты, фон/градиент и мелкая presentation-плотность без смены split;
2. **UI-3b broadcast IA:** журнал, выбор/раскрытие и error-details с отдельным interaction acceptance;
3. **UI-3c composer/backend:** shared composer, scheduled messages и delivery state; high-risk там, где появляется
   durable queue/dispatcher.

**Owner-ruling content to preserve in the bounded subscopes:** одинаковый chat background в doctor/patient chat,
modal и comments; имя в шапке как единственная card navigation; убрать лишнюю верхнюю фразу broadcasts; выбранная
рассылка раскрывается без перекрытий с summary/delivery/error data; в левом списке заявок не дублировать ссылку на
имя, если она есть в detail. Принятый 40/60 остаётся до ответа G4. Существующую принятую chat-card navigation нельзя
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

### UI-7 — коммуникационные возможности

- **UI-7a scheduled messages:** только после отдельного backend contract для queue, retry, cancellation, org scope
  и delivery; owner outcome — schedule button рядом с Send, date/time picker, «Запланировать» и pending clock state
  у sender; не прячется внутри presentation UI-3 и не копирует broadcast storage без contract review.
- **UI-7b voice/STT:** deferred по G2.

### UI-8 — capability/commercial projection

UI-8 вложен в C4D/C5. Он использует единый entitlement registry, точную organization ownership и commercial
defaults; не создаёт параллельную polarity system, seed или второй набор feature keys. Org-only — текущий default;
per-specialist axis deferred. Owner outcome — администратор может собирать тариф/включать доступные организации
механики через единый commercial contour; точные registry keys/default polarity и migration определяет C4D/C5, а
не этот UI plan. Значения `#191` не являются разрешением запускать UI-8 раньше C4D/C5.

### UI-9 — индивидуальные упражнения

UI-9 зависит от C4D exact-org library isolation и ответа G1. `#565` — design evidence; `#564` остаётся blocked до
прямого «запускать». Design recommendation: personal-scoped exercise создаётся из program editor, doctor media
upload использует organization/patient-owned folder contract, а назначенное видео immutable; точные field names и
draft semantics не являются owner rulings. Media access/presign и tenant ownership проверяются high-risk циклом.

### Client UI residual

Пустой mood chart на patient «Сегодня» скрывается до первой emoji/check-in отметки. Это точечная presentation-задача,
не расширяет Doctor UI stage и получает отдельный exact file manifest перед запуском.

## 3. Exact task mapping — без дублей

| Scope | Existing authority/task | Действие |
|---|---|---|
| UI-0 patient/appointment/walk-in | U3B / `#801` | trace и переиспользование; не форкать карточку |
| UI-1 presentation/behavior | C1 / `#851` | обновить scope существующей задачи при запуске |
| SCH-G5 | `#848` | owner-waiting, без реализации |
| UI-2 online appointment | `#215` | owner-waiting до ответа G5 |
| UI-3 communications | C1 / `#852` | split на subscopes в meta/note, не новые дубли |
| UI-4/UI-6 presentation | C1 / `#850` | launch manifests ниже; backend residual отдельно в той же карте до triage |
| UI-5 organization patient card | U5B roadmap stage | task создаётся/расширяется только при readiness, не заранее |
| UI-8 mechanics/reminders | C4D/C5 + `#191` | не форкать entitlement/commercial систему |
| UI-9 individual exercises | `#564`, design `#565` | blocked до G1 и C4D |
| Full Doctor DNA migration | `#885` | owner-cancelled/superseded; сохранить blocked historical record без stale question |

## 4. Immediate parallel presentation launch manifests

Эти три scope готовы к выдаче workers, но **этот docs-only pass их не запускает**. Файлы не пересекаются.

### UI-6a — Сегодня

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
`1440×900` и `390×844`. Existing branch colors видны в weekly template/day label, действие называется
«Установить», используется существующий shared time picker, grid lines спокойнее. Фильтр state и SCH-G5 не менять.

### UI-4a — Клиенты presentation

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

## 5. Handoff и completion

- Этот документ детализирует исполнение; status, completion и DAG остаются только в roadmap/taskdb/LOG.
- Worker handoff: commit, exact files, acceptance lines, commands/results, DEV URLs/viewports, residual risks.
- Presentation PASS не закрывает backend sibling; backend PASS не разрешает owner-waiting gates.
- После интеграции accepted slice в `feat/doctor-ui-rebuild` временная branch/worktree удаляется.
- Owner-visible TEST checkpoint проводится только по отдельному явному разрешению и только code-only deploy.
