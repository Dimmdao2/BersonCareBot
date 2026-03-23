# Этап 13: Интеграции

> Приоритет: P2–P3
> Зависимости: Этап 3 (email), Этап 5 (auth)
> Риск: высокий (внешние API, OAuth, сторонние сервисы)

---

## Подэтап 13.1: Email adapter (integrator)

**Задача:** настроить отправку email через nodemailer.

**Файлы:**
- `apps/integrator/src/integrations/email/` (новый модуль)
- `apps/integrator/src/config/env.ts`

**Действия:**
1. Создать модуль `email` по аналогии с `smsc`:
   - `config.ts` — env: `EMAIL_SMTP_HOST`, `EMAIL_SMTP_PORT`, `EMAIL_SMTP_USER`, `EMAIL_SMTP_PASS`, `EMAIL_FROM`.
   - `client.ts` — nodemailer transporter.
   - `deliveryAdapter.ts` — адаптер для отправки.
   - `stub.ts` — mock при `EMAIL_ENABLED=false`.
2. Зарегистрировать в `registry.ts`.
3. Использовать для: OTP-кодов, уведомлений, рассылок.
4. Выбрать российский SMTP-провайдер: Yandex 360 Business / Mail.ru для бизнеса / Unisender Go.

**Критерий:**
- Email отправляется через nodemailer.
- В dev-режиме: stub логирует в console.
- Env-переменные документированы.

---

## Подэтап 13.2: Email-верификация flow

**Задача:** отправка кода подтверждения на email через integrator.

**Файлы:**
- `apps/webapp/src/modules/auth/emailAuth.ts`
- API: `/api/auth/email/start`
- Integrator: новый endpoint или использовать email adapter

**Действия:**
1. Webapp → Integrator: запрос отправки кода на email.
2. Вариант A: через API `POST /api/bersoncare/send-email` (по аналогии с send-sms).
3. Вариант B: webapp отправляет email напрямую через nodemailer (в webapp deps). Проще, но дублирует конфигурацию.
4. Рекомендация: вариант A (единая точка отправки в integrator).
5. Шаблон письма: «Ваш код подтверждения: XXXXXX. Действителен 10 минут.»

**Критерий:**
- Код приходит на email.
- При вводе кода — email привязывается.

---

## Подэтап 13.3: Deep-link привязка (Telegram)

**Задача:** сценарий привязки через /start link_secret.

**Файлы:**
- `apps/integrator/src/content/telegram/user/scripts.json`
- Integrator: обработка link_secret

**Действия:**
1. Добавить сценарий в `scripts.json`:
   - Event: `message.received`, match: `/start link_*`.
   - Шаги: извлечь secret → проверить в webapp API → привязать → ответить «Аккаунт привязан!».
2. Webapp API: `POST /api/auth/channel-link/verify` — проверка и погашение секрета.
3. Миграция: таблица `channel_link_secrets` (если не создана в этапе 3.4).
4. TTL секрета: 10 минут.

**Критерий:**
- `/start link_xxx` в Telegram → привязка без запроса телефона.
- Секрет одноразовый, истекает через 10 мин.

---

## Подэтап 13.4: Deep-link привязка (Max)

**Задача:** аналогичная привязка для Max.

**Файлы:**
- Max Bot API docs
- `apps/integrator/src/content/max/user/scripts.json`

**Действия:**
1. Изучить Max Bot API: поддерживает ли `?start=` параметр при открытии бота.
2. Если да: аналогичный сценарий как для Telegram.
3. Если нет: альтернатива — показать код в webapp, пользователь вводит код в чат боту. Сценарий: match на 6-значный код в первом сообщении.
4. **Исследование VK Bot API:** VK поддерживает `ref` параметр через `https://vk.me/bot?ref=link_xxx`. Документировать для будущей реализации.

**Критерий:**
- Определён рабочий метод для Max.
- Реализован (если API позволяет).
- Документирован способ для VK.

---

## Подэтап 13.5: Google Calendar sync

**Задача:** синхронизация записей на прием в Google Calendar врача.

**Файлы:**
- `pnpm --filter integrator add googleapis google-auth-library`
- Новый модуль: `apps/integrator/src/integrations/google-calendar/`

**Действия:**
1. OAuth2 setup:
   - Google Cloud Console: создать проект, включить Calendar API.
   - OAuth2 consent screen (internal use).
   - Client ID + Client Secret → env.
2. Token storage: в БД integrator (таблица `google_oauth_tokens`).
3. Модуль:
   - `config.ts` — env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_CALENDAR_ID`.
   - `client.ts` — googleapis Calendar v3.
   - `sync.ts` — функции: `createEvent`, `updateEvent`, `deleteEvent`.
4. При webhook из Rubitime:
   - `event-create-record` → `createEvent` в Google Calendar.
   - `event-update-record` → `updateEvent`.
   - `event-remove-record` → `deleteEvent`.
5. Маппинг: title = «Приём: ФИО», time = `record_at`, description = детали.

**Критерий:**
- При создании записи в Rubitime → событие появляется в Google Calendar.
- При обновлении/удалении — синхронизация.
- OAuth токен обновляется автоматически (refresh token).

**Риски:**
- Google OAuth verification для production — может занять значительное время.
- Начать с «внутреннего» (internal) использования.

---

## Подэтап 13.6: Rubitime обратный API

**Задача:** перенос/отмена записи из webapp → Rubitime.

**Файлы:**
- `apps/integrator/src/integrations/rubitime/client.ts`
- Rubitime API docs

**Действия:**
1. Изучить Rubitime API: есть ли эндпоинты для обновления/удаления записей.
2. Если API позволяет:
   - `updateRecord(recordId, newDateTime)` — перенос.
   - `cancelRecord(recordId, reason)` — отмена.
3. Экспонировать через integrator API для webapp.
4. При действии врача → webhook в Rubitime + обновление Calendar + уведомление клиенту.

**Критерий:**
- Определена возможность обратного API Rubitime.
- Реализовано (если возможно).
- Документировано.

---

## Подэтап 13.7: Auto-привязка email из Rubitime

**Задача:** извлечение email из данных записи Rubitime.

**Файлы:**
- `apps/integrator/src/integrations/rubitime/connector.ts`
- Projection worker

**Действия:**
1. В payload `event-create-record` от Rubitime: проверить наличие email.
2. Если email есть и пользователь идентифицирован (по телефону):
   - Привязать email к пользователю (identity/contact в integrator).
   - Проецировать в webapp (`platform_users.email`).
3. Не требовать подтверждения (email из Rubitime = доверенный источник).

**Критерий:**
- При создании записи с email — email привязывается.
- Не перезаписывает уже подтверждённый email.

---

## Общий критерий завершения этапа 13

- [ ] Email adapter работает.
- [ ] Email-верификация через integrator.
- [ ] Deep-link привязка Telegram.
- [ ] Deep-link привязка Max (или альтернатива).
- [ ] Google Calendar sync.
- [ ] Rubitime обратный API (или документация о невозможности).
- [ ] Auto-привязка email из Rubitime.
- [ ] `pnpm run ci` проходит.
