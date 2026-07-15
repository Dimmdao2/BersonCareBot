# UX-03 — Product operating model (draft)

**Статус:** рабочий synthesis draft; не owner ruling и не финальная specification.
**Дата:** 2026-07-15.
**Scope:** роли, рабочие контексты, solo/clinic composition, patient multi-org, карточка пациента и semantics handoff.

## 1. Назначение и границы

Документ собирает один непротиворечивый operating-model candidate из UX-01, UX-02 и текущего
`SAAS_FOUNDATION`. Он нужен как вход в role/capability matrix и будущую target IA.

Здесь не принимаются решения владельца о:

- точных правах assistant;
- clinic-wide видимости медицинской истории;
- финальной модели карточки пациента;
- том, требует ли handoff подтверждения принимающего специалиста;
- default organization пациента при нескольких enrollment;
- тарифной упаковке team/collaboration capabilities.

Нет изменений app code, API, БД, RLS, auth, route tree или текущего SaaS execution plan.

## 2. Канон и provenance

### Зафиксированные источниками факты

- Tenant/workspace — `Organization`; solo specialist — организация с одним специалистом, clinic — организация с
  несколькими специалистами/локациями (`SAAS_FOUNDATION/00_DECISIONS_AND_SCHEMA.md`, D1).
- Один staff login имеет ровно один active organization membership. Ноль membership означает отсутствие staff
  workspace; несколько — `multiple_active_staff_memberships`, ошибка целостности, а не экран выбора организации.
  Для работы сотрудника во второй клинике используется отдельный email/login
  (`P0_2_MEMBERSHIP_RESOLVER_CHECKLIST.md`, `SAAS_R3_CUT_INVENTED_SCOPE.md`).
- Staff membership roles: `owner | admin | doctor | assistant`. Membership может быть связан с одним
  `specialistId`; owner/admin могут управлять организацией. Assistant признан ролью, но его точные powers не
  определены.
- Patient — один canonical `platform_user` и может иметь explicit enrollment в нескольких организациях. Это не
  создаёт отдельный patient account на каждую клинику (`00_DECISIONS_AND_SCHEMA.md`, D2).
- Organization owner/admin может одновременно быть специалистом. Владелец явно разрешил решить это одним меню,
  переключением рабочих поверхностей или отдельными вкладками; второй login не требуется
  (`OWNER_RULINGS_2026-07-15.md`, §17).
- Фильтр «мои пациенты» нужен уже сейчас, но является UX-слоем и не меняет tenant wall или право доступа
  (`OWNER_RULINGS_2026-07-15.md`, §7).
- Внутренняя organization directory доступна global admin; публичные карточки/каталог строятся отдельной public
  projection. Привязка пациента к организации возникает через регистрацию клиникой, invite или booking
  (`OWNER_RULINGS_2026-07-15.md`, §12).
- Current staff shell уже получает server-resolved organization, membership role, specialist binding и management
  flags. Patient shell пока не показывает устойчивый organization context. Current-state evidence и gaps описаны в
  `SCREEN_INVENTORY_SPECIALIST.md` и `SCREEN_INVENTORY_PATIENT_PUBLIC.md`.

### Evidence-backed продуктовые паттерны, но не решения

- Один organization account может одинаково поддерживать solo и team, если first-run и доступные действия
  capability-driven.
- Общая organization-scoped patient record с authored entries и фильтрами по специалисту обычно уменьшает дубли и
  фрагментацию истории.
- `primary specialist`, `care team`, assignment конкретной работы и transfer между организациями — разные
  операции, их нельзя объединять одной кнопкой «Передать пациента».

Источники и ограничения этих выводов: `UX02_PRODUCT_PATTERNS.md`, `UX02_TECHNICAL_PATTERNS.md`.

## 3. Термины модели

