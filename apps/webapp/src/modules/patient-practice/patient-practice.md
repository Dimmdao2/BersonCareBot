# patient-practice

Отметки выполнения коротких практик по CMS-материалам (`content_pages`): счётчик за день, серия дней, API для сохранения с экрана материала.

- Порт персистентности: `PatientPracticePort` (`infra/repos/pgPatientPracticeCompletions.ts`, in-memory для тестов).
- Бизнес-правила и проверка «материал опубликован и не архивен»: `createPatientPracticeService`.
- Нет FK на пользователей; `user_id` — канонический `platform_users.id`, без ссылки из БД.

## Data

Таблица `patient_practice_completions`:

- `content_page_id` с FK на `content_pages(id)` `ON DELETE CASCADE`;
- `source`: `home`, `reminder`, `section_page`, `daily_warmup`;
- `feeling`: optional score `1..5`;
- `notes`: строка для будущего расширения.

Дата «сегодня» и streak считаются в timezone приложения. PG-реализация использует Drizzle ORM; бизнес-слой работает только через порт.

## API and UI

- `POST /api/patient/practice/completion` - сохранить выполнение практики.
- `GET /api/patient/practice/progress` - получить `todayDone`, `todayTarget`, `streak`.
- `PatientHomeProgressBlock` показывает реальные значения для patient-tier и non-personal fallback для гостя/без tier.
- `PatientContentPracticeComplete` на странице материала отправляет completion; `from=daily_warmup` в query задаёт source `daily_warmup`, без привязки к editorial slug из `CONTENT_PLAN.md`.

Модуль не связан автоматически с дневником симптомов или ЛФК-сессиями.
