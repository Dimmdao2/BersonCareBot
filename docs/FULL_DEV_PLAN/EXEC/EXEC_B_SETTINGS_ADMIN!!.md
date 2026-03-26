# PACK B — Settings/Admin (Stage 14) !!

> Сложность: **высокий** — security-critical (admin mode, role guards, audit)  
> Агент: Auto (пул). При проблемах с admin mode или guards → переключить на API-модель.  
> Зависимости: нет  
> Миграция: `031_system_settings.sql`  
> Source of truth: `USER_TODO_STAGE.md` секции 3.1–3.2, `FIX_PLAN_POLISH.md` секция "Settings/Admin"

---

## Обязательные правила

- После каждого шага: `pnpm run ci`.
- При FAIL: починить → повторить (до 3 попыток). После 3 → СТОП, записать в отчёт.
- Все тексты UI на русском.
- Не менять существующие миграции — только новые файлы.
- Отчёт: `docs/FULL_DEV_PLAN/finsl_fix_report.md`.

---

## Шаг B.1 — Миграция `031_system_settings.sql`

**Файлы:** `apps/webapp/migrations/031_system_settings.sql` (новый)

**Действия:**
1. Проверить `ls apps/webapp/migrations/` — убедиться что 031 свободен.
2. Создать таблицу:
   ```sql
   CREATE TABLE IF NOT EXISTS system_settings (
     key         TEXT        NOT NULL,
     scope       TEXT        NOT NULL DEFAULT 'global',
     value_json  JSONB       NOT NULL DEFAULT '{}',
     updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_by  UUID        REFERENCES platform_users(id),
     PRIMARY KEY (key, scope),
     CHECK (scope IN ('global', 'doctor', 'admin'))
   );
   ```
3. Seed с `ON CONFLICT DO NOTHING`:
   - `('patient_label', 'doctor', '{"value": "пациент"}')` 
   - `('sms_fallback_enabled', 'admin', '{"value": true}')` 
   - `('debug_forward_to_admin', 'admin', '{"value": false}')` 
   - `('dev_mode', 'admin', '{"value": false}')` 
   - `('important_fallback_delay_minutes', 'admin', '{"value": 60}')` — для Stage 12

**DoD:** Миграция идемпотентна. CI зелёный.

---

## Шаг B.2 — Модуль `system-settings`: порт, сервис, репозиторий

**Файлы:**
- `apps/webapp/src/modules/system-settings/types.ts` (новый)
- `apps/webapp/src/modules/system-settings/ports.ts` (новый)
- `apps/webapp/src/modules/system-settings/service.ts` (новый)
- `apps/webapp/src/modules/system-settings/service.test.ts` (новый)
- `apps/webapp/src/infra/repos/pgSystemSettings.ts` (новый)
- `apps/webapp/src/app-layer/di/buildAppDeps.ts` (добавить)

**Действия:**
1. Определить типы: `SystemSettingKey`, `SystemSettingScope`, `SystemSetting`.
2. Whitelist ключей:
   ```ts
   const ALLOWED_KEYS = [
     "patient_label", "sms_fallback_enabled", "debug_forward_to_admin",
     "dev_mode", "important_fallback_delay_minutes", "integration_test_ids"
   ] as const;
   ```
3. Реализовать порт: `getByKey(key, scope)`, `getByScope(scope)`, `upsert(key, scope, valueJson, updatedBy)`.
4. Реализовать PG-репозиторий: SQL через `getPool()`.
5. Реализовать сервис: `getSetting`, `updateSetting` (с проверкой whitelist), `listSettingsByScope`.
6. Зарегистрировать в `buildAppDeps`.
7. Unit-тест сервиса: unknown key → ошибка, valid key → success.

**DoD:** Сервис доступен через DI. Невозможно записать ключ вне whitelist. CI зелёный.

---

## Шаг B.3 — API: GET/PATCH настроек с role-guard

**Файлы:**
- `apps/webapp/src/app/api/doctor/settings/route.ts` (новый)
- `apps/webapp/src/app/api/admin/settings/route.ts` (новый)
- Тесты рядом: `route.test.ts`

**Действия:**
1. `GET /api/doctor/settings` — возвращает настройки scope `doctor` для текущей сессии. Guard: `role >= doctor`.
2. `PATCH /api/doctor/settings` — обновляет допустимые ключи. Body: `{ key, value }`. Zod-валидация.
3. `GET /api/admin/settings` — возвращает scope `admin`. Guard: `role === admin`.
4. `PATCH /api/admin/settings` — обновляет admin-ключи. Guard: `role === admin`.
5. При каждом PATCH записывать `updated_by` = текущий userId.
6. Стандартные коды: 400 (bad payload), 401 (no session), 403 (wrong role).

**Тесты:** 
- Пациент → 403 на doctor и admin endpoints.
- Doctor → 200 на doctor, 403 на admin.
- Admin → 200 на оба.
- Invalid key → 400.

**DoD:** API защищён role-guard. CI зелёный.

---

## ⚠️ ЗАВИСИМОСТЬ от Pack I (UI Review)