| Термин | Значение в этом draft |
|---|---|
| Organization | Tenant и рабочее пространство практики; solo и clinic — формы одной сущности, не разные типы аккаунтов. |
| Staff identity | Login персонала с одним active organization membership. Не имеет org switcher. |
| Membership role | Базовая organizational роль `owner/admin/doctor/assistant`; сама по себе не заменяет granular capabilities. |
| Specialist binding | Связь staff membership с clinical specialist. Может отсутствовать у non-clinical owner/admin/assistant. |
| Workspace surface | Management, clinical или platform-operations композиция экранов в рамках одной session. Это не новая identity и не повышение прав. |
| Patient identity | Глобальный canonical user, общий для всех организаций и каналов. |
| Enrollment | Явная связь patient identity с одной organization. Несколько active enrollment разрешены. |
| Patient record | Organization-owned clinical representation пациента; не равна global identity/profile. |
| Attribution | Неизменяемая связь события/визита/назначения с автором и clinical source context. |
| Assignment | Текущая операционная ответственность; может меняться, не переписывая attribution истории. |
| Filter | Представление уже разрешённого набора данных. Никогда не источник authorization. |

## 4. Непереговорные инварианты

### 4.1 Identity и organization context

1. Staff organization context всегда приходит из единственного active membership, server-side. Query, host,
   выбранный specialist и client state не могут сменить organization.
2. Staff org switcher запрещён текущим каноном. Если один человек работает в двух организациях, это две staff
   identity/login связи, даже если в будущем identity federation упростит повторный вход.
3. Patient имеет одну canonical identity и может иметь несколько active enrollment; patient organization switcher
   разрешён и нужен именно поэтому.
4. Patient active organization выбирает только care context среди уже доступных enrollment. Он не создаёт
   enrollment и не расширяет доступ.
5. Organization context должен быть явным на patient booking, program, message, notification, payment и support
   surfaces. Данные двух организаций не смешиваются в одной clinical timeline или conversation без отдельного
   явно спроектированного cross-org workflow.
6. Host, custom domain, invite branding и URL могут предложить entry context, но не заменяют membership,
   enrollment или capability check.

### 4.2 Роли, modes и capabilities

1. `owner/admin` и `specialist` — совместимые признаки одного staff account, а не взаимоисключающие persona.
2. Management/clinical switch меняет композицию и задачи, но не session, identity, organization или права.
3. Clinical authorship и работа «как специалист» требуют specialist binding и необходимых clinical capabilities.
   Management role сама по себе не создаёт clinical authorship. Может ли non-clinical owner/admin читать часть
   clinic record как операционный сотрудник, определяется отдельной permission matrix и owner decision.
4. Management actions проверяются server-side по role/capability. Скрытая вкладка не является защитой.
5. Global admin работает в отдельной platform-operations surface. Вход в неё не должен маскироваться под doctor
   navigation, даже если один platform user технически имеет staff membership. Это разделение IA не отменяет
   зафиксированный platform-level доступ global admin к данным и restricted operational tools.
6. Entitlement может скрыть/заблокировать paid capability и показать upgrade path, но не может дать clinical access
   без role/membership/authorization.

### 4.3 Clinical history и handoff

1. «Мои / все пациенты организации» и «мои визиты / вся история / специалист X» применяются только после
   серверного ограничения разрешённого dataset.
2. Historical author/specialist attribution не меняется при handoff.
3. Смена primary specialist не означает автоматическую передачу всех программ, задач, разговоров и будущих
   записей.
4. Cross-organization transfer не является `UPDATE organization_id`. Это отдельный consent/share/copy/enrollment
   workflow с audit trail и явно выбранным составом данных.
5. Любая модель общей карточки должна поддерживать restricted/private entry до фильтра и не обещать всем staff
   unrestricted organization history.

## 5. Рекомендуемый operating-model candidate

Это предпочтительный кандидат для следующей критики, а не принятое решение.

### 5.1 Одна account model, две композиции практики

Использовать одну `Organization` model и один staff shell contract. Разница solo/clinic определяется не отдельным
route tree, а фактическими capabilities и состоянием организации.

