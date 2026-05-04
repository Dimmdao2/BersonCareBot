# AUDIT RESULTS — Patient App Shadcn Alignment

Дата фиксации: **2026-05-01**.

**Дополнение 2026-05-04 (execution):** по инициативе `PATIENT_APP_SHADCN_ALIGNMENT` закрыты **Phase 0** (инвентаризация) и **Phase 1** (добавлены `Collapsible` и `Accordion` в `apps/webapp/src/components/ui/`). **Phase 2–6** (кабинет, `FeatureCard` / sections, профиль `ProfileAccordionSection` → `Collapsible`, уведомления `ChannelNotificationToggles` → `Switch`, form controls + `radio-group` + intake) — см. [`LOG.md`](LOG.md), [`MASTER_PLAN.md`](MASTER_PLAN.md), §5 ниже. Подробности и GO/NO-GO по чеклистам — в [`TASKS.md`](TASKS.md).

Источник: global audit и последующее обсуждение после `PATIENT_APP_STYLE_TRANSFER_INITIATIVE`.

## 1. Главный вывод

В текущей Style Transfer инициативе **не было широкого ухода от shadcn primitives**.

Факты на момент обсуждения:

- В patient routes остаётся много прямых импортов из `@/components/ui/*`.
- В booking/cabinet, diary, reminders, profile и формах продолжают использоваться `Button`, `Card`, `Badge`, `Input`, `Textarea`, `Dialog`, `Tabs`, `Tooltip`.
- Style Transfer добавил patient visual layer (`patientVisual.ts`) и применил patient classes к surfaces/text/actions, но не заменял shadcn как общий UI foundation.

Иными словами: проблема не в том, что shadcn массово удалён. Проблема точечная: некоторые элементы остались raw/custom там, где shadcn primitive может дать более устойчивую accessibility/keyboard/visual consistency базу.

## 2. Что уже закрыто в Style Transfer follow-up

Эти пункты уже не считаются открытыми задачами для этой инициативы:

### `CabinetInfoLinks`

Было:

- ссылки-плитки в `/app/patient/cabinet` держали inline `--patient-*` classes прямо в компоненте.

Закрыто:

- добавлен `patientInfoLinkTileClass` в `apps/webapp/src/shared/ui/patientVisual.ts`;
- `CabinetInfoLinks` переведён на именованный patient primitive;
- ссылки, copy и route targets не менялись.

Статус:

- **закрыто как style-only cleanup**, не требует shadcn migration.

### `BookingFormatGrid`

Было:

- компонент упоминался как inactive/deferred in `AUDIT_PHASE_4`;
- в активном booking flow импортов не было.

Закрыто:

- выполнен style-only pass;
- компонент остаётся неактивным и не подключён в runtime flow.

Статус:

- **закрыто как inactive component style pass**.

## 3. Текущие основные кандидаты

**Сводка по исполнению (2026-05-04):** alignment-пассы по **кабинету** (Phase 2), **sections / `FeatureCard`** (Phase 3) и связанным подпунктам §3.1–§3.2 **выполнены** — см. [`LOG.md`](LOG.md). Подзаголовки **§3.1–§3.3** ниже сохраняют текст первичного аудита **2026-05-01** как контекст; где они называют кабинет «первым pass» или утверждают отсутствие `accordion`/`collapsible` в `components/ui`, это **устарело** после Phase 1–2.

### `/app/patient/cabinet`

**Статус (2026-05-04):** Phase 2 закрыт — см. [`LOG.md`](LOG.md). Ниже — формулировки аудита 2026-05-01.

Исторически (аудит 2026-05-01) кабинет был главным кандидатом для первого shadcn alignment pass; **по коду Phase 2 закрыт 2026-05-04.**

Найденные элементы *(снимок 2026-05-01; фактическое состояние после Phase 2 — [`LOG.md`](LOG.md))*:

- `CabinetPastBookings` — custom accordion-like раскрытие через raw `<button>` + local state.
- `AppointmentStatusBadge` — custom status badge на `<span>` + ручные tone classes.
- `CabinetInfoLinks` — уже вынесен в patient primitive; можно дополнительно обсудить link-like button adapter, но это не обязательно. Локальный `Button` сейчас не поддерживает `asChild`.

