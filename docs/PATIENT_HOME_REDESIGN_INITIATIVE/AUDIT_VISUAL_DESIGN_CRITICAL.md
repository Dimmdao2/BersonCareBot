# Audit — Design-critical visual pass (patient home «Сегодня»)

**Scope:** независимая проверка после коммита визуального прохода (`Refine patient home visual layout` и связанных примитивов). Навигация (topbar / bottom nav / маршруты) **вне оценки** как источник дефектов, по запросу аудита.

**Verdict: PASS WITH NOTES**

Полный **PASS** по критериям «реальный просмотр состояний на 390 / 1024 / 1280 и т.п.» **не заявляется**: в этом шаге не выполнялся браузерный осмотр и матрица guest / anonymous / tier / loading на целевых ширинах. Ниже — статический разбор исходников + targeted Vitest. Оставшиеся риски — в конце.

---

## Findings (by severity)

### 1. Medium — Нет фактической верификации viewports и визуальных состояний

| Field | Detail |
|--------|--------|
| **Component / area** | Вся главная пациента после design-critical pass |
| **Evidence** | Аудит выполнен без запуска браузера, без скриншотов и без ручной матрицы ширин (390, 768, 1024, 1280) и состояний (guest, no-tier, full data, loading). |
| **Risk** | Регрессии переполнения, субпиксельные сдвиги, контраст и «ощущение app» остаются неподтверждёнными. |
| **Exact fix recommendation** | Запланировать короткий **visual QA** (чеклист из `patient-home-visual-hardening` / `VISUAL_SYSTEM_SPEC.md`): фиксированные ширины, скриншоты до/после или Storybook/Chromatic по согласованию команды. |

### 2. Low — Тест сетки завязан на конкретные Tailwind-классы

| Field | Detail |
|--------|--------|
| **File** | `apps/webapp/src/app/app/patient/home/PatientHomeTodayLayout.test.tsx` |
| **Evidence** | Несколько `expect(layoutGrid).toHaveClass("lg:grid-cols-[3fr_2fr]")`, `lg:items-stretch`, `lg:order-[10]` и т.д. — это не полный snapshot `className`, но при смене токенов сетки тест придётся править синхронно с CSS. |
| **Risk** | Ложные падения CI при косметическом рефакторинге layout без изменения поведения. |
| **Exact fix recommendation** | По возможности сместить проверки на `data-testid` + структуру DOM (например, два блока в первой строке), или на минимальный набор семантических инвариантов без перечисления всех responsive-классов. |

### 3. Low — Hero: `flex-wrap` на ряду бейджей внутри фиксированной высоты

| Field | Detail |
|--------|--------|
| **File** | `PatientHomeDailyWarmupCard.tsx` |
| **Evidence** | Ряд бейджей обёрнут в `flex flex-wrap`; карточка при этом использует фиксированную геометрию `patientHomeHeroCardGeometryClass` (`h-[300px]` …). Сейчас подписи статичны («Разминка дня», «≈ 5 мин»). |
| **Risk** | Если позже в этот ряд попадут длинные CMS-строки, возможен перенос строки и клиппинг текста внизу при той же высоте. |
| **Exact fix recommendation** | `flex-nowrap` + `truncate` на бейджах или вынести вторичный бейдж в отдельную строку с зарезервированной высотой. |

### 4. Low — Booking: desktop CTA только по коду, не по пикселям

| Field | Detail |
|--------|--------|
| **File** | `PatientHomeBookingCard.tsx`, `patientHomeCardStyles.ts` (`patientHomeBookingActionsClass`, `patientHomeBookingCardGeometryClass`) |
| **Evidence** | На `lg` колонка действий ограничена (`lg:w-[12rem]` …), кнопки `w-full min-w-0`. Переполнение на 1024/1280 **не проверялось** в живом layout с длинными подписями кнопок. |
| **Risk** | При смене копирайта кнопок или локализации возможен тесный перенос или визуальная теснота. |
| **Exact fix recommendation** | Подтвердить вручную на 1024 и 1280 с самыми длинными строками CTA; при необходимости уменьшить `text-base`→`text-sm` только на кнопках booking или слегка поднять `lg:h-[192px]`. |

### 5. Low — Progress: внутри фиксированной высоты плотность контента различается по веткам

| Field | Detail |
|--------|--------|
| **File** | `PatientHomeProgressBlock.tsx`, `patientHomeProgressCardGeometryClass` |
| **Evidence** | Внешняя высота карточки фиксирована для всех веток. Ветка `loading` использует скелетон меньшей «визуальной массы», чем ветка с крупным счётчиком и полосой прогресса. |
| **Risk** | Нет скачка высоты карточки; возможны только косметические отличия вертикального баланса между состояниями. |
| **Exact fix recommendation** | При визуальном QA выровнять вертикальный ритм (например, фиксированная высота скелетона под высоту числа) — по желанию, не блокер. |

### 6. Low — Courses: только title без subtitle

