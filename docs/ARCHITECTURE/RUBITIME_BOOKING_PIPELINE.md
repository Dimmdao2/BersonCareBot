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

## Одноразовое восстановление данных (ops)

Если у записи есть телефон в `appointment_records`, но нет строки в `platform_users` с тем же `phone_normalized`, в UI врача может отображаться «Неизвестный клиент». Исправление — создать или связать профиль по согласованным с продуктом правилам.

Пример одноразового SQL в репозитории: `apps/webapp/scripts/repair-client-8077942.sql` (идемпотентная вставка `platform_users` для конкретного инцидента). Выполнять на **БД webapp** с актуальным `DATABASE_URL`; на production путь к env-файлу и имена БД — в `docs/ARCHITECTURE/SERVER CONVENTIONS.md` (раздел webapp).