| Аспект | Solo specialist | Clinic specialist |
|---|---|---|
| Organization | Одна организация, обычно один active specialist | Одна организация, несколько staff/specialists |
| Primary context | «Моя практика»; specialist filter не показывается, если выбор всегда единственный | Клиника и команда; собственный specialist context является default |
| Patients default | Мои active patients без лишнего selector chrome | «Мои пациенты»; при наличии права доступно «Все пациенты организации» |
| History default | Вся разрешённая история solo practice | Мои визиты/entries; optional «Вся разрешённая история» и specialist filter |
| Team UI | Нет members, handoff, care-team и specialist selectors в daily clinical flow | Team, assignment, care team и handoff actions по capabilities |
| Schedule | Мой календарь + setup, если owner | Мой календарь; organization schedule/setup — management capability |
| Settings | Personal + compact practice setup | Personal отдельно от organization management subsections |
| Growth | Invite first staff переводит composition в team mode без миграции account | Seat/staff lifecycle и team capabilities |

Важно: `staff_count === 1` не должен сам навсегда определять коммерческий тип. UI composition лучше вычислять из
specialist count, role/capabilities, entitlement и активированных team features. Иначе solo owner, заранее
настраивающий assistant или локацию, попадёт в противоречивое состояние.

### 5.2 Owner/admin + specialist: один login, явные рабочие поверхности

Предпочтительная композиция:

```text
Organization workspace
├── Clinical work       (только при specialist binding)
│   ├── Today
│   ├── Patients
│   ├── Schedule
│   └── Communications / care content
├── Organization management  (owner/admin capability)
│   ├── Overview
│   ├── Team and invitations
│   ├── Services / booking setup
│   ├── Branding / public page
│   ├── Integrations / channels
│   └── Plan / usage / billing
└── Account             (каждый staff)
    ├── Profile / security / 2FA
    ├── Personal notifications
    └── Install app
```

- Bound owner/admin открывает clinical work как основной daily mode и переходит в «Управление организацией» без
  повторной авторизации.
- Non-clinical owner/admin открывает management overview и не видит пустой doctor dashboard.
- Возврат из management восстанавливает последний безопасный clinical route только при сохранённой capability;
  иначе ведёт на management overview.
- Mode должен быть видимым в shell/breadcrumb, чтобы настройки клиники нельзя было принять за личные настройки.
- Global admin platform surface располагается отдельно от этого дерева.

Альтернатива — одна длинная sidebar со всеми ссылками. Она требует меньше shell changes, но уже создаёт current-state
смешение personal, clinical, clinic и global settings, поэтому не рекомендуется как target candidate.

### 5.3 Patient: global account, explicit organization care context

Предпочтительная модель patient shell:

```text
Patient identity (global)
├── Account / identity / global channel consent
├── Organization A enrollment
│   ├── Today / programs / visits / messages / payments
│   └── attributed specialists and care team
└── Organization B enrollment
    ├── Today / programs / visits / messages / payments
    └── attributed specialists and care team
```

- При одном active enrollment organization switcher не занимает primary navigation, но organization name/brand
  остаётся видимым как trust context.
- При нескольких enrollment shell показывает явный organization picker. Выбор сохраняется server-trusted способом
  и проверяется на каждом входе; archived/suspended enrollment не становится рабочим context.
- Deep link/invite/booking может временно открыть конкретную доступную organization, но UI показывает смену
  контекста. Нельзя незаметно заменить выбранную клинику параметром URL.
- Global surfaces: identity/security, список организаций, общие channel consent и platform support.
- Organization surfaces: clinical timeline, programs, visits, care messages, organization billing/benefits и
  organization support/contact.
- Messages — organization-scoped inbox с явно указанными thread/recipient/author. Один hard-coded «чат с врачом»
  не масштабируется на team и multi-org.

Default context при нескольких enrollment требует решения владельца. Безопасный fallback candidate: последний
успешно использованный active context на этом account/device; если он недоступен или первый вход нейтрален — экран
выбора организации. Invite/booking entry может иметь приоритет только для текущего journey.

## 6. Draft role/capability composition

Это не финальная permission matrix. Таблица показывает ожидаемую форму продукта и места, где capability должна
быть отдельной от role.

