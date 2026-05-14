---
name: Phase 3 Patient Home
overview: "Переписать `/app/patient` на мобильную витрину «Сегодня»: порядок и видимость секций строго из `patient_home_blocks` / `patient_home_block_items`, данные карточек — из разрешённых items и существующих портов (`todayConfig`, CMS, курсы, напоминания, программы). Прогресс и настроение — только заглушки; без новых сущностей и без хардкода редакционных slug-ов."
status: completed
todos:
  - id: dto-resolvers
    content: Добавить DTO + resolvers в modules/patient-home (situations, carousel, SOS, optional courses/reminder helper) с узкими deps-типами
    status: completed
  - id: patient-home-today
    content: Реализовать PatientHomeToday + дочерние компоненты и диспетчер по sortOrder блоков из БД
    status: completed
  - id: page-wire
    content: "Переписать patient/page.tsx: убрать legacy и миниапп-ветку, подключить PatientHomeToday + сессионные фильтры"
    status: completed
  - id: remove-deprecated
    content: Удалить PatientMiniAppPatientHome, PatientHomeBrowserHero, PatientHomeExtraBlocks; grep и поправить импорты
    status: completed
  - id: tests
    content: RTL/snapshot + BookingCard tier + юниты resolvers (гость = без tier по скрытым блокам)
    status: completed
  - id: log-gate
    content: Обновить LOG.md, phase-level typecheck/lint/test:webapp
    status: completed
isProject: false
---

# Phase 3 — мобильная главная пациента (план)

## Статус (закрыто)

Реализация завершена и закоммичена; во frontmatter у всех todos `status: completed`.

**Кнопка Build в Cursor:** галочки и активность **Build** в боковой панели плана берутся из UI Cursor и **не всегда синхронизируются** с ручным редактированием этого файла. Чтобы Build перестала быть основным действием и отобразились галочки: в панели **Plan** отметьте todos **вручную** или **закройте / dismiss** план. Повторно запускать Build для доработки Phase 3 не требуется.

- [x] Resolvers, политика блоков, reminder pick
- [x] `PatientHomeToday` и дочерние компоненты
- [x] `patient/page.tsx` (тонкий RSC; micro-fix — без лишнего импорта)
- [x] Удаление legacy-компонентов главной
- [x] Тесты Phase 3 + `todayConfig`
- [x] `LOG.md`, аудиты

## Контекст (прочитано)

- [README.md](docs/PATIENT_HOME_REDESIGN_INITIATIVE/README.md) §6 Phase 3, глоссарий, NOT IN SCOPE, §2.1 (slug).
- [CONTENT_PLAN.md](docs/PATIENT_HOME_REDESIGN_INITIATIVE/CONTENT_PLAN.md) — только редакционный ориентир; в runtime не переносить.
- [LOG.md](docs/PATIENT_HOME_REDESIGN_INITIATIVE/LOG.md) — Phase 1–2 завершены: таблицы блоков, `getPatientHomeTodayConfig`, DI `patientHomeBlocks`.
- [AUDIT_PHASE_2.md](docs/PATIENT_HOME_REDESIGN_INITIATIVE/AUDIT_PHASE_2.md) — вызов `getPatientHomeTodayConfig` ожидается в Phase 3.

Итог в коде: главная — [`PatientHomeToday.tsx`](apps/webapp/src/app/app/patient/home/PatientHomeToday.tsx) + [`page.tsx`](apps/webapp/src/app/app/patient/page.tsx); legacy-компоненты удалены. Админ-preview: [PatientHomeBlockPreview.tsx](apps/webapp/src/app/app/settings/patient-home/PatientHomeBlockPreview.tsx).

---

## Принципы Phase 3 (сводка требований)

