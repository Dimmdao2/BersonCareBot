# patient-home

Модуль витрины «Сегодня» и admin-настройки главной пациента (`/app/settings/patient-home`).

## Runtime source of truth

Состав и порядок блоков хранятся только в:

- `patient_home_blocks`
- `patient_home_block_items`

`CONTENT_PLAN.md` - только редакционный ориентир. Runtime не должен зависеть от slug из этого файла. Исключение: коды фиксированных блоков (`daily_warmup`, `subscription_carousel` и т.п.) являются частью схемы главной, а не editorial slug.

## Files

- `blocks.ts` - канонический список блоков, блоков с item-list и матрица допустимых `target_type`.
- `patientHomeLegacyContentPort.ts` - контракт **legacy** данных главной: баннер рассылок, логи рассылок, одна новость, просмотры новостей, «цитата дня». Реализации: `infra/repos/pgPatientHomeLegacyContent.ts` (Drizzle), `infra/repos/inMemoryPatientHomeLegacyContent.ts` (Vitest). Доступ с сервера: `const deps = buildAppDeps(); await deps.patientHomeLegacy.getHomeNews()` и т.п. **Не** импортировать `@/infra/db` из `modules/patient-home/*`.
- `patientHomeQuoteUtils.ts` - чистые `quoteDayKeyUtc`, `quoteIndexForDaySeed` для детерминированного выбора цитаты.
- `repository.ts` / `newsMotivation.ts` - только типы и re-export pure utils для старых UI-компонентов (`PatientHomeNewsSection`, `PatientHomeMailingsSection`).
- `ports.ts` - контракт хранилища `patient_home_blocks` / `patient_home_block_items`.
- `service.ts` - валидация команд admin UI (show/hide, reorder, add/update/delete item), без прямого доступа к infra.
- `todayConfig.ts` - `getPatientHomeTodayConfig(deps)`: первый видимый `content_page` item блока `daily_warmup` + `patient_home_daily_practice_target` из `system_settings` (1-10, default 3). Разминка не читается из отдельного slug-setting.
- `patientHomeBlockPolicy.ts` - фильтр/сортировка блоков для главной, включая скрытие персональных блоков при `personalTierOk === false`.
- `patientHomeResolvers.ts` - разрешение items блоков `situations`, `subscription_carousel`, `sos`, `courses` в DTO для UI. Здесь же `DEFAULT_SUBSCRIPTION_BADGE` и `getSubscriptionCarouselSectionPresentation(blocks, sectionSlug)` для промо-бейджа на странице раздела.
- `nextReminderOccurrence.ts` - расчёт ближайшего срабатывания reminder rule по `daysMask`, окну, интервалу и timezone.

## Patient home UI

Главная пациента: `app/app/patient/home/PatientHomeToday.tsx` и дочерние компоненты.

- Mobile и `md`: линейный порядок секций из `patient_home_blocks.sort_order`.
- `lg+`: `PatientHomeTodayLayout` раскладывает блоки по зонам: левая колонка (`daily_warmup`, `situations`, `progress`, `plan`, `courses`), правая колонка (`booking`, `next_reminder`, `sos`, `mood_checkin`), `subscription_carousel` полноширинно под колонками.
- Progress приходит из `modules/patient-practice`.
- Mood приходит из `modules/patient-mood`.
- Подписочная карусель и бейджи не закрывают доступ к контенту.
- Страница материалов раздела [`app/app/patient/sections/[slug]/page.tsx`](../../apps/webapp/src/app/app/patient/sections/[slug]/page.tsx): промо из `getSubscriptionCarouselSectionPresentation`, бейдж в шапке (`AppShell.patientTitleBadge` → `PatientHeader.titleBadge`), ссылки «Открыть курс» через `FeatureCard.secondaryHref` при `linked_course_id` и опубликованном курсе.

## Public home

Точный маршрут `/app/patient` без сессии разрешён только в `patient/layout.tsx` через `patientLayoutAllowsUnauthenticatedAccess` из `modules/platform-access/patientRouteApiPolicy.ts`.

`PatientHomeToday` принимает `session: AppSession | null`; персональные запросы (`reminders`, `treatmentProgramInstance`, practice progress, mood) выполняются только при `personalTierOk && session`.

Auth-on-drilldown: `patientHomeGuestNav.ts` строит login href с `next`. Для анонима превью `/api/media/*` на главной не используются; политика `GET /api/media/:id` не меняется.

## Ежедневное напоминание от бота (Phase 8)

Admin settings (глобально для всех подключённых пользователей; не персональное расписание):

- `patient_home_morning_ping_enabled`
- `patient_home_morning_ping_local_time`

Webapp хранит ключи в `system_settings` (`scope=admin`) и синхронизирует их штатным путём system-settings mirror. Integrator читает настройку и опубликованную разминку дня из `daily_warmup` блока; editorial slug из `CONTENT_PLAN.md` не используется.