| Field | Detail |
|--------|--------|
| **File** | `PatientHomeCoursesRow.tsx` |
| **Evidence** | Фиксированная высота строки задаётся `patientHomeCourseRowItemLayoutClass`; subtitle опционален. |
| **Risk** | Заголовок одной строкой может визуально «плавать» по вертикали относительно строк с двумя–тремя строками текста (всё ещё внутри одной высоты ячейки). |
| **Exact fix recommendation** | При QA решить, нужен ли `justify-start` + фиксированный padding сверху вместо `justify-center` для единообразия с многострочными карточками. |

---

## Проверки по требованиям аудита (код)

| Требование | Результат код-ревью |
|-------------|---------------------|
| Hero filled/empty, fixed image slot, title/summary clamps | **Соответствует намерению:** обе ветки используют `patientHomeHeroCardGeometryClass`; слот `patientHomeHeroImageSlotClass`; заголовок/описание через `patientHomeHeroTitleClampClass` / `patientHomeHeroSummaryClampClass` (или резерв `min-h` без summary). |
| Booking desktop CTA 1024/1280 | **Не верифицировано визуально**; в коде — узкая колонка CTA и `min-w-0` на кнопках (см. Finding 4). |
| Situations fixed tiles / fallback | **Соответствует:** `patientHomeSituationTileShellClass`, `patientHomeSituationTileMediaClass`, initials fallback; без slug-based цветов. |
| Progress full / loading / guest / no-tier same height | **Соответствует:** одна геометрия `patientHomeProgressCardGeometryClass` на `<article>`. |
| Reminder / Mood / SOS / Plan / Subscription / Courses fixed heights | **Соответствует:** reminder `patientHomeSecondaryCardShortHeightClass`; plan `patientHomeSecondaryCardTallHeightClass`; mood `patientHomeMoodCardGeometryClass`; SOS `patientHomeSosCardGeometryClass`; subscription `patientHomeCarouselItemLayoutClass`; courses `patientHomeCourseRowItemLayoutClass`; clamps на динамических строках где задумано. |
| Mood click/save не двигает карточку | **Соответствует по коду:** фиксированная высота секции + `patientHomeMoodStatusSlotClass` с `min-h-[2.75rem]`; смена текста статуса остаётся в слоте с `line-clamp-2`. |
| Тесты семантичные, не class snapshots | **В основном да:** доминируют роли, href, текст. **Исключение:** `PatientHomeTodayLayout.test.tsx` множественные `toHaveClass` по Tailwind (Finding 2). Carousel ранее ушёл от regex по `className` в пользу `data-testid`. |

---

## Tests reviewed / run

**Просмотрены (статически):** `PatientHomeTodayLayout.test.tsx`, `PatientHomeDailyWarmupCard.test.tsx`, `PatientHomeBookingCard.test.tsx`, `PatientHomeProgressBlock.test.tsx`, `PatientHomeMoodCheckin.test.tsx`, `PatientHomeSosCard.test.tsx`, `PatientHomeSituationsRow.test.tsx`, `PatientHomeSubscriptionCarousel.test.tsx`, `PatientHomeNextReminderCard.test.tsx`, `PatientHomeToday.test.tsx`.

**Запуск (targeted, без root `pnpm run ci`):**

```bash
pnpm --dir apps/webapp exec vitest run \
  src/app/app/patient/home/PatientHomeTodayLayout.test.tsx \
  src/app/app/patient/home/PatientHomeDailyWarmupCard.test.tsx \
  src/app/app/patient/home/PatientHomeBookingCard.test.tsx \
  src/app/app/patient/home/PatientHomeProgressBlock.test.tsx \
  src/app/app/patient/home/PatientHomeMoodCheckin.test.tsx \
  src/app/app/patient/home/PatientHomeSosCard.test.tsx \
  src/app/app/patient/home/PatientHomeSituationsRow.test.tsx \
  src/app/app/patient/home/PatientHomeSubscriptionCarousel.test.tsx \
  src/app/app/patient/home/PatientHomeNextReminderCard.test.tsx \
  src/app/app/patient/home/PatientHomeToday.test.tsx
```

**Результат:** `Test Files 10 passed (10)`, `Tests 26 passed (26)` (в логе Vitest может быть шум globalSetup про migrate — на результат тестов не влияет).

---

## Remaining risks

- Нет подтверждения **референсом** для 390px «как app», без скриншотов.
- **Контент из CMS** (очень длинные заголовки SOS/plan в пределах clamp) может выглядеть плотно — функционально обрезано, визуально нужен глаз.
- **Активные состояния mood** (ring/border) могут слегка менять визуальный вес кнопки без изменения высоты карточки — приемлемо, но стоит проверить тап-зону вручную.
- Соседние блоки в **двухколоночной сетке** при частично скрытых блоках CMS могут давать «дыры» — продуктово ожидаемо; визуальный баланс только через QA.

---

## Out of scope

- Исправления кода в этом шаге не вносились (только этот документ + `LOG.md`).
- Полный root `pnpm run ci` не запускался.
