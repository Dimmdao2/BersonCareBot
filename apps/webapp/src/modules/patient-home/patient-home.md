# patient-home

Модуль управления витриной главной пациента для admin-настройки (`/app/settings/patient-home`).

- `blocks.ts` — канонический список блоков, блоков с item-list и матрица допустимых `target_type`.
- `ports.ts` — контракт хранилища `patient_home_blocks` / `patient_home_block_items`.
- `service.ts` — валидация команд (show/hide, reorder, add/update/delete item), без прямого доступа к infra.

Состав и порядок блоков хранятся только в:

- `patient_home_blocks`
- `patient_home_block_items`

`CONTENT_PLAN.md` используется только как контентный ориентир и не является runtime-контрактом.

- `todayConfig.ts` — `getPatientHomeTodayConfig(deps)`: первый видимый item блока `daily_warmup` с типом `content_page` + целевое число практик из `system_settings` `patient_home_daily_practice_target` (1–10, default 3). Разминка **не** читается из отдельного slug в settings.
- `patientHomeBlockPolicy.ts` — фильтр/сортировка блоков для главной с учётом tier patient (скрытие персональных блоков при `personalTierOk === false`).
- `patientHomeResolvers.ts` — разрешение items блоков `situations`, `subscription_carousel`, `sos`, `courses` в DTO для UI (без импорта infra). Экспорт `DEFAULT_SUBSCRIPTION_BADGE`, `getSubscriptionCarouselSectionPresentation(blocks, sectionSlug)` — промо на странице раздела `/app/patient/sections/[slug]`, если видимый блок `subscription_carousel` содержит видимый item `content_section` с `target_ref` = slug (Phase 7).
- `patientHomeReminderPick.ts` — упрощённый выбор правила напоминания для карточки «Следующее напоминание» (Phase 3).

Клиентская главная «Сегодня»: `app/app/patient/home/PatientHomeToday.tsx` и дочерние компоненты; mobile/`md` сохраняют линейный порядок секций из `patient_home_blocks.sort_order` и видимости блоков/items. На `lg+` `PatientHomeTodayLayout` раскладывает видимые блоки по зонам: левая колонка (`daily_warmup`, `situations`, `progress`, `plan`, `courses`), правая колонка (`booking`, `next_reminder`, `sos`, `mood_checkin`), `subscription_carousel` — полноширинно под колонками.

**Phase 4.5 (публичная главная):** точный маршрут `/app/patient` без сессии разрешён только в `patient/layout.tsx` через `patientLayoutAllowsUnauthenticatedAccess` из `patientRouteApiPolicy.ts`. `PatientHomeToday` принимает `session: AppSession | null`; персональные запросы (`reminders`, `treatmentProgramInstance`, …) только при `personalTierOk && session`. Auth-on-drilldown: `patientHomeGuestNav.ts` (`appLoginWithNextHref`); для анонима превью `/api/media/*` на главной не используются (fallback в UI), политика `GET /api/media/:id` не меняется.