Почему стоит смотреть:

- `/cabinet` — интерактивная страница с записями, прошедшими приёмами, статусами и ссылками;
- локальные shadcn-style primitives на базе `@base-ui/react` могут улучшить keyboard/focus/a11y consistency;
- scope можно держать узким и хорошо покрыть targeted tests.

Важная оговорка (актуализировано 2026-05-04):

- В `apps/webapp/src/components/ui/` есть в т.ч. **`accordion`** и **`collapsible`** (Phase 1); accordion-like в кабинете переведены на `Collapsible` где запланировано (Phase 2).
- *(На снимок аудита 2026-05-01: `accordion` / `collapsible` отсутствовали; добавление — Phase 1.)*

### `/app/patient/sections`

**Статус (2026-05-04):** Phase 3 закрыт — см. [`LOG.md`](LOG.md). Ниже — формулировки аудита 2026-05-01.

Кандидат связан с `FeatureCard`.

Найденные элементы *(снимок 2026-05-01; фактическое состояние после Phase 3 — [`LOG.md`](LOG.md))*:

- `sections/page.tsx` использует `FeatureCard`.
- `FeatureCard` — custom clickable card abstraction; внутри использует `Badge`, но не построен как shadcn `Card` composition.

Почему стоит смотреть:

- `FeatureCard` используется как карточка разделов;
- если хотим shadcn-first card composition, лучше менять сам `FeatureCard`, а не каждый route отдельно.

Риск:

- `FeatureCard` также используется вне `/sections` (например legacy/home-side usages), поэтому изменение должно быть осторожным и тестироваться по всем consumers.

### `/app/patient/sections/[slug]`

**Статус (2026-05-04):** покрыто тем же Phase 3, что и `/sections` — см. [`LOG.md`](LOG.md).

Кандидат по той же причине:

- route использует `FeatureCard` для дочерних разделов/материалов;
- поведение должно остаться прежним: ссылки, slugs, redirect/canonical behavior, subscription/warmup gates.

## 4. Страницы, которые пока не стоит включать в первый pass

### Новая patient home (`/app/patient`)

Не трогаем.

Уточнение после обсуждения:

- видимая новая главная рендерится через `PatientHomeToday`;
- текущий pipeline включает blocks: `daily_warmup`, `useful_post`, `booking`, `situations`, `progress`, `next_reminder`, `mood_checkin`, `sos`, `plan`, `subscription_carousel`, `courses`;
- legacy/side components вроде `PatientHomeNewsSection`, `PatientHomeMotivationSection`, `PatientHomeMailingsSection` существуют в repo, но не являются тем, что пользователь сейчас называет новой главной; `PatientHomeLessonsSection` удалён (2026-05-04).

Поэтому shadcn alignment новой home — **не scope** этой инициативы без отдельного product/design решения.

### `/app/patient/profile`

**2026-05-04 (Phase 4):** [`ProfileAccordionSection`](../../apps/webapp/src/app/app/patient/profile/ProfileAccordionSection.tsx) переведён на **`Collapsible`** (`CollapsibleTrigger` / `CollapsibleContent`); тесты — [`ProfileAccordionSection.test.tsx`](../../apps/webapp/src/app/app/patient/profile/ProfileAccordionSection.test.tsx).

**2026-05-04 (Phase 6):** [`AuthOtpChannelPreference`](../../apps/webapp/src/app/app/patient/profile/AuthOtpChannelPreference.tsx) — **`RadioGroup`**; [`DiaryDataPurgeSection`](../../apps/webapp/src/app/app/patient/profile/DiaryDataPurgeSection.tsx) — согласие на purge через **`Switch`**. Прочие блоки профиля (PIN, основные формы данных и т.д.) в Phase 6 не входили — см. [`TASKS.md`](./TASKS.md) / [`LOG.md`](./LOG.md).

### `/app/patient/notifications`

