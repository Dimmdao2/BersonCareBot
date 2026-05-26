# patient-home

Модуль витрины «Сегодня», таблицы блоков главной (`patient_home_*`) и связанные **scalar** ключи `system_settings` (`scope=admin`). UI блоков и часть настроек — [`/app/settings/patient-home`](../../app/app/settings/patient-home/page.tsx); паузы повтора разминки/плана и утренний пинг — только **admin** на [`/app/doctor/patient-home`](../../app/app/doctor/patient-home/page.tsx) (см. разделы ниже).

## Runtime source of truth

Состав и порядок блоков хранятся только в:

- `patient_home_blocks`
- `patient_home_block_items`

`CONTENT_PLAN.md` - только редакционный ориентир. Runtime не должен зависеть от slug из этого файла. Исключение: коды фиксированных блоков (`daily_warmup`, `useful_post`, `subscription_carousel` и т.п.) являются частью схемы главной, а не editorial slug.

## Files

- `blocks.ts` - канонический список блоков, блоков с item-list и матрица допустимых `target_type`.
- `patientHomeLegacyContentPort.ts` - контракт **legacy** данных главной: баннер рассылок, логи рассылок, «цитата дня». Реализации: `infra/repos/pgPatientHomeLegacyContent.ts` (Drizzle), `infra/repos/inMemoryPatientHomeLegacyContent.ts` (Vitest). Доступ с сервера: `const deps = buildAppDeps(); await deps.patientHomeLegacy.getQuoteForDay(...)` и т.п. **Не** импортировать `@/infra/db` из `modules/patient-home/*`.
- `patientHomeQuoteUtils.ts` - чистые `quoteDayKeyUtc`, `quoteIndexForDaySeed` для детерминированного выбора цитаты.
- `repository.ts` / `newsMotivation.ts` - только типы и re-export pure utils для legacy-данных главной (баннеры/рассылки); отдельные секции под это на новой главной не используются.
- `ports.ts` - контракт хранилища `patient_home_blocks` / `patient_home_block_items`.
- `service.ts` - валидация команд admin UI (show/hide, reorder, add/update/delete item), без прямого доступа к infra.
- `todayConfig.ts` — `listDailyWarmupPagesForHome(deps)` (упорядоченный список опубликованных `content_page` блока `daily_warmup`), `buildPatientDailyWarmupNav(slug, pages)` для pager на `/app/patient/content/[slug]?from=daily_warmup`; `getPatientHomeTodayConfig(deps, pickContext?)`: **round-robin pick** — guest/no tier → первая по `sortOrder`, patient tier → следующая после последнего `daily_warmup` completion (глобально), wrap; `dailyWarmupCount` для cooldown UI. Hero-cooldown «Разминка выполнена» только при `dailyWarmupCount === 1` (`dailyWarmupHeroCooldownGate.ts`). Экран разминки: membership в блоке `daily_warmup` задаёт warmup layout (не query `from`); `PatientDailyWarmupQuickList` при `pages.length > 1`; `PatientDailyWarmupPager` («Разминка дня n/N»). Deeplink `/app/patient/go/daily-warmup` и push используют тот же pick что главная.
- `patientHomeRepeatCooldownSettings.ts` — парсинг `patient_home_daily_warmup_repeat_cooldown_minutes`, `patient_treatment_plan_item_done_repeat_cooldown_minutes`, `patient_home_warmup_skip_to_next_available_enabled` (дефолты 60 / 60 / true).
- `patientHomeBlockPolicy.ts` - фильтр/сортировка блоков для главной, включая скрытие персональных блоков при `personalTierOk === false`.
- `patientHomeResolvers.ts` — разрешение items блоков `situations`, `subscription_carousel`, `sos`, `courses`, плюс `resolveUsefulPostCard` для блока `useful_post` (первый видимый `content_page`). Здесь же `DEFAULT_SUBSCRIPTION_BADGE` и `getSubscriptionCarouselSectionPresentation(blocks, sectionSlug)` для промо-бейджа на странице раздела.
- `nextReminderOccurrence.ts` — ближайшее срабатывание по `interval_window` или `slots_v1`; `formatPatientHomeNextReminderHeadline` для **«Следующее напоминание»** (только «Через N …», без n/N). `countPlannedHomeReminderOccurrencesInUtcRange` — знаменатель **«Сегодня выполнено»** при home-linked напоминаниях.
- `patientHomeTodayProgress.ts` — факт за календарный день пациента: разминки только `source=daily_warmup`; цель `resolvePatientHomePracticeTarget` (слоты напоминаний или `patient_home_daily_practice_target`); разбивка «Разминки / Тренировки» при плане из напоминаний.
- `patientHomeProgressResolver.ts` — та же логика для `GET /api/patient/practice/progress` и главной (`loadPatientHomeProgressForUser`).

## Patient home UI

Главная пациента: `app/app/patient/home/PatientHomeToday.tsx` и дочерние компоненты.