| Требование | Реализация |
|------------|------------|
| Структура экрана из БД | Один запрос `deps.patientHomeBlocks.listBlocksWithItems()`, фильтр `block.isVisible`, сортировка по `block.sortOrder`; рендер **диспетчер по `block.code`**, без дублирующего «ручного» порядка секций в JSX. |
| DailyWarmupCard | [todayConfig.ts](apps/webapp/src/modules/patient-home/todayConfig.ts) `getPatientHomeTodayConfig` — уже: первый видимый `content_page` в `daily_warmup`, учёт видимости блока. |
| SituationsRow | Блок `situations`: все **видимые** items, `targetType === 'content_section'`, порядок `sortOrder`; разрешение метаданных через `contentSections` (slug = `targetRef`). |
| SubscriptionCarousel | Блок `subscription_carousel`: все видимые items; типы `content_section` \| `content_page` \| `course` — полиморфное разрешение (см. ниже). |
| SosCard | Блок `sos`: **первый** видимый item (`sortOrder`), типы `content_section` \| `content_page`; при отсутствии/битой ссылке — **не рендерить** карточку (как в README §3.3). |
| Progress / Mood | Только заглушки (статический копирайт / placeholder UI); **не** подключать `patient_practice_completions`, `patient_daily_mood`, API Phase 5–6. `practiceTarget` из `getPatientHomeTodayConfig` можно передать в заглушку прогресса как «цель из настроек» без реального счётчика — опционально, без запросов к новым таблицам. |
| BookingCard | Рендер **только** если блок `booking` существует и `isVisible`; внутри карточки — ссылки на `/app/patient/booking`, кабинет и т.д. по README (без лишних server queries). |
| Без slug из CONTENT_PLAN | Любая логика и fixture-ы — по **типам** и произвольным тестовым slug/id; запрет `switch (slug === 'office-work')` и т.п.; при необходимости общий UI с админкой — только **DTO** (title, imageUrl, href), без ветвления по редакционным идентификаторам. |
| Без Phase 5–6 сущностей | Не добавлять миграции/порты под прогресс и mood. |

**Слот приветствия:** в seed [patient_home_blocks](apps/webapp/db/schema/schema.ts) нет блока `greeting`. Компонент `PatientHomeGreeting.tsx` (новый файл по README §3.1) — **фиксированно сверху** страницы (как README §3.2), затем цикл по видимым блокам из БД в порядке `sortOrder`.

**Матрица сессий (README §3.2)** — фильтр в диспетчере **дополняет** `block.isVisible` из БД (не подменяет порядок оставшихся блоков):

| Состояние | Блоки не рендерить (даже если в БД visible) | Особенности UI |
|-----------|---------------------------------------------|-----------------|
| Гость | `progress`, `mood_checkin`, `next_reminder`, `plan` | Без ПДн; DailyWarmup из админ-конфига; CTA «войти…» по README §3.2 |
| Авторизован, нет tier `patient` | **Те же**, что у гостя: `progress`, `mood_checkin`, `next_reminder`, `plan` (README: «то же + …») | В **BookingCard** — «Активировать профиль» |
| Tier `patient` | — | Все блоки из БД по `sortOrder`; `PlanCard` / `NextReminderCard` только при наличии данных |

**Один вызов разминки:** `getPatientHomeTodayConfig` вызывать **один раз** на запрос; в узле цикла для `daily_warmup` использовать уже полученный `{ dailyWarmupItem, practiceTarget }`, не дублировать выбор первого item в компоненте карточки.

**Блок `courses`:** в seed есть отдельно от `subscription_carousel`. В Phase 3 — минимальный UI (горизонтальный ряд или список карточек по visible items, `targetRef` = UUID курса через [courses/service.ts](apps/webapp/src/modules/courses/service.ts) `getCourseForDoctor` и т.п., **без** новых таблиц). README §3.2 для гостя явно не перечисляет `courses`; допустимы два варианта — **скрывать у гостя** вместе с минимальной витриной или **показывать** как публичный каталог; выбрать один вариант и зафиксировать в `LOG.md`. Ускорение scope: одна ссылка «Все курсы» вместо ряда — тоже через `LOG.md`.

**Блок `next_reminder` / `plan`:** как в README §3.3 — `deps.reminders.listRulesByUser`, `deps.treatmentProgramInstance.listForPatient`; при отсутствии данных карточка не рендерится (для tier `patient`); для гостя и без tier — см. матрицу выше (блоки скрыты целиком).

**Ветка бота:** убрать отдельный «только миниапп» layout ([PatientMiniAppPatientHome.tsx](apps/webapp/src/app/app/patient/home/PatientMiniAppPatientHome.tsx)): для `platformEntry === 'bot'` и tier patient показывать тот же `PatientHomeToday`, иначе расходится с «удалить deprecated» и единой витриной. Сохранить смысл быстрых ссылок опционально компактным блоком внутри `BookingCard` / footer — только если уложится в scope; иначе риск зафиксировать в RISKS.

**Legacy `patientHomeBlocksForEntry` / news / motivation:** README Phase 3 предполагает замену главной. Явно решить: либо не показывать старые `HomeBlockId`-секции на новой главной (проще, соответствует ТЗ), либо вынести в конец страницы за флагом — **предпочтительно не показывать**, чтобы не дублировать навигацию; при бизнес-блокере — запись в `LOG.md`.

