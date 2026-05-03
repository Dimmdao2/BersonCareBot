# DOCTOR_CLIENT_PROFILE_REPACK_PLAN — карточка пациента и список клиентов: пересборка из имеющихся блоков

**Дата:** 2026-05-02.
**Статус:** выполнено.
**Связанный общий план:** [PLAN_DOCTOR_CABINET.md](../PLAN_DOCTOR_CABINET.md), этап 6 (минимальная пересборка карточки пациента из имеющегося — заморозка глубокой переработки).
**Аудит закрытия:** [`DOCTOR_CLIENT_PROFILE_REPACK_EXECUTION_AUDIT.md`](DOCTOR_CLIENT_PROFILE_REPACK_EXECUTION_AUDIT.md) — чек-листы §5, синхронизация документов, остаточные хвосты.

**Связанные документы:**
- [RECOMMENDATIONS_AND_ROADMAP.md](../RECOMMENDATIONS_AND_ROADMAP.md) §II.3 (карточка пациента — продуктовая боль и **целевая** модель табов; целевая модель **в этом ТЗ не делается**).
- [TARGET_STRUCTURE_DOCTOR.md](../TARGET_STRUCTURE_DOCTOR.md) §5 (целевая структура карточки — ориентир, не цель этого прохода).
- [`DOCTOR_UI_DENSITY_PLAN.md`](DOCTOR_UI_DENSITY_PLAN.md) — общий стандарт плотности doctor UI; этот ТЗ ему не противоречит.
- `.cursor/rules/clean-architecture-module-isolation.mdc`.

---

## 0. Что делаем и почему

Сейчас экран `/app/doctor/clients/[userId]` визуально неудобен: карточка пациента — длинная цепочка из 11–13 аккордеонов, каждый — отдельная «коробка», по умолчанию раскрыты «Контакты», а основная клиническая работа (заметки, программа, ЛФК, дневники) — ниже и закрыта. Список клиентов слева перегружен: ФИО, телефон под именем, ярлыки `TG`/`MAX`/«N отмен» — пациентов в строке мало, скролл длинный.

Менять БД, сервисы и порты в этом проходе нельзя (этап 6 заморожен). Делаем три точечных, дешёвых улучшения:

1. **Карточка пациента** — убрать аккордеон, собрать всё в **один цельный контейнер** с короткой sticky-шапкой и плоскими секциями.
2. **Удалить заглушку «Создать из записи на приём»** на странице списка клиентов.
3. **Список клиентов** — компактнее: убрать телефон под ФИО, заменить текстовые бейджи `TG`/`MAX` на маленькие **иконочные** бейджи каналов (телефон, Telegram, MAX), отображать только подключённые.

---

## 1. Scope boundaries

### Разрешено трогать

- `apps/webapp/src/app/app/doctor/clients/page.tsx` — снят рендер заглушки «Создать из записи на приём» (**выполнено**).
- ~~`apps/webapp/src/app/app/doctor/clients/CreateClientFromRecordStub.tsx`~~ — файл **удалён** (**выполнено**).
- `apps/webapp/src/app/app/doctor/clients/DoctorClientsPanel.tsx` — UI строк списка (плотность + иконочные бейджи).
- `apps/webapp/src/app/app/doctor/clients/ClientProfileCard.tsx` — пересборка макета без аккордеонов.
- При желании — выделение **локальных** child-компонентов рядом, **только для разделения JSX**, без изменения данных:
  - `ClientProfileStickyHeader.tsx` (опционально),
  - `ClientChannelBadges.tsx` (опционально, переиспользуется со списком).
- Тесты рядом с затронутыми файлами:
  - `ClientProfileCard.backLink.test.tsx` — обновить, если меняется шапка/back-link;
  - новый/обновлённый тест плотного рендера списка и иконочных бейджей;
  - e2e (`apps/webapp/e2e/doctor-pages-inprocess.test.ts`) — только если падает из-за изменений.
- `docs/APP_RESTRUCTURE_INITIATIVE/LOG.md` — запись об исполнении.
- При необходимости — этот документ и `PLAN_DOCTOR_CABINET.md` §«Этап 6».

### Вне scope

