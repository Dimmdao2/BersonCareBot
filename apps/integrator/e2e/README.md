# Integrator Staging Smoke

Пошаговый smoke для ручной проверки Stage 13 интеграций на staging.

## 1) Подготовка

- Убедиться, что развернуты `webapp` и `integrator` со свежими миграциями.
- Проверить env: webhook secrets, Telegram/Max credentials, Rubitime API key, Google Calendar flag/credentials.
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

## 4) Rubitime webhook + Google Calendar projection

- В Rubitime создать/обновить/удалить запись.
- Ожидание:
  - `POST /webhook/rubitime/:token` -> 200,
  - событие дошло до gateway,
  - при `GOOGLE_CALENDAR_ENABLED=true` событие синхронизировано в Google Calendar (create/update/delete),
  - при `GOOGLE_CALENDAR_ENABLED=false` внешних вызовов в Google нет.

## 5) Rubitime reverse API (doctor)

- В webapp вызвать:
  - `POST /api/doctor/appointments/rubitime/update`,
  - `POST /api/doctor/appointments/rubitime/cancel`.
- Ожидание:
  - интегратор принял `POST /api/bersoncare/rubitime/update-record|remove-record`,
  - Rubitime вернул `status=ok`,
  - webapp получил `ok: true`.

## 6) Email OTP via integrator

- Запустить `POST /api/auth/email/start` в webapp.
- Ожидание:
  - webapp вызывает integrator `POST /api/bersoncare/send-email` с HMAC,
  - integrator возвращает 200,
  - письмо с OTP отправлено провайдером.

## 7) Autobind email из Rubitime

- Создать Rubitime `event-create-record` с `phone` + `email`.
- Ожидание:
  - integrator эмитит `user.email.autobind` в webapp,
  - invalid email -> skip,
  - verified email уже есть -> skip,
  - conflict email -> warning в лог,
  - иначе email сохранён как unverified.