**2026-05-04 (Phase 5):** [`ChannelNotificationToggles`](../../apps/webapp/src/app/app/patient/notifications/ChannelNotificationToggles.tsx) переведён на **`Switch`**; тесты — [`ChannelNotificationToggles.test.tsx`](../../apps/webapp/src/app/app/patient/notifications/ChannelNotificationToggles.test.tsx). Исторически здесь был raw checkbox — см. журнал инициативы.

### `/app/patient/diary/*`

**2026-05-04 (Phase 6):** form controls дневника и журналов симптомов/ЛФК выровнены (`Select` / `Textarea`); FAB [`QuickAddPopup`](../../apps/webapp/src/app/app/patient/diary/QuickAddPopup.tsx) смонтирован на [`diary/page.tsx`](../../apps/webapp/src/app/app/patient/diary/page.tsx) — детали в [`LOG.md`](./LOG.md).

*Архив аудита 2026-05-01:* дневник изначально помечался как высокорисковый для первого pass из‑за плотных form contracts; отдельная **Phase 6** закрыла согласованный поднабор экранов без смены ключей `FormData`.

### `/app/patient/support`

**2026-05-04 (Phase 6):** [`PatientSupportForm`](../../apps/webapp/src/app/app/patient/support/PatientSupportForm.tsx) — **`Textarea`** для текста сообщения.

*Архив 2026-05-01:* откладывался в общий form-controls pass — выполнено в Phase 6.

### `/app/patient/courses`

Есть raw `<button>` с patient action class.

Почему не первый pass:

- это не выглядит проблемой: patient action class уже задаёт нужный visual layer;
- перевод на shadcn `Button` можно сделать позже как consistency cleanup.

### Deferred/extra routes

К этой группе относятся:

- `/app/patient/messages`
- `/app/patient/emergency`
- `/app/patient/lessons`
- `/app/patient/address`
- `/app/patient/intake/lfk`
- `/app/patient/intake/nutrition`
- прочие routes из `CHECKLISTS.md` §4.1 Style Transfer.

**Примечание (Phase 6):** для `/app/patient/intake/lfk` и `/app/patient/intake/nutrition` выровнены виджеты ввода (`Textarea` / `Input`); полный restyle/coverage маршрутов остаётся в зоне Phase 7 / отдельной инициативы (`MASTER_PLAN`).

Почему не первый pass:

- это расширение route coverage;
- там нужно отдельно проверять forms, iframe/map, messages read/send, intake submit behavior, access gates;
- это уже не shadcn alignment точечно, а отдельный restyle/coverage pass.

## 5. Рекомендуемый порядок

1. **Infrastructure check:** решить, добавляем ли shadcn-compatible `Accordion` / `Collapsible`, и нужен ли adapter для link-like buttons вместо несуществующего сейчас `Button asChild`. *(Выполнено: Phase 1, 2026-05-04 — см. `LOG.md`.)*
2. **Cabinet pass:** `CabinetPastBookings`, `AppointmentStatusBadge`, при необходимости small cleanup вокруг info links. *(✅ Phase 2, 2026-05-04.)*
3. **Sections / FeatureCard pass:** перевести `FeatureCard` на shadcn-compatible `Card` composition без изменения links/copy/status semantics. *(✅ Phase 3, 2026-05-04.)*
4. **Profile accordion pass:** `ProfileAccordionSection` → `Collapsible`. *(✅ Phase 4, 2026-05-04.)*
5. **Notifications control pass:** `ChannelNotificationToggles` → `Switch`. *(✅ Phase 5, 2026-05-04.)*
6. **Diary/support/intake form controls pass:** `Select` / `Textarea` / `Switch` / `RadioGroup` на целевых экранах; `QuickAddPopup` на дневнике. *(✅ Phase 6, 2026-05-04 — см. `LOG.md`.)*
7. **Deferred routes restyle pass:** отдельная инициатива или отдельная фаза, не смешивать с shadcn alignment core.

## 6. Что считать успехом

- Shadcn primitives используются там, где они дают реальную семантическую/keyboard/a11y пользу.
- Patient visual layer (`patientVisual.ts`) остаётся источником patient-specific styling, а не заменяется глобальными doctor/admin styles.
- Новая patient home не меняется случайно.
- No content/copy/product changes.
- No business/API/DB/env changes.
- Targeted tests/checks покрывают каждый pass.