- Не вводить **табы** карточки пациента (это глубокая переработка из §II.3 roadmap — отдельная инициатива).
- Не вводить новый **hero «Что важно сейчас»** как отдельную секцию с чужими данными — sticky-шапка показывает **только те поля, что уже есть в `ClientProfile`** (см. §3).
- Не менять **порты/сервисы/инфру**: ничего нового в `apps/webapp/src/modules/doctor-clients/**`, `apps/webapp/src/infra/repos/**`, `apps/webapp/src/app-layer/**`. Никаких новых API/route/SQL/миграций.
- Не трогать `AssignLfkTemplatePanel`, `PatientTreatmentProgramsPanel`, `DoctorNotesPanel`, `DoctorClientLifecycleActions`, `SubscriberBlockPanel`, `AdminClientProfileEditPanel`, `AdminMergeAccountsPanel`, `AdminClientAuditHistorySection`, `AdminDangerActions`, `DoctorChatPanel` — переиспользовать как есть.
- Не трогать модальный поток чата (`openPatientChat`, `chatUnreadCount`, `Dialog`) — оставить как есть.
- Не менять список запросов на стороне `page.tsx` (`Promise.all`), не вводить новые `Promise.all`-ветки для карточки.
- Не менять admin-видимость секций (поведение `isAdmin` / `canPermanentDelete` / `canEditClientProfile` сохраняется).
- Не редизайнить ничего в патч-интерфейсе пациента, в меню врача, в дашборде «Сегодня», в каталогах назначений.
- Не добавлять новые зависимости (иконки берём из уже подключённого `lucide-react`).

### Архитектурные ограничения

- ESLint/архитектура: модули в `apps/webapp/src/modules/**` и роуты `apps/webapp/src/app/api/**/route.ts` не трогаем — изменения только во фронтовом слое `apps/webapp/src/app/app/doctor/clients/**`. Новые `@/infra/db/*` / `@/infra/repos/*` импорты не вводим.
- Без новых env vars и без `system_settings` (никакого runtime-конфига).
- Никаких новых таблиц, миграций, SQL.

---

## 2. Историческая база (до исполнения ТЗ, 2026-05-02)

> Сохранено для трассировки решений. **Текущее состояние кода** — после REPACK: см. [LOG.md](../LOG.md) и [`DOCTOR_CLIENT_PROFILE_REPACK_EXECUTION_AUDIT.md`](DOCTOR_CLIENT_PROFILE_REPACK_EXECUTION_AUDIT.md).

- Страница списка/карточки **раньше** рендерила [`page.tsx`](../../apps/webapp/src/app/app/doctor/clients/page.tsx) с `<CreateClientFromRecordStub />` при `scope === "appointments"` и master-detail с `DoctorClientsPanel` + `ClientProfileCard`. **Сейчас** заглушка удалена, только master-detail.
- Файл **`CreateClientFromRecordStub.tsx`** в репозитории **отсутствует** (удалён при исполнении).
- Список клиентов **раньше** в [`DoctorClientsPanel.tsx`](../../apps/webapp/src/app/app/doctor/clients/DoctorClientsPanel.tsx): `displayName`, телефон строкой под именем, `nextAppointmentLabel`, текстовые бейджи `TG`/`MAX`/`N отмен`. **Сейчас** — компактные строки и иконочные бейджи (см. §3.2).
- Карточка **раньше** в [`ClientProfileCard.tsx`](../../apps/webapp/src/app/app/doctor/clients/ClientProfileCard.tsx): `AccItem` и раскрытие по секциям. **Сейчас** — один `article`, sticky-шапка, плоские секции (см. §3.3). Данные по-прежнему из `profile` (`identity`, `channelCards`, записи, дневники и т.д.), чат — `openPatientChat` + `Dialog` + `DoctorChatPanel`.

Все данные, которые понадобятся новой шапке и новой раскладке, **уже** доступны через эти поля. Новых полей не добавляем.

---

## 3. Целевое поведение

### 3.1 Удалить «Создать из записи на приём»

- Удалить компонент-заглушку `CreateClientFromRecordStub.tsx`.
- В `apps/webapp/src/app/app/doctor/clients/page.tsx` снять импорт и условный рендер `{scope === "appointments" ? <CreateClientFromRecordStub /> : null}` — без замены другим контентом.
- ID `doctor-clients-create-from-record-stub` выходит из верстки. Если он есть в e2e — удалить ассерт.

### 3.2 Список клиентов: компактнее, иконочные бейджи каналов

В `DoctorClientsPanel.tsx`, в строке `<li>`:

