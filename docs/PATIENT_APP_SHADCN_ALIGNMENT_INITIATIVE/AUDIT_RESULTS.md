# AUDIT RESULTS — Patient App Shadcn Alignment

Дата фиксации: **2026-05-01**.

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

### `/app/patient/cabinet`

Это главный кандидат для первого shadcn alignment pass.

Найденные элементы:

- `CabinetPastBookings` — custom accordion-like раскрытие через raw `<button>` + local state.
- `AppointmentStatusBadge` — custom status badge на `<span>` + ручные tone classes.
- `CabinetInfoLinks` — уже вынесен в patient primitive; можно дополнительно обсудить link-like button adapter, но это не обязательно. Локальный `Button` сейчас не поддерживает `asChild`.

Почему стоит смотреть:

- `/cabinet` — интерактивная страница с записями, прошедшими приёмами, статусами и ссылками;
- локальные shadcn-style primitives на базе `@base-ui/react` могут улучшить keyboard/focus/a11y consistency;
- scope можно держать узким и хорошо покрыть targeted tests.

Важная оговорка:

- В `apps/webapp/src/components/ui/` сейчас есть `button`, `card`, `badge`, `dialog`, `tabs`, `tooltip`, `switch`, `select`, `textarea`, `input`, но нет `accordion` / `collapsible`.
- Если переводить accordion-like блоки правильно, нужно либо добавить shadcn `Accordion`/`Collapsible`, либо не трогать raw `<button>` до отдельного infrastructure step.

### `/app/patient/sections`

Кандидат связан с `FeatureCard`.

Найденные элементы:

- `sections/page.tsx` использует `FeatureCard`.
- `FeatureCard` — custom clickable card abstraction; внутри использует `Badge`, но не построен как shadcn `Card` composition.

Почему стоит смотреть:

- `FeatureCard` используется как карточка разделов;
- если хотим shadcn-first card composition, лучше менять сам `FeatureCard`, а не каждый route отдельно.

Риск:

- `FeatureCard` также используется вне `/sections` (например legacy/home-side usages), поэтому изменение должно быть осторожным и тестироваться по всем consumers.

### `/app/patient/sections/[slug]`

Кандидат по той же причине:

- route использует `FeatureCard` для дочерних разделов/материалов;
- поведение должно остаться прежним: ссылки, slugs, redirect/canonical behavior, subscription/warmup gates.

## 4. Страницы, которые пока не стоит включать в первый pass

### Новая patient home (`/app/patient`)

Не трогаем.

Уточнение после обсуждения:

- видимая новая главная рендерится через `PatientHomeToday`;
- текущий pipeline включает blocks: `daily_warmup`, `useful_post`, `booking`, `situations`, `progress`, `next_reminder`, `mood_checkin`, `sos`, `plan`, `subscription_carousel`, `courses`;
- legacy/side components вроде `PatientHomeNewsSection`, `PatientHomeMotivationSection`, `PatientHomeMailingsSection`, `PatientHomeLessonsSection` существуют в repo, но не являются тем, что пользователь сейчас называет новой главной.

Поэтому shadcn alignment новой home — **не scope** этой инициативы без отдельного product/design решения.

### `/app/patient/profile`

Есть похожий accordion-like custom component:

- `ProfileAccordionSection` — raw `<button>` + local state.

Почему не первый pass:

- полноценный shadcn migration потребует `Accordion`/`Collapsible`;
- лучше делать вместе с cabinet accordion-like components после добавления primitive, но как отдельную фазу.

### `/app/patient/notifications`

Есть raw checkbox:

- `ChannelNotificationToggles`.

В проекте уже есть `Switch`, поэтому потенциально можно перевести.

Почему не первый pass:

- это поведенческий control (server action / transition / pending / checked state);
- менять лучше отдельным focused pass с tests.

### `/app/patient/diary/*`

Есть native `<select>`, raw `<textarea>`, icon buttons и много form behavior.

Почему не первый pass:

- высокий риск затронуть form field names, submit contracts, keyboard behavior;
- diary лучше выносить в отдельную form-controls alignment фазу.

### `/app/patient/support`

Есть raw `<textarea>` при наличии shadcn `Textarea`.

Почему не первый pass:

- маленький кандидат, но он не критичен и лучше входит в общий form-controls pass.

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

Почему не первый pass:

- это расширение route coverage;
- там нужно отдельно проверять forms, iframe/map, messages read/send, intake submit behavior, access gates;
- это уже не shadcn alignment точечно, а отдельный restyle/coverage pass.

## 5. Рекомендуемый порядок

1. **Infrastructure check:** решить, добавляем ли shadcn-compatible `Accordion` / `Collapsible`, и нужен ли adapter для link-like buttons вместо несуществующего сейчас `Button asChild`.
2. **Cabinet pass:** `CabinetPastBookings`, `AppointmentStatusBadge`, при необходимости small cleanup вокруг info links.
3. **Sections / FeatureCard pass:** перевести `FeatureCard` на shadcn-compatible `Card` composition без изменения links/copy/status semantics.
4. **Profile accordion pass:** только после решения по `Accordion`/`Collapsible`.
5. **Notifications control pass:** `ChannelNotificationToggles` → `Switch`, если подтверждена визуальная и поведенческая целесообразность.
6. **Diary/support/intake form controls pass:** отдельно, с осторожными tests по form contracts.
7. **Deferred routes restyle pass:** отдельная инициатива или отдельная фаза, не смешивать с shadcn alignment core.

## 6. Что считать успехом

- Shadcn primitives используются там, где они дают реальную семантическую/keyboard/a11y пользу.
- Patient visual layer (`patientVisual.ts`) остаётся источником patient-specific styling, а не заменяется глобальными doctor/admin styles.
- Новая patient home не меняется случайно.
- No content/copy/product changes.
- No business/API/DB/env changes.
- Targeted tests/checks покрывают каждый pass.