| Actor | Context source | Surface candidate | Baseline capabilities | Не следует автоматически |
|---|---|---|---|---|
| Global admin | Platform session/admin mode | Platform operations | Organizations, tariffs, billing/usage, health, platform settings | Обычный clinical workflow конкретной organization |
| Organization owner, non-clinical | Единственный membership | Management + Account | Lifecycle, ownership, billing, plan, staff, org settings | Clinical authorship/write без specialist binding; допустимый clinic-record read scope TBD |
| Organization owner + specialist | Тот же membership + specialist binding | Clinical + Management + Account | Собственная clinical работа и owner management | Неограниченная private history только из owner role |
| Organization admin, non-clinical | Единственный membership | Management + Account | Делегированные organization operations | Ownership transfer/billing contract и clinical authorship; допустимый clinic-record read scope TBD |
| Organization admin + specialist | Membership + specialist binding | Clinical + Management + Account | Clinical work + делегированные management actions | Owner-only lifecycle actions |
| Doctor/specialist | Membership + specialist binding | Clinical + Account | Own work, authorized patients/history, authored entries | Team/settings/billing и hidden history |
| Assistant | Membership; specialist binding обычно отсутствует | Operational + Account, точный состав TBD | Кандидаты: schedule/intake/contact admin | Clinical authorship, unrestricted chart, billing/ownership |
| Patient | Canonical identity + selected active enrollment | Patient org context + global Account | Own authorized data and care flows | Данные другой organization или staff management |
| Onboarding patient | Canonical identity without patient tier | Activation only | Identity activation/support allowlist | Business actions до patient tier |
| Anonymous/public | Trusted public route/entry context | Landing, public org, booking, join | Published allowlisted data | Internal organization directory/clinical data |

Кандидат на capability vocabulary для последующей matrix:

```text
organization.manage_lifecycle
organization.manage_billing
organization.manage_staff
organization.manage_settings
booking.manage_setup
schedule.view_organization
patients.view_assigned
patients.view_organization
clinical_history.view_shared
clinical_history.write
patient_assignment.manage
care_team.manage
program_assignment.transfer
communications.manage_broadcasts
```

Названия иллюстративны. Этот discovery draft не создаёт новую runtime capability framework.

## 7. Patient-card model comparison

### Model A — отдельная карточка на каждого специалиста

Один global patient может иметь несколько specialist-scoped profiles внутри организации.

**Плюсы**

- Простая mental model приватности «моя карточка».
- Отдельные episode/forms/workflows можно изолировать естественно.
- Удобно, если специалисты юридически ведут полностью независимые практики под одним брендом.

**Минусы**

- Дубли FIO/contact/intake, merge и reconciliation.
- Фрагментация общей истории клиники и риск не увидеть противопоказание/предыдущий визит.
- Handoff превращается в copy/link/migration между профилями.
- Пациент и staff могут не понимать, какую из нескольких карточек открыли.
- Сложнее единый booking, billing, consent и reporting.

### Model B — одна organization-scoped карточка с authored entries

Один patient enrollment соответствует одной clinic record; visits, notes, programs, messages и assignments имеют
author/specialist attribution и собственные visibility rules.

**Плюсы**

- Одна клиническая identity внутри организации без дублей.
- Цельная history и явная attribution.
- Фильтры «мои / вся разрешённая / specialist X» естественны.
- Primary specialist/care team меняются без переноса самой карточки.
- Лучше соответствует tenant = organization и внешнему evidence UX-02.

**Минусы**

- Требует строгой entry-level/episode-level privacy до UI filters.
- Нужны понятные обозначения автора, владельца задачи и получателя сообщения.
- Organization-wide access нельзя выводить только из факта membership.
- Sensitive specialties или legal boundaries могут потребовать отдельного restricted section/episode.

### Model C — одна organization record + изолированные care episodes

Общая demographic/contact/booking оболочка, а clinical content группируется в episodes/cases с собственной care
team и visibility.

**Плюсы**

- Сохраняет canonical clinic record, но поддерживает чувствительные или независимые episodes.
- Handoff конкретного episode не меняет остальные active care flows.
- Хорошо выражает разные программы/обращения.

**Минусы**

- Самая сложная mental model и реализация.
- Требуется решить, какие сведения действительно общие, а какие принадлежат episode.
- Возможны ошибки при создании записи «не в том episode» и сложный cross-episode summary.

### Рекомендуемый кандидат

