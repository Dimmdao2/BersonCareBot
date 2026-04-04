# AUDIT — Stage 8 (зачистка legacy, документация, стабилизация)

**Scope:** `STAGE_8_CLEANUP_AND_DOCS.md`, `MASTER_PLAN.md` → Stage 8.

**Дата аудита:** 2026-04-04

---

## Verdict

**PASS** (с одним **minor** замечанием по синхронизации `MASTER_PLAN.md`)

---

## Проверки (gate)

### 1) Legacy элементы auth убраны

**Статус:** OK

- Файла `apps/webapp/src/shared/ui/auth/PhoneInput.tsx` в исходниках **нет**; публичный flow использует `InternationalPhoneInput` (`AuthFlowV2.tsx`); `PhoneAuthForm` / bind-phone — `InternationalPhoneField`.
- Импорты `@/shared/ui/auth/PhoneInput` в `apps/webapp/src` **отсутствуют** (кроме библиотечного компонента `react-phone-number-input` и класса CSS `PhoneInput`).
- Таблица файлов в `MASTER_PLAN.md` фиксирует: `PhoneInput.tsx` удалён, `InternationalPhoneInput.tsx` — актуальный UI.

---

### 2) Документация соответствует фактическому поведению

**Статус:** OK для канонических источников; **частичное расхождение** в `MASTER_PLAN.md` (см. findings).

**Канон рядом с кодом**

- `apps/webapp/src/modules/auth/auth.md` — Telegram Login primary, международный телефон, SMS только РФ, `delivery_failed`, PIN скрыт в публичном потоке, OAuth Yandex только backend + `system_settings`, email не как единственный обязательный публичный вход, список API, операционный лог `phone_otp_delivery`.

**Инициатива AUTH_RESTRUCTURE**

- `docs/AUTH_RESTRUCTURE/auth.md` — согласовано с `AuthFlowV2` (PIN / OAuth / email).

**Архитектура конфигурации**

- `docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md` — `telegram_login_bot_username`, Yandex OAuth keys в `system_settings`, ссылка на `ALLOWED_KEYS`.

**Деплой**

- `deploy/HOST_DEPLOY_README.md` — auth: OAuth и Telegram Login Widget через `system_settings`, без новых секретов в env webapp; отсылка к `CONFIGURATION_ENV_VS_DATABASE.md`.

**Устаревший снимок в `MASTER_PLAN.md`**

- Раздел **«Текущее состояние»** (строки ~36–51) всё ещё описывает старые формулировки: `PhoneInput`, отсутствие Telegram Login Widget, старые проблемы `integratorSmsAdapter` / только РФ / PIN в auth-flow. Это **не** отражает завершённые Stages 1–7. Для читателя, ищущего актуальное поведение, источником истины должны оставаться `auth.md` и stage-доки; **рекомендуется** обновить или пометить секцию как исторический снимок (см. MANDATORY / minor).

---

### 3) Ограничения (PIN hidden, OAuth backend-only, Email profile-only) задокументированы

**Статус:** OK

| Ограничение | Где зафиксировано |
|-------------|-------------------|
| PIN скрыт в публичном login | `auth.md` (публичный поток), `docs/AUTH_RESTRUCTURE/auth.md`, комментарий в `AuthFlowV2.tsx` |
| OAuth backend-only, не в публичном UI | `auth.md`, `checkPhoneMethods.ts` (комментарий к `oauth`), `RuntimeConfigSection` (админка) |
| Email не единственный публичный вход; канал в профиле / OTP | `auth.md`, `docs/AUTH_RESTRUCTURE/auth.md`, `otpChannelUi` (публичный flow без email) |

---

### 4) Операционный лог SMS (S8.T04)

**Статус:** OK

- `integratorSmsAdapter.ts`: событие `phone_otp_delivery` (JSON в stdout, маска номера, канал, исход HTTP при наличии).
- Описано в `apps/webapp/src/modules/auth/auth.md` (раздел «Операционные логи OTP»).

---

### 5) CI evidence

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

### Minor

- **`MASTER_PLAN.md` §«Текущее состояние»** не обновлён под финальное состояние после Stages 1–7 (в т.ч. упоминания удалённого `PhoneInput` и проблем, уже закрытых stage). Путает при чтении рядом с актуальным `auth.md`.

### Informational

- Архивные документы в `docs/archive/` могут ссылаться на старый `PhoneInput`; на gate не влияют (`AUDIT_GLOBAL.md`).
- Комментарий в `AuthBootstrap.tsx` («PIN, OTP») может кратко уточниться при следующем редактировании файла.

---

## MANDATORY FIX INSTRUCTIONS

**Обязательных исправлений коду и критичных правок документации по gate Stage 8 нет** (нет `critical` / `major`).

**Рекомендуется закрыть minor из этого аудита:**

1. Обновить **`docs/AUTH_RESTRUCTURE/MASTER_PLAN.md`** раздел **«Текущее состояние»**: либо заменить на краткое описание **текущего** поведения (Telegram Login Widget, `InternationalPhoneInput`, SMS только РФ, без дублирования устаревших проблем), либо явно пометить блок как *исторический снимок на старт инициативы* и дать ссылку на `apps/webapp/src/modules/auth/auth.md` как на актуальный канон.

После правки — при необходимости одна проверка `pnpm run ci` (ожидается зелёный).
