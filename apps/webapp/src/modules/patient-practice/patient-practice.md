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

- `POST /api/patient/practice/completion` — сохранить выполнение практики (`feeling` опционален; для сценария разминки клиент может отправить `feeling: null`, затем выбрать ощущение отдельным PATCH).
- `PATCH /api/patient/practice/completion/[id]/feeling` — только для completion с `source === daily_warmup`. Тело: **`{ feeling: 1 | 3 | 5 }`**. Маршрут тонкий: валидация и **`deps.warmupFeelingCompletion.applyDailyWarmupFeeling`** ([порт](./warmupFeelingCompletionPort.ts); PG — [`pgWarmupFeelingCompletion.ts`](../../infra/repos/pgWarmupFeelingCompletion.ts): одна **Drizzle-транзакция** — upsert трекинга `warmup_feeling` через **`upsertWarmupFeelingTrackingIdInTx`** ([`warmupFeelingTrackingTx.ts`](../../infra/repos/warmupFeelingTrackingTx.ts)), при необходимости insert в **`symptom_entries`** с **`patient_practice_completion_id`**, обновление **`patient_practice_completions.feeling`**; при гонке — идемпотентность и **`duplicate: true`**. **`revalidatePath`** после успешного вызова порта (включая `duplicate`).
- `GET /api/patient/practice/progress` — получить `todayDone`, `todayTarget`, `streak`.
- `PatientHomeProgressBlock` показывает реальные значения для patient-tier и non-personal fallback для гостя/без tier.
- `PatientContentPracticeComplete`: для `daily_warmup` — двухшагово POST → PATCH и редирект на главную после выбора иконки; для остальных источников — прежний одношаговый POST из модалки (включая «Пропустить»). Страница материала при **`from=daily_warmup`**: компактный hero (геометрия + **`patientDailyWarmupDetailHeroTitleClampClass`** для заголовка), порядок **видео → кнопка практики → описание**; типографика описания через **`patientDailyWarmupDetailMarkdownClass`**.

Модуль не связан автоматически с ЛФК-сессиями. Связь с дневником симптомов — только для **`daily_warmup`** через PATCH выше и системный тип **`warmup_feeling`**.
