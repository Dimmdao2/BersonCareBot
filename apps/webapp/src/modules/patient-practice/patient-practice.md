# patient-practice

Отметки выполнения коротких практик по CMS-материалам (`content_pages`): счётчик за день, серия дней, API для сохранения с экрана материала.

- Порт персистентности: `PatientPracticePort` (`infra/repos/pgPatientPracticeCompletions.ts`, in-memory для тестов).
- Бизнес-правила и проверка «материал опубликован и не архивен»: `createPatientPracticeService`.
- Нет FK на пользователей; `user_id` — канонический `platform_users.id`, без ссылки из БД.
