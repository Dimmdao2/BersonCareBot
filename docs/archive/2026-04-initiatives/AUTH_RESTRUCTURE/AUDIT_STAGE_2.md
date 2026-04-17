# AUDIT — Stage 2 (международный телефон: UI + E.164)

**Scope:** `STAGE_2_INTERNATIONAL_PHONE_VALIDATION.md`, `MASTER_PLAN.md` → Stage 2.

**Дата аудита:** 2026-04-04

---

## Verdict

**PASS**

---

## Проверки (gate)

### 1) `InternationalPhoneInput` включён в `AuthFlowV2`

**Статус:** OK

- Импорт: `import { InternationalPhoneInput } from "@/shared/ui/auth/InternationalPhoneInput"`.
- На шаге `phone` рендерится `<InternationalPhoneInput disabled={loading} onSubmit={runCheckPhone} submitLabel="Продолжить" />` (`apps/webapp/src/shared/ui/auth/AuthFlowV2.tsx`).

### 2) Невалидный номер не уходит на backend

**Статус:** OK

- `InternationalPhoneInput`: `canSubmit = Boolean(value && isValidPhoneNumber(value))` — кнопка **disabled**, пока номер не валиден для libphonenumber.
- `handleSubmit`: при `!value || !isValidPhoneNumber(value)` — **ранний return**, `onSubmit` не вызывается.
- Ошибка формата — **inline** («Введите корректный номер»), без toast (`InternationalPhoneInput.tsx`).

### 3) API-роуты используют `isValidPhoneE164`

**Статус:** OK (список из Stage 2 S2.T06)

| Роут | Нормализация | Валидация |
|------|----------------|-----------|
| `app/api/auth/phone/start/route.ts` | `normalizePhone` → `normalized` | `isValidPhoneE164(normalized)` |
| `app/api/auth/check-phone/route.ts` | `normalizePhone` | `isValidPhoneE164(phone)` |
| `app/api/auth/pin/login/route.ts` | `normalizePhone` | `isValidPhoneE164(phone)` |
| `app/api/auth/messenger/start/route.ts` | `normalizePhone` | `isValidPhoneE164(phone)` |

Дополнительно: `startPhoneAuth` в `phoneAuth.ts` повторно проверяет `isValidPhoneE164` после `normalizePhone` (защита вне HTTP-слоя).

### 4) Тесты покрывают `+1`, `+44`, `+49`, `+380`, `+7`

**Статус:** OK

- `apps/webapp/src/modules/auth/phoneValidation.test.ts`, блок `describe("isValidPhoneE164")`:
  - `+12025550123` (+1)
  - `+442078361234` (+44)
  - `+4915123456789` (+49)
  - `+380501234567` (+380)
  - `+79991234567` (+7)
- Отрицательные кейсы: `+`, короткие строки, без `+`, мусор.
- UI: `InternationalPhoneInput.test.tsx` проверяет disabled submit и успешный вызов с `+79991234567` (сквозной сценарий для RU default).

### 5) CI evidence

**Статус:** OK

| Команда | Результат |
|---------|-----------|
| `pnpm install --frozen-lockfile && pnpm run ci` | **exit 0** (2026-04-04) |

В составе CI: lint, typecheck, integrator test, webapp test, webapp:typecheck, build, build:webapp, `audit --prod`.

---

## Findings by severity

### Critical

Нет.

### Major

Нет.

### Minor / informational

- **Информационно:** отдельные тесты компонента `InternationalPhoneInput` не прогоняют ввод для каждого из префиксов `+1` / `+44` / … — покрытие префиксов сосредоточено в **`phoneValidation.test.ts`** (`isValidPhoneE164`). Для gate Stage 2 этого достаточно.

---

## MANDATORY FIX INSTRUCTIONS

**Обязательных исправлений по результатам этого аудита нет** (нет `critical` / `major`).

Если позже понадобится усилить регрессию UI по странам — опционально добавить параметризованный тест в `InternationalPhoneInput.test.tsx` с моком страны/ввода; это **не** блокер Stage 2.
