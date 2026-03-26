# EXEC_H — Hotfix: UI polish + Auth flow переработка

Дата: 2026-03-25  
Приоритет: **СРОЧНО**, выполнить до любых pre-prod задач.  
CI: `pnpm run ci` после каждого шага.

---

## H.1 — Переработка Auth Flow (КРИТИЧНЫЙ)

### H.1.1 Исправить normalizePhone

**Файл**: `apps/webapp/src/modules/auth/phoneNormalize.ts`

Текущая логика:
```typescript
export function normalizePhone(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) digits = "7" + digits.slice(1);
  if (digits.length >= 10 && digits.startsWith("7")) return `+${digits}`;
  if (digits.length >= 10) return `+7${digits}`;
  return `+${digits}`;
}
```

**Проблема**: ввод `9189000782` (10 цифр без 7) → `+79189000782` (12 символов ≥ 10) — формально работает. Но клиентская валидация в `PhoneInput.tsx` проверяет `n.length < 10` — это длина строки `+79189000782` = 12 — проходит. Серверная — то же.

Однако **ввод `+79189000782`** даёт digits=`79189000782` (11 цифр, начинается с 7) → `+79189000782` — тоже должно работать. Если пользователь вводит `+7 918 900 07 82` с пробелами — digits = `79189000782` → `+79189000782`. Работает.

**Реальная проблема**: после нормализации → `check-phone` → OK → `startSms` → **rate_limited** из-за предыдущей неудачной попытки. Пользователь видит ошибку "не удалось отправить код" и не понимает что делать.

**Что исправить**:

1. **normalizePhone** — добавить обработку:
   - `+7(918)900-07-82` (скобки, дефисы)
   - `8(918)900-07-82` (8 в начале с форматированием)
   - Строка длиной 10 без ведущей 7/8: `9189000782` → `+79189000782`
   - Строка из 11 цифр начинающаяся с `7`: `79189000782` → `+79189000782`
   - **Уже работает**, но надо добавить unit-тесты для всех вариантов.

2. **PhoneInput.tsx** — валидация: проверять `n.length < 12` (длина нормализованного `+7XXXXXXXXXX` = 12), а не `< 10`:
   ```typescript
   if (n.length < 12 || !n.startsWith("+7")) {
     setError("Введите корректный номер (10 цифр)");
     return;
   }
   ```

3. **phoneAuth.ts** — серверная валидация: аналогично `normalized.length < 12`.

### H.1.2 Переработать rate limiting — НЕ блокировать до отправки SMS

**Текущая проблема**: `phoneOtpLimits.ts` блокирует на 10 минут (`OTP_LOCK_DURATION_SEC = 600`) после 3 неверных вводов кода. Но если юзер вводит неверный телефон, исправляет, и пытается снова — попадает в `rate_limited` из-за cooldown 60 сек на `phone/start`.

**Что исправить**:

1. **Не считать неудачные вводы номера как попытки** — rate limit только после успешной отправки SMS:
   - `check-phone` — лёгкий rate limit (уже есть: 40/час, достаточно).
   - `phone/start` — cooldown 60 сек **привязать к конкретному challengeId**, а не к номеру телефона. Т.е. повторная отправка для **того же** challenge — через 60 сек. Но новый challenge для того же номера (после коррекции) — сразу.
   - **Альтернатива (проще)**: cooldown по номеру оставить, но **показывать таймер** с обратным отсчётом вместо ошибки.

2. **UI**: в `OtpCodeForm.tsx` / `SmsCodeForm.tsx` — при `rate_limited`:
   - НЕ показывать "Слишком много попыток. Попробуйте позже." как ошибку.
   - Показывать таймер: "Повторная отправка возможна через XX сек" с обратным отсчётом.

3. **UI**: при `too_many_attempts` (3 неверных кода):
   - Сообщение: "Превышено количество попыток. Запросите новый код через 10 минут."
   - Кнопка "Назад" для смены номера.

### H.1.3 Переработать flow: телефон → check → PIN / канал / SMS

**Файлы**: `AuthFlowV2.tsx`, `MethodPicker.tsx`, `PinInput.tsx`

**Текущий flow**:
```
phone → check-phone → [new_user: SMS] / [existing: MethodPicker (PIN/Telegram/Max/SMS)]
```

**Новый flow**:
```
phone → check-phone →
  [new_user]: сразу отправляем SMS → экран ввода кода
  [existing + has_pin]: экран ввода PIN
    ↳ кнопка "не помню PIN" → экран выбора канала
    ↳ 3 ошибки PIN → автоматически → экран выбора канала
  [existing + no_pin]: экран выбора канала
```