1. **Убрать телефон под именем** (`identity.phone` сейчас отдельной строкой `text-xs uppercase`). Поиск по телефону остаётся прежним (`matchesSearch` уже включает `phone`); пациенту телефон видно только из карточки.
2. **Сделать строку компактнее:**
   - вертикальный padding `py-3` → `py-2`;
   - `space-y-3` у `<ul>` → `space-y-1.5`;
   - `displayName` оставить как `font-semibold`, но `text-sm` (как в общем плотном UI doctor; ориентир — `DOCTOR_UI_DENSITY_PLAN.md`);
   - `nextAppointmentLabel` оставить второй строкой, но `text-[11px]` `text-muted-foreground` (без `uppercase`/`tracking-wide`).
3. **Иконочные бейджи каналов справа.** Контейнер справа (`flex shrink-0 gap-1`):
   - Если `identity.phone` есть — иконка **`Phone`** (lucide-react).
   - Если `identity.bindings.telegramId` есть — иконка **`Send`** (lucide-react, paper plane — устоявшаяся ассоциация с Telegram).
   - Если `identity.bindings.maxId` есть — текстовый glyph **`М`** в той же визуальной обвязке, что иконки (в `lucide-react` нет подходящей иконки для MAX; пользовательский запрос «если нет — бейджик макс»).
   - Бейджи **не рендерим** для отсутствующих каналов (отображаем только подключённое).
   - Размер: каждый бейдж `inline-flex items-center justify-center size-6 rounded-md bg-muted text-muted-foreground` (или `Badge variant="secondary"` с тонкой геометрией — на усмотрение исполнителя; главное — единая высота и не больше 24px).
   - Иконка внутри `size-3.5`, `aria-hidden`, у обёртки `aria-label` («Телефон указан», «Подключён Telegram», «Подключён MAX»).
   - **Цвет/состояние:** только нейтральный; разные цвета каналов не вводить, чтобы не размывать текущий стиль.
4. **Бейдж «N отмен»** (`cancellationCount30d > 0`) — оставить, но визуально приравнять к иконочным бейджам по высоте. Допустимо `Badge variant="destructive"`, размер уменьшить (`px-1.5 py-0 text-[10px]`).
5. **Поведение клика, scope-tabs, фильтры, поиск, master-detail, mobile-навигация, ID для тестов** не меняются.

> Ассоциация «телеграм=конверт» из запроса покрывается paper-plane‑ом из lucide; формальный конверт (`Mail`) зарезервирован за email и в этом UI не используется. Если визуально не зайдёт — заменить на `MessageCircle`. Решение фиксируется в `LOG.md` после реализации.

### 3.3 Карточка пациента: один контейнер, без аккордеонов

Полностью убираем `AccItem` и `useState<string | null>("contacts")` (вместе со всем `openSection`/`toggle`). Логика чата (`openPatientChat`, `chatUnreadCount`, диалог `Dialog`/`DoctorChatPanel`) сохраняется.

#### 3.3.1 Корневой контейнер

Один цельный визуальный контейнер вместо 12+ отдельных карточек:

```tsx
<div id={`doctor-client-profile-page-${userId}`} className="flex flex-col gap-3">
  {/* блокировка-баннер как сейчас, если identity.isBlocked */}
  <article
    id={`doctor-client-profile-card-${userId}`}
    className="rounded-lg border border-border bg-card shadow-sm overflow-hidden"
  >
    {/* sticky-шапка */}
    {/* секции через <section>, разделённые тонкой линией border-t */}
  </article>
  <p id="doctor-client-back-link-container" className="pt-1">…back-link…</p>
  <Dialog …>{/* как сейчас */}</Dialog>
</div>
```

- Внутренние секции — без собственных `border` / `rounded` / `bg-card` / `shadow-sm`. Разделение строго `border-t border-border` сверху каждой секции, кроме первой после шапки.
- Вертикальные отступы внутри секции `py-3`/`py-4`, горизонтальные `px-4`. Без вложенных «карточек», кроме существующих специальных панелей (notes/treatment-programs/lfk-assign — они оставляют свою внутреннюю верстку как есть).

#### 3.3.2 Sticky-шапка карточки

Только из существующих полей `profile`:

- Слева: `identity.displayName` (или «Имя не указано»), вторая строка — `identity.phone` со ссылкой `tel:` (если есть). Плюс маленькие статусные бейджи: «архив» (`identity.isArchived`), «заблокирован» (`identity.isBlocked`).
- По центру (на md+): «Ближайший визит» = `upcomingAppointments[0]`, отображается `scheduleProvenancePrefix` мелко + `label` нормально. Если пусто — «Нет ближайших записей».
- Справа в один ряд:
  - Кнопка **«Открыть чат»** = существующий `openPatientChat()`, бейдж `chatUnreadCount` уже есть.
  - Иконочный якорь **«Заметки»** — ссылка-якорь на `#doctor-client-section-notes`, плавный скролл.
  - Иконочный якорь на **программу лечения** — ссылка-якорь на `#doctor-client-section-treatment-programs` (в UI использована краткая подпись **«Программа»** вместо «Назначить» — тот же целевой блок).
