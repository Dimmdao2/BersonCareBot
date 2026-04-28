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
- `patientHomeResolvers.ts` — разрешение items блоков `situations`, `subscription_carousel`, `sos`, `courses` в DTO для UI (без импорта infra).
- `patientHomeReminderPick.ts` — упрощённый выбор правила напоминания для карточки «Следующее напоминание» (Phase 3).

Клиентская главная «Сегодня»: `app/app/patient/home/PatientHomeToday.tsx` и дочерние компоненты; порядок секций из `patient_home_blocks.sort_order` и видимости блоков/items.
