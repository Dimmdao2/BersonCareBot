# QA Checklist — FIX_PLAN_POLISH Execution

---

## После каждого пакета

- [x] `pnpm run ci` зелёный (lint, typecheck, test, test:webapp, webapp:typecheck, build, audit).
- [x] Нет новых `console.log` в production-коде (по `git diff`).
- [x] Нет закоммиченных секретов (`.env`, credentials, API keys) в изменениях.
- [x] Нет `any` типов в новом коде (по `git diff`, кроме `expect.any(...)` в тестах).
- [x] Все новые API routes имеют Zod-валидацию на входе (покрыто route/unit тестами Pack B-G).
- [x] Все новые API routes имеют auth guard (401/403) для защищённых endpoint'ов.
- [x] Новые миграции идемпотентны (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`).
- [x] Отчёт `finsl_fix_report.md` обновлён.

---

## После Pack A (Quick Fixes)

- [x] `buildAppDeps` мемоизирован (нет дублирования при множественных вызовах).
- [x] `shared/ui/` не импортирует из `modules/` напрямую *(в рамках Pack A: `PatientHeader` / `DoctorHeader` → `shared/hooks/useSupportUnreadPolling`; остальные файлы в `shared/ui/` с импортами из `modules/` — вне scope `EXEC_A_QUICK_FIXES`, отдельный архитектурный долг).*
- [x] `appointmentStats` показывает реальные `cancellations30d` и `lastVisitLabel`.
- [x] Новые тесты TEST-01 проходят.

---

## После Pack B (Settings/Admin)

- [x] Таблица `system_settings` с seed-данными.
- [x] Пациент → 403 на admin/doctor endpoints.
- [x] Doctor → 200 на doctor settings, 403 на admin.
- [x] Admin → 200 на оба endpoint (GET + PATCH).
- [x] Admin mode: toggle + confirm + красная шапка.
- [x] `shouldDispatch` корректно блокирует non-whitelist при `dev_mode`.
- [x] Updated_by записывается при каждом изменении (покрыто тестом).
- [x] Admin UI сохраняет значения в формате `{value: X}` — совместимо с shouldDispatch и seed.

---

## После Pack C (Relay Outbound)

- [x] Relay endpoint в integrator принимает подписанные запросы.
- [x] Невалидная подпись → 401.
- [x] Duplicate idempotencyKey → 200 duplicate (не повторная отправка).
- [x] Retry: 4 попытки с backoff (прерывается на 4xx).
- [x] `doctorSupportMessagingService.sendAdminReply` вызывает relay.
- [x] `INTEGRATOR_CONTRACT.md` содержит раздел relay-outbound.
- [x] `shouldDispatch` guard: при отсутствии userId — relay блокируется (dev_mode_skip_no_user).
- [x] max, sms каналы: корректный payload в dispatch intent (покрыто тестами).

---

## После Pack D (Reminders)

- [x] `listReminderRules` возвращает реальные данные (не `[]`).
- [x] `/app/patient/reminders` загружается и показывает категории.
- [x] Toggle категории → сохраняется → виден после reload (revalidatePath).
- [x] Колокольчик в PatientHeader показывает badge при unseen > 0.
- [x] `mark-seen` уменьшает badge (`all: true` вызывает `markAllSeen`).
- [x] Статистика (sent/seen/unseen/failed) корректна (getStats).
- [ ] Policy "важных сообщений" (вариант B): все мессенджеры + email → ожидание → SMS *(вне scope Pack D; требует интеграции с integrator scheduler — отдельная задача).*
- [x] Route tests: `GET /api/patient/reminders/unread-count`, `POST /api/patient/reminders/mark-seen`.
- [x] Server action tests: `toggleReminderCategory` (valid/invalid/unauth), `updateReminderRule` (valid/invalid bounds).
- [x] `mark-seen { all: true }` → `markAllSeen` (критический фикс из code review).
- [x] `mark-seen` route: JSON parse error → 400, auth error → 401 (разделены).
- [x] `PatientHeader`: import `useReminderUnreadCount` через `shared/hooks/` (не напрямую из `modules/`).

---

## После Pack E (Integrations) — ГЛУБОКИЙ АУДИТ

- [x] `send-email` endpoint: HMAC-подпись проверяется, timestamp window.
- [x] Email OTP webapp → integrator (не прямой SMTP).
- [x] Telegram deep-link: одноразовый, TTL, идемпотентный complete.
- [x] Max deep-link: работает или задокументирован блокер.
- [x] Google Calendar: feature flag, idempotency по record id, nock-тесты.
- [x] Rubitime reverse: работает или задокументирован блокер.
- [x] Email autobind: не перезаписывает verified, обрабатывает конфликты.
- [x] Все nock/inject тесты без реальных сетевых вызовов.
- [x] `INTEGRATOR_CONTRACT.md` актуален.

---

## После Pack F (LFK)

- [x] FK chain: `lfk_exercises` → `lfk_complex_template_exercises` → `lfk_complex_templates` (+ `035_lfk_complex_exercises` для комплекса пациента).
- [x] Doctor UI: справочник упражнений (list, create, edit, archive).
- [x] Doctor UI: конструктор шаблонов с DnD reorder.
- [x] Publish: нельзя опубликовать пустой шаблон; сохранение черновика не может очистить упражнения у **опубликованного** шаблона (сервисная проверка).
- [x] Assign: doctor assigns → patient diary shows complex (при `DATABASE_URL`; без БД — stub).
- [x] Assigned complex с меткой "Назначен врачом".
- [x] Повторное назначение: обновление `patient_lfk_assignments` + новый комплекс, старый комплекс `is_active=false` (транзакция в `pgLfkAssignments`).

---

## После Pack G (Final)

- [x] OAuth callback: state (CSRF) проверяется (state mismatch → 403; valid state → flow продолжается).
- [x] CMS e2e: upload → save → page accessible (`e2e/cms-content.test.ts`: upload→saveContentPage chain).

---

## Финальная регрессия (после всех пакетов)

- [x] `pnpm run ci` зелёный.
- [x] `pnpm run test:webapp` зелёный.
- [x] Проверить: нет broken imports / dead code от переименований (lint + typecheck + build PASS).
- [x] Проверить: все migration номера уникальны и последовательны (031–035).
- [x] Проверить: `SERVER CONVENTIONS.md` актуален (порты, пути, сервисы).
- [x] Проверить: `INTEGRATOR_CONTRACT.md` описывает все M2M endpoints.
- [ ] Проверить: `.env.example` содержит все новые переменные *(не хватает части ключей, см. `QA_CHEK_RESULT`)*.