**Экран выбора канала** (заменяет текущий MethodPicker):
- Заголовок: "Выберите, где вам удобно получить код для входа:"
- Кнопки (только если привязаны):
  1. **Telegram** (Button variant="secondary")
  2. **Max** (Button variant="secondary")
  3. **Email** (Button variant="secondary")
- Внизу текстом (не кнопкой): "получить код по СМС" (variant="link", мелкий шрифт)

**Изменения в коде**:

1. **`AuthFlowV2.tsx`** — добавить новые steps:
   ```
   Steps: "phone" | "new_user_sms" | "pin" | "choose_channel" | "code" | "messenger_wait"
   ```
   - Убрать step `"methods"`.
   - При `exists && methods.pin` → step `"pin"`.
   - При `exists && !methods.pin` → step `"choose_channel"`.
   - Из `"pin"` при "не помню" или 3 ошибках → `"choose_channel"`.
   - `pinFailCount` state — считать ошибки PIN.

2. **`PinInput.tsx`** — изменить `onForgotSms` → `onForgot`:
   - Текст кнопки: "Не помню PIN" (вместо "Забыли PIN? Войти по SMS").
   - Callback: `onForgot()` → переключает на `choose_channel`.

3. **`MethodPicker.tsx`** → **переделать в `ChannelPicker.tsx`**:
   - Убрать PIN из списка.
   - Заголовок: "Выберите, где вам удобно получить код для входа:"
   - Порядок: Telegram → Max → Email (только привязанные).
   - SMS — внизу текстом-ссылкой: "получить код по СМС".

4. **`checkPhoneMethods.ts`** — добавить `email` в `AuthMethodsPayload`:
   ```typescript
   return {
     exists: true,
     methods: {
       sms: true,
       pin: !!pinRow,
       telegram: !!user.bindings?.telegramId,
       max: !!user.bindings?.maxId,
       email: !!user.emailVerified,
     },
   };
   ```
   Для этого нужно загрузить `emailVerified` из `platform_users` / user projection.

### H.1.4 OTP доставка через мессенджер/email вместо SMS

**Текущее**: `startSms` всегда вызывает `POST /api/auth/phone/start` → integrator → SMS.

**Целевое**:
- При выборе Telegram → отправить OTP код через бота в Telegram (не deep-link login, а именно код).
- При выборе Max → отправить OTP код через бота в Max.
- При выборе Email → отправить OTP код на email (уже есть `emailAuth.ts`).
- При выборе SMS → как сейчас.

**Реализация**:
1. Новый API: `POST /api/auth/otp/start` (или расширить `phone/start`):
   ```json
   { "phone": "+7...", "deliveryChannel": "sms" | "telegram" | "max" | "email" }
   ```
2. Backend: при `deliveryChannel === "telegram"`:
   - Найти telegramId по phone/userId.
   - Вызвать integrator: `POST /api/bersoncare/send-otp` с `{ channel: "telegram", recipientId: telegramId, code }`.
3. Backend: при `deliveryChannel === "email"`:
   - Переиспользовать `emailAuth.ts` logic (уже есть send email via integrator).
4. UI: экран ожидания кода — текст адаптировать: "Введите код, отправленный вам в Telegram" / "...на email" / "...по SMS".
5. Под полем кода — после попытки через мессенджер/email, добавить кнопку "отправить на СМС" (variant="link").

**Integrator**: нужен новый маршрут `POST /api/bersoncare/send-otp`:
- Принимает: `{ channel, recipientId, code }`.
- Для telegram: отправляет сообщение через бота с текстом "Код для входа в BersonCare: XXXXXX".
- Для max: аналогично через Max bot.
- HMAC-подпись как в relay-outbound.

### H.1.5 После входа — предложение обновить PIN и привязать канал

**Файл**: `apps/webapp/src/shared/ui/auth/PostLoginSuggestion.tsx` (уже существует)

Добавить логику:
- Если вход был через SMS (не через PIN) и у пользователя нет PIN → "Создайте PIN-код для быстрого входа".
- Если вход был через SMS и нет привязанных мессенджеров → "Привяжите Telegram для восстановления доступа".
- Если вход через SMS и PIN есть → "Обновите PIN-код" (опционально).

### H.1.6 Тесты

- Unit: `normalizePhone` — все варианты ввода (10 цифр, 11 с 8, +7..., с пробелами, скобками, дефисами).
- Unit: rate limiting — cooldown не блокирует после исправления номера.
- Integration: полный auth flow: phone → check → PIN → forgot → channel → code → redirect.
- Integration: OTP delivery через telegram/email mock.

---

## H.2 — UI: padding и отступы от краёв

### H.2.1 Проблема

Пользователь сообщает: "пропали поля от края экрана".

