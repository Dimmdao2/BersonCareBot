# PACK A — Quick Fixes (оставшиеся пункты FINAL_FIX_RECOMMENDATIONS)

> Сложность: простой  
> Агент: Auto (пул)  
> Зависимости: нет  
> Ожидаемое время Auto: 1 чат-сессия

---

## Обязательные правила

- После каждого шага: `pnpm run ci`.
- При FAIL: починить → повторить (до 3 попыток). После 3 → СТОП, записать в отчёт.
- Решения владельца: `docs/FULL_DEV_PLAN/USER_TODO_STAGE.md`.
- Отчёт: `docs/FULL_DEV_PLAN/finsl_fix_report.md`.

---

## Шаг A.1 — PERF-04 + QA-02: мемоизация `buildAppDeps`

**Файлы:** `apps/webapp/src/app-layer/di/buildAppDeps.ts`

**Действия:**
1. Обернуть `buildAppDeps()` в `React.cache()` (или module-level singleton + lazy init):
   ```ts
   import { cache } from "react";
   export const buildAppDeps = cache(_buildAppDeps);
   function _buildAppDeps() { /* текущее тело */ }
   ```
2. Убедиться, что повторный вызов в рамках одного запроса возвращает тот же объект.

**DoD:** `buildAppDeps()` не создаёт дублирующихся сервисов при множественных вызовах в одном request scope. CI зелёный.

---

## Шаг A.2 — ARCH-01: исправить границу `shared/ui` → `modules/messaging`

**Файлы:**
- `apps/webapp/src/shared/ui/PatientHeader.tsx`
- `apps/webapp/src/shared/ui/DoctorHeader.tsx`
- Новый: `apps/webapp/src/shared/hooks/useSupportUnreadPolling.ts`

**Действия:**
1. Создать `apps/webapp/src/shared/hooks/useSupportUnreadPolling.ts` — re-export из `modules/messaging/hooks/useSupportUnreadPolling`.
2. В `PatientHeader.tsx` и `DoctorHeader.tsx` изменить импорт на `@/shared/hooks/useSupportUnreadPolling`.
3. Проверить, что нет других прямых импортов из `modules/messaging` в `shared/ui/`.

**DoD:** `shared/ui/` не импортирует напрямую из `modules/`. CI зелёный.

---

## Шаг A.3 — ARCH-02: убрать raw SQL из `buildAppDeps`

**Файлы:**
- `apps/webapp/src/app-layer/di/buildAppDeps.ts`
- `apps/webapp/src/infra/repos/pgUserByPhone.ts` (или `pgUserProjection.ts`)

**Действия:**
1. Найти в `buildAppDeps.ts` прямой `pool.query("SELECT phone_normalized FROM platform_users WHERE id = $1")`.
2. Вынести в метод `getPhoneByUserId(userId: string): Promise<string | null>` в соответствующем pg-репозитории.
3. Использовать новый метод в `buildAppDeps`.

**DoD:** В `buildAppDeps.ts` нет прямых SQL-запросов. CI зелёный.

---

## Шаг A.4 — ARCH-03: исправить заглушки в `appointmentStats`

**Файлы:**
- `apps/webapp/src/modules/doctor-clients/service.ts`
- `apps/webapp/src/infra/repos/pgDoctorAppointments.ts`

**Действия:**
1. В `service.ts` найти `cancellations30d: 0` и `lastVisitLabel: null`.
2. Вычислить `cancellations30d` из истории записей: записи со статусом `canceled` + `CANCELLATION_LAST_EVENT_EXCLUSION_SQL` за последние 30 дней.
3. Вычислить `lastVisitLabel` из истории: последняя запись с прошедшей датой.
4. При необходимости добавить метод в `pgDoctorAppointments` для получения этих данных.

**DoD:** `appointmentStats` в карточке клиента показывает реальные данные. CI зелёный. Добавить unit-тест.

---

## Шаг A.5 — TEST-01 + QA-03: недостающие тесты

**Файлы:** новые тест-файлы рядом с целевыми route/модулями.

**Действия:**
1. Добавить тесты для ключевых пропущенных сценариев:
   - `POST /api/patient/messages` → 403 при заблокированном пользователе.
   - `GET /api/doctor/messages/unread-count` → базовый тест.
   - `PATCH /api/admin/users/[id]/archive` → 403 от role=doctor.
2. Добавить unit-тест стабильности цитаты дня: `getQuoteForDay(seed, date)` → один и тот же `daySeed` в один день → один и тот же результат (QA-03).
3. Все тесты должны использовать `vi.fn()` и моки, без реальной сети.

**DoD:** Новые тесты покрывают указанные сценарии. CI зелёный.

---

## Не входит в Pack A

- PERF-06 (пагинация клиентов) — реализовать в рамках Pack F или отдельно, требует UI-изменений.
- ARCH-05 (conditional render на мобильном) — требует решения по SSR vs client-side, отложить.
- SEC-03 (in-memory rate limit) — зафиксировать ограничение в `SERVER CONVENTIONS.md`, не менять код.
- SEC-06/SEC-07 — реализовать в рамках Pack E (OAuth).