- На мобильной ширине шапка не sticky, а просто верхний блок; CTA-кнопки переносятся ниже имени.
- Sticky на md+: `md:sticky md:top-[var(--doctor-sticky-offset,0px)] z-10 bg-card`.

> Sticky-шапка **не вводит новых данных** и не дублирует логику чата — `openPatientChat` остаётся единственным источником истины.

#### 3.3.3 Порядок секций (плоско, без аккордеонов)

Внутри `<article>` сверху вниз:

1. **Sticky-шапка** (см. 3.3.2).
2. `КЛИНИЧЕСКАЯ РАБОТА` — маленький `<h3>` (uppercase, muted, `text-xs`):
   1. **Заметки врача** (`<DoctorNotesPanel />`) — `id="doctor-client-section-notes"`.
   2. **Программа лечения** (`<PatientTreatmentProgramsPanel />`) — `id="doctor-client-section-treatment-programs"`.
   3. **Дневник ЛФК** — текущий контент (`lfkComplexes`/`recentLfkSessions`) + `<AssignLfkTemplatePanel />`.
   4. **Дневник симптомов** — текущий контент.
3. `ЗАПИСИ`:
   1. **Ближайшие записи** (`upcomingAppointments` + `appointmentStats`).
   2. **История записей** (`appointmentHistory`) — обёрнута в нативный `<details>` со сводкой «Показать историю записей (N)»; раскрывается без JS, без CSS-аккордеона.
4. `КОММУНИКАЦИИ`:
   - CTA «Открыть чат» уже есть в шапке; в этой секции — компактный блок с тем же CTA (для мобильной ширины) + старый журнал отправок (`messageHistory`) под `<details>` со сводкой «Старый журнал отправок (N)». Если `messageHistory.length === 0` — секцию **не рендерим** вообще.
5. `УЧЁТНАЯ ЗАПИСЬ`:
   1. **Контакты и каналы** (`contacts` сейчас): **удалить** строку «Открыть раздел сообщений» в `/app/doctor/messages` (дубль; чат теперь в шапке). Inline-edit (`AdminClientProfileEditPanel`) сохраняется только для admin при `canEditClientProfile`.
   2. **Учётная запись и архив** (`DoctorClientLifecycleActions`).
   3. **Блокировка подписчика** (`SubscriberBlockPanel`).
6. `ADMIN` (если `isAdmin`/`canPermanentDelete`) — **сворачиваем** в `<details>` с подписью «Админ-операции», чтобы не пугать врачей и не удлинять страницу. Внутри:
   1. `<AdminDangerActions />` (если `isAdmin`).
   2. `<AdminMergeAccountsPanel anchorUserId={userId} enabled />` — у этого компонента есть `suspendHeavyFetch`. Поскольку убираем аккордеон, передаём:
      `suspendHeavyFetch={!detailsOpen}` (контролируем небольшим `useState` для одной этой `<details>`-подсекции). Это **не аккордеон** карточки — это локальная защита тяжёлой загрузки одного admin-блока.
   3. `<AdminClientAuditHistorySection platformUserId={userId} enabled suspendLoad={!detailsOpen} />` — аналогично.

> Все исходные ID, которые сейчас завязаны на старый аккордеон, **удаляются** вместе с `AccItem` (например `doctor-client-acc-trigger-*`). Новые стабильные ID секций — `doctor-client-section-{notes|treatment-programs|lfk|symptoms|appointments|appointment-history|communications|contacts|lifecycle|subscriber|admin}`.

#### 3.3.4 Что **не** меняем внутри секций

- Содержимое `DoctorNotesPanel`, `PatientTreatmentProgramsPanel`, `AssignLfkTemplatePanel`, `DoctorClientLifecycleActions`, `SubscriberBlockPanel`, `AdminClientProfileEditPanel`, `AdminMergeAccountsPanel`, `AdminClientAuditHistorySection`, `AdminDangerActions`, `DoctorChatPanel`.
- Логику чата: `openPatientChat`, `loadPatientUnreadCount`, `Dialog`, `DoctorChatPanel`.
- Тексты (кроме явных сокращений «UPPERCASE» в muted-подзаголовках), цвета, базовую палитру.

