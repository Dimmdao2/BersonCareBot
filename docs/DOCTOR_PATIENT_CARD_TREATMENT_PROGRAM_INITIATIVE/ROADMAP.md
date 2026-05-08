# Roadmap: карточка врача — назначение программ из шаблонов и правка инстансов

**Назначение:** собрать в одном месте **все найденные в репозитории опорные факты и этапы** для задачи: врач в `/app/doctor/clients/[userId]` назначает программу из шаблона и корректирует `treatment_program_instance`.

**Дата сборки:** 2026-05-05.  
**Статус Этап 2 (назначение из карточки):** ✅ завершён 2026-05-05 — см. [`MASTER_PLAN.md`](MASTER_PLAN.md) и [`LOG.md`](LOG.md).

---

## 1. Цель продукта (сводка из документов)

- Кабинет врача — **рабочее место с пациентом**; каталоги — **инструмент назначения**, в т.ч. точка входа из карточки пациента ([`TARGET_STRUCTURE_DOCTOR.md`](../APP_RESTRUCTURE_INITIATIVE/TARGET_STRUCTURE_DOCTOR.md) §2, §6.2).
- **Любое назначение пациенту** в целевой модели плана лечения = **`treatment_program_instance`** (инвариант [`PROGRAM_PATIENT_SHAPE_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md) §вводный блок).
- В целевой карточке пациента — отдельный поток **«Назначения»**: активная программа, действия по этапу/элементам, CTA **«Назначить новое»** (селектор из библиотеки шаблонов), архив завершённых ([`TARGET_STRUCTURE_DOCTOR.md`](../APP_RESTRUCTURE_INITIATIVE/TARGET_STRUCTURE_DOCTOR.md) §5, Tab 2).

---

## 2. Источники и их роль

| Источник | Что даёт для этой задачи |
|----------|---------------------------|
| [`TARGET_STRUCTURE_DOCTOR.md`](../APP_RESTRUCTURE_INITIATIVE/TARGET_STRUCTURE_DOCTOR.md) §5 | IA: Hero, Tab 1–5; **Tab «Назначения»**: активная программа как instance, «Изменить шаг» / «Отключить элемент» / «Завершить программу», этап 0 «Общие рекомендации», Inbox «К проверке», **«Назначить новое»** (selector). Статус документа: **черновик / strawman**. |
| [`TARGET_STRUCTURE_DOCTOR.md`](../APP_RESTRUCTURE_INITIATIVE/TARGET_STRUCTURE_DOCTOR.md) §6.2–6.6 | Каталоги: вход из меню и **из карточки пациента** (Tab 2 → «Назначить новое»); конструктор программы тоже использует selector items. |
| [`PLAN_DOCTOR_CABINET.md`](../APP_RESTRUCTURE_INITIATIVE/PLAN_DOCTOR_CABINET.md) | Исторический контекст: **этап 6** — карточка **не углублялась** новыми функциями (REPACK без табов/hero); **этап 10** — «глубокая переработка карточки (tabs, hero…)» как **отдельная инициатива**. |
| [`PROGRAM_PATIENT_SHAPE_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md) §1, §4, §6 | Домен: template → deep copy → instance; **отключение item** в инстансе (`active`/`disabled`); цели/задачи/срок этапа; группы этапа; actionable/persistent для рекомендаций; **§4.1** — конкретный UX врача (конструктор + правка инстанса); §4.3–4.4 — inbox «К проверке», фид событий. |
| [`APP_RESTRUCTURE_INITIATIVE/README.md`](../APP_RESTRUCTURE_INITIATIVE/README.md) | Указание, что execution **PROGRAM_PATIENT_SHAPE** (A1–A5) и **ASSIGNMENT_CATALOGS_REWORK** (B1–B7) вынесены в архив; сверять **фактическое состояние кода**. |
| [`archive/.../PROGRAM_PATIENT_SHAPE_INITIATIVE/`](../archive/2026-05-initiatives/PROGRAM_PATIENT_SHAPE_INITIATIVE/README.md) | Карта кодовой базы (MASTER_PLAN): `modules/treatment-program`, API doctor/patient, Drizzle `treatmentProgram*.ts` — **отправная точка инвентаризации**. |
| [`ASSIGNMENT_CATALOGS_REWORK_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md) | UX/данные каталогов (в т.ч. конструктор шаблонов, фильтры, universal comment pattern B7). README инициативы: по шаблонам программ оставался **«мелкий хвост»**, не блокер для [`ROADMAP_2.md`](../APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md). |
| [`ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/done/ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md) (done) | Связь шаблон ↔ использование ↔ пациенты при архивации — контекст безопасных изменений каталога. |
| [`../archive/2026-05-initiatives/TREATMENT_PROGRAM_INITIATIVE/EXECUTION_RULES.md`](../archive/2026-05-initiatives/TREATMENT_PROGRAM_INITIATIVE/EXECUTION_RULES.md) | Абсолюты: не трогать запрещённые LFK-таблицы; полиморфный `item_ref_id` без FK; Drizzle для новых сущностей; фазы и CI. |
| [`PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE/README.md`](../PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE/README.md) | Пациентский UI программ ([`ROADMAP_2`](../APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md) §1.x) — **смежный**, не заменяет врачебный поток, но влияет на согласованность отображения после назначения/правок. |

---

## 3. Целевой фрагмент UI карточки (зафиксировано в TARGET)

Из [`TARGET_STRUCTURE_DOCTOR.md`](../APP_RESTRUCTURE_INITIATIVE/TARGET_STRUCTURE_DOCTOR.md) §5 — **Tab «Назначения»**:

- Активная программа лечения = **`treatment_program_instance`** + цели/задачи/срок текущего этапа.
- Действия: **«Изменить шаг»**, **«Отключить элемент»**, **«Завершить программу»**; этап 0 «Общие рекомендации» (persistent).
- **Inbox «К проверке»** (тесты `submitted`, `decided_by IS NULL` — формулировка в TARGET).
- **CTA «Назначить новое»** — **модалка** (или иной селектор) из библиотеки шаблонов; см. [`MASTER_PLAN.md`](MASTER_PLAN.md) шаг 3.
- Архив завершённых программ.

Принципы той же §5: **«Назначить — основное действие»**; заметки — первичны в другом tab.

---

## 4. Возможности врача по шаблону и инстансу (PROGRAM_PATIENT_SHAPE §4.1)

Конкретика из [`PROGRAM_PATIENT_SHAPE_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md) §4.1 (конструктор шаблона / правка инстанса):

| Область | Поведение |
|---------|-----------|
| Этап | Поля **«Цель»**, **«Задачи»**, **«Ожидаемый срок»** под заголовком этапа (копируются template→instance; редактирование и там и там по плану A1). |
| Группы | UI группировки: **drag-and-drop** items между группами; CRUD группы (`title`, `description`, `schedule_text`, `sort_order`) — этап A3. На экземпляре: две **системные** группы «Рекомендации» / «Тесты» (фиксированный порядок в UI врача; без смены названия / reorder / скрытия); перенос в системную группу только для типа `recommendation` или `clinical_test` соответственно. |
| Рекомендации в этапе | На **инстансе** — переключатель **«Требует выполнения» / «Постоянная рекомендация»** (`is_actionable`). При создании строки экземпляра из шаблона и при добавлении рекомендации в инстанс по умолчанию **постоянная** (`is_actionable = false`); врач может включить исполняемую. Глобальный дефолт из каталога/строки шаблона — в [`docs/TODO.md`](../../TODO.md) (backlog). |
| Элементы в инстансе | **«Отключить» / «Включить»** (статус строки); **удаление** строки при отсутствии выполнения и попыток теста (`DELETE .../stage-items/[itemId]`); жёсткое удаление из **шаблона** — в конструкторе шаблона (§1.8 плана). |

Дополнительно тот же документ: **universal comment** — `comment` на шаблоне → **`local_comment`** на instance с fallback «Из шаблона: …» (§1.4, связка с B7 в [`ASSIGNMENT_CATALOGS_REWORK_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md)).