Взять **Model B** как default: одна organization-scoped patient card, authored immutable history, explicit
assignment/care team и server-enforced entry visibility. Использовать элементы Model C только там, где подтверждена
реальная legal/clinical privacy или независимый case workflow. Не создавать specialist-specific duplicate cards как
обычный путь.

Это остаётся `needs-owner-decision`, потому что current foundation отдельно оставляет открытыми
`card_visibility_policy` и global-vs-org patient profile semantics.

## 8. Permission и filter — обязательное разделение

Рекомендуемый processing order:

```text
session/canonical identity
  -> active membership + organization context
  -> role/capability + patient enrollment/record authorization
  -> entry/episode visibility policy
  -> разрешённый dataset
  -> UI filter (mine / all allowed / specialist X / period / type)
  -> sort/pagination/presentation
```

Примеры:

- Doctor без `patients.view_organization` не получает clinic-wide rows при выборе «Все»: control отсутствует или
  возвращает permission state; API не расширяет query.
- Doctor с clinic-wide patient list, но без `clinical_history.view_shared`, может открыть shared demographics и
  свои entries, но не чужие restricted notes. «Вся история» означает вся **разрешённая**, а не вся физическая.
- Owner+specialist не получает private note другого специалиста только из-за `owner`.
- Specialist selector фильтрует entries по attribution; он не «входит от имени другого специалиста» и не меняет
  actor/author для новых записей.
- Global admin analytics filters не превращают operational analytics в patient chart browsing.

UI wording должно отражать это: «Вся доступная история» безопаснее абсолютного «Вся история», пока policy не
зафиксирована.

## 9. Handoff semantics candidates

Одна кнопка «Передать пациента» должна сначала требовать выбора предмета передачи.

### 9.1 Primary assignment

Меняется основной ответственный за координацию пациента внутри той же organization.

```text
unassigned
  -> assigned(A)
  -> handoff_pending(A -> B)
  -> assigned(B) | rejected/expired -> assigned(A)
  -> care_closed
```

- Не переписывает author attribution и не переносит автоматически все work items.
- Open decision: мгновенное admin action или accept B; остаётся ли A в care team; кто может отменить pending.

### 9.2 Care team membership

Добавляет/удаляет специалиста как участника совместного сопровождения, не меняя primary assignment.

```text
not_member -> invited/added -> active_member -> removed
```

- Capabilities могут отличаться: view summary, shared history, write entries, message, manage program.
- Добавление в care team не должно автоматически раскрывать private/restricted historical entries.
- Полезно для клиники; в solo UI не показывается.

### 9.3 Work item / program / episode transfer

Передаётся конкретная будущая работа: appointment, intake case, program, task или episode responsibility.

```text
owned_by(A) -> transfer_pending(A -> B) -> owned_by(B) | rejected/cancelled
```

- Patient primary specialist может не меняться.
- Нужно отдельно определить судьбу future appointments, unfinished tasks, message recipient и due dates.
- Historical completion/author remains A; новые действия после accept attributed B.

### 9.4 Cross-organization transfer

Это не внутриклинический handoff и не смена organization у существующей строки.

```text
source enrollment/record
  -> consent + destination resolution
  -> destination enrollment
  -> approved share/copy package
  -> destination import/reference + audit receipt
  -> optional source closure (отдельное действие)
```

- Нужны owner/patient/clinical consent rules, verified destination, purpose, data selection, revocation/retention и
  audit trail.
- Source organization сохраняет собственную record/history по retention policy.
- Этот workflow должен быть отдельным launch scope; обычная кнопка clinic handoff не должна обещать его.

## 10. Required states и edge cases для следующей matrix/IA

