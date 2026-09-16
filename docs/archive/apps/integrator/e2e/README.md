# Integrator Staging Smoke

Пошаговый smoke для ручной проверки Stage 13 интеграций на staging.

## 1) Подготовка

- Убедиться, что развернуты `webapp` и `integrator` со свежими миграциями.
- Проверить env: webhook secrets, Telegram/Max credentials, Google Calendar flag/credentials.
- Проверить, что `pnpm run ci` зелёный перед ручным smoke.

## 2) Telegram webhook

- Отправить боту `/start`.
- Отправить `/start link_<secret>` из webapp channel-link flow.
- Ожидание:
  - интегратор отвечает 200 на webhook,
  - в webapp `POST /api/integrator/channel-link/complete` возвращает `ok: true` или `already_used`,
  - в `user_channel_bindings` появилась/подтвердилась привязка.

## 3) MAX webhook

- Отправить сообщение в MAX боту.
- Отправить `/start link_<secret>`.
- Ожидание:
  - `POST /webhook/max` -> 200,
  - событие в gateway (`source=max`),
  - привязка канала max в webapp через complete route.

## 4) Booking lifecycle + Google Calendar projection

- В webapp создать/обновить/удалить canonical booking через provider-neutral lifecycle flow.
- Ожидание:
  - webapp отправил signed `POST /api/bersoncare/booking/lifecycle-event`,
  - при включённых canonical DB-настройке и platform switch Google Calendar событие синхронизировано в Google Calendar (create/update/delete),
  - при выключенном platform switch внешних вызовов в Google нет.

## 5) Retired Rubitime reverse API (выведено 2026-07-27)

- Не проверять `/api/doctor/appointments/rubitime/*` и `/api/bersoncare/rubitime/*`: эти runtime routes retired by
  Rubitime retirement R6. Исторический raw archive остается только audit/rollback scope до R7.

## 6) Email OTP via integrator

- Запустить `POST /api/auth/email/start` в webapp.
- Ожидание:
  - webapp вызывает integrator `POST /api/bersoncare/send-email` с HMAC,
  - integrator возвращает 200,
  - письмо с OTP отправлено провайдером.

## 7) Retired Rubitime autobind (выведено 2026-07-27)

- Не проверять Rubitime `event-create-record`: Rubitime webhook ingress retired by R6. Email/user identity checks
  должны идти через canonical webapp flows, не через raw provider webhook.
