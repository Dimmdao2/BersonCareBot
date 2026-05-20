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

Дата «сегодня» в таблице completions и streak в `getProgress` — в переданном IANA (на главной и в API — **календарь пациента**, см. `patientHomeProgressResolver`). PG-реализация использует Drizzle ORM; бизнес-слой работает только через порт.

## API and UI

- `POST /api/patient/practice/completion` — сохранить выполнение практики (`feeling` опционален; для сценария разминки клиент может отправить `feeling: null`, затем выбрать ощущение отдельным PATCH).
- `PATCH /api/patient/practice/completion/[id]/feeling` — только для completion с `source === daily_warmup`. Тело: **`{ feeling: 1 | 3 | 5 }`**. Маршрут тонкий: валидация и **`deps.warmupFeelingCompletion.applyDailyWarmupFeeling`** ([порт](./warmupFeelingCompletionPort.ts); PG — [`pgWarmupFeelingCompletion.ts`](../../infra/repos/pgWarmupFeelingCompletion.ts): одна **Drizzle-транзакция** — upsert трекинга `warmup_feeling` через **`upsertWarmupFeelingTrackingIdInTx`** ([`warmupFeelingTrackingTx.ts`](../../infra/repos/warmupFeelingTrackingTx.ts)), при необходимости insert в **`symptom_entries`** для `warmup_feeling` с **`patient_practice_completion_id`**, при наличии ref **`general_wellbeing`** в справочнике — зеркальный **instant** для общего самочувствия (то же время и значение, `notes` = **`WELLBEING_GENERAL_MIRROR_NOTE`**, см. [`wellbeingGeneralMirrorNote.ts`](../diaries/wellbeingGeneralMirrorNote.ts), без `patient_practice_completion_id`); если ref **`general_wellbeing`** **нет** — зеркало не пишется, ответ всё равно **200** (только `warmup_feeling` + **`patient_practice_completions.feeling`**); при гонке — идемпотентность и **`duplicate: true`**. **`revalidatePath`** после успешного вызова порта (включая `duplicate`).
- `GET /api/patient/practice/progress` — `todayDone`, `todayTarget`, `streak` по тем же правилам, что блок **«Сегодня выполнено»** на главной (`loadPatientHomeProgressForUser`: разминки `daily_warmup` + чеклист программы; цель из напоминаний или `patient_home_daily_practice_target`).
- `PatientHomeProgressBlock` показывает реальные значения для patient-tier и non-personal fallback для гостя/без tier.
- `PatientContentPracticeComplete`: для `daily_warmup` — двухшагово POST → PATCH; после выбора иконки самочувствия остаёмся на странице материала (`router.refresh`), CTA — зелёный блок «Разминка выполнена»; для остальных источников — прежний одношаговый POST из модалки (включая «Пропустить»). Страница материала при **`from=daily_warmup`**: компактный hero (геометрия + **`patientDailyWarmupDetailHeroTitleClampClass`** для заголовка), порядок **видео → кнопка практики → описание**; типографика описания через **`patientDailyWarmupDetailMarkdownClass`**.

Модуль не связан автоматически с ЛФК-сессиями. Связь с дневником симптомов — только для **`daily_warmup`** через PATCH выше и системный тип **`warmup_feeling`**.