| Сценарий | Ожидаемое operating behavior |
|---|---|
| Solo owner без specialist binding | Management first; clinical surfaces недоступны до создания/binding специалиста. |
| Owner+specialist | Один login; clinical daily mode + явный management entry. |
| Clinic doctor без shared-history capability | «Мои пациенты/entries»; чужая история не загружается, даже если URL известен. |
| Clinic doctor с shared-history capability | Может выбрать «Вся доступная история»/specialist X; attribution всегда видима. |
| Multiple active staff memberships | Fail closed как ошибка данных; никакого org picker. |
| Patient с одним enrollment | Org context видим, selector compact/hidden. |
| Patient с несколькими enrollment | Явный picker; каждая organization surface изолирована. |
| Deep link в другую доступную organization | Явное переключение context для journey; возврат контролируемый. |
| Deep link в revoked/foreign enrollment | Neutral access/recovery state без clinical data. |
| Primary handoff pending | Старый ответственный остаётся действующим до accept, если owner policy не выберет instant transfer. |
| Принимающий specialist disabled/removed | Pending transfer отменяется/эскалируется; patient не остаётся скрыто unassigned. |
| Private note автора A | Не появляется у B через filter, care-team membership или primary reassignment без отдельного права. |
| Organization suspended | Staff management/recovery и patient safe messaging policy требуют отдельного state contract; не молча выбирать другую org. |

## 11. Альтернативы operating model

### Alternative 1 — отдельные solo и clinic products/routes

Даёт максимально специализированный onboarding, но создаёт дубли экранов, сложную миграцию solo → team и риск
расхождения guards. Не рекомендуется; полезна только как acquisition copy/first-run branching поверх одной модели.

### Alternative 2 — одно меню без management/clinical mode

Минимум shell work, но сохраняет current-state смешение задач и перегружает solo/doctor ролями, которых у них нет.
Допустимо как transitional implementation, не как target IA.

### Alternative 3 — org switcher для staff

Противоречит текущему канону one-active-membership-per-login и не является допустимой UX-гипотезой в этой
инициативе.

### Alternative 4 — отдельный patient account/portal на каждую организацию

Упрощает tenant presentation, но противоречит canonical global identity и создаёт повторные логины, profile picker,
merge и notification fragmentation. Не рекомендуется.

## 12. Owner decisions, которые нельзя скрыто закрыть

1. **Clinic history policy:** при каком baseline role/capability специалист видит чужие visits/entries; нужны ли
   default restricted specialties/entry types?
2. **Patient-card model:** принять Model B как default и использовать restricted episodes при необходимости либо
   выбрать specialist-specific cards/полный episode model.
3. **Primary handoff:** instant или accept/reject; кто инициирует, отменяет и эскалирует; остаётся ли бывший
   ответственный в care team.
4. **Scope of transfer:** какие объекты по умолчанию следуют за primary assignment — ни один, future appointments,
   active programs/tasks, conversations?
5. **Assistant product role:** schedule/intake/contact/billing capabilities и допустимый patient/history access.
6. **Patient multi-org default:** last active, explicit chooser или entry-context priority; как показывать
   suspended/archived organization.
7. **Management/clinical composition:** отдельный mode/workspace entry (рекомендуется) или единая navigation с
   management group.
8. **Team entitlement:** какие collaboration actions core, а какие зависят от тарифа; entitlement не должен менять
   security baseline.
9. **Cross-org transfer launch scope:** исключить из первого launch либо спроектировать consent/share package как
   отдельную capability.
10. **Non-clinical owner/admin record access:** какие demographic, scheduling, billing и clinical sections доступны
    operational staff без specialist binding; clinical authorship при этом не возникает.

## 13. Выходы после критики этого draft

После plan-critic и architecture review, но до UX-04/UX-06, нужно создать отдельно:

- финальный `OPERATING_MODEL.md` с принятыми и явно открытыми решениями;
- `ROLE_CAPABILITY_MATRIX.md`: actor × capability × object scope × surface × denial state;
- context/state diagrams для staff, patient multi-org и четырёх handoff primitives;
- короткий owner decision packet только по пунктам §12;
- список data/API gaps как наблюдения, без реализации внутри discovery.

## 14. Проверка внутренней непротиворечивости

- Solo и clinic используют одну tenant/account model; team UI не засоряет solo daily flow.
- Staff не получает organization switcher; patient получает его только при нескольких enrollment.
- Owner/admin может быть specialist в одной session, но management role не подменяет clinical authorization.
- Одна clinic patient card не означает unrestricted shared history.
- Assignment, care team, work transfer и cross-org transfer разведены как разные state transitions.
- Filters применяются только к уже разрешённым данным.
- Рекомендации и owner decisions помечены отдельно; ни одна гипотеза UX-02 не подписана как ruling.
