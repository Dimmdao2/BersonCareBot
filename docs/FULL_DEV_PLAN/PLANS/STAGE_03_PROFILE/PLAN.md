# Этап 3: Доработка клиентского профиля

> Приоритет: P1
> Зависимости: Этап 2 (дизайн-система)
> Риск: средний (email-верификация требует mailer)

---

## Подэтап 3.1: Профиль — inline-edit поля

**Задача:** все персональные данные (ФИО, телефон, email) в едином формате с кнопкой «изменить».

**Файлы:**
- `apps/webapp/src/app/app/patient/profile/ProfileForm.tsx`
- `apps/webapp/src/app/globals.css`

**Действия:**
1. Создать переиспользуемый компонент `InlineEditField`:
   - Props: `label`, `value`, `onSave`, `placeholder`, `type ('text' | 'phone' | 'email')`.
   - Режим просмотра: `label: value` — справа кнопка «Изменить» (или «Добавить» если пусто).
   - Режим редактирования: инпут с текущим значением + кнопка «Сохранить» / «Отмена».
   - Состояние сбрасывается при навигации.
2. Применить к ФИО: first_name, last_name (через `InlineEditField`).
3. Применить к телефону: `phone_normalized` (через `InlineEditField`).
4. Применить к email: `email` (через `InlineEditField`).
5. Если значения нет (null/empty): показываем только label + «Добавить».

**Критерий:**
- ФИО, телефон, email — однотипные поля.
- Кнопки «Изменить» выровнены по правому краю.
- При пустом значении — «Добавить».

---

## Подэтап 3.2: Привязка email

**Задача:** пользователь может привязать email с подтверждением кодом.

**Файлы:**
- Миграция: `apps/webapp/migrations/016_email_challenges.sql`
- `apps/webapp/src/modules/auth/emailAuth.ts` (новый)
- `apps/webapp/src/app/app/patient/profile/ProfileForm.tsx`
- `apps/integrator/src/integrations/` — email delivery adapter

**Действия:**
1. Миграция:
   ```sql
   CREATE TABLE IF NOT EXISTS email_challenges (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id UUID NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
     email TEXT NOT NULL,
     code_hash TEXT NOT NULL,
     expires_at TIMESTAMPTZ NOT NULL,
     attempts SMALLINT NOT NULL DEFAULT 0,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   CREATE INDEX idx_email_challenges_user ON email_challenges(user_id);
   CREATE INDEX idx_email_challenges_expires ON email_challenges(expires_at);
   ```
2. Backend flow:
   - `POST /api/auth/email/start` → генерация 6-значного кода, хэширование, сохранение в email_challenges, отправка кода на email через integrator.
   - `POST /api/auth/email/confirm` → проверка кода, обновление `platform_users.email`, `email_verified_at = now()`.
3. UI: при нажатии «Привязать» для email — появляется инпут кода подтверждения (как для телефона).
4. Integrator: использовать nodemailer для отправки (настроить SMTP provider позже; для тестов — console log).

**Критерий:**
- Пользователь вводит email → получает код → вводит код → email привязан.
- При неверном коде — ошибка.
- Email отображается в профиле.

---

## Подэтап 3.3: OTP improvements

**Задача:** таймер повторной отправки, блокировка после 3 попыток.

**Файлы:**
- `apps/webapp/src/shared/ui/SmsCodeForm.tsx` (или аналог)
- `apps/webapp/src/modules/auth/phoneAuth.ts`
- `apps/webapp/src/infra/repos/pgPhoneChallengeRepo.ts` (или аналог)

**Действия:**
1. UI: после отправки кода — таймер 60 сек. Кнопка «Отправить повторно» неактивна, рядом обратный отсчёт.
2. UI: после 3 неудачных попыток ввода — сообщение «Слишком много попыток. Попробуйте через 10 минут.»
3. Backend: в `phone_challenges` (и `email_challenges`):
   - Поле `attempts` — инкрементировать при неудачной проверке.
   - При `attempts >= 3` — отклонять с ошибкой `too_many_attempts`.
   - Новый challenge нельзя создать, если предыдущий < 60 сек назад.

**Критерий:**
- Кнопка «Отправить повторно» неактивна 60 сек после отправки.
- После 3 неудачных попыток — блокировка 10 мин.
- На backend невозможно запросить код чаще раз в минуту.

---

## Подэтап 3.4: Привязка мессенджеров через deep-link

**Задача:** при нажатии «Подключить» в профиле генерируется одноразовый секрет и передаётся мессенджеру.

**Файлы:**
- `apps/webapp/src/shared/ui/ConnectMessengersBlock.tsx`
- `apps/webapp/src/modules/auth/` (или integrator API)
- `apps/integrator/src/content/telegram/user/scripts.json`
- `apps/integrator/src/integrations/` — link secret handling

**Действия:**
1. Webapp backend: эндпоинт `POST /api/auth/channel-link/start`:
   - Генерирует `link_secret` (UUID или crypto random, 32 символа).
   - Сохраняет в БД: `channel_link_secrets (user_id, secret_hash, channel, expires_at, used)`.
   - Миграция для таблицы.
   - Возвращает URL: `https://t.me/BersonCareBot?start=link_{secret}` (для Telegram).
2. Integrator: сценарий `message.received` с match `/start link_*`:
   - Извлечь secret из команды.
   - Проверить в webapp API (или в integrator DB) — валиден ли, не истёк.
   - Привязать identity к user.
   - Сбросить secret (пометить used).
   - Ответить: «Аккаунт успешно привязан!».
3. UI: кнопка «Подключить» → запрашивает secret → открывает deep-link.
4. **Max:** проверить, поддерживает ли Max Bot API параметр `?start=`. Если нет — альтернатива: показать код в UI, пользователь вводит код в чат боту.
5. **VK:** VK-боты поддерживают `ref` параметр через `vk.me/bot_name?ref=...`. Реализовать аналогично TG.

**Критерий:**
- Telegram: нажатие «Подключить» → открывается бот → привязка автоматическая.
- Max: определён рабочий метод привязки (deep-link или код).
- В профиле статус мессенджера обновляется.

---

## Подэтап 3.5: Переиспользуемый BindPhoneBlock

**Задача:** вынести блок привязки телефона в shared для использования в профиле, записях, уведомлениях.

**Файлы:**
- `apps/webapp/src/shared/ui/BindPhoneBlock.tsx` (уже существует)
- Страницы: profile, notifications, appointments

**Действия:**
1. Проверить текущий `BindPhoneBlock` — содержит ли всё необходимое:
   - Поле ввода телефона.
   - Кнопка «Привязать».
   - Поле ввода кода.
   - Таймер повторной отправки.
   - Состояние «уже привязан».
2. Если нет — дополнить (ресурсы из подэтапа 3.3).
3. Использовать на:
   - Странице «Мои записи» (если нет телефона).
   - Странице «Настройки уведомлений» (для SMS-канала).
   - Странице профиля.

**Критерий:**
- Один компонент `BindPhoneBlock` используется на 3+ страницах.
- Логика OTP (таймер, блокировка) работает везде одинаково.

---

## Общий критерий завершения этапа 3

- [ ] Профиль: ФИО, телефон, email — единообразные inline-edit поля.
- [ ] Email-привязка с кодом подтверждения работает.
- [ ] OTP: таймер 60 сек, блокировка после 3 попыток.
- [ ] Deep-link привязка Telegram работает.
- [ ] BindPhoneBlock переиспользуется на 3+ страницах.
- [ ] `pnpm run ci` проходит.