---

## 4. Шаги исполнения

Каждый шаг — отдельный коммит и отдельная запись в `LOG.md`.

1. **Удалить заглушку «Создать из записи на приём».**
   - Удалить файл `CreateClientFromRecordStub.tsx`.
   - В `apps/webapp/src/app/app/doctor/clients/page.tsx` убрать импорт и условный рендер.
   - `rg "CreateClientFromRecordStub"` — должно вернуть пусто (кроме новой записи в `LOG.md`).
   - Запустить узкие проверки:
     - `pnpm --dir apps/webapp lint`
     - `pnpm --dir apps/webapp typecheck`
     - точечно vitest по затронутым тестам (если есть).

2. **Список клиентов: плотность + иконочные бейджи каналов.**
   - В `DoctorClientsPanel.tsx`:
     - убрать рендер телефона под ФИО;
     - применить плотные классы (`py-2`, `space-y-1.5`, `text-sm`, `text-[11px]`);
     - заменить текстовые `Badge "TG"` / `Badge "MAX"` на иконочные бейджи (`Phone`, `Send`, glyph `М`); рендерить только подключённое;
     - бейдж `N отмен` оставить, нормализовать высоту.
   - При желании выделить локальный `<ClientChannelBadges item={c} />` для переиспользования с карточкой пациента (опционально, без новых модулей).
   - Тесты: добавить/обновить focused unit/RTL-тест строки списка (рендер при разных комбинациях `phone`/`telegramId`/`maxId`/`cancellationCount30d`).
   - Не менять ID `doctor-clients-item-{userId}` / `doctor-clients-card-{userId}`.

3. **Карточка пациента: один контейнер, sticky-шапка, плоские секции.**
   - В `ClientProfileCard.tsx`:
     - удалить `AccItem`, `openSection`, `toggle`;
     - реализовать `<article>` с sticky-шапкой и плоскими секциями (см. 3.3);
     - снять ссылку «Открыть раздел сообщений» из секции «Контакты»;
     - реализовать `<details>` для «История записей», «Старый журнал отправок» и `ADMIN`;
     - сохранить чат-диалог и `loadPatientUnreadCount` без изменений.
   - При желании выделить локально `ClientProfileStickyHeader.tsx` и `ClientChannelBadges.tsx` (без побочных эффектов и без бизнес-логики).
   - Тесты: обновить `ClientProfileCard.backLink.test.tsx`; добавить focused-тесты на наличие sticky-шапки, на отсутствие `AccItem`/`role="button"` для секций, на `<details>` для admin-блока.
   - `rg "AccItem|doctor-client-acc-trigger-"` по `apps/webapp/src` — должно вернуть пусто.

4. **Документация и журнал.**
   - В `LOG.md` — отдельная запись «карточка пациента: пересборка из имеющегося + список клиентов: иконочные бейджи + удалена заглушка `CreateClientFromRecord`».
   - В `PLAN_DOCTOR_CABINET.md` §«Этап 6» — отметить, что три указанных микро-улучшения сделаны (без снятия общей заморозки глубокой переработки).
   - В `README.md` — строка с ссылкой на этот ТЗ и его статус.
   - **Не** трогать `STRUCTURE_AUDIT.md` (immutable baseline).

5. **Финальный CI.**
   - `pnpm install --frozen-lockfile && pnpm run ci` (как в `.cursor/rules/pre-push-ci.mdc` — обязательно перед push).

---

## 5. Проверки

### 5.1 Архитектура / lint

- `rg "CreateClientFromRecordStub"` — пусто (кроме `LOG.md`).
- `rg "AccItem|doctor-client-acc-trigger-" apps/webapp/src` — пусто.
- `rg "@/infra/db|@/infra/repos" apps/webapp/src/app/app/doctor/clients` — без новых попаданий относительно `main`.
- `pnpm --dir apps/webapp lint`, `pnpm --dir apps/webapp typecheck`.

### 5.2 Узкие тесты

- `pnpm --dir apps/webapp exec vitest run src/app/app/doctor/clients/ClientProfileCard.backLink.test.tsx` — обновлён, проходит.
- Новый тест строки `DoctorClientsPanel`:
  - phone+TG+MAX → три бейджа в нужном порядке;
  - только phone → один бейдж телефона;
  - cancellationCount30d > 0 → бейдж «N отмен» рендерится.