- Паузы повтора разминки / пунктов плана (только роль admin): `app/app/settings/patient-home/PatientHomeRepeatCooldownPanel.tsx` на `/app/doctor/patient-home`; сохранение через server action `savePatientHomeRepeatCooldownsAction` в `app/app/doctor/patient-home/patientHomeDoctorSettingsActions.ts` (`updateSetting` ×2 + `revalidatePath` для `/app/doctor/patient-home`, `/app/settings/patient-home`, `/app/patient`).
- Mobile и `md`: линейный порядок секций из `patient_home_blocks.sort_order`.
- `lg+`: `PatientHomeTodayLayout` — desktop dashboard (`lg:grid-cols-12`): верхний ряд — `daily_warmup` (8) + `useful_post` (4); второй — `situations` (8) + `booking` (4); третий — `progress` (8) + `next_reminder` (4); затем **`sos` на всю ширину (12)**; далее `plan` (8) + `mood_checkin` (4); нижний ряд — `courses` (8) + `subscription_carousel` (4).
- Progress приходит из `modules/patient-practice`.
- Mood приходит из `modules/patient-mood`.
- Подписочная карусель и бейджи не закрывают доступ к контенту.
- `useful_post`: item хранит `badgeLabel` для бейджа «Новый пост» и `showTitle` для видимого текста заголовка на cover-карточке. Если `showTitle=false`, ссылка остаётся доступной, но заголовок визуально скрыт.
- Страница материалов раздела [`app/app/patient/sections/[slug]/page.tsx`](../../app/app/patient/sections/[slug]/page.tsx): промо из `getSubscriptionCarouselSectionPresentation`, бейдж в шапке, ссылки «Открыть курс» через `FeatureCard.secondaryHref`. Напоминания на разминки — только [`/app/patient/reminders`](../../app/app/patient/reminders/page.tsx) (блок `#patient-reminders-warmups`), не на списке раздела `warmups`.
- Материал разминки дня: [`content/[slug]`](../../app/app/patient/content/[slug]/page.tsx) — warmup layout по membership в блоке `daily_warmup` (query `?from=daily_warmup` только для back на главную); quick list всех разминок блока; feedback modal после star rating 1–3 (`patient_content_rating_feedback`). CTA с главной и из напоминания (`/app/patient/go/daily-warmup` → тот же pick).

## Public home

`patient/layout.tsx` при отсутствии сессии всегда редиректит на `/app?next=…` (в т.ч. с `/app/patient` после установки PWA).

`PatientHomeToday` принимает `session: AppSession | null`; персональные запросы (`reminders`, `treatmentProgramInstance`, practice progress, mood) выполняются только при `personalTierOk && session`.

Auth-on-drilldown: `patientHomeGuestNav.ts` строит login href с `next`. Для анонима превью `/api/media/*` на главной не используются; политика `GET /api/media/:id` не меняется.

## Ежедневное напоминание от бота (Phase 8)

Admin settings (глобально для всех подключённых пользователей; не персональное расписание):

- `patient_home_morning_ping_enabled`
- `patient_home_morning_ping_local_time`

Webapp хранит ключи в `system_settings` (`scope=admin`) и синхронизирует их штатным путём system-settings mirror. Integrator читает настройку и опубликованную разминку дня из `daily_warmup` блока; editorial slug из `CONTENT_PLAN.md` не используется.

## Паузы повтора (разминка дня и простые пункты плана)

Ключи `system_settings` (`scope=admin`); запись только через **`updateSetting`** (например server action `savePatientHomeRepeatCooldownsAction` — зеркало в `integrator.system_settings` без обходных путей). Редактирование в UI — **только роль admin**, панель на `/app/doctor/patient-home`.

- `patient_home_daily_warmup_repeat_cooldown_minutes` — пауза (минуты, 5–180, default 60) перед повторной отметкой **той же** разминки на главной; hero «Разминка выполнена» **только** если в блоке `daily_warmup` ровно одна страница (`dailyWarmupCount === 1`). При двух и более разминках pick не использует cooldown.
- `patient_home_warmup_skip_to_next_available_enabled` — legacy-ключ (default `true`); pick **игнорирует**; UI на `/app/doctor/patient-home` не показывается и **не перезаписывается** при сохранении пауз (значение в DB остаётся as-is).
- `patient_treatment_plan_item_done_repeat_cooldown_minutes` — пауза (минуты, 5–180, default 60) для повторного «Выполнено» у **простых** пунктов программы (не ЛФК-форма); чтение в RSC страниц программы, проп `planItemDoneRepeatCooldownMinutes` → `itemDoneCooldown.ts` на клиенте.

Отдельный INSERT дефолтов в миграциях **не обязателен**: при отсутствии строк парсеры возвращают 60 / 60 / `true` (`patientHomeRepeatCooldownSettings.ts`). PATCH `/api/admin/settings` для числовых ключей использует тот же диапазон 5–180.