---

## 5. Открытые продуктовые вопросы (из PROGRAM_PATIENT_SHAPE §5)

Перед финализацией UX/валидаций закрыть в продукте (ссылки на §5 оригинала):

- **O5** — обязательность `expected_duration_*`.
- **O6** — судьба persistent-рекомендаций после завершения программы.
- **O7** — UX истории попыток теста.

---

## 6. Рекомендуемая последовательность этапов (roadmap исполнения)

Этапы ниже — **логическая склейка** источников; нумерация внутреняя. Перед стартом **сверить с кодом** (API doctor для instances/templates, текущий `ClientProfileCard`, наличие табов).

### Этап 0 — Инвентаризация и выравнивание ожиданий

- Пройти [`MASTER_PLAN`](../archive/2026-05-initiatives/PROGRAM_PATIENT_SHAPE_INITIATIVE/MASTER_PLAN.md) §карта кода + фактические маршруты `app/app/doctor/**`, `modules/treatment-program/**`.
- Зафиксировать gap: что уже есть для **создания instance из template** и **мутаций инстанса** с карточки vs что только в отдельных экранах каталога.
- Проверить соблюдение [`EXECUTION_RULES.md`](../archive/2026-05-initiatives/TREATMENT_PROGRAM_INITIATIVE/EXECUTION_RULES.md) и портов/DI.

**Выход:** короткий аудит-заметка в [`LOG.md`](LOG.md) (таблица «есть / нет»).

### Этап 1 — IA карточки пациента (решение по объёму)

Варианты (не взаимоисключающие):

- **Минимум:** сохранить одностраничную карточку, но выделить явную секцию **«Назначения»** с CTA и сводкой активной программы (без полного перехода на tabs из TARGET).
- **Целевой TARGET:** tabs + Hero «Что важно сейчас» — отдельный объём; согласовать с [`PLAN_DOCTOR_CABINET.md`](../APP_RESTRUCTURE_INITIATIVE/PLAN_DOCTOR_CABINET.md) (ранее заморозка).

