# Фаза 1 — Rubitime → platform_user

**Статус:** `pending`  
**Канон:** [MAIN PLAN.md](MAIN%20PLAN.md) §1  
**Зависит от:** [PHASE_00](PHASE_00_AUDIT_AND_AGREEMENT.md)  
**Следующий:** [PHASE_02](PHASE_02_CONTACT_EMAIL_POLICY.md) (параллельно допустимо), затем цепочка 03→05

## Цель

После Rubitime record created/updated врач видит пациентскую карточку и может назначить программу; `appointment_records.platform_user_id` заполнен; дубли не плодятся.

## Правила (не нарушать)

- Телефон Rubitime — обязательный доверенный источник; сценарий «без телефона» не проектируем.
- Поиск: **сначала phone**, затем email; существующий autobind не ломать.
- Имя существующего пользователя **не затирать**; Rubitime name — в payload/UI «В Rubitime: …».
- Новый user: display name из Rubitime; phone trusted; email — **unverified** contact.

## Scope

### В scope

- integrator/webapp обработчики Rubitime events
- find/create/link `platform_user`, `appointment_records.platform_user_id`
- trusted phone при match по email + phone из Rubitime

### Вне scope

- Email setup tokens (фаза 3–4)
- Изменение AuthFlow (фаза 5)
- Backfill / исторические appointment_records ([`SCOPE_DECISIONS.md`](SCOPE_DECISIONS.md))

## Definition of Done

- [ ] Record с новым phone → создаётся `platform_user`, привязка appointment
- [ ] Record с phone+email → user создан, email unverified, phone trusted
- [ ] Record с существующим phone → appointment к user, имя не перезаписано
- [ ] Record с existing email user → appointment + trusted phone добавлен при необходимости
- [ ] Существующий bot user + Rubitime phone → appointment attached (без дубля)
- [ ] Тесты integrator/webapp по сценариям MAIN PLAN §11 (Rubitime)
- [ ] Запись в [`LOG.md`](LOG.md)

## Локальные проверки

- [ ] `pnpm --filter @bersoncare/integrator test` — затронутые файлы
- [ ] `pnpm --filter @bersoncare/webapp test` — projection/Rubitime при наличии
- [ ] `rg appointment_records.platform_user_id` — все write path покрыты

## Якоря (ожидаемые зоны правок)

- `apps/integrator` — Rubitime record handlers
- `apps/webapp/src/infra/repos/pgUserProjection.ts` — `ensureClientFromAppointmentProjection`, autobind
- [`RUBITIME_BOOKING_PIPELINE.md`](../ARCHITECTURE/RUBITIME_BOOKING_PIPELINE.md) — обновить при изменении контракта