- Новый focused-тест карточки:
  - sticky-шапка содержит `displayName`, телефон со ссылкой `tel:`, CTA «Открыть чат» (с `chatUnreadCount`-бейджем при > 0);
  - в DOM нет `[id^="doctor-client-acc-trigger-"]`;
  - admin-блок рендерится внутри `<details>`, у `AdminClientAuditHistorySection` `suspendLoad=true` пока `<details>` закрыт.
- `pnpm --dir apps/webapp exec vitest run apps/webapp/e2e/doctor-pages-inprocess.test.ts` — проверить, что не отвалился smoke страницы клиентов; при необходимости подправить ассерт под исчезнувший `CreateClientFromRecordStub`.

### 5.3 Manual smoke (оператор)

- На `/app/doctor/clients`:
  - заглушка «Создать из записи на приём» **отсутствует** во всех `scope` (`appointments`/`all`/`archived`);
  - в строке клиента нет телефона, справа маленькие бейджи каналов и (если есть) «N отмен»;
  - бейджи показывают только подключённые каналы;
  - клик по строке открывает карточку пациента справа (на md+) или переходит на детальную (на mobile).
- На карточке пациента:
  - один общий контейнер, без отдельных «коробочек» на каждую секцию;
  - sticky-шапка остаётся видимой при скролле;
  - кнопка «Открыть чат» открывает существующий модальный чат, бейдж непрочитанных корректен;
  - якоря «Заметки» / «Программа» скроллят к нужным секциям (`#doctor-client-section-notes`, `#doctor-client-section-treatment-programs`);
  - история записей и старый журнал отправок свёрнуты под «Показать»;
  - admin-операции (для admin) свёрнуты в одну `<details>`-секцию; `AdminMergeAccountsPanel` и `AdminClientAuditHistorySection` не делают тяжёлых запросов до раскрытия;
  - на мобильной ширине вёрстка остаётся читаемой, без горизонтального скролла.

### 5.4 Полный CI перед push

`pnpm install --frozen-lockfile && pnpm run ci` — успех (обязательно).

---

## 6. Stop conditions

Если в ходе работы вскрылось одно из:

- нужно менять `ClientListItem` / `ClientProfile` или порты `doctor-clients`,
- нужно менять API/route/SQL,
- ломаются e2e сценарии, не связанные с тремя задачами этого ТЗ,
- появляется соблазн ввести табы / hero «Что важно сейчас» / новые сводки,

— остановиться, зафиксировать ситуацию в `LOG.md` и поднять отдельным решением (это уже не «минимальная пересборка из имеющегося», а глубокая переработка — отдельная инициатива по §II.3 roadmap).

---

## 7. Definition of Done

- На странице `/app/doctor/clients` нет заглушки «Создать из записи на приём» ни в одном `scope`.
- В строке списка нет телефона; справа — иконочные бейджи каналов (только подключённое) и опционально «N отмен» в той же геометрии.
- Карточка пациента — **один цельный контейнер**: без аккордеонов, со sticky-шапкой, плоскими секциями и группировкой `КЛИНИКА / ЗАПИСИ / КОММУНИКАЦИИ / УЧЁТНАЯ ЗАПИСЬ / ADMIN`.
- Заметки врача рендерятся выше системных секций; контакты и lifecycle — внизу; admin-секции свёрнуты под `<details>` с защитой тяжёлых запросов.
- Дубль ссылки «Открыть раздел сообщений» из секции «Контакты» удалён; чат открывается через CTA в шапке.
- Поведение и логика чата (`openPatientChat`, `chatUnreadCount`, `Dialog`, `DoctorChatPanel`) **не изменены**.
- Никаких новых имп-цепочек в `@/infra/db|@/infra/repos`; новых env/SQL/миграций нет.
- Точечные тесты (lint/typecheck + vitest по затронутым файлам) — зелёные; перед push — `pnpm run ci` успешен.
- В `LOG.md` есть запись с проверками; в `PLAN_DOCTOR_CABINET.md` §«Этап 6» отмечены закрытые микро-улучшения; в `README.md` — строка с этим ТЗ.

---

## 8. Полный аудит закрытия

[`DOCTOR_CLIENT_PROFILE_REPACK_EXECUTION_AUDIT.md`](DOCTOR_CLIENT_PROFILE_REPACK_EXECUTION_AUDIT.md) — чек-листы §5, синхронизация документов, осознанные хвосты (в т.ч. отсутствие отдельного RTL на проп `suspendLoad` — §2.2).