---

## Файлы (изменить / создать / удалить)

### Переписать

- [apps/webapp/src/app/app/patient/page.tsx](apps/webapp/src/app/app/patient/page.tsx) — тонкий RSC: сессия, вызов `PatientHomeToday` (данные через `buildAppDeps` внутри дочернего компонента), `AppShell variant="patient"`, без legacy-стека и миниапп-ветки.

### Создать (главная «Сегодня», README §3.1 + диспетчер)

- `apps/webapp/src/app/app/patient/home/PatientHomeToday.tsx` — **Server Component**: загрузка данных, приветствие, цикл по видимым блокам, передача props в дочерние компоненты (интерактив — только во вложенных `client` при необходимости).
- `apps/webapp/src/app/app/patient/home/PatientHomeGreeting.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeDailyWarmupCard.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeBookingCard.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeSituationsRow.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeProgressBlock.tsx` (заглушка)
- `apps/webapp/src/app/app/patient/home/PatientHomeNextReminderCard.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeMoodCheckin.tsx` (заглушка)
- `apps/webapp/src/app/app/patient/home/PatientHomeSosCard.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomePlanCard.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeSubscriptionCarousel.tsx`
- При необходимости: `PatientHomeCoursesRow.tsx` (блок `courses`).

### Модуль patient-home (разрешение контента, без infra)

- Новый файл(ы) в [apps/webapp/src/modules/patient-home/](apps/webapp/src/modules/patient-home/) — узкие `deps`-типы (как `PatientHomeTodayConfigDeps`) и чистые функции/async-хелперы:
  - разрешение списка ситуаций;
  - разрешение элементов карусели подписки (section/page/course);
  - разрешение первого SOS item;
  - опционально: выбор «следующего» reminder для карточки (упрощённый алгоритм из README §3.3 / §9 risk).
- Обновить [patient-home.md](apps/webapp/src/modules/patient-home/patient-home.md) кратким описанием view/resolvers для Phase 3.

### Удалить (после миграции импортов)

- [apps/webapp/src/app/app/patient/home/PatientMiniAppPatientHome.tsx](apps/webapp/src/app/app/patient/home/PatientMiniAppPatientHome.tsx)
- [apps/webapp/src/app/app/patient/home/PatientHomeBrowserHero.tsx](apps/webapp/src/app/app/patient/home/PatientHomeBrowserHero.tsx)
- [apps/webapp/src/app/app/patient/home/PatientHomeExtraBlocks.tsx](apps/webapp/src/app/app/patient/home/PatientHomeExtraBlocks.tsx)

### ~~Оставить без использования на главной~~ (устарело 2026-05-04)

- `PatientHomeLessonsSection.tsx` **удалён из репозитория**; блок каталога разделов на главной при появлении — новая реализация (см. `docs/archive/2026-05-initiatives/PATIENT_APP_SHADCN_ALIGNMENT_INITIATIVE/LOG.md`, маршрут `/app/patient/sections`).

### Админ-preview и переиспользование UI

- По возможности вынести **presentational** части (карточка с `rounded-2xl border …`, чип ситуации, слайд карусели) в общие компоненты под `home/` или `shared/ui/patient-home/`, принимающие только DTO. Обновить [PatientHomeBlockPreview.tsx](apps/webapp/src/app/app/settings/patient-home/PatientHomeBlockPreview.tsx) **опционально** — не обязательно полный паритет, главное — **не** завязывать на slug из CONTENT_PLAN (уже соблюдено).

### DI / guards

- [buildAppDeps.ts](apps/webapp/src/app-layer/di/buildAppDeps.ts) — без новых ключей system_settings; использовать существующие `patientHomeBlocks`, `contentPages`, `contentSections`, `courses`, `reminders`, `treatmentProgramInstance`, `systemSettings` (для TZ при расчёте reminder — через [getAppDisplayTimeZone](apps/webapp/src/modules/system-settings/appDisplayTimezone.ts) при необходимости).

---

## Шаги выполнения