**Текущие значения**:
- Patient shell: `px-4` (16px) — `AppShell.tsx` line 45
- PatientHeader: `-mx-4 px-3` — header на 3px, но bleed на -4
- Doctor shell: `px-3 md:px-4` (12–16px)

**Возможная причина**: на некоторых экранах контент перекрывает padding. `PatientHeader` использует `-mx-4` для bleed, но если `px-3` в header < `px-4` shell — правый край может быть обрезан.

### H.2.2 Что исправить

1. **PatientHeader** — сделать `px-4` вместо `px-3`:
   ```
   className="sticky top-0 z-40 -mx-4 mb-4 border-b border-border/60 bg-[var(--patient-surface)] px-4 py-2 shadow-sm"
   ```

2. Проверить все страницы patient — нет ли компонентов с `-mx-4` или `w-screen` без соответствующего padding.

3. Проверить `feature-grid` и другие CSS классы в `globals.css` — возможно отсутствует ограничение по ширине.

---

## H.3 — UI: шапка — иконки крупнее, промежутки больше

### H.3.1 Текущие значения

- Иконки: `size-5` (20px) — `Home`, `MessageCircle`, `Bell`, `Menu`
- Кнопки: `size="icon-sm"` — маленькие touch-target
- Промежуток правый кластер: `gap-0.5` (2px)
- Промежуток левый кластер: `gap-1` (4px)
- Промежуток между кластерами: `gap-2` (8px)

### H.3.2 Что исправить

**PatientHeader.tsx** и **DoctorHeader.tsx**:

1. Иконки: `size-5` → `size-6` (24px).
2. Кнопки: `size="icon-sm"` → `size="icon"` (для нормального touch-target ≥ 44px).
3. Правый кластер: `gap-0.5` → `gap-1.5` (6px).
4. Левый кластер: `gap-1` → `gap-2` (8px).
5. Header padding: `py-2` → `py-2.5` (10px).

Применить к обоим: `PatientHeader.tsx` и `DoctorHeader.tsx`.

---

## H.4 — Главная страница: порядок секций vs RAW_PLAN

### H.4.1 Что хочет владелец (RAW_PLAN раздел 7)

```
1. Кабинет:
   - Дневник (→ diary)
   - Мои записи (→ cabinet)
   - Мои комплексы ЛФК (скрыт пока)
2. Уроки:
   - Скорая помощь
   - Разминки / Тренировки
   - Полезные материалы
3. Важные новости (информационный блок)
4. Уведомления (рассылки)
5. Мотивашка
6. Статистика (мини-график + ЛФК кружочки)
```

### H.4.2 Текущий порядок в `patient/page.tsx`

```
1. PostLoginSuggestion
2. PatientHomeCabinetSection  — содержит: "symptoms" и "cabinet" → дневник симптомов + мои записи
3. PatientHomeDiariesSection  — содержит: только "lfk" → дневник ЛФК
4. PatientHomeLessonsSection  — уроки
5. PatientHomeNewsSection     — новости
6. PatientHomeMailingsSection — рассылки
7. PatientHomeMotivationSection — мотивашка
8. MiniStats (статистика)
9. ConnectMessengersBlock
```

### H.4.3 Проблемы

1. **Дневник разбит на две секции**: "symptoms" в Cabinet, "lfk" в Diaries. По RAW_PLAN "Дневник" — один пункт в кабинете.
2. **Секция "Дневники" с заголовком** — содержит только ЛФК, что сбивает с толку.
3. По RAW_PLAN в блоке «Кабинет» должны быть:
   - Дневник (одна ссылка → `/app/patient/diary`)
   - Мои записи (→ `/app/patient/cabinet`)
   - Мои комплексы ЛФК (скрыт)

### H.4.4 Что исправить

1. **PatientHomeCabinetSection** — содержать: `"diary"` (дневник, ведущий на `/app/patient/diary` — общую страницу дневников с вкладками), `"cabinet"` (мои записи), `"lfk"` (скрыт).
2. **Убрать PatientHomeDiariesSection** — ЛФК уходит в Кабинет.
3. Для этого: проверить `MenuService` — какие id он возвращает, и привести в соответствие.

---

## H.5 — Аудит всех страниц vs RAW_PLAN

### H.5.1 Метод

Для каждой страницы проверить соответствие RAW_PLAN. Ниже — список отклонений для исправления (агент должен проверить каждый пункт и создать задачи).

### H.5.2 Известные отклонения (из RAW_PLAN)

