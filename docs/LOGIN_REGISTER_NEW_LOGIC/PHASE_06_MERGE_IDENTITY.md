# Фаза 6 — Merge и identity (страховка)

**Статус:** `deferred` (scope 2026-05-19 — не ломать существующий ручной merge)  
**Канон:** [MAIN PLAN.md](MAIN%20PLAN.md) §7  
**Зависит от:** [PHASE_01](PHASE_01_RUBITIME_PLATFORM_USER.md), [PHASE_05](PHASE_05_AUTH_REGISTER_LOGIN_FORGOT.md)

## Цель

Предотвращение дублей — в первую очередь фаза 1; эта фаза — проверка и точечные доработки merge, если дубль уже есть.

## Сценарии проверки

- [ ] Rubitime user по email + phone из Rubitime → trusted phone на том же user  
- [ ] Позже bot user с тем же телефоном → безопасный merge / resolution (без потери appointments vs diary)  
- [ ] User A: appointments; User B: PWA stats/reminders → после merge данные на canonical user  

## Scope

### В scope

- Ревью `PLATFORM_USER_MERGE.md` vs новая логика phone/email  
- Тест(ы) «appointments + diary/warmup» basic merge  
- Документировать ограничения automerge (email conflict → support)  

### Вне scope

- Новый merge engine v3 без явного запроса  
- Изменение GitHub CI workflow  

## Definition of Done

- [ ] Чеклист сценариев §7 пройден или заведены backlog-задачи с причиной отмены  
- [ ] Нет регрессии manual merge API  
- [ ] [`LOG.md`](LOG.md)

## Локальные проверки

- [ ] `pnpm --filter @bersoncare/webapp test` — merge-related  
- [ ] `pnpm --filter @bersoncare/integrator test` — `mergeIntegratorUsers` при затронутых путях