Pack I (выполняется ДО Pack B) устанавливает UI-стандарты, которые ОБЯЗАТЕЛЬНЫ для всего нового UI:
- **I.1 (кнопки)**: единый Button (скругление, active:затемнение + shadow-inner, текст белый на синем).
- **I.2 (размеры)**: input h-10/h-11, text-base, px-5, font 15-16px.
- **I.10 (заглушки)**: GuestPlaceholder для закрытых страниц.

Все новые UI-компоненты в B.4–B.6 ДОЛЖНЫ следовать этим стандартам.

---

## Шаг B.4 — UI: страница `/app/settings` (вместо редиректа)

**Файлы:**
- `apps/webapp/src/app/app/settings/page.tsx` (переписать)
- `apps/webapp/src/app/app/settings/SettingsForm.tsx` (новый, client component)
- `apps/webapp/src/app-layer/routes/paths.ts` (если нужно)
- `apps/webapp/src/modules/menu/service.ts` (проверить ссылку)

**Действия:**
1. Для `role === 'client'` — оставить редирект на `/app/patient/profile`.
2. Для `role === 'doctor'` или `role === 'admin'` — рендерить страницу настроек.
3. Блоки doctor:
   - `patient_label`: выпадающий список `["пациент", "клиент"]`.
   - `sms_fallback_enabled`: toggle.
4. Сохранение через `fetch PATCH /api/doctor/settings`.
5. На странице использовать shadcn компоненты: `Card`, `Select`, `Switch`, `Button`.
6. Все тексты на русском: "Настройки", "Как называть пациента", "SMS fallback" и т.д.

**DoD:** Doctor видит реальную страницу настроек. Сохранение работает. CI зелёный.

---

## Шаг B.5 — Admin mode: сессия + confirm + визуальная индикация

**Файлы:**
- `apps/webapp/src/modules/auth/service.ts` (или актуальный файл сессии)
- `apps/webapp/src/shared/ui/DoctorHeader.tsx`
- `apps/webapp/src/app/app/settings/AdminModeToggle.tsx` (новый, client component)
- `apps/webapp/src/app/api/admin/mode/route.ts` (новый)

**Действия:**
1. Добавить `adminMode: boolean` в сессионные данные (cookie или JWT payload — как реализовано в проекте).
2. API `POST /api/admin/mode` — toggle. Guard: `role === admin`. Сохраняет в сессию.
3. `AdminModeToggle` — shadcn `AlertDialog` с подтверждением "Включить режим администратора?".
4. В `DoctorHeader.tsx`:
   - Читать `adminMode` из сессии.
   - При `adminMode === true` → менять фон шапки на `bg-destructive/10` + текст "ADMIN MODE" (красный badge).
5. При `adminMode === false` — admin-only элементы скрыты в UI (но API всё равно проверяет роль на сервере).

**Тесты:**
- Doctor пытается `POST /api/admin/mode` → 403.
- Admin → 200, сессия обновлена.
- Unit-тест `AdminModeToggle` рендера.

**DoD:** Admin mode работает как отдельный слой безопасности. CI зелёный.

---

## Шаг B.6 — Admin UI: dev_mode, debug forwarding, test IDs, audit log

**Файлы:**
- `apps/webapp/src/app/app/settings/AdminSettingsSection.tsx` (новый, client component)
- `apps/webapp/src/modules/system-settings/service.ts` (добавить `shouldDispatch`)

**Действия:**
1. В секции admin на странице settings (видна только при `adminMode === true`):
   - Toggle `dev_mode` с пояснением "При включении рассылки уходят только на тестовые аккаунты".
   - Toggle `debug_forward_to_admin` с пояснением "Пересылать все входящие сообщения админу".
   - Поле `integration_test_ids` (textarea, JSON array строк).
   - Поле `important_fallback_delay_minutes` (числовой input, default 60).
2. Реализовать `shouldDispatch(userId: string): Promise<boolean>`:
   - Если `dev_mode === false` → `true` (все получают).
   - Если `dev_mode === true` → только если `userId` есть в `integration_test_ids`.
3. Audit: при каждом PATCH в admin API — `console.info` с `key`, `oldValue`, `newValue`, `updatedBy`, `timestamp`.
   Также записывать в `system_settings` как `updated_at + updated_by` (уже есть из B.1).

**Тесты:**
- Unit: `shouldDispatch` с dev_mode true + whitelist.
- Unit: `shouldDispatch` с dev_mode false.
- Integration: admin settings PATCH → значения обновляются.

**DoD:** Admin-флаги реально влияют на `shouldDispatch`. Audit log записывается. CI зелёный.

---

## Финальный критерий Pack B

- [ ] Таблица `system_settings` с seed.
- [ ] Сервис с whitelist и DI.
- [ ] API с role-guards (doctor/admin).
- [ ] `/app/settings` — реальная страница.
- [ ] Admin mode с confirm и красной шапкой.
- [ ] `shouldDispatch` и admin-флаги.
- [ ] `pnpm run ci` зелёный.