| # | Страница | RAW_PLAN | Текущее | Задача |
|---|----------|----------|---------|--------|
| 1 | Главная (patient) | Кабинет: Дневник, Мои записи, ЛФК(скрыт) | Дневник симптомов и ЛФК разбиты | H.4 |
| 2 | Главная (patient) | Блок «Уведомления»: кнопка «просмотрено» скрывает | Проверить наличие кнопки | Проверить |
| 3 | Профиль | ФИО/телефон/email — inline edit, кнопка «изменить» | Проверить все поля | Проверить |
| 4 | Настройки уведомлений | Заголовок «Подписки на уведомления», выбор SMS/email | Проверить | Проверить |
| 5 | Мои записи | Статусы цветные, виджет Rubitime, инфо-блок (адрес, подготовка) | Проверить | Проверить |
| 6 | Дневник | Две вкладки: «Симптомы» и «ЛФК» | Проверить | Проверить |
| 7 | Сообщения (patient) | Пузырики чата, даты, время, пустое состояние | Проверить | Проверить |
| 8 | Дашборд доктора | Плитка: пациенты, записи | Проверить | Проверить |
| 9 | Клиенты (doctor) | Карточка: ФИО, контакты-кнопки, записи | Проверить | Проверить |
| 10 | CMS | Markdown-редактор, медиа-загрузка | Проверить | Проверить |

**Агенту**: пройти по каждой строке таблицы, открыть соответствующий `page.tsx`, сравнить с RAW_PLAN, зафиксировать отклонения как новые задачи в этом документе.

---

## Порядок выполнения

```
H.1.1 (normalizePhone + валидация) ──┐
H.1.2 (rate limiting UI)             ├── СРОЧНО, параллельно
H.1.3 (flow: phone → PIN → channel) ─┤
H.2 (padding)                        │
H.3 (иконки в шапке)                 ┘

H.1.4 (OTP через мессенджер/email) ──── после H.1.3
H.1.5 (PostLoginSuggestion)       ──── после H.1.4
H.1.6 (тесты)                     ──── после всех H.1.*

H.4 (главная — порядок секций)    ──── параллельно с H.1
H.5 (аудит всех страниц)          ──── после H.4
```

---

## Зависимости от PRE_PROD_TODO

Этот пакет **не зависит** от PRE_PROD_TODO пунктов 1-3 (ключи, whitelist, dispatch).  
Выполняется **до** них.

---

## Контрольный чеклист

Статус: **проверено code review 2026-03-25** (Pack H части 1–3 + сверка кода/тестов).

- [x] `normalizePhone` корректно обрабатывает: `9189000782`, `89189000782`, `+79189000782`, `+7(918)900-07-82`, `8 918 900 07 82` — покрыто `phoneNormalize.test.ts`.
- [x] Клиентская валидация: вместо наивного `length < 12` используется `isValidRuMobileNormalized` (`^\+7\d{10}$`) в `PhoneInput.tsx` — строже и соответствует цели EXEC.
- [x] Серверная валидация: `isValidRuMobileNormalized` на `check-phone`, `phone/start`, `pin/login`, `messenger/start` и в `phoneAuth.startPhoneAuth`.
- [x] Rate limit не блокирует после коррекции номера — `phoneOtpLimits.test.ts` (другой нормализованный номер); плюс регрессия интегратора без «фантомного» cooldown (`integratorSmsAdapter.test.ts`).
- [x] Таймер обратного отсчёта вместо ошибки — `AuthFlowV2` (`smsStartCooldownSec`), `OtpCodeForm` / `SmsCodeForm` при `rate_limited`.
- [x] Flow: phone → check → PIN → «не помню» → `choose_channel` — `AuthFlowV2.tsx`.
- [x] Flow: phone → check → `choose_channel` при отсутствии PIN — `AuthFlowV2.tsx`.
- [x] Выбор канала: Telegram / Max / Email + ссылка SMS — `ChannelPicker.tsx`.
- [x] OTP доставка через Telegram/Max/Email — `phone/start` + `integratorSmsAdapter` / `sendOtpRoute`; полная e2e-доставка зависит от env/интегратора.
- [x] PostLoginSuggestion — подсказки PIN / Telegram при `postLoginHints` (`/api/me`).
- [x] Padding: `AppShell` patient `px-4`, `PatientHeader` `px-4` (и `-mx-4` bleed согласован).
- [x] Иконки: Lucide `size-6`, правый кластер `gap-1.5`, кнопки `HEADER_ICON_CLASS` с `size-11` (touch ≥ 44px).
- [x] Главная: секция «Кабинет» — карточки «Дневник» + «Мои записи» (`menu` id `diary`/`cabinet`, `PatientHomeCabinetSection`); секции «Дневники» нет, `PatientHomeDiariesSection` удалён.
- [x] `pnpm run ci` — зелёный (последняя верификация в рамках Pack H часть 3).
