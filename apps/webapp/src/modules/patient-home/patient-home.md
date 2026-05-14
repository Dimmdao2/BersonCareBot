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
- `todayConfig.ts` - `getPatientHomeTodayConfig(deps, weekdayIndex, warmupPick?)`: ротация видимых `content_page` item блока `daily_warmup` + `patient_home_daily_practice_target` из `system_settings` (1-10, default 3). `warmupPick` при персональном tier: `cooldownMinutes` из `patient_home_daily_warmup_repeat_cooldown_minutes` (default 60, clamp 5–180), `skipCooldownPages` из `patient_home_warmup_skip_to_next_available_enabled` (default true). Если `skipCooldownPages` — пропускаются страницы в hero-cooldown и берётся следующая; иначе первая в ротации дня без учёта cooldown. Если все кандидаты в cooldown при skip — `allDailyWarmupsInCooldown`. Пауза для пунктов программы на главной не задаётся здесь — см. `patient_treatment_plan_item_done_repeat_cooldown_minutes` в экранах программы. Разминка не читается из отдельного slug-setting.
- `patientHomeRepeatCooldownSettings.ts` — парсинг `patient_home_daily_warmup_repeat_cooldown_minutes`, `patient_treatment_plan_item_done_repeat_cooldown_minutes`, `patient_home_warmup_skip_to_next_available_enabled` (дефолты 60 / 60 / true).
- `patientHomeBlockPolicy.ts` - фильтр/сортировка блоков для главной, включая скрытие персональных блоков при `personalTierOk === false`.
- `patientHomeResolvers.ts` — разрешение items блоков `situations`, `subscription_carousel`, `sos`, `courses`, плюс `resolveUsefulPostCard` для блока `useful_post` (первый видимый `content_page`). Здесь же `DEFAULT_SUBSCRIPTION_BADGE` и `getSubscriptionCarouselSectionPresentation(blocks, sectionSlug)` для промо-бейджа на странице раздела.
- `nextReminderOccurrence.ts` — ближайшее срабатывание по `interval_window` или `slots_v1`, типы связей включая `rehab_program`; счётчик запланированных слотов за календарный день приложения (`countPlannedHomeReminderOccurrencesInUtcRange`) для блока «Следующее напоминание» и **n/N** на главной (см. [`docs/archive/2026-05-initiatives/PATIENT_REMINDER_UX_INITIATIVE/README.md`](../../../../../docs/archive/2026-05-initiatives/PATIENT_REMINDER_UX_INITIATIVE/README.md)).

## Patient home UI

Главная пациента: `app/app/patient/home/PatientHomeToday.tsx` и дочерние компоненты.

- Паузы повтора разминки / пунктов плана (только роль admin): `app/app/settings/patient-home/PatientHomeRepeatCooldownPanel.tsx` на `/app/doctor/patient-home`; сохранение через server action `savePatientHomeRepeatCooldownsAction` в `app/app/doctor/patient-home/patientHomeDoctorSettingsActions.ts` (`updateSetting` ×3 + `revalidatePath` для `/app/doctor/patient-home`, `/app/settings/patient-home`, `/app/patient`).
- Mobile и `md`: линейный порядок секций из `patient_home_blocks.sort_order`.
- `lg+`: `PatientHomeTodayLayout` — desktop dashboard (`lg:grid-cols-12`): верхний ряд — `daily_warmup` (8) + `useful_post` (4); второй — `situations` (8) + `booking` (4); третий — `progress` (8) + `next_reminder` (4); затем **`sos` на всю ширину (12)**; далее `plan` (8) + `mood_checkin` (4); нижний ряд — `courses` (8) + `subscription_carousel` (4).
- Progress приходит из `modules/patient-practice`.
- Mood приходит из `modules/patient-mood`.
- Подписочная карусель и бейджи не закрывают доступ к контенту.
- `useful_post`: item хранит `badgeLabel` для бейджа «Новый пост» и `showTitle` для видимого текста заголовка на cover-карточке. Если `showTitle=false`, ссылка остаётся доступной, но заголовок визуально скрыт.
- Страница материалов раздела [`app/app/patient/sections/[slug]/page.tsx`](../../app/app/patient/sections/[slug]/page.tsx): промо из `getSubscriptionCarouselSectionPresentation`, бейдж в шапке (`AppShell.patientTitleBadge` → `PatientHeader.titleBadge`), ссылки «Открыть курс» через `FeatureCard.secondaryHref` при `linked_course_id` и опубликованном курсе.

## Public home

Точный маршрут `/app/patient` без сессии разрешён только в `patient/layout.tsx` через `patientLayoutAllowsUnauthenticatedAccess` из `modules/platform-access/patientRouteApiPolicy.ts`.

`PatientHomeToday` принимает `session: AppSession | null`; персональные запросы (`reminders`, `treatmentProgramInstance`, practice progress, mood) выполняются только при `personalTierOk && session`.

Auth-on-drilldown: `patientHomeGuestNav.ts` строит login href с `next`. Для анонима превью `/api/media/*` на главной не используются; политика `GET /api/media/:id` не меняется.

## Ежедневное напоминание от бота (Phase 8)

Admin settings (глобально для всех подключённых пользователей; не персональное расписание):

- `patient_home_morning_ping_enabled`
- `patient_home_morning_ping_local_time`

Webapp хранит ключи в `system_settings` (`scope=admin`) и синхронизирует их штатным путём system-settings mirror. Integrator читает настройку и опубликованную разминку дня из `daily_warmup` блока; editorial slug из `CONTENT_PLAN.md` не используется.

## Паузы повтора (разминка дня и простые пункты плана)

Ключи `system_settings` (`scope=admin`); запись только через **`updateSetting`** (например server action `savePatientHomeRepeatCooldownsAction` — зеркало в `integrator.system_settings` без обходных путей). Редактирование в UI — **только роль admin**, панель на `/app/doctor/patient-home`.

- `patient_home_daily_warmup_repeat_cooldown_minutes` — пауза (минуты, 5–180, default 60) перед повторной отметкой **той же** разминки дня на главной; чтение в `PatientHomeToday` + `getPatientHomeTodayConfig` (`warmupPick.cooldownMinutes`).
- `patient_home_warmup_skip_to_next_available_enabled` — boolean (default `true`): при выборе кандидата разминки **пропускать** страницы в hero-cooldown и брать следующую; при `false` — первая в ротации дня без учёта cooldown в цикле (см. `todayConfig.ts`).
- `patient_treatment_plan_item_done_repeat_cooldown_minutes` — пауза (минуты, 5–180, default 60) для повторного «Выполнено» у **простых** пунктов программы (не ЛФК-форма); чтение в RSC страниц программы, проп `planItemDoneRepeatCooldownMinutes` → `itemDoneCooldown.ts` на клиенте.

Отдельный INSERT дефолтов в миграциях **не обязателен**: при отсутствии строк парсеры возвращают 60 / 60 / `true` (`patientHomeRepeatCooldownSettings.ts`). PATCH `/api/admin/settings` для числовых ключей использует тот же диапазон 5–180.
