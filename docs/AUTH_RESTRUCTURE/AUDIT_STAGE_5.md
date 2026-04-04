# AUDIT — Stage 5 (PIN скрыт в публичном auth-flow)

**Scope:** `STAGE_5_HIDE_PIN_PUBLIC_AUTH_FLOW.md`, `MASTER_PLAN.md` → Stage 5.

**Дата аудита:** 2026-04-04

---

## Verdict

**PASS**

---

## Проверки (gate)

### 1) `set_pin` отсутствует в публичном auth-flow

**Статус:** OK

- Тип шагов `AuthFlowStep` в `AuthFlowV2.tsx` не содержит `set_pin` (только `entry_loading` | `landing` | `phone` | `new_user_foreign` | `new_user_sms` | `foreign_no_otp_channel` | `choose_channel` | `code`).
- В файле **нет** импорта `PinInput`, **нет** строки/ветки `set_pin`.
- Комментарий в шапке файла: PIN в этом flow намеренно отключён (Stage 5); ссылка на `docs/AUTH_RESTRUCTURE/auth.md`.
- **Тесты:** `AuthFlowV2.test.tsx` — при `methods.pin: true` пользователь попадает на OTP, без UI PIN; после успешного `phone/confirm` проверяется отсутствие текста про придумывание PIN.

---

### 2) SMS / Telegram login → немедленный редирект

**Статус:** OK

**SMS / OTP**

- Успешный `POST /api/auth/phone/confirm` возвращает `{ ok: true, redirectTo }`; сессия выставляется в route (`setSessionFromUser`). `confirmPhoneAuth` возвращает сразу `redirectTo: getRedirectPathForRole` — **без** шага установки PIN (`phoneAuth.ts`).
- В `AuthFlowV2` при успехе `OtpCodeForm` вызывается `redirectOk(data.redirectTo)` → `router.replace`.
- **Тест:** «after successful OTP confirm redirects immediately without set_pin» — `replace` с `/app/patient/home`.

**Telegram Login Widget**

- `TelegramLoginButton`: при `ok` и `redirectTo` из `POST /api/auth/telegram-login` выполняется `router.replace(target)` (без промежуточных шагов, без PIN).
- Сессия создаётся на сервере в `exchangeTelegramLoginWidget` (см. Stage 3).

*(Отдельный UI-тест, который кликает виджет Telegram и мокает callback, в репозитории не выделен; поведение редиректа зафиксировано в `TelegramLoginButton.tsx`.)*

---

### 3) Нет скрытой зависимости от `PinInput` в login

**Статус:** OK

- Публичный вход: `AuthBootstrap` рендерит только `AuthFlowV2` (и обмен токена / initData) — **без** `PinInput`.
- `PinInput` импортируется в **профиле** (`PinSection.tsx`, `DiaryDataPurgeSection.tsx`) и в тестах `PinInput.test.tsx`, **не** в `AuthFlowV2`, `AuthBootstrap`, `AppEntryLoginContent`.
- `PhoneAuthForm` (содержит международное поле телефона без PIN) используется в `BindPhoneBlock`, не в корневом `/app` login.

---

### 4) CI evidence

**Статус:** OK

| Команда | Результат |
|---------|-----------|
| `pnpm install --frozen-lockfile && pnpm run ci` | **exit 0** (2026-04-04) |

---

## Findings by severity

### Critical

Нет.

### Major

Нет.

### Minor / informational

- **`AuthBootstrap.tsx`:** в комментарии к файлу всё ещё упоминается «PIN, OTP» в описании потока по телефону — фактически публичный flow PIN не использует; имеет смысл поправить комментарий при следующем редактировании (косметика, не блокер Stage 5).
- **Информационно:** end-to-end тест с моком успешного Telegram Login callback и проверкой `router.replace` без PIN не выделен; для gate Stage 5 достаточно кода `TelegramLoginButton` + тестов SMS-ветки.

---

## MANDATORY FIX INSTRUCTIONS

**Обязательных исправлений по результатам этого аудита нет** (нет `critical` / `major`).

Опционально: выровнять комментарий в `AuthBootstrap.tsx` с текущим публичным flow (без PIN в login).
