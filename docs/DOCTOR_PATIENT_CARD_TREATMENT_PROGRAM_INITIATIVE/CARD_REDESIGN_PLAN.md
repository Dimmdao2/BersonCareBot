# CARD_REDESIGN_PLAN — карточка пациента врача (фаза 2A)

**Статус:** дизайн утверждён owner 2026-06-02 (модель **Tabs + Hero**, график самочувствия **вторичный**). **Фазы 2B–2C реализованы** (2026-06-02 — см. [`LOG.md`](LOG.md), задачи: [`SPECIALIST_TASKS.md`](SPECIALIST_TASKS.md)).

**План-очередь:** Cursor `active_workqueue_plan_30236040` (фазы 2A/2B/2C).
**Каноничные спецификации (не дублировать):** [`ROADMAP.md`](ROADMAP.md), [`../APP_RESTRUCTURE_INITIATIVE/TARGET_STRUCTURE_DOCTOR.md`](../APP_RESTRUCTURE_INITIATIVE/TARGET_STRUCTURE_DOCTOR.md) §5–6, [`../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md) §4.
**Правила:** `.cursor/rules/clean-architecture-module-isolation.mdc`, `.cursor/rules/patient-ui-shared-primitives.mdc` (static-превью медиа), `.cursor/rules/runtime-config-env-vs-db.mdc`, `.cursor/rules/ui-copy-no-excess-labels.mdc`.

---

## 1. Проблема

`apps/webapp/src/app/app/doctor/clients/ClientProfileCard.tsx` сегодня — одна длинная лента: заметки, история записей, сопровождение, программа, тесты к проверке, ЛФК, симптомы, коммуникации, контакты, lifecycle, блокировка, админ-операции — всё на одном уровне важности. Врач не может за ~10 секунд понять «что с пациентом и что от меня требуется», нужно скроллить через несколько экранов.

**Цель редизайна:** «капитанский мостик» сверху (кто, контакт, что горит) + лечение в «Обзоре» + остальное по табам. Без переписывания доменных панелей за один PR — существующие панели переиспользуются, меняется только каркас/IA.

---

## 2. User tasks — «10 секунд на ответ»

| Вопрос врача | Где отвечаем | Действие |
|---|---|---|
| Кто это, когда следующий контакт? | Hero | Позвонить / Чат |
| Я веду пациента? | Hero (тумблер «На сопровождении») | Toggle |
| Что горит сейчас? | Action Strip | Перейти к проблеме |
| Какие у меня дела по пациенту? | Hero (сводка задач) + секция «Задачи» | Выполнить / создать |
| Как идёт лечение? | Таб «Обзор» (Care Plan + самочувствие) | Открыть программу |
| Что нового от пациента? | Бейджи на табах + Action Strip | Ответить / оценить тест |

Рыночный ориентир (care-management дашборды, типовые EHR): *patient header → priority/alerts → active care plan → timeline → vitals*. Адаптируем под нашу модель (программа-инстанс + дневник + чат + задачи специалиста).

---

## 3. Data inventory

### 3.1 Уже есть (грузится / доступно)

| Данные | Источник | Тип/поля |
|---|---|---|
| Идентичность, телефон, бейджи Архив/Блок | `ClientProfile.identity` (`ClientIdentity`) | `displayName`, `phone`, `isArchived`, `isBlocked`, `blockedReason` |
| Ближайшая / предстоящие записи, статистика | `ClientProfile.upcomingAppointments`, `appointmentStats`, `appointmentHistory` | `AppointmentSummary` |
| Флаг сопровождения | `DoctorClientSupportPanel` + `GET/PATCH …/support-settings` (фаза 1) | on/off |
| Непрочитанные в чате | `POST /api/doctor/messages/conversations/unread-by-patient` | `unreadCount` |
| Активная программа (summary) | `treatmentProgramInstancesInitial` | `TreatmentProgramInstanceSummary` (`status`, `patientPlanLastOpenedAt`, …) |
| Этап + элементы (детально) | детальный экран инстанса (`TreatmentProgramInstanceDetail`) | `stages[].goals/objectives/expectedDuration*`, `items[].lastViewedAt/isActionable/snapshot` |
| Тесты к проверке | `pendingProgramTestEvaluations` | `PendingProgramTestEvaluationRow` (`decided_by IS NULL`) |
| Обсуждение элементов (комментарии/медиа) | `DoctorProgramItemDiscussionDialog`, `DoctorProgramActionLogMediaPreview` (экран инстанса) | поэлементно |
| Самочувствие (дневник) | `ClientProfile.recentSymptomEntries`, `symptomTrackings` + `buildWellbeingWeekChartData` | `SymptomEntry.value0_10`, `recordedAt` |
| ЛФК-сессии | `ClientProfile.recentLfkSessions`, `lfkComplexes` | `LfkSession` (`difficulty0_10`, `pain0_10`) |
| События программы (timeline-источник) | `treatment_program_events` | `TREATMENT_PROGRAM_EVENT_TYPES` |
| Старый журнал отправок | `messageHistory` | `MessageLogEntry` |
| Контакты/каналы, профиль, lifecycle, админ | существующие панели | — |

### 3.2 Новые read-модели / агрегаты (нужно добавить для 2B/2C)

Контракты ниже — обязательные для Composer (точные источники, поля и семантика «нового»). Все читаются через порт/сервис, без прямого `@/infra/db|repos` из модулей/route.

1. **Агрегат Action Strip по пациенту** (2B, шаг 2B-3).
   - **Источник:** `program-item-discussion` (сообщения по элементам, сейчас читаются поэлементно через `GET /api/doctor/treatment-program-instances/[instanceId]/items/[itemId]/discussion`) — нужен rollup уровня пациента по **активному** инстансу.
   - **Что считаем «новым»:** сообщение от **пациента** (`author = patient`), у которого нет ответа врача после него / не помечено просмотренным врачом. Если поля «просмотрено врачом» в `program-item-discussion` нет — для 2B берём **порог по времени последнего просмотра врачом активного инстанса** (зеркало логики `patientPlanLastOpenedAt`, но для врача) либо «есть хотя бы 1 сообщение пациента в последнем «хвосте» обсуждения элемента». Точную семантику зафиксировать в `LOG.md` при реализации шага и отразить в `api.md`.
   - **Контракт:** `{ newCommentsCount: number; patientMediaCount: number }` по `patientUserId` (активный инстанс). Медиа — сабмишены пациента в `program_action_log` / discussion с вложением.
   - **Поверхность:** RSC (above-the-fold), порт в `modules/treatment-program/*` (или новый `program-item-discussion` агрегат) + DI в `[userId]/page.tsx`.
2. **«План не открыт пациентом»** (2B, шаг 2B-3).
   - **Алгоритм:** `planNotOpened = (lastPlanMutationEventAt != null) && (patientPlanLastOpenedAt == null || patientPlanLastOpenedAt < lastPlanMutationEventAt)`.
   - **`lastPlanMutationEventAt`:** максимальный `treatment_program_events.created_at` активного инстанса с `event_type ∈ TREATMENT_PROGRAM_PLAN_MUTATION_EVENT_TYPES` (`apps/webapp/src/modules/treatment-program/types.ts`).
   - **`patientPlanLastOpenedAt`:** из `TreatmentProgramInstanceSummary` (уже грузится).
   - **Контракт:** `{ planNotOpened: boolean; lastPlanMutationEventAt: string | null }`. Чисто информативный чип, без перехода.
3. **Сводка задач** (фаза 2C, шаг 2C-4).
   - **Контракт:** `{ openCount: number; nextImportantOrOverdue: { id: string; title: string; dueAt: string | null; isImportant: boolean } | null }` по `patient_user_id`. Для Hero — `openCount` + маркер, для секции — полный список (отдельный read).
4. **Полный клинический timeline** из `treatment_program_events` с человекочитаемыми подписями — **вне scope 2A/2B** (см. §11), не блокер. Для Action Strip timeline не требуется.

---

## 4. IA / Layout

### 4.1 Верхний уровень (над табами, sticky на desktop)

**Hero / Care Bar** — одна строка (desktop) / 2 ряда (mobile):

```
┌───────────────────────────────────────────────────────────────────────┐
│ Иванова Мария   ☎ +7…   ●На сопровождении        [Чат •3]  [⋯]         │
│ Архив·Блок(если)   Ближайшая: 4 июн 13:00 →   Задачи: 2 невып. (1 ❗)   │
└───────────────────────────────────────────────────────────────────────┘
```

- Слева: имя + статусные бейджи.
- Центр: телефон (tel) + ближайшая запись + **краткая сводка невыполненных задач** (счётчик + маркер важной/просроченной → скролл к секции «Задачи»).
- Справа: тумблер «На сопровождении», главная кнопка «Чат» (бейдж непрочитанных), меню `⋯` (История / Заметки / Учётка).

**Action Strip «Что важно сейчас»** — ряд чипов; рендерится только при наличии задач, иначе тонкая строка «Срочных задач нет»:

- «К проверке · N» (`pendingProgramTestEvaluations`) → таб «Программа».
- «Новые комментарии · N» / «Медиа от пациента · N» (агрегат §3.2.1) → таб «Программа».
- «Сообщение в чате · N» (`unread-by-patient`) → таб «Коммуникации» (встроенный чат).
- «План не открыт» (§3.2.2) → информативный.
- «Задачи · N» (§3.2.3) → секция «Задачи».

### 4.2 Табы

```
[ Обзор ] [ Программа •N ] [ Коммуникации •N ] [ Записи ] [ Учётка ]      (Админ ⌄)
```

- **Обзор** (дефолт): двухколоночно (desktop) / стек (mobile):
  - *Care Plan:* активный инстанс, текущий этап (`goals`/`objectives`/`expectedDuration*`), элементы этапа со **static-превью** (`PatientCatalogMediaStaticThumb`/`MediaThumb`, без `<video>`), бейдж «Новое» при `lastViewedAt = null`, прогресс этапов, CTA «Открыть программу» / «Назначить программу» (`PatientTreatmentProgramsPanel`).
  - *Самочувствие (вторичный):* **спарклайн** `value0_10` (`buildWellbeingWeekChartData`) + последнее значение/тренд + маркеры ЛФК-сессий; кнопка «Подробный график» раскрывает полноразмерный график с периодом и маркерами выполнения/пропусков.
  - *Секция «Задачи»* пациента (см. §6) — подробный список (решение «здесь vs мини-таб» ниже, см. §4.4).
- **Программа •N:** `PatientTreatmentProgramsPanel` (активная + архив) + program inbox (тесты к проверке, комментарии, медиа) с быстрым ответом/оценкой. Бейдж = к проверке + новые комментарии + медиа.
- **Коммуникации •N:** встроенный чат поддержки (`DoctorClientEmbeddedChat` + `POST …/conversations/ensure`) + свёрнутый старый журнал `messageHistory` в `<details>`.
- **Записи:** предстоящие + `appointmentStats` + свёрнутая история + текстовая сводка симптомов.
- **Учётка:** контакты/каналы, правка профиля (`AdminClientProfileEditPanel`), доп.контакты (`DoctorSupplementaryContactsPanel`), lifecycle (`DoctorClientLifecycleActions`), блокировка (`SubscriberBlockPanel`).
- **Меню «Админ»** (isAdmin/canPermanentDelete): `DoctorClientCardAdminSection` **под** карточкой (вне таб-бара), lazy через `suspend*` — не в табе «Учётка».

### 4.3 Mobile

- Hero: 2 ряда; тумблер сопровождения и сводка задач — во второй ряд / `⋯`.
- Action Strip: горизонтальный скролл чипов.
- Табы: горизонтально-скроллящийся ряд; контент — одна колонка.
- Только patient/doctor shell-токены и shadcn-примитивы; без одноразового chrome; без лишних поясняющих подписей (`ui-copy-no-excess-labels`).

### 4.4 Размещение «Задач» (решение зафиксировано)

**Дефолт для Composer:** секция «Задачи» пациента — **отдельным блоком в «Обзоре»**, под Care Plan и Wellbeing. Hero-сводка невыполненных — всегда. Мини-таб «Задачи •N» вводится **только** если на ревью 2C «Обзор» окажется перегружен (зафиксировать решение в `LOG.md`, без самовольного добавления таба в 2B). До 2C блок не рендерится (фичефлаг/наличие данных).

### 4.5 Home существующих панелей в табах (решение зафиксировано)

Чтобы Composer не угадывал, куда переезжает каждая существующая секция:

| Панель / секция (сейчас) | Целевой таб |
|---|---|
| `DoctorNotesPanel` (`-notes`) | **Обзор** (компактный блок «Заметки») — врач видит контекст без перехода |
| `PatientTreatmentProgramsPanel` (`-treatment-programs`) | Программа |
| inbox тестов (`-pending-program-tests`) | Программа |
| `DoctorClientSupportPanel` (`-support`) | Hero-тумблер (управление) + дубль в «Учётка» при необходимости |
| `DoctorLfkComplexExerciseOverridesPanel` + ЛФК-сводка (`-lfk`) | **Учётка** (legacy-блок, сворачиваемый) — не на «Обзоре» |
| симптомы (`-symptoms`) | Записи (текстовая сводка) — числовой ряд в Wellbeing «Обзора» |
| записи/история (`-appointments`, `-appointment-history`, booking history) | Записи |
| `messageHistory` / чат (`-communications`) | Коммуникации |
| контакты/каналы, `AdminClientProfileEditPanel`, `DoctorSupplementaryContactsPanel` (`-contacts`) | Учётка |
| `DoctorClientLifecycleActions` (`-lifecycle`), `SubscriberBlockPanel` (`-subscriber`) | Учётка |
| `Admin*` (`AdminDangerActions`, `AdminMergeAccountsPanel`, `AdminClientAuditHistorySection`) | меню «Админ» (lazy) |

---

## 5. Компонентная декомпозиция

`ClientProfileCard` → тонкий каркас (Hero + Action Strip + Tabs router, сохранение `key={userId}` для сброса состояния).

Новые компоненты:

- `PatientCareBar` — Hero (идентичность, запись, сопровождение, чат-кнопка, сводка задач).
- `PatientActionStrip` — чипы «Что важно сейчас».
- `OverviewTab` — Care Plan + Wellbeing (спарклайн + раскрытие полного графика) + блок «Задачи» (или мини-таб).
- `ProgramTab`, `CommunicationsTab`, `RecordsTab`, `AccountTab` — обёртки, переиспользующие существующие панели.
- `PatientTasksSection` + `TaskFormDialog` + `TaskRow` (фаза 2C).

Переиспользуются без изменений (переезжают в табы): `DoctorNotesPanel`, `PatientTreatmentProgramsPanel`, `DoctorClientSupportPanel`, `ClientBookingHistoryPanel`, `DoctorLfkComplexExerciseOverridesPanel`, `DoctorSupplementaryContactsPanel`, `AdminClientProfileEditPanel`, `DoctorClientLifecycleActions`, `SubscriberBlockPanel`, `Admin*`.

Архитектура: данные — через порт/сервис + `buildAppDeps` в `page.tsx`/`route.ts`; модули без прямого `@/infra/db|repos`; новые сущности — Drizzle.

---

## 6. Сущность «Задача» (фаза 2C) — место в карточке

Полная спецификация — в плане-очереди (фаза 2C). Здесь — UI-контракт карточки:

- **Секция «Задачи» пациента:** подробный список — заголовок (короткое описание), важность (❗), срок, статус; быстрые действия «Выполнить» / правка / «Новая задача». Невыполненные просроченные/важные визуально выделены. Поля задачи: дата постановки, короткое + подробное описание, срок (необяз.), напоминание (необяз.; **каналы — из настроек специалиста** `/app/settings`), важность (по умолчанию off), отметка о выполнении, привязка к пациенту (`patient_user_id` nullable; `null` = глобальная).
- **Hero:** краткая сводка невыполненных (счётчик + ближайшая важная/просроченная).
- **Глобальные задачи** (без пациента) — не в карточке пациента, а на «Сегодня»/доме врача.

---

## 7. Data/API контракт и производительность

**В RSC сразу (above-the-fold):** identity, ближайшая запись, флаг сопровождения, активный инстанс-summary, `pendingProgramTestEvaluations`, счётчики Action Strip (вкл. агрегат комментариев/медиа), спарклайн самочувствия, сводка невыполненных задач.

**Lazy / по открытию таба:** полный график (период), история записей, старый журнал, ЛФК-детали, program inbox-детали, админ-блоки (`suspendHeavyFetch`/`suspendLoad` уже есть).

Новые эндпоинты/агрегаты (2B/2C): агрегат Action Strip по пациенту; «план не открыт»; задачи (CRUD/выполнение) + сводка. Все — через тонкие route + сервис/порт; задачи на Drizzle; каналы напоминаний и их доставка — doctor-scope настройка + worker (без env под конфиг).

---

## 8. Миграция якорей (не сломать внешние ссылки)

Полный список якорей в текущем `ClientProfileCard.tsx` / `ClientBookingHistoryPanel.tsx` (проверено `rg`). При монтировании карты по хешу: **выбрать таб → доскроллить к сохранённому `id`**. Сами `id` остаются на DOM-узлах внутри табов (не удалять).

| Якорь (есть в коде) | Целевой таб + действие |
|---|---|
| `#doctor-client-section-notes` | Обзор → скролл к блоку «Заметки» |
| `#doctor-client-section-support` | Обзор → Hero-тумблер сопровождения |
| `#doctor-client-section-treatment-programs` | Программа → скролл |
| `#doctor-client-section-pending-program-tests` | Программа → inbox |
| `#doctor-client-section-lfk` | Учётка → legacy ЛФК-блок |
| `#doctor-client-section-symptoms` | Записи → сводка симптомов |
| `#doctor-client-section-appointments` | Записи → предстоящие |
| `#doctor-client-section-appointment-history` | Записи → история |
| `#doctor-client-section-booking-history` | Записи → booking history (`ClientBookingHistoryPanel`) |
| `#doctor-client-section-communications` | Коммуникации |
| `#doctor-client-section-contacts` | Учётка → контакты/каналы |
| `#doctor-client-section-lifecycle` | Учётка → lifecycle |
| `#doctor-client-section-subscriber` | Учётка → блокировка |
| `?chat=1` | таб «Коммуникации» + якорь `#doctor-client-section-communications` (`autoOpenChat`) |
| `?discussionItem={stageItemId}` (экран инстанса) | автооткрытие `DoctorProgramItemDiscussionDialog` для элемента |

**Реализация (один helper):** при маунте читать `window.location.hash`, по карте «anchor → tabId» переключить активный таб, затем `scrollIntoView` по `id` (с небольшим `requestAnimationFrame`/`useEffect` после рендера таба). Внутренние кнопки Hero «История/Заметки/Программа» переводятся на тот же механизм (сейчас это `<Link href="#...">`).

**Проверка:** `rg "doctor-client-section-" apps/webapp/src` — каждый найденный `id` присутствует в карте выше; для каждого якоря есть кейс «таб выбран + узел в DOM».

---

## 9. Execution decomposition (для Composer)

Каждый шаг — самостоятельный PR-able кусок с локальными проверками и DoD. Полный `pnpm run ci` — **не** после каждого шага, а перед push (политика репозитория). После каждого шага — запись в `LOG.md` (что сделано / проверки / что не трогали). Care Plan на «Обзоре» — **summary + CTA на детальный экран инстанса**, дерево инстанса в карточку **не** тянем (детальный экран не переписывается, см. §11).

### Фаза 2B — карточка ✅ (2026-06-02)

**2B-1. Каркас Tabs + перенос секций (без новых данных).** ✅
- Файлы: `ClientProfileCard.tsx` → тонкий каркас (Hero-заглушка + `Tabs` router, `key={userId}` сохранить); новые обёртки `OverviewTab/ProgramTab/CommunicationsTab/RecordsTab/AccountTab` в `apps/webapp/src/app/app/doctor/clients/`. Существующие панели переезжают **без изменений** по карте §4.5.
- Props/данные `[userId]/page.tsx` **не меняем** (тот же `Promise.all`).
- Проверки: `pnpm --dir apps/webapp exec tsc --noEmit`; `pnpm --dir apps/webapp lint`; обновить/прогнать `ClientProfileCard.backLink.test.tsx`; визуальный smoke (все блоки доступны в табах).
- DoD: длинная лента заменена табами; ни одна существующая панель не потеряна; тесты карточки зелёные.

**2B-2. Hero / Care Bar.** ✅
- Новый `PatientCareBar` (идентичность, телефон `tel:`, бейджи Архив/Блок, ближайшая запись из `upcomingAppointments[0]`, тумблер сопровождения через существующий `support-settings` flow, кнопка «Чат» с `chatUnreadCount` через существующий `unread-by-patient`, меню `⋯`). Hero-сводка задач — плейсхолдер до 2C.
- Проверки: `tsc`/`lint`; RTL на Hero (рендер бейджей, наличие кнопки чата с бейджем).
- DoD: above-the-fold виден «кто/контакт/запись/сопровождение/чат» без скролла; mobile — 2 ряда.

**2B-3. Action Strip + агрегаты (§3.2.1, §3.2.2).** ✅
- Порт/сервис rollup комментариев/медиа активного инстанса + «план не открыт»; DI в `[userId]/page.tsx` (RSC, above-the-fold); `PatientActionStrip` с чипами по §4.1; пустое состояние «Срочных задач нет».
- Семантику «нового» комментария/медиа зафиксировать в `LOG.md` + `apps/webapp/src/app/api/api.md`.
- Проверки: unit на агрегат (порог дат «план не открыт», подсчёт «новых»); `tsc`/`lint`; route/RSC-тест на корректные счётчики.
- DoD: каждый чип ведёт в нужный таб/чат; «план не открыт» по алгоритму §3.2.2.

**2B-4. Обзор: Care Plan + Wellbeing.** ✅
- `OverviewTab`: Care Plan-карточка из `treatmentProgramInstancesInitial` (активный инстанс summary, текущий этап, CTA «Открыть программу»/«Назначить»; элементы со static-превью `PatientCatalogMediaStaticThumb`/`MediaThumb`, **без** `<video>`, бейдж «Новое» при `lastViewedAt = null`); Wellbeing-спарклайн (`buildWellbeingWeekChartData` по `recentSymptomEntries`/`symptomTrackings`) + кнопка «Подробный график» (lazy раскрытие полного графика); компактный блок «Заметки» (§4.5).
- Проверки: соответствие `patient-ui-shared-primitives` (static-превью); `tsc`/`lint`; RTL на «Новое»-бейдж и раскрытие графика (прогрев lazy в `beforeAll` по `webapp-tests-lean-no-bloat`).
- DoD: лечение (программа+самочувствие) на «Обзоре»; полный график только по клику.

**2B-5. Миграция якорей + `autoOpenChat`.** ✅

**UX-аудит после 2B (P0/P1):** встроенный чат в табе; deep link `?discussionItem=` с inbox/Care Plan; Action Strip «Сейчас»; primary/secondary обзор; зона «Срочное» на табе «Программа»; `doctorClientCardChrome.ts`; админ вне табов. Детали — [`LOG.md`](LOG.md) §2026-06-02 UX-аудит.
- Helper «anchor → tab + scroll» по таблице §8; Hero-ссылки переведены на него; `?chat=1` сохраняет автооткрытие.
- Проверки: `rg "doctor-client-section-" apps/webapp/src`; RTL/integration на 2–3 ключевых якоря (`-treatment-programs`, `-pending-program-tests`, `-communications`) + `?chat=1`.
- DoD: старые `#doctor-client-section-*` и `?chat=1` открывают правильный таб без «битого» якоря.

### Фаза 2C — задачи специалиста

Перед 2C — отдельная мини-спека модели задач (Drizzle-схема + ключи `system_settings` каналов + worker) в этой папке инициативы; UI-контракт уже в §6. Шаги:

**2C-1.** Drizzle-таблица задач (`patient_user_id nullable`, без FK на `item_ref_id`/пациента по правилам), миграция, порт/сервис/DI, API CRUD/выполнение/сводка через тонкие route. Проверки: миграция применяется; unit сервиса; route-тесты (401/403/404/валидация). DoD: CRUD + выполнение + сводка работают.
**2C-2.** Настройки каналов напоминаний специалиста в `/app/settings` (doctor-scope, ключи в `ALLOWED_KEYS`, **не env** — `000-critical-integration-config-in-db`). DoD: каналы редактируются и читаются из `system_settings`.
**2C-3.** Worker-напоминания: скан `remind_at`, идемпотентность, существующий канал нотификации. DoD: напоминание приходит по выбранным каналам, без дублей.
**2C-4.** UI: `PatientTasksSection` + `TaskFormDialog` + `TaskRow` в «Обзоре» (§4.4) + Hero-сводка (§3.2.3); глобальные задачи — на «Сегодня». DoD: список в карточке + сводка в Hero.

---

## 10. Acceptance checklist («хаос убран»)

- [x] При открытии без скролла видно: кто, ближайшая запись, сопровождение, что горит, активный этап (сводка задач — фаза 2C).
- [x] Срочное собрано в Action Strip; каждый чип ведёт в нужное место.
- [x] Лечение (программа + самочувствие) — на «Обзоре»; учётка/админка/история — в своих табах.
- [x] Самочувствие: спарклайн в «Обзоре» (маркеры ЛФК), полный график — по клику.
- [x] Старые `#doctor-client-section-*` и `?chat=1` открывают правильный таб без 404 якоря.
- [x] Mobile: чат, сопровождение доступны без горизонтального хаоса (задачи — 2C).
- [x] Задачи: список в карточке + сводка невыполненных в Hero; напоминание по каналам из настроек, без дублей (`reminder_sent_at`) — 2C.
- [x] Нет нарушений module isolation (2B); новые сущности на Drizzle и конфиг каналов — 2C.

---

## 11. Scope boundaries

**Разрешено трогать (2B):** `apps/webapp/src/app/app/doctor/clients/` (каркас карточки, новые `*Tab`/`PatientCareBar`/`PatientActionStrip`/`OverviewTab` и обёртки), `apps/webapp/src/app/app/doctor/clients/[userId]/page.tsx` (только добавление новых RSC-агрегатов в `Promise.all`), новые порт/сервис агрегатов в `apps/webapp/src/modules/treatment-program/` (или новый модуль агрегата), `api.md`, `LOG.md`. **2C** дополнительно: новая таблица задач (`apps/webapp/db/schema/*`, миграции), её порт/сервис/route, doctor-scope ключи `system_settings`, worker напоминаний, `/app/settings`, «Сегодня» (глобальные задачи).

**Вне scope (не менять без отдельного решения):**
- Детальный экран инстанса (`[instanceId]/*`: правка/обсуждение) — карточка только **ведёт** на него.
- Существующие доменные панели — переезжают в табы **как есть**, без рефактора их внутренней логики.
- Полный клинический timeline с богатой семантикой событий (после 2B); cross-patient inbox на «Сегодня» (фаза 5); CMS/help (фаза 6); черновик редактора программы (фаза 3).
- Контракт API `treatment-program-instances` и схема существующих таблиц программы (для 2B новые агрегаты — read-only поверх существующих данных).

Любое расширение scope — согласовать до реализации.