**Выход:** решение зафиксировано в README или LOG; scope границы для этапов 2–3.

### Этап 2 — Назначение из карточки: выбор шаблона → создание instance ✅ завершён 2026-05-05

- ~~UI: инлайн-`Select` + кнопка «Назначить программу»~~ → **CTA «Назначить программу лечения»** → **`Dialog`** с поиском по названию, выбором шаблона, `toast.success` и inline-ошибкой для 409.
- Backend: использует существующий `POST /api/doctor/clients/:userId/treatment-program-instances` без изменений.
- Старый путь `AssignLfkTemplatePanel` + `assignLfkTemplateAction` удалён; `publishedLfkTemplates` / `assignLfkEnabled` выведены из `ClientProfileCardProps` и страниц.
- Автотесты: `PatientTreatmentProgramsPanel.test.tsx` — 3 сценария (открытие, успех, 409). `tsc`, `lint`, `test` — зелёные.

**Что осталось:** ручной smoke на живом стенде (чеклист в [`MASTER_PLAN.md`](MASTER_PLAN.md) шаг 4).

### Этап 3 — Правка инстанса из контекста пациента

Реализовать parity с [`PROGRAM_PATIENT_SHAPE_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md) §4.1 на доступном уровне (по зависимости от уже выполненных A1–A3 в коде):

- Редактирование целей/задач/срока этапа на инстансе.
- Переключение **disabled** для items; toggle **actionable** для рекомендаций где применимо.
- Группы: DnD и CRUD, если в данных уже есть `instStageGroups`.

**Критерий:** правки отражаются у пациента в плане (согласовать с [`PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE`](../PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE/README.md) при приёмке).

### Этап 4 — Вторичный функционал карточки по TARGET / PROGRAM_PATIENT_SHAPE

- **Inbox «К проверке»** в карточке (read по `decided_by IS NULL` — см. §4.3 плана).
- Компактный **фид «Последние изменения»** из `treatment_program_events` (§4.4).
- Кросс-пациентский inbox на «Сегодня» — в документе помечен как **backlog**.

### Этап 5 — Каталог шаблонов и конструктор (связанный хвост)

- Довести «мелкий хвост» по [`APP_RESTRUCTURE_INITIATIVE/README.md`](../APP_RESTRUCTURE_INITIATIVE/README.md) и [`ASSIGNMENT_CATALOGS_REWORK_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md), если блокирует удобство назначения или редактирования.
- **B7** — universal comment pattern на все контейнеры items при необходимости полного parity комментариев.

### Этап 6 — Приёмка и документация

- Обновить [`LOG.md`](LOG.md): что сделано, тесты, сознательные ограничения.
- При изменении IA кабинета — точечно обновить [`TARGET_STRUCTURE_DOCTOR.md`](../APP_RESTRUCTURE_INITIATIVE/TARGET_STRUCTURE_DOCTOR.md) или дельту в [`STRUCTURE_AUDIT.md`](../APP_RESTRUCTURE_INITIATIVE/STRUCTURE_AUDIT.md) по правилам репозитория.

---

## 7. Definition of Done (предлагаемый)

1. Из карточки пациента врач может **назначить программу**, выбрав **опубликованный шаблон** (в т.ч. через **модалку** выбора — см. [`MASTER_PLAN.md`](MASTER_PLAN.md) шаг 3), и получить работающий **`treatment_program_instance`**.
2. Из того же контекста врач может **отредактировать инстанс** по возможностям §4.1 (в пределах уже поддерживаемых данных и без нарушения EXECUTION_RULES).
3. Активная программа и ключевые действия **видны без охоты** по каталогам (сводка + CTA согласованы с TARGET §5 по духу, даже если без полных tabs).
4. Нет новых нарушений **clean architecture** в затронутых модулях; нет правок запрещённых **LFK** таблиц под эту фичу.
5. [`LOG.md`](LOG.md) содержит запись о закрытии этапов и ссылку на PR/коммиты при необходимости.

---

## 8. Зависимости и риски

| Риск | Митигация |
|------|-----------|
| Документы TARGET / PROGRAM — **частично strawman или docs-only**; код мог уйти вперёд или отстать | Этап 0 инвентаризации обязателен. |
| Полные **tabs/hero** резко увеличивают объём | Этап 1: явное решение «минимум vs TARGET». |
| Дублирование логики каталога и карточки | Общие компоненты selector + сервис назначения через порты. |
| Регресс у пациента | Согласовать с [`PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE`](../PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE/README.md) / smoke сценарии. |

---

## 9. Связь с `ROADMAP_2.md`

Глобальная дорожная карта пациентских экранов и связанных блоков — [`../APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md`](../APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md). Эта инициатива **дополняет** её **врачебным** контуром (назначение/правка из карточки); при конфликте приоритета — явное решение в [`LOG.md`](LOG.md).
