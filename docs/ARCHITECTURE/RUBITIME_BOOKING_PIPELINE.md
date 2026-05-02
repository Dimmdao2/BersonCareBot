# Rubitime: вебхук, журнал, проекция, имена и статусы

## Поток данных

Входящий webhook → integrator: `rubitime_events` (сырой журнал), `rubitime_records`, очередь `projection_outbox` → webapp: `appointment_records` и обновление `platform_users` по телефону → интерфейс врача (список записей джойнит к `platform_users` по `phone_normalized`).

Код: `apps/integrator/src/integrations/rubitime/webhook.ts`, `connector.ts`, `apps/integrator/src/infra/db/writePort.ts`; проекция в webapp — `apps/webapp/src/modules/integrator/events.ts`.

## Журнал `rubitime_events.event` (integrator)

Колонка `event` — короткий тип строки. При логировании через шаг `event.log` с `eventStore: booking` значение берётся из тела: приоритет `event` → `action` (например `created` / `updated` / логика отмены) → `eventType` → иначе `unknown`. Раньше в журнале часто оставался `unknown`, если в payload не было поля `event`, хотя `action` был — это исправлено в `writePort.ts`.

## Имя клиента (ФИО)

Rubitime передаёт `name` как полную строку (часто ФИО с отчеством); порядок слов не гарантирован. Политика:

- Разбиение на имя и фамилию выполняется **только** при ровно **двух** словах (условно «фамилия имя»).
- При **трёх и более** словах отдельные `clientFirstName` / `clientLastName` из `name` **не** выводятся; каноническое отображаемое имя — поле `clientName` / полное имя в `payloadJson` проекции.
- Webapp при событии `appointment.record.upserted` в первую очередь использует `payloadJson.name` для `display_name`; `first_name` / `last_name` обновляются только если интегратор передал непустые значения.

## Статусы записи API (числовые коды 0–7)

Соответствие кодов Rubitime API внутренним строкам задаётся в `normalizeRubitimeStatus` (`connector.ts`), например: `0` → `recorded`, `4` → `canceled`, `5` → `awaiting_confirmation`, `7` → `moved_awaiting`; промежуточные состояния (`1`, `2`, `3`, `6`) маппятся во внутренние теги без дублирования уведомлений там, где сценарии в `content/rubitime/scripts.json` на них не завязаны.

Точные имена внутренних статусов и тесты — в `apps/integrator/src/integrations/rubitime/connector.test.ts`.

## Native booking (webapp create) — post-create projection

При создании записи из webapp (не через Rubitime iframe/сайт) данные проходят два параллельных пути:

**Patient path (webapp):**
1. `POST /api/booking/create` → `patient_bookings` (confirmed) → `emitBookingEvent('booking.created')` → TG/MAX уведомления + напоминания.

**Doctor projection + GCal path (integrator):**
1. Webapp → `POST /api/bersoncare/rubitime/create-record` (M2M) → integrator создаёт запись в Rubitime API → получает `recordId`. Пока integrator не ответил, исходящий запрос webapp к integrator **обычно открыт** всё время ожиданий throttle и повторов api2 — на стороне webapp нужен **индикатор загрузки** (см. `apps/webapp/INTEGRATOR_CONTRACT.md`).
2. `runPostCreateProjection(recordId)` (файл `postCreateProjection.ts`) выполняет:
   - `fetchRubitimeRecordById` — забрать полную запись из Rubitime; при ошибке — пауза **5200 ms**, затем вторая попытка. Все вызовы api2 (включая повтор после ответа Rubitime про «5 second / consecutive requests») проходят через общий throttle **5500 ms** (`rubitime_api_throttle`): следующий вызов не стартует, пока не выдержан интервал после *завершения* предыдущего. Подробнее: `docs/REPORTS/RUBITIME_API2_PACING_AND_PHASE2_BACKLOG.md`.
   - Синтетический `RubitimeWebhookBodyValidated` c `from: 'webapp'`, `event: 'event-create-record'`.
   - `prepareRubitimeWebhookIngress` — нормализация timezone.
   - `syncRubitimeWebhookBodyToGoogleCalendar` — Google Calendar sync (best-effort, non-fatal).
   - `writeDb({ type: 'booking.upsert', ... })` → `rubitime_records` + `enqueueProjectionEvent('appointment.record.upserted')`.
   - webapp projection poller → `appointment_records` → Doctor appointments UI.
3. Email autobind (если `webappEventsPort` доступен) — аналог webhook-path пункта.

**Идемпотентность при дубле webhook:** `booking.upsert` использует `ON CONFLICT (rubitime_record_id) DO UPDATE`; projection outbox дедуплицируется по `idempotencyKey`. Если Rubitime webhook для той же записи придёт позже — данные обновятся без дубликатов.

**Разделение UI:**
- Doctor appointments UI питается из `appointment_records` (заполняется через projection).
- Patient «Мои записи» питается из `patient_bookings` (заполняется напрямую в webapp).

## Google Calendar: поле `description` события

Синхронизация Rubitime → Google Calendar (best-effort, не блокирует вебхук) выполняется в `syncRubitimeWebhookBodyToGoogleCalendar` → `mapRubitimeEventToGoogleEvent` (`apps/integrator/src/integrations/google-calendar/sync.ts`).

**Содержимое описания события:**

- **Клиент:** поле `comment` (как в [документации Rubitime API](https://rubitime.ru/faq/api)).
- **Администратор:** первое непустое из `admin_comment`, `comment_admin`, `staff_comment`, `internal_comment`, `admin_note` (единого канонического имени во всех ответах API нет — список расширяется при подтверждённых полях из `get-record`).
- Формат текста: блоки `Клиент: …` и `Администратор: …`, между блоками — пустая строка. Если оба комментария пусты, в описание подставляется резервная строка `Rubitime #<id записи>`.

**Вебхук:** часть полей может приходить только на верхнем уровне `data`, а не внутри `data.record`. В `toRubitimeIncoming` (`connector.ts`) для ключей комментариев выполняется подмешивание с родительского уровня, если во вложенной записи значение пустое (`mergeRubitimeWebhookSiblingCommentFields`).

**Проверки в репозитории:** `apps/integrator/src/integrations/google-calendar/sync.test.ts` (`buildGoogleCalendarDescriptionFromRubitimeRecord`, интеграция с `mapRubitimeEventToGoogleEvent`), `apps/integrator/src/integrations/rubitime/connector.test.ts` (merge полей вебхука).

### Журнал (фрагмент)

| Дата | Изменение |
|------|-----------|
| 2026-05-02 | Описание события GCal: комментарии клиента/админа вместо одного только id; merge полей комментариев из тела вебхука; unit-тесты. |

## Одноразовое восстановление данных (ops)

Если у записи есть телефон в `appointment_records`, но нет строки в `platform_users` с тем же `phone_normalized`, в UI врача может отображаться «Неизвестный клиент». Исправление — создать или связать профиль по согласованным с продуктом правилам.

Пример одноразового SQL в репозитории: `apps/webapp/scripts/repair-client-8077942.sql` (идемпотентная вставка `platform_users` для конкретного инцидента). Выполнять на **БД webapp** с актуальным `DATABASE_URL`; на production путь к env-файлу и имена БД — в `docs/ARCHITECTURE/SERVER CONVENTIONS.md` (раздел webapp).
