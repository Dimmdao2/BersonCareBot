# Фаза 6 — Merge и identity (страховка)

**Статус:** `completed` (2026-05-20)  
**Аудит:** [`PHASE_06_AUDIT.md`](PHASE_06_AUDIT.md)  
**Канон:** [MAIN PLAN.md](MAIN%20PLAN.md) §7  
**Зависит от:** [PHASE_01](PHASE_01_RUBITIME_PLATFORM_USER.md), [PHASE_05](PHASE_05_AUTH_REGISTER_LOGIN_FORGOT.md)

## Цель

Предотвращение дублей — в первую очередь фаза 1; эта фаза — проверка и точечные доработки merge, если дубль уже есть.

## Сценарии проверки

- [x] Rubitime user по email + phone из Rubitime → trusted phone на том же user — **PHASE_01** (`ensureAppointmentClient`, autobind tests); merge не требуется на live-path.
- [x] Позже bot user с тем же телефоном → безопасный merge / resolution — **существующие** тесты `pickMergeTargetId`, `phone_bind` в `pgPlatformUserMerge.test.ts`; auto-merge conflict → 202 (`events.test.ts`).
- [x] User A: appointments; User B: PWA stats/reminders → после merge данные на canonical user — **новый** unit-тест manual merge (appointment_records + symptom_trackings + reminders).

## Scope

### В scope

- Ревью `PLATFORM_USER_MERGE.md` vs новая логика phone/email — секция «Login / Register initiative — identity vs merge» + таблица ограничений auto-merge.
- Тест(ы) «appointments + diary/warmup» basic merge — `pgPlatformUserMerge.test.ts`.
- Документировать ограничения automerge (email conflict → support) — в `PLATFORM_USER_MERGE.md`.

### Вне scope

- Новый merge engine v3 без явного запроса  
- Изменение GitHub CI workflow  

## Definition of Done

- [x] Чеклист сценариев §7 пройден или заведены backlog-задачи с причиной отмены  
- [x] Нет регрессии manual merge API (существующие тесты `pgPlatformUserMerge`, `manualPlatformUserMerge`, `adminMergeAccountsLogic` не меняли контракт apply)  
- [x] [`LOG.md`](LOG.md)

## Локальные проверки

- [x] `pnpm --filter @bersoncare/webapp exec vitest run src/infra/repos/pgPlatformUserMerge.test.ts`
- [x] integrator `mergeIntegratorUsers` — пути не затронуты (пропуск)