1. **Контракт DTO** — описать типы props для каждой карточки (slug, title, imageUrl, href, badgeLabel и т.д.); все ссылки на маршруты через [routePaths](apps/webapp/src/app-layer/routes/paths.ts).
2. **Resolvers в `modules/patient-home`** — реализовать разрешение items → DTO (последовательные `getBySlug` / `getById`; при большом числе items — батч через существующие list-методы, если есть, иначе ограничить N в Phase 3 и зафиксировать в RISKS).
3. **`PatientHomeToday`** — параллельные запросы: `listBlocksWithItems`, **один** `getPatientHomeTodayConfig`; для tier `patient` дополнительно reminders + instances; для гостя — без персональных портов.
4. **Диспетчер блоков** — `switch (code)` или map `Record<PatientHomeBlockCode, Component>`; для каждого `code` рендер соответствующего компонента + фильтр по сессии (README §3.2).
5. **Компоненты UI** — Tailwind: `gap-6`, карточки как в README §3.4; карусель — базовый `overflow-x-auto` (peek можно минимально, полный peek — Phase 7).
6. **`page.tsx`** — заменить тело на новый root; удалить неиспользуемые импорты и мёртвый код.
7. **Удаление deprecated** — grep репозитория на `PatientMiniAppPatientHome` / `PatientHomeBrowserHero` / `PatientHomeExtraBlocks`; удалить файлы.
8. **LOG.md** — краткая запись Phase 3 start/done, отклонения от README (если есть).
9. **Phase-level gate** — targeted vitest + `pnpm --dir apps/webapp typecheck` + `pnpm --dir apps/webapp lint` + `pnpm test:webapp` (без обязательного root `ci`, см. README §6 и [test-execution-policy](.cursor/rules/test-execution-policy.md)).

---

## Тесты

| Файл | Что проверять |
|------|----------------|
| `PatientHomeToday.test.tsx` | Три сессии: гость и «без tier» — **одинаково** скрыты `progress` / `mood` / `next_reminder` / `plan`; patient — они могут появиться; порядок секций = `sortOrder` mock-блоков; `booking` отсутствует в DOM, если блок `booking` в mock с `isVisible: false`. |
| `PatientHomeBookingCard.test.tsx` (или внутри Today) | При tier ≠ patient — наличие CTA «Активировать профиль»; при patient tier — без этой CTA (или иная разметка по README). |
| `patientHomeResolvers.test.ts` (имя по факту) | Юниты на resolvers: битый `target_ref`, пустые items, смешанный `subscription_carousel`; без slug из CONTENT_PLAN. |
| `PatientHomeSituationsRow.test.tsx` | Пустой список → `null`; с DTO → ссылки `/app/patient/sections/<slug>`; fallback иконки без URL. |
| `PatientHomeSubscriptionCarousel.test.tsx` | Смешанные типы; бейдж default «По подписке» при пустом `badgeLabel`; горизонтальный контейнер. |
| `PatientHomeDailyWarmupCard.test.tsx` (опционально) | Fallback «Скоро…» при `null` из `todayConfig`. |
| `PatientHomeSosCard.test.tsx` | Нет данных → не рендерится; есть → одна ссылка. |
| Snapshot (как README §3.5) | Три состояния сессии для `PatientHomeToday` с фиксированными mock-блоками (**slug в fixture** — произвольные, не из CONTENT_PLAN). |

Существующие тесты `todayConfig.test.ts` не ломать.

---

## Риски

1. **Два «домашних» концепта** — `HomeBlockId` в [navigation.ts](apps/webapp/src/app-layer/routes/navigation.ts) vs CMS `patient_home_blocks`. Риск путаницы и регрессий новостей/мотивации при отключении старого UI — смягчить явным решением в коде + `LOG.md`.
2. **N+1 при разрешении items** — много `getBySlug` подряд; при необходимости кэшировать в рамках запроса или добавить батч-порт позже (backlog).
3. **NextReminderCard** — точный расчёт следующего срабатывания сложный (README §9.1); Phase 3 — упрощение или «ближайшее enabled правило» с понятным текстом; иначе долгий scope creep.
4. **Бот / tier patient** — смена главной может ухудшить быстрый доступ к записям; UX-проверка и при необходимости дублирование ссылок в `BookingCard`.
5. **Полиморфные `target_ref`** — удалённые материалы/разделы: карточки пропускать, не падать SSR (как preview warning для админа).
6. **Контент «только для авторизованных»** — при разрешении `content_section` / `content_page` для гостя использовать те же правила, что и на публичных маршрутах CMS (например `requiresAuth` / `listVisible` с флагом «гость»), иначе пустой чип или пропуск item без падения SSR.
7. **Коллизия `courses` у гостя** — если показывать блок `courses` гостю, убедиться, что карточки не раскрывают ПДн; иначе скрыть блок для гостя и зафиксировать в `LOG.md`.
